import { app } from 'electron'
import fs from 'fs'
import { createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import https from 'node:https'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { AUDIO_CONFIG, LOCAL_ASR } from '../shared/constants'
import type { LocalASRDownloadProgress, LocalASRStatus } from '../shared/types'
import { downloadFromSources } from './download-sources'

type ModelFile = (typeof LOCAL_ASR.MODEL_FILES)[number]

type LocalASRPaths = {
  installDir: string
  modelDir: string
  manifestPath: string
  modelPath: string
}

type ProgressCallback = (progress: LocalASRDownloadProgress) => void
type LocalASRRunResult = { stdout: string; stderr: string }
type WorkerCommandInput =
  | { command: 'transcribe'; audioFilePath: string; modelDir: string }
  | { command: 'verify'; modelDir: string }
  | { command: 'release' }
type WorkerCommand = WorkerCommandInput & { id: number }
type WorkerResponse =
  | { id: number; ok: true; result?: LocalASRRunResult }
  | { id: number; ok: false; error: string }
type WorkerRequest = {
  resolve: (value: LocalASRRunResult | void) => void
  reject: (error: Error) => void
}

const nodeRequire = createRequire(import.meta.url)

// Abort a model download when the socket stays idle this long, so a dead
// connection cannot leave `activeDownload` pending forever.
const DOWNLOAD_IDLE_TIMEOUT_MS = 30_000

let activeDownload: Promise<LocalASRStatus> | null = null
let currentProgress: LocalASRDownloadProgress | undefined
let lastError: string | undefined
let recognitionQueue: Promise<void> = Promise.resolve()
let localASRWorker: Worker | null = null
let localASRWorkerIdleTimer: NodeJS.Timeout | null = null
let nextWorkerRequestId = 1
const workerRequests = new Map<number, WorkerRequest>()

export function getLocalASRStatus(): LocalASRStatus {
  const paths = getLocalASRPaths()
  const modelDir = getReadyModelDir(paths)
  const missing = modelDir ? [] : getMissingModelFiles(paths)

  return {
    supported: true,
    ready: Boolean(modelDir),
    downloading: Boolean(activeDownload),
    modelName: LOCAL_ASR.MODEL_NAME,
    installDir: paths.installDir,
    modelPath: modelDir ? path.join(modelDir, LOCAL_ASR.MODEL_FILE) : paths.modelPath,
    missing,
    downloadSizeBytes: LOCAL_ASR.DOWNLOAD_SIZE_BYTES,
    progress: currentProgress,
    error: lastError,
  }
}

export function ensureLocalASRReady(): LocalASRPaths {
  const status = getLocalASRStatus()
  if (!status.supported) {
    throw new Error(status.error || 'Local ASR runtime is not available')
  }
  if (!status.ready) {
    throw new Error('Local ASR model is not downloaded yet')
  }
  return getLocalASRPaths()
}

export async function runLocalASR(audioFilePath: string): Promise<LocalASRRunResult> {
  // Count a queued request as activity immediately, even if another chunk is
  // still ahead of it in the serialized recognition queue.
  clearLocalASRWorkerIdleTimer()

  const run = async (): Promise<LocalASRRunResult> => {
    // A previous queued run may have scheduled its idle timeout immediately
    // before this run starts, so clear it again at the execution boundary.
    clearLocalASRWorkerIdleTimer()

    try {
      const paths = ensureLocalASRReady()
      const modelDir = getReadyModelDir(paths)
      if (!modelDir) {
        throw new Error('Local ASR model is not downloaded yet')
      }

      return await callLocalASRWorker<LocalASRRunResult>({
        command: 'transcribe',
        audioFilePath,
        modelDir,
      })
    } finally {
      scheduleLocalASRWorkerIdleTermination()
    }
  }

  const nextRun = recognitionQueue.then(run, run)
  recognitionQueue = nextRun.then(
    () => undefined,
    () => undefined,
  )
  return nextRun
}

export async function downloadLocalASRAssets(
  onProgress?: ProgressCallback,
): Promise<LocalASRStatus> {
  if (activeDownload) {
    return activeDownload
  }

  activeDownload = downloadLocalASRAssetsInternal(onProgress).finally(() => {
    activeDownload = null
    currentProgress = undefined
  })

  return activeDownload
}

async function downloadLocalASRAssetsInternal(
  onProgress?: ProgressCallback,
): Promise<LocalASRStatus> {
  const paths = getLocalASRPaths()
  const readyModelDir = getReadyModelDir(paths)
  if (readyModelDir) {
    lastError = undefined
    return getLocalASRStatus()
  }

  const stagingDir = `${paths.modelDir}.download`
  let downloadedBytes = 0

  try {
    await terminateLocalASRWorker()
    fs.rmSync(stagingDir, { recursive: true, force: true })
    fs.mkdirSync(stagingDir, { recursive: true })

    for (const file of LOCAL_ASR.MODEL_FILES) {
      downloadedBytes += await downloadModelFile(
        file,
        path.join(stagingDir, file.name),
        downloadedBytes,
        onProgress,
      )
    }

    await verifyLocalASRModel(stagingDir)
    writeModelManifest(path.join(stagingDir, 'model.json'))

    fs.rmSync(paths.modelDir, { recursive: true, force: true })
    fs.mkdirSync(path.dirname(paths.modelDir), { recursive: true })
    fs.renameSync(stagingDir, paths.modelDir)

    lastError = undefined
    return getLocalASRStatus()
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true })
    lastError = error instanceof Error ? error.message : 'Local ASR download failed'
    throw error
  }
}

