import { app } from 'electron'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import https from 'node:https'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { AUDIO_CONFIG, STREAMING_ASR, STREAMING_PUNCTUATION } from '../shared/constants'
import type {
  LocalASRDownloadProgress,
  LocalASRStatus,
  StreamingAudioFramePayload,
} from '../shared/types'
import { downloadFromSources } from './download-sources'
import {
  punctuateStreamingText,
  releaseStreamingPunctuation,
  verifyStreamingPunctuation,
  warmStreamingPunctuation,
} from './streaming-punctuation-manager'

type ModelFile =
  | (typeof STREAMING_ASR.MODEL_FILES)[number]
  | (typeof STREAMING_PUNCTUATION.MODEL_FILES)[number]

type ModelBundlePaths = {
  modelDir: string
  manifestPath: string
  modelPath: string
}

type StreamingASRPaths = {
  installDir: string
  asr: ModelBundlePaths
  punctuation: ModelBundlePaths
}

type ReadyModelDirs = {
  asrModelDir: string
  punctuationModelDir: string
}

type ModelBundle = {
  label: 'ASR' | 'punctuation'
  modelVersion: string
  healthCheckVersion: number
  files: readonly ModelFile[]
  downloadSizeBytes: number
  paths: ModelBundlePaths
  kind: 'asr' | 'punctuation'
}

type ProgressCallback = (progress: LocalASRDownloadProgress) => void
type StreamingASRFinalResult = { text: string }
type WorkerCommandInput =
  | { command: 'verify'; modelDir: string }
  | { command: 'warm'; modelDir: string }
  | { command: 'start'; sessionId: string; modelDir: string }
  | { command: 'finish'; sessionId: string }
  | { command: 'cancel'; sessionId: string }
  | { command: 'release' }
type WorkerCommand = WorkerCommandInput & { id: number }
type WorkerResponse =
  | { id: number; ok: true; result?: StreamingASRFinalResult }
  | { id: number; ok: false; error: string }
  | { event: 'partial'; sessionId: string; text: string }
  | { event: 'session-error'; sessionId: string; error: string }
type WorkerRequest = {
  resolve: (value: StreamingASRFinalResult | void) => void
  reject: (error: Error) => void
}

type StreamingSessionCallbacks = {
  onPartial: (text: string) => void
  onError: (error: Error) => void
}

type ActiveStreamingSession = {
  id: string
  ready: Promise<void>
  frameQueue: Promise<void>
  lastSequence: number
  failure: Error | null
  errorReported: boolean
  punctuationModelDir: string
  callbacks: StreamingSessionCallbacks
}

const nodeRequire = createRequire(import.meta.url)
const DOWNLOAD_IDLE_TIMEOUT_MS = 30_000

let activeDownload: Promise<LocalASRStatus> | null = null
let currentProgress: LocalASRDownloadProgress | undefined
let lastError: string | undefined
let streamingWorker: Worker | null = null
let streamingWorkerIdleTimer: NodeJS.Timeout | null = null
let activeSession: ActiveStreamingSession | null = null
let nextWorkerRequestId = 1
const workerRequests = new Map<number, WorkerRequest>()

export function getStreamingASRStatus(): LocalASRStatus {
  const paths = getStreamingASRPaths()
  const modelDirs = getReadyModelDirs(paths)
  const missing = modelDirs ? [] : getMissingModelFiles(paths)

  return {
    supported: true,
    ready: Boolean(modelDirs),
    downloading: Boolean(activeDownload),
    modelName: `${STREAMING_ASR.MODEL_NAME} + ${STREAMING_PUNCTUATION.MODEL_NAME}`,
    installDir: paths.installDir,
    modelPath: modelDirs
      ? path.join(modelDirs.asrModelDir, STREAMING_ASR.ENCODER_FILE)
      : paths.asr.modelPath,
    missing,
    downloadSizeBytes:
      STREAMING_ASR.DOWNLOAD_SIZE_BYTES + STREAMING_PUNCTUATION.DOWNLOAD_SIZE_BYTES,
    progress: currentProgress,
    error: lastError,
  }
}

