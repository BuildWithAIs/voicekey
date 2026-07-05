import { app } from 'electron'
import fs from 'fs'
import { createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import https from 'node:https'
import { createRequire } from 'node:module'
import { cpus } from 'node:os'
import path from 'node:path'
import { AUDIO_CONFIG, LOCAL_ASR } from '../shared/constants'
import type { LocalASRDownloadProgress, LocalASRStatus } from '../shared/types'

type ModelFile = (typeof LOCAL_ASR.MODEL_FILES)[number]

type LocalASRPaths = {
  installDir: string
  modelDir: string
  manifestPath: string
  modelPath: string
}

type ProgressCallback = (progress: LocalASRDownloadProgress) => void
type LocalASRRunResult = { stdout: string; stderr: string }

type SherpaWave = {
  samples: Float32Array
  sampleRate: number
}

type SherpaResult = {
  text?: string
  timestamps?: number[]
  tokens?: string[]
}

type SherpaStream = {
  acceptWaveform(sampleRate: number, samples: Float32Array): void
  free(): void
}

type SherpaRecognizer = {
  createStream(): SherpaStream
  decode(stream: SherpaStream): void
  getResult(stream: SherpaStream): SherpaResult
  free(): void
}

type SherpaOnnx = {
  readWave(filePath: string): SherpaWave
  createOfflineRecognizer(config: unknown): SherpaRecognizer
}

const nodeRequire = createRequire(import.meta.url)

let activeDownload: Promise<LocalASRStatus> | null = null
let currentProgress: LocalASRDownloadProgress | undefined
let lastError: string | undefined
let cachedSherpa: SherpaOnnx | null = null
let cachedRecognizer: SherpaRecognizer | null = null
let cachedRecognizerModelDir: string | null = null
let recognitionQueue: Promise<void> = Promise.resolve()

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
  const run = async (): Promise<LocalASRRunResult> => {
    const sherpaLoadError = getSherpaLoadError()
    if (sherpaLoadError) {
      throw new Error(sherpaLoadError)
    }

    const paths = ensureLocalASRReady()
    const modelDir = getReadyModelDir(paths)
    if (!modelDir) {
      throw new Error('Local ASR model is not downloaded yet')
    }

    return transcribeWithSherpa(audioFilePath, modelDir)
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
  const sherpaLoadError = getSherpaLoadError()
  if (sherpaLoadError) {
    throw new Error(sherpaLoadError)
  }

  const paths = getLocalASRPaths()
  const readyModelDir = getReadyModelDir(paths)
  if (readyModelDir) {
    lastError = undefined
    return getLocalASRStatus()
  }

  const stagingDir = `${paths.modelDir}.download`
  let downloadedBytes = 0

  try {
    releaseCachedRecognizer()
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

    verifyLocalASRModel(stagingDir)
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

function getSherpaLoadError(): string | undefined {
  try {
    sherpa()
    return undefined
  } catch (error) {
    const message = error instanceof Error ? error.message : 'sherpa-onnx failed to load'
    return `Local ASR runtime failed to load: ${message}`
  }
}

function sherpa(): SherpaOnnx {
  if (!cachedSherpa) {
    cachedSherpa = nodeRequire('sherpa-onnx') as SherpaOnnx
  }
  return cachedSherpa
}

function recognizerThreadCount(): number {
  return Math.max(1, Math.min(4, Math.floor(cpus().length / 2) || 1))
}

function createRecognizer(modelDir: string): SherpaRecognizer {
  return sherpa().createOfflineRecognizer({
    featConfig: { sampleRate: AUDIO_CONFIG.SAMPLE_RATE, featureDim: 80 },
    modelConfig: {
      senseVoice: {
        model: path.join(modelDir, LOCAL_ASR.MODEL_FILE),
        language: LOCAL_ASR.LANGUAGE,
        useInverseTextNormalization: 1,
      },
      tokens: path.join(modelDir, LOCAL_ASR.TOKENS_FILE),
      numThreads: recognizerThreadCount(),
      provider: 'cpu',
      debug: 0,
    },
  })
}

function getCachedRecognizer(modelDir: string): SherpaRecognizer {
  if (!cachedRecognizer || cachedRecognizerModelDir !== modelDir) {
    releaseCachedRecognizer()
    cachedRecognizer = createRecognizer(modelDir)
    cachedRecognizerModelDir = modelDir
  }

  return cachedRecognizer
}

function releaseCachedRecognizer(): void {
  cachedRecognizer?.free()
  cachedRecognizer = null
  cachedRecognizerModelDir = null
}

function verifyLocalASRModel(modelDir: string): void {
  const recognizer = createRecognizer(modelDir)
  recognizer.free()
}

function transcribeWithSherpa(audioFilePath: string, modelDir: string): LocalASRRunResult {
  const wave = sherpa().readWave(audioFilePath)
  if (!(wave.samples instanceof Float32Array) || wave.samples.length === 0) {
    return { stdout: '', stderr: 'Local ASR input audio contains no samples' }
  }

  if (wave.sampleRate !== AUDIO_CONFIG.SAMPLE_RATE) {
    throw new Error(
      `Local ASR expected ${AUDIO_CONFIG.SAMPLE_RATE}Hz WAV input but received ${wave.sampleRate}Hz`,
    )
  }

  const recognizer = getCachedRecognizer(modelDir)
  const stream = recognizer.createStream()
  try {
    stream.acceptWaveform(wave.sampleRate, wave.samples)
    recognizer.decode(stream)
    const result = recognizer.getResult(stream)
    return { stdout: result.text ?? '', stderr: '' }
  } finally {
    stream.free()
  }
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

  await requestDownload(file.url, tempPath, downloadedBefore, onProgress)
  await verifyFileSha256(tempPath, file.sha256)

  const downloadedBytes = fs.statSync(tempPath).size
  if (downloadedBytes !== file.sizeBytes) {
    fs.rmSync(tempPath, { force: true })
    throw new Error(`Downloaded local ASR asset has unexpected size: ${file.name}`)
  }

  fs.renameSync(tempPath, outputPath)
  return downloadedBytes
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

    const request = https.get(
      parsedUrl,
      {
        headers: {
          'User-Agent': 'VoiceKey',
        },
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

        response.on('data', (chunk: Buffer) => {
          receivedBytes += chunk.length
          const totalReceivedBytes = Math.min(
            LOCAL_ASR.DOWNLOAD_SIZE_BYTES,
            downloadedBefore + receivedBytes,
          )
          currentProgress = {
            phase: 'model',
            receivedBytes: totalReceivedBytes,
            totalBytes: LOCAL_ASR.DOWNLOAD_SIZE_BYTES,
            percent: Math.min(
              100,
              Math.round((totalReceivedBytes / LOCAL_ASR.DOWNLOAD_SIZE_BYTES) * 100),
            ),
          }
          onProgress?.(currentProgress)
        })

        response.pipe(file)
        file.on('finish', () => {
          file.close(() => resolve())
        })
        file.on('error', (error) => {
          fs.rmSync(outputPath, { force: true })
          reject(error)
        })
      },
    )

    request.on('error', (error) => {
      fs.rmSync(outputPath, { force: true })
      reject(error)
    })
  })
}