function getLocalASRPaths(): LocalASRPaths {
  const installDir = path.join(app.getPath('userData'), 'local-asr', 'sensevoice')
  const modelDir = path.join(installDir, 'models', LOCAL_ASR.MODEL_VERSION)

  return {
    installDir,
    modelDir,
    manifestPath: path.join(modelDir, 'model.json'),
    modelPath: path.join(modelDir, LOCAL_ASR.MODEL_FILE),
  }
}

function getReadyModelDir(paths: LocalASRPaths): string | null {
  const developmentModelDir = getDevelopmentModelDir()
  if (developmentModelDir) {
    return developmentModelDir
  }

  return isInstalledModelReady(paths) ? paths.modelDir : null
}

function getDevelopmentModelDir(): string | null {
  if (app.isPackaged) {
    return null
  }

  const candidates = [
    process.env.VOICEKEY_ASR_MODEL_DIR,
    path.join(process.cwd(), 'resources', 'asr', 'sensevoice'),
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of candidates) {
    if (hasRequiredModelFiles(candidate)) {
      return candidate
    }
  }

  return null
}

function hasRequiredModelFiles(modelDir: string): boolean {
  return (
    fileHasSize(path.join(modelDir, LOCAL_ASR.MODEL_FILE), getModelFile(LOCAL_ASR.MODEL_FILE)) &&
    fileHasSize(path.join(modelDir, LOCAL_ASR.TOKENS_FILE), getModelFile(LOCAL_ASR.TOKENS_FILE))
  )
}

function isInstalledModelReady(paths: LocalASRPaths): boolean {
  if (!isModelManifestReady(paths.manifestPath)) {
    return false
  }

  return LOCAL_ASR.MODEL_FILES.every((file) =>
    fileHasSize(path.join(paths.modelDir, file.name), file),
  )
}

function isModelManifestReady(manifestPath: string): boolean {
  if (!fs.existsSync(manifestPath)) {
    return false
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
    return (
      manifest.version === LOCAL_ASR.HEALTH_CHECK_VERSION &&
      manifest.modelVersion === LOCAL_ASR.MODEL_VERSION
    )
  } catch {
    return false
  }
}

function getMissingModelFiles(paths: LocalASRPaths): string[] {
  const missing: string[] = LOCAL_ASR.MODEL_FILES.filter(
    (file) => !fileHasSize(path.join(paths.modelDir, file.name), file),
  ).map((file) => file.name)

  if (missing.length === 0 && !isModelManifestReady(paths.manifestPath)) {
    missing.push('model.json')
  }

  return missing.length > 0 ? missing : ['model']
}

function fileHasSize(filePath: string, modelFile: ModelFile): boolean {
  try {
    return fs.statSync(filePath).size === modelFile.sizeBytes
  } catch {
    return false
  }
}

function getModelFile(name: string): ModelFile {
  const file = LOCAL_ASR.MODEL_FILES.find((candidate) => candidate.name === name)
  if (!file) {
    throw new Error(`Unknown local ASR model file: ${name}`)
  }
  return file
}

async function verifyLocalASRModel(modelDir: string): Promise<void> {
  try {
    await callLocalASRWorker<void>({ command: 'verify', modelDir })
  } finally {
    // Model verification expands the worker's WebAssembly memory even though
    // the temporary recognizer is freed. Terminating the worker is the only
    // reliable way to return that memory to the operating system.
    await terminateLocalASRWorker()
  }
}

