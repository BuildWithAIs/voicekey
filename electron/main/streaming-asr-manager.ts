import { app } from 'electron'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { t } from './i18n'
import { configManager } from './config-manager'
import { RECORDING, AUDIO_CONFIG, STREAMING_ASR } from '../shared/constants'
import type {
  LocalASRDownloadProgress,
  LocalASRStatus,
  StreamingAudioFramePayload,
} from '../shared/types'
import { getASRModelStorageDir, removeManagedASRInstallDir } from './asr-model-storage'
import { detectPublicIpCountryCode, orderDownloadSourcesForCountry } from './download-region'
import { downloadASRAsset } from './asr-download'
import { getASRIdleTimeout, getASRThreadCount, watchASRMemory } from './asr-runtime-policy'

type ModelFile = (typeof STREAMING_ASR.MODEL_FILES)[number]

type ModelBundlePaths = {
  modelDir: string
  manifestPath: string
  modelPath: string
}

type StreamingASRPaths = {
  installDir: string
  asr: ModelBundlePaths
}

type ReadyModelDirs = {
  asrModelDir: string
}

type ModelBundle = {
  label: 'ASR'
  modelVersion: string
  healthCheckVersion: number
  files: readonly ModelFile[]
  downloadSizeBytes: number
  paths: ModelBundlePaths
}

type ProgressCallback = (progress: LocalASRDownloadProgress) => void
type StreamingASRFinalResult = { text: string }
type WorkerCommandInput =
  | { command: 'verify'; modelDir: string }
  | { command: 'warm'; modelDir: string; terms: string[] }
  | { command: 'start'; sessionId: string; modelDir: string; terms: string[] }
  | { command: 'finish'; sessionId: string }
  | { command: 'cancel'; sessionId: string }
  | { command: 'release' }
type WorkerCommand = WorkerCommandInput & { id: number }
type WorkerResponse =
  | { id: number; ok: true; result?: StreamingASRFinalResult }
  | { id: number; ok: false; error: string }
  | { event: 'consumed'; sessionId: string; sequence: number }
  | { event: 'partial'; sessionId: string; text: string }
  | { event: 'session-error'; sessionId: string; error: string }
type WorkerRequest = {
  resolve: (value: StreamingASRFinalResult | void) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
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
  pendingFrames: Map<number, number>
  pendingSeconds: number
  backlogLimitSeconds: number
  catchupDeadline: number | null
  failure: Error | null
  errorReported: boolean
  callbacks: StreamingSessionCallbacks
}

const nodeRequire = createRequire(import.meta.url)

let downloadController: AbortController | null = null
let activeDownload: Promise<LocalASRStatus> | null = null
let deletingAssets = false
let currentProgress: LocalASRDownloadProgress | undefined
let lastError: string | undefined
let streamingWorker: Worker | null = null
let streamingWorkerIdleTimer: NodeJS.Timeout | null = null
let activeSession: ActiveStreamingSession | null = null
let stopMemoryWatch: (() => void) | null = null
let workerThreadCount = 0
let runtimeReady = false
let terminating: Promise<void> | null = null
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
    runtimeState: runtimeReady ? 'ready' : streamingWorker ? 'loading' : 'unloaded',
    modelName: STREAMING_ASR.MODEL_NAME,
    installDir: paths.installDir,
    hasFiles: fs.existsSync(paths.installDir),
    storageDir: getASRModelStorageDir(),
    modelPath: modelDirs
      ? path.join(modelDirs.asrModelDir, STREAMING_ASR.ENCODER_FILE)
      : paths.asr.modelPath,
    missing,
    downloadSizeBytes: STREAMING_ASR.DOWNLOAD_SIZE_BYTES,
    progress: currentProgress,
    error: lastError,
  }
}