export async function startStreamingASRSession(
  sessionId: string,
  callbacks: StreamingSessionCallbacks,
): Promise<void> {
  clearWorkerIdleTimer()

  if (activeSession && activeSession.id !== sessionId) {
    await cancelStreamingASRSession(activeSession.id)
  }

  const paths = ensureStreamingASRReady()
  const modelDirs = getReadyModelDirs(paths)
  if (!modelDirs) {
    throw new Error('Streaming ASR or punctuation model is not downloaded yet')
  }

  const session: ActiveStreamingSession = {
    id: sessionId,
    ready: Promise.resolve(),
    frameQueue: Promise.resolve(),
    lastSequence: -1,
    failure: null,
    errorReported: false,
    punctuationModelDir: modelDirs.punctuationModelDir,
    callbacks,
  }
  activeSession = session

  session.ready = callWorker<void>({
    command: 'start',
    sessionId,
    modelDir: modelDirs.asrModelDir,
  }).catch((error) => {
    reportSessionError(session, error)
    throw error
  })

  void warmStreamingPunctuation(modelDirs.punctuationModelDir).catch((error: unknown) => {
    console.error(
      '[ASR:Streaming] Failed to prewarm local punctuation; finalization will use raw text if retry fails:',
      error instanceof Error ? error.message : error,
    )
  })

  await session.ready
}

export async function warmStreamingASR(): Promise<void> {
  clearWorkerIdleTimer()
  const paths = ensureStreamingASRReady()
  const modelDirs = getReadyModelDirs(paths)
  if (!modelDirs) {
    throw new Error('Streaming ASR or punctuation model is not downloaded yet')
  }

  try {
    await callWorker<void>({ command: 'warm', modelDir: modelDirs.asrModelDir })
  } finally {
    scheduleWorkerIdleTermination()
  }
}

export function pushStreamingAudioFrame(payload: StreamingAudioFramePayload): void {
  const session = activeSession
  if (!session || session.id !== payload.sessionId || session.failure) return
  if (payload.sequence <= session.lastSequence) return

  session.lastSequence = payload.sequence
  const buffer = payload.buffer
  session.frameQueue = session.frameQueue
    .then(() => session.ready)
    .then(() => {
      if (activeSession !== session || session.failure) return
      const worker = getWorker()
      worker.postMessage(
        {
          command: 'audio',
          sessionId: payload.sessionId,
          sequence: payload.sequence,
          sampleRate: payload.sampleRate,
          buffer,
        },
        [buffer],
      )
    })
    .catch((error: unknown) => {
      reportSessionError(
        session,
        error instanceof Error ? error : new Error('Failed to stream audio to ASR worker'),
      )
    })
}

export async function finishStreamingASRSession(sessionId: string): Promise<string> {
  const session = activeSession
  if (!session || session.id !== sessionId) {
    throw new Error('Streaming ASR session is not active')
  }

  try {
    await session.ready
    await session.frameQueue
    if (session.failure) throw session.failure

    const result = await callWorker<StreamingASRFinalResult>({ command: 'finish', sessionId })
    const finalText = await addPunctuationOrFallback(result.text, session.punctuationModelDir)
    session.callbacks.onPartial(finalText)
    return finalText
  } finally {
    await releaseSessionPunctuationSafely('finalization')
    if (activeSession === session) {
      activeSession = null
    }
    scheduleWorkerIdleTermination()
  }
}

async function addPunctuationOrFallback(text: string, modelDir: string): Promise<string> {
  if (!text.trim()) return text

  try {
    return await punctuateStreamingText(text, modelDir)
  } catch (error) {
    console.error(
      '[ASR:Streaming] Local punctuation failed; using the unpunctuated transcript:',
      error instanceof Error ? error.message : error,
    )
    return text
  }
}

async function releaseSessionPunctuationSafely(reason: string): Promise<void> {
  try {
    await releaseStreamingPunctuation()
  } catch (error) {
    console.error(
      `[ASR:Streaming] Failed to release punctuation worker after ${reason}:`,
      error instanceof Error ? error.message : error,
    )
  }
}

export async function cancelStreamingASRSession(sessionId: string): Promise<void> {
  const session = activeSession
  if (!session || session.id !== sessionId) return

  activeSession = null
  try {
    await session.ready.catch(() => undefined)
    await callWorker<void>({ command: 'cancel', sessionId })
  } finally {
    await releaseSessionPunctuationSafely('cancellation')
    scheduleWorkerIdleTermination()
  }
}