function getLocalASRWorker(): Worker {
  if (localASRWorker) return localASRWorker

  const worker = new Worker(getLocalASRWorkerUrl(), {
    workerData: {
      sherpaModulePath: nodeRequire.resolve('sherpa-onnx'),
      audioConfig: {
        sampleRate: AUDIO_CONFIG.SAMPLE_RATE,
      },
      localASR: {
        modelFile: LOCAL_ASR.MODEL_FILE,
        tokensFile: LOCAL_ASR.TOKENS_FILE,
        language: LOCAL_ASR.LANGUAGE,
      },
    },
  })

  localASRWorker = worker

  worker.on('message', (response: WorkerResponse) => {
    const request = workerRequests.get(response.id)
    if (!request) return
    workerRequests.delete(response.id)

    if (response.ok) {
      request.resolve(response.result)
      return
    }

    request.reject(new Error(response.error))
  })

  worker.on('error', (error) => {
    if (localASRWorker !== worker) return

    localASRWorker = null
    clearLocalASRWorkerIdleTimer()
    rejectAllWorkerRequests(error instanceof Error ? error : new Error('Local ASR worker failed'))
  })

  worker.on('exit', (code) => {
    if (localASRWorker !== worker) return

    localASRWorker = null
    clearLocalASRWorkerIdleTimer()
    if (code !== 0) {
      rejectAllWorkerRequests(new Error(`Local ASR worker exited with code ${code}`))
    }
  })

  return worker
}

function getLocalASRWorkerUrl(): URL {
  const currentFilePath = fileURLToPath(import.meta.url)
  return pathToFileURL(path.join(path.dirname(currentFilePath), 'local-asr-worker.mjs'))
}

function callLocalASRWorker<T extends LocalASRRunResult | void>(
  command: WorkerCommandInput,
): Promise<T> {
  const worker = getLocalASRWorker()
  const id = nextWorkerRequestId++

  return new Promise<T>((resolve, reject) => {
    workerRequests.set(id, {
      resolve: resolve as (value: LocalASRRunResult | void) => void,
      reject,
    })

    try {
      worker.postMessage({ ...command, id } satisfies WorkerCommand)
    } catch (error) {
      workerRequests.delete(id)
      reject(error instanceof Error ? error : new Error('Failed to post local ASR worker request'))
    }
  })
}

async function terminateLocalASRWorker(): Promise<void> {
  clearLocalASRWorkerIdleTimer()

  const worker = localASRWorker
  if (!worker) return

  localASRWorker = null
  rejectAllWorkerRequests(new Error('Local ASR worker was restarted'))
  await worker.terminate()
}

function clearLocalASRWorkerIdleTimer(): void {
  if (!localASRWorkerIdleTimer) return

  clearTimeout(localASRWorkerIdleTimer)
  localASRWorkerIdleTimer = null
}

function scheduleLocalASRWorkerIdleTermination(): void {
  clearLocalASRWorkerIdleTimer()
  if (!localASRWorker) return

  localASRWorkerIdleTimer = setTimeout(() => {
    localASRWorkerIdleTimer = null
    console.log(
      `[ASR:Local] Releasing worker after ${LOCAL_ASR.WORKER_IDLE_TIMEOUT_MS / 60_000} minutes of inactivity`,
    )
    void terminateLocalASRWorker().catch((error: unknown) => {
      console.error(
        '[ASR:Local] Failed to release idle worker:',
        error instanceof Error ? error.message : error,
      )
    })
  }, LOCAL_ASR.WORKER_IDLE_TIMEOUT_MS)
  localASRWorkerIdleTimer.unref()
}

function rejectAllWorkerRequests(error: Error): void {
  for (const request of workerRequests.values()) {
    request.reject(error)
  }
  workerRequests.clear()
}

function writeModelManifest(manifestPath: string): void {
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        version: LOCAL_ASR.HEALTH_CHECK_VERSION,
        modelVersion: LOCAL_ASR.MODEL_VERSION,
        files: LOCAL_ASR.MODEL_FILES.map(({ name, sizeBytes, sha256 }) => ({
          name,
          sizeBytes,
          sha256,
        })),
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    'utf8',
  )
}

