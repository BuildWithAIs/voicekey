import { app } from 'electron'
import fs from 'fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { RECORDING, AUDIO_CONFIG, LOCAL_ASR } from '../shared/constants'
import type { LocalASRDownloadProgress, LocalASRStatus } from '../shared/types'
import { getASRModelStorageDir, removeManagedASRInstallDir } from './asr-model-storage'
import { t } from './i18n'
import { downloadASRAsset } from './asr-download'
import { getASRIdleTimeout, getASRThreadCount, watchASRMemory } from './asr-runtime-policy'

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
  timer: NodeJS.Timeout
}

const nodeRequire = createRequire(import.meta.url)

// Abort a model download when the socket stays idle this long, so a dead
// connection cannot leave `activeDownload` pending forever.

let downloadController: AbortController | null = null
let activeDownload: Promise<LocalASRStatus> | null = null
let deletingAssets = false
let currentProgress: LocalASRDownloadProgress | undefined
let lastError: string | undefined
let recognitionQueue: Promise<void> = Promise.resolve()
let localASRWorker: Worker | null = null
let localASRWorkerIdleTimer: NodeJS.Timeout | null = null
let cancelledBefore = 0
let stopMemoryWatch: (() => void) | null = null
let workerThreadCount = 0
let runtimeReady = false
let terminating: Promise<void> | null = null
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
    runtimeState: runtimeReady ? 'ready' : localASRWorker ? 'loading' : 'unloaded',
    modelName: LOCAL_ASR.MODEL_NAME,
    installDir: paths.installDir,
    hasFiles: fs.existsSync(paths.installDir),
    storageDir: getASRModelStorageDir(),
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
  if (deletingAssets) {
    throw new Error('Local ASR model deletion is in progress')
  }

  // Count a queued request as activity immediately, even if another chunk is
  // still ahead of it in the serialized recognition queue.
  clearLocalASRWorkerIdleTimer()
  const generation = nextWorkerRequestId

  const run = async (): Promise<LocalASRRunResult> => {
    // A previous queued run may have scheduled its idle timeout immediately
    // before this run starts, so clear it again at the execution boundary.
    clearLocalASRWorkerIdleTimer()

    try {
      if (generation < cancelledBefore) throw new Error('Recognition cancelled')
      if (terminating) await terminating
      if (localASRWorker && workerThreadCount !== getASRThreadCount())
        await terminateLocalASRWorker()
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

export async function cancelLocalASR(): Promise<void> {
  await terminateLocalASRWorker()
}

export async function releaseLocalASR(): Promise<void> {
  await recognitionQueue
  await terminateLocalASRWorker()
}

export async function deleteLocalASRAssets(): Promise<LocalASRStatus> {
  if (activeDownload) {
    throw new Error('Cannot delete the local ASR model while it is downloading')
  }
  if (deletingAssets) {
    throw new Error('Local ASR model deletion is already in progress')
  }

  deletingAssets = true
  try {
    await releaseLocalASR()
    removeManagedASRInstallDir(getLocalASRPaths().installDir)
    currentProgress = undefined
    lastError = undefined
    return getLocalASRStatus()
  } finally {
    deletingAssets = false
  }
}

export async function cancelLocalASRDownload(): Promise<void> {
  if (!activeDownload) return
  downloadController?.abort()
  await terminateLocalASRWorker()
  await activeDownload.catch(() => undefined)
}

export async function downloadLocalASRAssets(
  onProgress?: ProgressCallback,
): Promise<LocalASRStatus> {
  if (deletingAssets) {
    throw new Error('Cannot download the local ASR model while deletion is in progress')
  }
  if (activeDownload) {
    return activeDownload
  }

  downloadController = new AbortController()
  activeDownload = downloadLocalASRAssetsInternal(onProgress).finally(() => {
    activeDownload = null
    downloadController = null
    currentProgress = undefined
  })

  await activeDownload
  return getLocalASRStatus()
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
    fs.mkdirSync(stagingDir, { recursive: true })

    for (const file of LOCAL_ASR.MODEL_FILES) {
      downloadedBytes += await downloadModelFile(
        file,
        path.join(stagingDir, file.name),
        downloadedBytes,
        onProgress,
      )
    }

    downloadController!.signal.throwIfAborted()
    currentProgress = { ...currentProgress!, phase: 'initialize' }
    onProgress?.(currentProgress)
    await verifyLocalASRModel(stagingDir)
    downloadController!.signal.throwIfAborted()
    writeModelManifest(path.join(stagingDir, 'model.json'))

    fs.rmSync(paths.modelDir, { recursive: true, force: true })
    fs.mkdirSync(path.dirname(paths.modelDir), { recursive: true })
    fs.renameSync(stagingDir, paths.modelDir)

    lastError = undefined
    return getLocalASRStatus()
  } catch (error) {
    lastError = downloadController?.signal.aborted
      ? undefined
      : error instanceof Error
        ? error.message
        : 'Local ASR download failed'
    throw error
  }
}

function getLocalASRPaths(): LocalASRPaths {
  const installDir = path.join(getASRModelStorageDir(), 'sensevoice')
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
      numThreads: getASRThreadCount(),
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
  workerThreadCount = getASRThreadCount()
  stopMemoryWatch = watchASRMemory(() => {
    const error = new Error(t('errors.asrMemory'))
    rejectAllWorkerRequests(error)
    void terminateLocalASRWorker()
  })

  worker.on('message', (response: WorkerResponse) => {
    const request = workerRequests.get(response.id)
    if (!request) return
    workerRequests.delete(response.id)
    clearTimeout(request.timer)

    if (response.ok) {
      runtimeReady = true
      request.resolve(response.result)
      return
    }

    request.reject(new Error(response.error))
  })

  worker.on('error', (error) => {
    if (localASRWorker !== worker) return

    localASRWorker = null
    stopMemoryWatch?.()
    stopMemoryWatch = null
    runtimeReady = false
    clearLocalASRWorkerIdleTimer()
    rejectAllWorkerRequests(error instanceof Error ? error : new Error('Local ASR worker failed'))
  })

  worker.on('exit', (code) => {
    if (localASRWorker !== worker) return

    localASRWorker = null
    stopMemoryWatch?.()
    stopMemoryWatch = null
    runtimeReady = false
    clearLocalASRWorkerIdleTimer()
    rejectAllWorkerRequests(new Error(`Local ASR worker exited with code ${code}`))
  })

  return worker
}

function getLocalASRWorkerUrl(): URL {
  const currentFilePath = fileURLToPath(import.meta.url)
  return pathToFileURL(path.join(path.dirname(currentFilePath), 'local-asr-worker.mjs'))
}

async function callLocalASRWorker<T extends LocalASRRunResult | void>(
  command: WorkerCommandInput,
): Promise<T> {
  if (terminating) await terminating
  const worker = getLocalASRWorker()
  const id = nextWorkerRequestId++

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => {
        const request = workerRequests.get(id)
        if (!request) return
        workerRequests.delete(id)
        request.reject(new Error('ASR operation timed out'))
        void terminateLocalASRWorker()
      },
      command.command === 'transcribe'
        ? RECORDING.TRANSCRIPTION_TIMEOUT_MS
        : RECORDING.WORKER_TIMEOUT_MS,
    )
    workerRequests.set(id, {
      timer,
      resolve: resolve as (value: LocalASRRunResult | void) => void,
      reject,
    })

    try {
      worker.postMessage({ ...command, id } satisfies WorkerCommand)
    } catch (error) {
      workerRequests.delete(id)
      clearTimeout(timer)
      reject(error instanceof Error ? error : new Error('Failed to post local ASR worker request'))
    }
  })
}