export async function releaseStreamingASR(): Promise<void> {
  if (activeSession) {
    throw new Error('Cannot release streaming ASR while a session is active')
  }
  await Promise.all([terminateWorker(), releaseStreamingPunctuation()])
}

export async function downloadStreamingASRAssets(
  onProgress?: ProgressCallback,
): Promise<LocalASRStatus> {
  if (activeDownload) return activeDownload

  activeDownload = downloadStreamingASRAssetsInternal(onProgress).finally(() => {
    activeDownload = null
    currentProgress = undefined
  })
  return activeDownload
}

function ensureStreamingASRReady(): StreamingASRPaths {
  const status = getStreamingASRStatus()
  if (!status.supported) {
    throw new Error(status.error || 'Streaming ASR runtime is not available')
  }
  if (!status.ready) {
    throw new Error('Streaming ASR or punctuation model is not downloaded yet')
  }
  return getStreamingASRPaths()
}

async function downloadStreamingASRAssetsInternal(
  onProgress?: ProgressCallback,
): Promise<LocalASRStatus> {
  const paths = getStreamingASRPaths()
  if (getReadyModelDirs(paths)) {
    lastError = undefined
    return getStreamingASRStatus()
  }

  const bundles = getModelBundles(paths)
  const pendingBundles = bundles.filter((bundle) => !getReadyBundleModelDir(bundle))
  let completedBytes = bundles
    .filter((bundle) => !pendingBundles.includes(bundle))
    .reduce((total, bundle) => total + bundle.downloadSizeBytes, 0)

  try {
    await Promise.all([terminateWorker(), releaseStreamingPunctuation()])

    updateDownloadProgress(completedBytes, onProgress)
    for (const bundle of pendingBundles) {
      await installModelBundle(bundle, completedBytes, onProgress)
      completedBytes += bundle.downloadSizeBytes
    }

    lastError = undefined
    return getStreamingASRStatus()
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'Streaming ASR download failed'
    throw error
  }
}

function getStreamingASRPaths(): StreamingASRPaths {
  const installDir = path.join(app.getPath('userData'), 'local-asr', 'streaming-paraformer')
  const asrModelDir = path.join(installDir, 'models', STREAMING_ASR.MODEL_VERSION)
  const punctuationInstallDir = path.join(
    app.getPath('userData'),
    'local-asr',
    'streaming-punctuation',
  )
  const punctuationModelDir = path.join(
    punctuationInstallDir,
    'models',
    STREAMING_PUNCTUATION.MODEL_VERSION,
  )
  return {
    installDir,
    asr: {
      modelDir: asrModelDir,
      manifestPath: path.join(asrModelDir, 'model.json'),
      modelPath: path.join(asrModelDir, STREAMING_ASR.ENCODER_FILE),
    },
    punctuation: {
      modelDir: punctuationModelDir,
      manifestPath: path.join(punctuationModelDir, 'model.json'),
      modelPath: path.join(punctuationModelDir, STREAMING_PUNCTUATION.MODEL_FILE),
    },
  }
}

function getModelBundles(paths: StreamingASRPaths): ModelBundle[] {
  return [
    {
      label: 'ASR',
      modelVersion: STREAMING_ASR.MODEL_VERSION,
      healthCheckVersion: STREAMING_ASR.HEALTH_CHECK_VERSION,
      files: STREAMING_ASR.MODEL_FILES,
      downloadSizeBytes: STREAMING_ASR.DOWNLOAD_SIZE_BYTES,
      paths: paths.asr,
      kind: 'asr',
    },
    {
      label: 'punctuation',
      modelVersion: STREAMING_PUNCTUATION.MODEL_VERSION,
      healthCheckVersion: STREAMING_PUNCTUATION.HEALTH_CHECK_VERSION,
      files: STREAMING_PUNCTUATION.MODEL_FILES,
      downloadSizeBytes: STREAMING_PUNCTUATION.DOWNLOAD_SIZE_BYTES,
      paths: paths.punctuation,
      kind: 'punctuation',
    },
  ]
}