export async function startStreamingASRSession(
  sessionId: string,
  callbacks: StreamingSessionCallbacks,
): Promise<void> {
  if (deletingAssets) {
    throw new Error('Streaming ASR model deletion is in progress')
  }

  clearWorkerIdleTimer()

  if (activeSession && activeSession.id !== sessionId) {
    await cancelStreamingASRSession(activeSession.id)
  }

  if (streamingWorker && workerThreadCount !== getASRThreadCount()) await terminateWorker()
  const paths = ensureStreamingASRReady()
  const modelDirs = getReadyModelDirs(paths)
  if (!modelDirs) {
    throw new Error('Streaming ASR model is not downloaded yet')
  }

  const session: ActiveStreamingSession = {
    id: sessionId,
    ready: Promise.resolve(),
    frameQueue: Promise.resolve(),
    lastSequence: -1,
    pendingFrames: new Map(),
    pendingSeconds: 0,
    backlogLimitSeconds: RECORDING.MAX_STREAMING_STARTUP_SECONDS,
    catchupDeadline: null,
    failure: null,
    errorReported: false,
    callbacks,
  }
  activeSession = session

  session.ready = callWorker<void>({
    command: 'start',
    terms: configManager.getUserDictionary(),
    sessionId,
    modelDir: modelDirs.asrModelDir,
  }).catch((error) => {
    reportSessionError(session, error)
    throw error
  })

  await session.ready
  // Loading is slower than steady-state inference. Permit a bounded capture
  // buffer during cold start, then require the recognizer to catch up promptly.
  session.backlogLimitSeconds = Math.max(
    RECORDING.MAX_STREAMING_BACKLOG_SECONDS,
    session.pendingSeconds + 0.5,
  )
  session.catchupDeadline = Date.now() + RECORDING.STREAMING_CATCHUP_TIMEOUT_MS
}

export async function warmStreamingASR(): Promise<void> {
  // A warm request must not replace an active session's dictionary/recognizer.
  if (activeSession) return
  if (deletingAssets) {
    throw new Error('Streaming ASR model deletion is in progress')
  }

  clearWorkerIdleTimer()
  if (streamingWorker && workerThreadCount !== getASRThreadCount()) await terminateWorker()
  const paths = ensureStreamingASRReady()
  const modelDirs = getReadyModelDirs(paths)
  if (!modelDirs) {
    throw new Error('Streaming ASR model is not downloaded yet')
  }

  try {
    await callWorker<void>({
      command: 'warm',
      modelDir: modelDirs.asrModelDir,
      terms: configManager.getUserDictionary(),
    })
  } finally {
    scheduleWorkerIdleTermination()
  }
}

