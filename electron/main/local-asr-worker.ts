import { createRequire } from 'node:module'
import { cpus } from 'node:os'
import path from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'

type LocalASRWorkerData = {
  sherpaModulePath: string
  audioConfig: {
    sampleRate: number
  }
  localASR: {
    modelFile: string
    tokensFile: string
    language: string
  }
}

type LocalASRRunResult = { stdout: string; stderr: string }
type WorkerCommand =
  | { id: number; command: 'transcribe'; audioFilePath: string; modelDir: string }
  | { id: number; command: 'verify'; modelDir: string }
  | { id: number; command: 'release' }

type OfflineStream = {
  acceptWaveform(sampleRate: number, samples: Float32Array): void
  free(): void
}

type OfflineRecognizer = {
  createStream(): OfflineStream
  decode(stream: OfflineStream): void
  getResult(stream: OfflineStream): { text?: string }
  free(): void
}

type SherpaModule = {
  createOfflineRecognizer(config: unknown): OfflineRecognizer
  readWave(audioFilePath: string): { samples: Float32Array; sampleRate: number }
}

if (!parentPort) {
  throw new Error('Local ASR worker requires parentPort')
}

const port = parentPort
const nodeRequire = createRequire(import.meta.url)
const data = workerData as LocalASRWorkerData
const sherpa = nodeRequire(data.sherpaModulePath) as SherpaModule

let cachedRecognizer: OfflineRecognizer | null = null
let cachedRecognizerModelDir: string | null = null

function recognizerThreadCount(): number {
  return Math.max(1, Math.min(4, Math.floor(cpus().length / 2) || 1))
}

function createRecognizer(modelDir: string): OfflineRecognizer {
  return sherpa.createOfflineRecognizer({
    featConfig: { sampleRate: data.audioConfig.sampleRate, featureDim: 80 },
    modelConfig: {
      senseVoice: {
        model: path.join(modelDir, data.localASR.modelFile),
        language: data.localASR.language,
        useInverseTextNormalization: 1,
      },
      tokens: path.join(modelDir, data.localASR.tokensFile),
      numThreads: recognizerThreadCount(),
      provider: 'cpu',
      debug: 0,
    },
  })
}

function releaseCachedRecognizer(): void {
  cachedRecognizer?.free()
  cachedRecognizer = null
  cachedRecognizerModelDir = null
}

function getCachedRecognizer(modelDir: string): OfflineRecognizer {
  if (!cachedRecognizer || cachedRecognizerModelDir !== modelDir) {
    releaseCachedRecognizer()
    cachedRecognizer = createRecognizer(modelDir)
    cachedRecognizerModelDir = modelDir
  }
  return cachedRecognizer
}

function verifyModel(modelDir: string): void {
  const recognizer = createRecognizer(modelDir)
  recognizer.free()
}

function transcribe(audioFilePath: string, modelDir: string): LocalASRRunResult {
  const wave = sherpa.readWave(audioFilePath)
  if (!(wave.samples instanceof Float32Array) || wave.samples.length === 0) {
    return { stdout: '', stderr: 'Local ASR input audio contains no samples' }
  }

  if (wave.sampleRate !== data.audioConfig.sampleRate) {
    throw new Error(
      `Local ASR expected ${data.audioConfig.sampleRate}Hz WAV input but received ${wave.sampleRate}Hz`,
    )
  }

  const recognizer = getCachedRecognizer(modelDir)
  const stream = recognizer.createStream()
  try {
    stream.acceptWaveform(wave.sampleRate, wave.samples)
    recognizer.decode(stream)
    const result = recognizer.getResult(stream)
    return { stdout: result.text || '', stderr: '' }
  } finally {
    stream.free()
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Local ASR worker failed'
}

port.on('message', (message: WorkerCommand) => {
  try {
    if (message.command === 'release') {
      releaseCachedRecognizer()
      port.postMessage({ id: message.id, ok: true })
      return
    }

    if (message.command === 'verify') {
      verifyModel(message.modelDir)
      port.postMessage({ id: message.id, ok: true })
      return
    }

    if (message.command === 'transcribe') {
      const result = transcribe(message.audioFilePath, message.modelDir)
      port.postMessage({ id: message.id, ok: true, result })
      return
    }

    throw new Error(
      `Unknown local ASR worker command: ${(message as { command?: string }).command}`,
    )
  } catch (error) {
    port.postMessage({
      id: message.id,
      ok: false,
      error: getErrorMessage(error),
    })
  }
})