async function terminateLocalASRWorker(): Promise<void> {
  clearLocalASRWorkerIdleTimer()
  cancelledBefore = ++nextWorkerRequestId
  if (terminating) return terminating
  const worker = localASRWorker
  if (!worker) return
  localASRWorker = null
  stopMemoryWatch?.()
  stopMemoryWatch = null
  runtimeReady = false
  rejectAllWorkerRequests(new Error('ASR worker was stopped'))
  terminating = worker
    .terminate()
    .then(() => undefined)
    .finally(() => {
      terminating = null
    })
  await terminating
}

function clearLocalASRWorkerIdleTimer(): void {
  if (!localASRWorkerIdleTimer) return

  clearTimeout(localASRWorkerIdleTimer)
  localASRWorkerIdleTimer = null
}

function scheduleLocalASRWorkerIdleTermination(): void {
  clearLocalASRWorkerIdleTimer()
  if (!localASRWorker) return
  const idleSince = Date.now()
  const check = () => {
    if (Date.now() - idleSince >= getASRIdleTimeout()) {
      localASRWorkerIdleTimer = null
      void terminateLocalASRWorker().catch((error: unknown) =>
        console.error('[ASR] Idle release failed:', error),
      )
      return
    }
    localASRWorkerIdleTimer = setTimeout(check, 30_000)
    localASRWorkerIdleTimer.unref()
  }
  localASRWorkerIdleTimer = setTimeout(check, 30_000)
  localASRWorkerIdleTimer.unref()
}

function rejectAllWorkerRequests(error: Error): void {
  for (const request of workerRequests.values()) {
    clearTimeout(request.timer)
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
  return downloadASRAsset(
    file,
    outputPath,
    downloadController!.signal,
    (bytes) => updateDownloadProgress(downloadedBefore + bytes, onProgress),
    () => {
      currentProgress = {
        ...currentProgress!,
        phase: 'verify',
        receivedBytes: currentProgress?.receivedBytes ?? downloadedBefore,
      }
      onProgress?.(currentProgress)
    },
    path.join(path.dirname(outputPath).replace(/\.download$/u, ''), file.name),
  )
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