export function pushStreamingAudioFrame(payload: StreamingAudioFramePayload): void {
  const session = activeSession
  if (!session || session.id !== payload.sessionId || session.failure) return
  if (payload.sequence !== session.lastSequence + 1) {
    reportSessionError(session, new Error(t('errors.audioSequence')))
    return
  }
  const seconds = payload.buffer.byteLength / Float32Array.BYTES_PER_ELEMENT / payload.sampleRate
  if (
    session.catchupDeadline !== null &&
    session.pendingSeconds <= RECORDING.MAX_STREAMING_BACKLOG_SECONDS
  ) {
    session.backlogLimitSeconds = RECORDING.MAX_STREAMING_BACKLOG_SECONDS
    session.catchupDeadline = null
  }
  if (
    session.pendingSeconds + seconds > session.backlogLimitSeconds ||
    (session.catchupDeadline !== null && Date.now() > session.catchupDeadline)
  ) {
    reportSessionError(session, new Error(t('errors.asrOverloaded')))
    return
  }
  session.pendingSeconds += seconds
  session.pendingFrames.set(payload.sequence, seconds)

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

export async function finishStreamingASRSession(
  sessionId: string,
  finalSequence?: number,
): Promise<string> {
  const session = activeSession
  if (!session || session.id !== sessionId) {
    throw new Error('Streaming ASR session is not active')
  }

  try {
    if (finalSequence !== undefined && finalSequence !== session.lastSequence + 1)
      throw new Error(t('errors.audioSequence'))
    await session.ready
    await session.frameQueue
    if (session.failure) throw session.failure

    const result = await callWorker<StreamingASRFinalResult>({ command: 'finish', sessionId })
    session.callbacks.onPartial(result.text)
    return result.text
  } catch (error) {
    await terminateWorker()
    throw error
  } finally {
    if (activeSession === session) {
      activeSession = null
    }
    scheduleWorkerIdleTermination()
  }
}

export async function cancelStreamingASRSession(sessionId: string): Promise<void> {
  const session = activeSession
  if (!session || session.id !== sessionId) return

  // Termination bypasses queued PCM and synchronous inference. Never queue a
  // cancel command behind the work the user is trying to stop.
  activeSession = null
  await terminateWorker()
}

export async function releaseStreamingASR(): Promise<void> {
  if (activeSession) {
    throw new Error('Cannot release streaming ASR while a session is active')
  }
  await terminateWorker()
}

export async function deleteStreamingASRAssets(): Promise<LocalASRStatus> {
  if (activeDownload) {
    throw new Error('Cannot delete streaming ASR models while they are downloading')
  }
  if (deletingAssets) {
    throw new Error('Streaming ASR model deletion is already in progress')
  }

  deletingAssets = true
  try {
    if (activeSession) {
      throw new Error('Cannot delete streaming ASR models while a session is active')
    }

    await releaseStreamingASR()
    const paths = getStreamingASRPaths()
    removeManagedASRInstallDir(paths.installDir)
    currentProgress = undefined
    lastError = undefined
    return getStreamingASRStatus()
  } finally {
    deletingAssets = false
  }
}

export async function cancelStreamingASRDownload(): Promise<void> {
  if (!activeDownload) return
  downloadController?.abort()
  await terminateWorker()
  await activeDownload.catch(() => undefined)
}

export async function downloadStreamingASRAssets(
  onProgress?: ProgressCallback,
): Promise<LocalASRStatus> {
  if (deletingAssets) {
    throw new Error('Cannot download streaming ASR models while deletion is in progress')
  }
  if (activeDownload) return activeDownload

  downloadController = new AbortController()
  activeDownload = downloadStreamingASRAssetsInternal(onProgress).finally(() => {
    activeDownload = null
    downloadController = null
    currentProgress = undefined
  })
  await activeDownload
  return getStreamingASRStatus()
}

function ensureStreamingASRReady(): StreamingASRPaths {
  const status = getStreamingASRStatus()
  if (!status.supported) {
    throw new Error(status.error || 'Streaming ASR runtime is not available')
  }
  if (!status.ready) {
    throw new Error('Streaming ASR model is not downloaded yet')
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
    await terminateWorker()
    const sourceCountryCode = await detectPublicIpCountryCode()

    updateDownloadProgress(completedBytes, onProgress)
    for (const bundle of pendingBundles) {
      await installModelBundle(bundle, completedBytes, sourceCountryCode, onProgress)
      completedBytes += bundle.downloadSizeBytes
    }

    lastError = undefined
    return getStreamingASRStatus()
  } catch (error) {
    lastError = downloadController?.signal.aborted
      ? undefined
      : error instanceof Error
        ? error.message
        : 'Streaming ASR download failed'
    throw error
  }
}

function getStreamingASRPaths(): StreamingASRPaths {
  const storageDir = getASRModelStorageDir()
  const installDir = path.join(storageDir, 'x-asr-480ms')
  const asrModelDir = path.join(installDir, 'models', STREAMING_ASR.MODEL_VERSION)
  return {
    installDir,
    asr: {
      modelDir: asrModelDir,
      manifestPath: path.join(asrModelDir, 'model.json'),
      modelPath: path.join(asrModelDir, STREAMING_ASR.ENCODER_FILE),
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
    },
  ]
}

function getReadyModelDirs(paths: StreamingASRPaths): ReadyModelDirs | null {
  const [asrBundle] = getModelBundles(paths)
  const asrModelDir = getReadyBundleModelDir(asrBundle)
  return asrModelDir ? { asrModelDir } : null
}

function getReadyBundleModelDir(bundle: ModelBundle): string | null {
  const developmentModelDir = getDevelopmentModelDir(bundle)
  if (developmentModelDir) return developmentModelDir
  return isInstalledModelReady(bundle) ? bundle.paths.modelDir : null
}

function getDevelopmentModelDir(bundle: ModelBundle): string | null {
  if (app.isPackaged) return null

  const candidates = [
    process.env.VOICEKEY_STREAMING_ASR_MODEL_DIR,
    path.join(process.cwd(), 'resources', 'asr', 'x-asr-480ms'),
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
    const missingFiles = bundle.files
      .filter((file) => !fileHasSize(path.join(bundle.paths.modelDir, file.name), file))
      .map((file) => `asr/${file.name}`)

    if (missingFiles.length > 0) {
      missing.push(...missingFiles)
    } else if (!isModelManifestReady(bundle)) {
      missing.push('asr/model.json')
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
  sourceCountryCode: string | null,
  onProgress?: ProgressCallback,
): Promise<void> {
  const stagingDir = `${bundle.paths.modelDir}.download`
  let completedInBundle = 0

  {
    fs.mkdirSync(stagingDir, { recursive: true })

    for (const file of bundle.files) {
      const stagingFile = path.join(stagingDir, file.name)
      completedInBundle += await downloadModelFile(
        file,
        stagingFile,
        completedBefore + completedInBundle,
        sourceCountryCode,
        onProgress,
      )
    }

    downloadController!.signal.throwIfAborted()
    currentProgress = { ...currentProgress!, phase: 'initialize' }
    onProgress?.(currentProgress)
    await verifyModelBundle(stagingDir)
    downloadController!.signal.throwIfAborted()
    writeModelManifest(path.join(stagingDir, 'model.json'), bundle)

    fs.rmSync(bundle.paths.modelDir, { recursive: true, force: true })
    fs.mkdirSync(path.dirname(bundle.paths.modelDir), { recursive: true })
    fs.renameSync(stagingDir, bundle.paths.modelDir)
  }
}

async function verifyModelBundle(modelDir: string): Promise<void> {
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
      numThreads: getASRThreadCount(),
      sherpaModulePath: nodeRequire.resolve('sherpa-onnx'),
      audioConfig: { sampleRate: AUDIO_CONFIG.SAMPLE_RATE },
      model: {
        encoderFile: STREAMING_ASR.ENCODER_FILE,
        decoderFile: STREAMING_ASR.DECODER_FILE,
        joinerFile: STREAMING_ASR.JOINER_FILE,
        tokensFile: STREAMING_ASR.TOKENS_FILE,
        modelType: STREAMING_ASR.MODEL_TYPE,
        finalTailPaddingMs: STREAMING_ASR.FINAL_TAIL_PADDING_MS,
        endpointRules: STREAMING_ASR.ENDPOINT_RULES,
      },
    },
  })
  streamingWorker = worker
  workerThreadCount = getASRThreadCount()
  stopMemoryWatch = watchASRMemory(() => {
    const error = new Error(t('errors.asrMemory'))
    rejectAllWorkerRequests(error)
    if (activeSession) reportSessionError(activeSession, error)
    void terminateWorker()
  })

  worker.on('message', (response: WorkerResponse) => {
    if ('event' in response) {
      const session = activeSession
      if (!session || session.id !== response.sessionId) return

      if (response.event === 'consumed') {
        session.pendingSeconds = Math.max(
          0,
          session.pendingSeconds - (session.pendingFrames.get(response.sequence) ?? 0),
        )
        session.pendingFrames.delete(response.sequence)
        return
      }
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
    clearTimeout(request.timer)
    if (response.ok) {
      runtimeReady = true
      request.resolve(response.result)
    } else {
      request.reject(new Error(response.error))
    }
  })

  worker.on('error', (error) => {
    if (streamingWorker !== worker) return
    streamingWorker = null
    stopMemoryWatch?.()
    stopMemoryWatch = null
    runtimeReady = false
    clearWorkerIdleTimer()
    const workerError = error instanceof Error ? error : new Error('Streaming ASR worker failed')
    rejectAllWorkerRequests(workerError)
    if (activeSession) reportSessionError(activeSession, workerError)
  })

  worker.on('exit', (code) => {
    if (streamingWorker !== worker) return
    streamingWorker = null
    stopMemoryWatch?.()
    stopMemoryWatch = null
    runtimeReady = false
    clearWorkerIdleTimer()
    {
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

async function callWorker<T extends StreamingASRFinalResult | void>(
  command: WorkerCommandInput,
): Promise<T> {
  if (terminating) await terminating
  const worker = getWorker()
  const id = nextWorkerRequestId++

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const request = workerRequests.get(id)
      if (!request) return
      workerRequests.delete(id)
      request.reject(new Error('ASR operation timed out'))
      void terminateWorker()
    }, RECORDING.WORKER_TIMEOUT_MS)
    workerRequests.set(id, {
      timer,
      resolve: resolve as (value: StreamingASRFinalResult | void) => void,
      reject,
    })
    try {
      worker.postMessage({ ...command, id } satisfies WorkerCommand)
    } catch (error) {
      workerRequests.delete(id)
      clearTimeout(timer)
      reject(error instanceof Error ? error : new Error('Failed to post streaming ASR request'))
    }
  })
}

function reportSessionError(session: ActiveStreamingSession, error: Error): void {
  if (!session.failure) session.failure = error
  if (session.errorReported) return
  session.errorReported = true
  session.callbacks.onError(error)
}

async function terminateWorker(): Promise<void> {
  clearWorkerIdleTimer()
  activeSession = null
  if (terminating) return terminating
  const worker = streamingWorker
  if (!worker) return
  streamingWorker = null
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

function clearWorkerIdleTimer(): void {
  if (!streamingWorkerIdleTimer) return
  clearTimeout(streamingWorkerIdleTimer)
  streamingWorkerIdleTimer = null
}

function scheduleWorkerIdleTermination(): void {
  clearWorkerIdleTimer()
  if (!streamingWorker || activeSession) return
  const idleSince = Date.now()
  const check = () => {
    if (Date.now() - idleSince >= getASRIdleTimeout()) {
      streamingWorkerIdleTimer = null
      void terminateWorker().catch((error: unknown) =>
        console.error('[ASR] Idle release failed:', error),
      )
      return
    }
    streamingWorkerIdleTimer = setTimeout(check, 30_000)
    streamingWorkerIdleTimer.unref()
  }
  streamingWorkerIdleTimer = setTimeout(check, 30_000)
  streamingWorkerIdleTimer.unref()
}

function rejectAllWorkerRequests(error: Error): void {
  for (const request of workerRequests.values()) {
    clearTimeout(request.timer)
    request.reject(error)
  }
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
  sourceCountryCode: string | null,
  onProgress?: ProgressCallback,
): Promise<number> {
  return downloadASRAsset(
    { ...file, urls: orderDownloadSourcesForCountry(file.urls, sourceCountryCode) },
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
    totalBytes: STREAMING_ASR.DOWNLOAD_SIZE_BYTES,
    percent: Math.min(100, Math.round((receivedBytes / STREAMING_ASR.DOWNLOAD_SIZE_BYTES) * 100)),
  }
  onProgress?.(currentProgress)
}