function getReadyModelDirs(paths: StreamingASRPaths): ReadyModelDirs | null {
  const [asrBundle, punctuationBundle] = getModelBundles(paths)
  const asrModelDir = getReadyBundleModelDir(asrBundle)
  const punctuationModelDir = getReadyBundleModelDir(punctuationBundle)
  return asrModelDir && punctuationModelDir ? { asrModelDir, punctuationModelDir } : null
}

function getReadyBundleModelDir(bundle: ModelBundle): string | null {
  const developmentModelDir = getDevelopmentModelDir(bundle)
  if (developmentModelDir) return developmentModelDir
  return isInstalledModelReady(bundle) ? bundle.paths.modelDir : null
}

function getDevelopmentModelDir(bundle: ModelBundle): string | null {
  if (app.isPackaged) return null

  const candidates =
    bundle.label === 'ASR'
      ? [
          process.env.VOICEKEY_STREAMING_ASR_MODEL_DIR,
          path.join(process.cwd(), 'resources', 'asr', 'streaming-paraformer'),
        ]
      : [
          process.env.VOICEKEY_STREAMING_PUNCTUATION_MODEL_DIR,
          path.join(process.cwd(), 'resources', 'asr', 'streaming-punctuation'),
        ]

  return (
    candidates
      .filter((candidate): candidate is string => Boolean(candidate))
      .find((candidate) => hasRequiredModelFiles(candidate, bundle.files)) ?? null
  )
}

function hasRequiredModelFiles(modelDir: string, files: readonly ModelFile[]): boolean {
  return files.every((file) => fileHasSize(path.join(modelDir, file.name), file))
}

function isInstalledModelReady(bundle: ModelBundle): boolean {
  return isModelManifestReady(bundle) && hasRequiredModelFiles(bundle.paths.modelDir, bundle.files)
}

function isModelManifestReady(bundle: ModelBundle): boolean {
  if (!fs.existsSync(bundle.paths.manifestPath)) return false

  try {
    const manifest = JSON.parse(fs.readFileSync(bundle.paths.manifestPath, 'utf8')) as Record<
      string,
      unknown
    >
    return (
      manifest.version === bundle.healthCheckVersion &&
      manifest.modelVersion === bundle.modelVersion
    )
  } catch {
    return false
  }
}

function getMissingModelFiles(paths: StreamingASRPaths): string[] {
  const missing: string[] = []

  for (const bundle of getModelBundles(paths)) {
    if (getReadyBundleModelDir(bundle)) continue
    const prefix = bundle.label === 'ASR' ? 'asr' : 'punctuation'
    const missingFiles = bundle.files
      .filter((file) => !fileHasSize(path.join(bundle.paths.modelDir, file.name), file))
      .map((file) => `${prefix}/${file.name}`)

    if (missingFiles.length > 0) {
      missing.push(...missingFiles)
    } else if (!isModelManifestReady(bundle)) {
      missing.push(`${prefix}/model.json`)
    }
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

async function installModelBundle(
  bundle: ModelBundle,
  completedBefore: number,
  onProgress?: ProgressCallback,
): Promise<void> {
  const stagingDir = `${bundle.paths.modelDir}.download`
  let completedInBundle = 0

  try {
    fs.rmSync(stagingDir, { recursive: true, force: true })
    fs.mkdirSync(stagingDir, { recursive: true })

    for (const file of bundle.files) {
      const installedFile = path.join(bundle.paths.modelDir, file.name)
      const stagingFile = path.join(stagingDir, file.name)
      if (fileHasSize(installedFile, file)) {
        try {
          await verifyFileSha256(installedFile, file.sha256)
          fs.copyFileSync(installedFile, stagingFile)
          completedInBundle += file.sizeBytes
          updateDownloadProgress(completedBefore + completedInBundle, onProgress)
          continue
        } catch (error) {
          console.warn(
            `[ASR:Streaming] Existing ${bundle.label} asset failed verification; downloading it again:`,
            error instanceof Error ? error.message : error,
          )
        }
      }

      completedInBundle += await downloadModelFile(
        file,
        stagingFile,
        completedBefore + completedInBundle,
        onProgress,
      )
    }

    await verifyModelBundle(bundle.kind, stagingDir)
    writeModelManifest(path.join(stagingDir, 'model.json'), bundle)

    fs.rmSync(bundle.paths.modelDir, { recursive: true, force: true })
    fs.mkdirSync(path.dirname(bundle.paths.modelDir), { recursive: true })
    fs.renameSync(stagingDir, bundle.paths.modelDir)
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true })
    throw error
  }
}