async function downloadModelFile(
  file: ModelFile,
  outputPath: string,
  downloadedBefore: number,
  onProgress?: ProgressCallback,
): Promise<number> {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })

  const tempPath = `${outputPath}.download`
  fs.rmSync(tempPath, { force: true })

  const downloadedBytes = await downloadFromSources(
    file.urls,
    async (source) => {
      fs.rmSync(tempPath, { force: true })
      updateDownloadProgress(downloadedBefore, onProgress)

      await requestDownload(source, tempPath, downloadedBefore, onProgress)
      await verifyFileSha256(tempPath, file.sha256)

      const sourceBytes = fs.statSync(tempPath).size
      if (sourceBytes !== file.sizeBytes) {
        fs.rmSync(tempPath, { force: true })
        throw new Error(`Downloaded local ASR asset has unexpected size: ${file.name}`)
      }

      return sourceBytes
    },
    ({ source, nextSource, error }) => {
      console.warn(
        `[ASR:Local] Downloading ${file.name} from ${new URL(source).host} failed; ` +
          `trying ${new URL(nextSource).host}: ${error.message}`,
      )
    },
  )

  fs.renameSync(tempPath, outputPath)
  return downloadedBytes
}

function updateDownloadProgress(receivedBytes: number, onProgress?: ProgressCallback): void {
  currentProgress = {
    phase: 'model',
    receivedBytes,
    totalBytes: LOCAL_ASR.DOWNLOAD_SIZE_BYTES,
    percent: Math.min(100, Math.round((receivedBytes / LOCAL_ASR.DOWNLOAD_SIZE_BYTES) * 100)),
  }
  onProgress?.(currentProgress)
}

function verifyFileSha256(filePath: string, expectedSha256: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = fs.createReadStream(filePath)

    stream.on('data', (chunk: Buffer) => {
      hash.update(chunk)
    })
    stream.on('error', reject)
    stream.on('end', () => {
      const actualSha256 = hash.digest('hex')
      if (actualSha256 === expectedSha256.toLowerCase()) {
        resolve()
        return
      }

      fs.rmSync(filePath, { force: true })
      reject(new Error('Downloaded local ASR asset failed checksum verification'))
    })
  })
}

function requestDownload(
  url: string,
  outputPath: string,
  downloadedBefore: number,
  onProgress?: ProgressCallback,
  redirectCount = 0,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 8) {
      reject(new Error('Too many redirects while downloading local ASR assets'))
      return
    }

    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== 'https:') {
      reject(new Error('Local ASR model downloads must use HTTPS'))
      return
    }

    let fileStream: fs.WriteStream | null = null

    const failWithCleanup = (error: Error) => {
      if (fileStream) {
        fileStream.destroy()
        fileStream = null
      }
      try {
        fs.rmSync(outputPath, { force: true })
      } catch {
        // Staging dir cleanup in the caller removes leftovers.
      }
      reject(error)
    }

    const request = https.get(
      parsedUrl,
      {
        headers: {
          'User-Agent': 'VoiceKey',
        },
        timeout: DOWNLOAD_IDLE_TIMEOUT_MS,
      },
      (response: IncomingMessage) => {
        const statusCode = response.statusCode ?? 0
        const location = response.headers.location

        if (statusCode >= 300 && statusCode < 400 && location) {
          response.resume()
          const nextUrl = new URL(location, parsedUrl).toString()
          requestDownload(nextUrl, outputPath, downloadedBefore, onProgress, redirectCount + 1)
            .then(resolve)
            .catch(reject)
          return
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume()
          reject(new Error(`Download failed with HTTP ${statusCode}`))
          return
        }

        let receivedBytes = 0
        const file = fs.createWriteStream(outputPath)
        fileStream = file

        response.on('data', (chunk: Buffer) => {
          receivedBytes += chunk.length
          const totalReceivedBytes = Math.min(
            LOCAL_ASR.DOWNLOAD_SIZE_BYTES,
            downloadedBefore + receivedBytes,
          )
          updateDownloadProgress(totalReceivedBytes, onProgress)
        })

        // Without this, a mid-transfer stream error leaves the promise pending
        // forever ('finish' never fires and pipe() does not forward errors).
        response.on('error', (error) => {
          failWithCleanup(new Error(`Download stream failed: ${error.message}`))
        })

        response.pipe(file)
        file.on('finish', () => {
          fileStream = null
          file.close(() => resolve())
        })
        file.on('error', (error) => {
          failWithCleanup(error)
        })
      },
    )

    request.on('timeout', () => {
      request.destroy(
        new Error(
          `Download timed out after ${DOWNLOAD_IDLE_TIMEOUT_MS / 1000}s without receiving data`,
        ),
      )
    })

    request.on('error', (error) => {
      failWithCleanup(error)
    })
  })
}