async function verifyModelBundle(kind: ModelBundle['kind'], modelDir: string): Promise<void> {
  if (kind === 'punctuation') {
    await verifyStreamingPunctuation(modelDir)
    return
  }

  try {
    await callWorker<void>({ command: 'verify', modelDir })
  } finally {
    await terminateWorker()
  }
}

function getWorker(): Worker {
  if (streamingWorker) return streamingWorker

  const worker = new Worker(getWorkerUrl(), {
    workerData: {
      sherpaModulePath: nodeRequire.resolve('sherpa-onnx'),
      audioConfig: { sampleRate: AUDIO_CONFIG.SAMPLE_RATE },
      model: {
        encoderFile: STREAMING_ASR.ENCODER_FILE,
        decoderFile: STREAMING_ASR.DECODER_FILE,
        tokensFile: STREAMING_ASR.TOKENS_FILE,
        endpointRules: STREAMING_ASR.ENDPOINT_RULES,
      },
    },
  })
  streamingWorker = worker

  worker.on('message', (response: WorkerResponse) => {
    if ('event' in response) {
      const session = activeSession
      if (!session || session.id !== response.sessionId) return

      if (response.event === 'partial') {
        session.callbacks.onPartial(response.text)
      } else {
        reportSessionError(session, new Error(response.error))
      }
      return
    }

    const request = workerRequests.get(response.id)
    if (!request) return
    workerRequests.delete(response.id)
    if (response.ok) {
      request.resolve(response.result)
    } else {
      request.reject(new Error(response.error))
    }
  })

  worker.on('error', (error) => {
    if (streamingWorker !== worker) return
    streamingWorker = null
    clearWorkerIdleTimer()
    const workerError = error instanceof Error ? error : new Error('Streaming ASR worker failed')
    rejectAllWorkerRequests(workerError)
    if (activeSession) reportSessionError(activeSession, workerError)
  })

  worker.on('exit', (code) => {
    if (streamingWorker !== worker) return
    streamingWorker = null
    clearWorkerIdleTimer()
    if (code !== 0) {
      const error = new Error(`Streaming ASR worker exited with code ${code}`)
      rejectAllWorkerRequests(error)
      if (activeSession) reportSessionError(activeSession, error)
    }
  })

  return worker
}

function getWorkerUrl(): URL {
  const currentFilePath = fileURLToPath(import.meta.url)
  return pathToFileURL(path.join(path.dirname(currentFilePath), 'streaming-asr-worker.mjs'))
}

function callWorker<T extends StreamingASRFinalResult | void>(
  command: WorkerCommandInput,
): Promise<T> {
  const worker = getWorker()
  const id = nextWorkerRequestId++

  return new Promise<T>((resolve, reject) => {
    workerRequests.set(id, {
      resolve: resolve as (value: StreamingASRFinalResult | void) => void,
      reject,
    })
    try {
      worker.postMessage({ ...command, id } satisfies WorkerCommand)
    } catch (error) {
      workerRequests.delete(id)
      reject(error instanceof Error ? error : new Error('Failed to post streaming ASR request'))
    }
  })
}

function reportSessionError(session: ActiveStreamingSession, error: Error): void {
  if (!session.failure) session.failure = error
  void releaseStreamingPunctuation().catch((releaseError: unknown) => {
    console.error(
      '[ASR:Streaming] Failed to release punctuation worker after session error:',
      releaseError instanceof Error ? releaseError.message : releaseError,
    )
  })
  if (session.errorReported) return
  session.errorReported = true
  session.callbacks.onError(error)
}

async function terminateWorker(): Promise<void> {
  clearWorkerIdleTimer()
  const worker = streamingWorker
  if (!worker) return

  streamingWorker = null
  activeSession = null
  rejectAllWorkerRequests(new Error('Streaming ASR worker was restarted'))
  await worker.terminate()
}

function clearWorkerIdleTimer(): void {
  if (!streamingWorkerIdleTimer) return
  clearTimeout(streamingWorkerIdleTimer)
  streamingWorkerIdleTimer = null
}

function scheduleWorkerIdleTermination(): void {
  clearWorkerIdleTimer()
  if (!streamingWorker || activeSession) return

  streamingWorkerIdleTimer = setTimeout(() => {
    streamingWorkerIdleTimer = null
    console.log(
      `[ASR:Streaming] Releasing worker after ${STREAMING_ASR.WORKER_IDLE_TIMEOUT_MS / 60_000} minutes of inactivity`,
    )
    void terminateWorker().catch((error: unknown) => {
      console.error(
        '[ASR:Streaming] Failed to release idle worker:',
        error instanceof Error ? error.message : error,
      )
    })
  }, STREAMING_ASR.WORKER_IDLE_TIMEOUT_MS)
  streamingWorkerIdleTimer.unref()
}

function rejectAllWorkerRequests(error: Error): void {
  for (const request of workerRequests.values()) request.reject(error)
  workerRequests.clear()
}

function writeModelManifest(manifestPath: string, bundle: ModelBundle): void {
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        version: bundle.healthCheckVersion,
        modelVersion: bundle.modelVersion,
        files: bundle.files.map(({ name, sizeBytes, sha256 }) => ({
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
        throw new Error(`Downloaded realtime model asset has unexpected size: ${file.name}`)
      }
      return sourceBytes
    },
    ({ source, nextSource, error }) => {
      console.warn(
        `[ASR:Streaming] Downloading ${file.name} from ${new URL(source).host} failed; ` +
          `trying ${new URL(nextSource).host}: ${error.message}`,
      )
    },
  )

  fs.renameSync(tempPath, outputPath)
  return downloadedBytes
}

function updateDownloadProgress(receivedBytes: number, onProgress?: ProgressCallback): void {
  const totalBytes = STREAMING_ASR.DOWNLOAD_SIZE_BYTES + STREAMING_PUNCTUATION.DOWNLOAD_SIZE_BYTES
  currentProgress = {
    phase: 'model',
    receivedBytes,
    totalBytes,
    percent: Math.min(100, Math.round((receivedBytes / totalBytes) * 100)),
  }
  onProgress?.(currentProgress)
}

function verifyFileSha256(filePath: string, expectedSha256: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk: Buffer) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => {
      if (hash.digest('hex') === expectedSha256.toLowerCase()) {
        resolve()
        return
      }
      fs.rmSync(filePath, { force: true })
      reject(new Error('Downloaded realtime model asset failed checksum verification'))
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
      reject(new Error('Too many redirects while downloading streaming ASR assets'))
      return
    }

    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== 'https:') {
      reject(new Error('Realtime model downloads must use HTTPS'))
      return
    }

    let fileStream: fs.WriteStream | null = null
    const failWithCleanup = (error: Error) => {
      fileStream?.destroy()
      fileStream = null
      try {
        fs.rmSync(outputPath, { force: true })
      } catch {
        // The caller removes the whole staging directory.
      }
      reject(error)
    }

    const request = https.get(
      parsedUrl,
      { headers: { 'User-Agent': 'VoiceKey' }, timeout: DOWNLOAD_IDLE_TIMEOUT_MS },
      (response: IncomingMessage) => {
        const statusCode = response.statusCode ?? 0
        const location = response.headers.location
        if (statusCode >= 300 && statusCode < 400 && location) {
          response.resume()
          requestDownload(
            new URL(location, parsedUrl).toString(),
            outputPath,
            downloadedBefore,
            onProgress,
            redirectCount + 1,
          )
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
          updateDownloadProgress(
            Math.min(
              STREAMING_ASR.DOWNLOAD_SIZE_BYTES + STREAMING_PUNCTUATION.DOWNLOAD_SIZE_BYTES,
              downloadedBefore + receivedBytes,
            ),
            onProgress,
          )
        })
        response.on('error', (error) => {
          failWithCleanup(new Error(`Download stream failed: ${error.message}`))
        })
        response.pipe(file)
        file.on('finish', () => {
          fileStream = null
          file.close(() => resolve())
        })
        file.on('error', failWithCleanup)
      },
    )

    request.on('timeout', () => {
      request.destroy(
        new Error(
          `Download timed out after ${DOWNLOAD_IDLE_TIMEOUT_MS / 1000}s without receiving data`,
        ),
      )
    })
    request.on('error', failWithCleanup)
  })
}
