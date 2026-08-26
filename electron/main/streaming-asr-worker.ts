import { createRequire } from 'node:module'
import { cpus } from 'node:os'
import path from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'

type StreamingASRWorkerData = {
  sherpaModulePath: string
  audioConfig: { sampleRate: number }
  model: {
    encoderFile: string
    decoderFile: string
    tokensFile: string
    endpointRules: {
      rule1MinTrailingSilence: number
      rule2MinTrailingSilence: number
      rule3MinUtteranceLength: number
    }
  }
}

type WorkerCommand =
  | { id: number; command: 'verify'; modelDir: string }
  | { id: number; command: 'warm'; modelDir: string }
  | { id: number; command: 'start'; sessionId: string; modelDir: string }
  | {
      command: 'audio'
      sessionId: string
      sequence: number
      sampleRate: number
      buffer: ArrayBuffer
    }
  | { id: number; command: 'finish'; sessionId: string }
  | { id: number; command: 'cancel'; sessionId: string }
  | { id: number; command: 'release' }

type OnlineStream = {
  acceptWaveform(sampleRate: number, samples: Float32Array): void
  inputFinished(): void
  free(): void
}

type OnlineRecognizer = {
  createStream(): OnlineStream
  isReady(stream: OnlineStream): boolean
  decode(stream: OnlineStream): void
  isEndpoint(stream: OnlineStream): boolean
  reset(stream: OnlineStream): void
  getResult(stream: OnlineStream): { text?: string }
  free(): void
}

type SherpaModule = {
  createOnlineRecognizer(config: unknown): OnlineRecognizer
}

type ActiveSession = {
  id: string
  stream: OnlineStream
  committedSegments: string[]
  lastPartialText: string
  lastSequence: number
}

if (!parentPort) {
  throw new Error('Streaming ASR worker requires parentPort')
}

const port = parentPort
const nodeRequire = createRequire(import.meta.url)
const data = workerData as StreamingASRWorkerData
const sherpa = nodeRequire(data.sherpaModulePath) as SherpaModule

let cachedRecognizer: OnlineRecognizer | null = null
let cachedRecognizerModelDir: string | null = null
let activeSession: ActiveSession | null = null

function recognizerThreadCount(): number {
  return Math.max(1, Math.min(4, Math.floor(cpus().length / 2) || 1))
}

function createRecognizer(modelDir: string): OnlineRecognizer {
  return sherpa.createOnlineRecognizer({
    featConfig: { sampleRate: data.audioConfig.sampleRate, featureDim: 80 },
    modelConfig: {
      paraformer: {
        encoder: path.join(modelDir, data.model.encoderFile),
        decoder: path.join(modelDir, data.model.decoderFile),
      },
      tokens: path.join(modelDir, data.model.tokensFile),
      numThreads: recognizerThreadCount(),
      provider: 'cpu',
      debug: 0,
      modelingUnit: 'cjkchar',
    },
    decodingMethod: 'greedy_search',
    maxActivePaths: 4,
    enableEndpoint: 1,
    ...data.model.endpointRules,
  })
}

function releaseActiveSession(): void {
  activeSession?.stream.free()
  activeSession = null
}

function releaseRecognizer(): void {
  releaseActiveSession()
  cachedRecognizer?.free()
  cachedRecognizer = null
  cachedRecognizerModelDir = null
}

function getRecognizer(modelDir: string): OnlineRecognizer {
  if (!cachedRecognizer || cachedRecognizerModelDir !== modelDir) {
    releaseRecognizer()
    cachedRecognizer = createRecognizer(modelDir)
    cachedRecognizerModelDir = modelDir
  }
  return cachedRecognizer
}

function mergeSegments(segments: readonly string[]): string {
  let merged = ''

  for (const segment of segments) {
    const right = segment.trim()
    if (!right) continue
    if (!merged) {
      merged = right
      continue
    }

    const left = merged.replace(/\s+$/u, '')
    const first = right[0]
    const last = left[left.length - 1]
    const needsSpace = /^[A-Za-z0-9_]$/.test(last) && /^[A-Za-z0-9_]$/.test(first)
    merged = needsSpace ? `${left} ${right}` : `${left}${right}`
  }

  return merged
}

function getCurrentText(session: ActiveSession): string {
  if (!cachedRecognizer) return mergeSegments(session.committedSegments)
  const current = cachedRecognizer.getResult(session.stream).text?.trim() ?? ''
  return mergeSegments([...session.committedSegments, current])
}

function emitPartial(session: ActiveSession, force = false): void {
  const text = getCurrentText(session)
  if (!force && text === session.lastPartialText) return
  session.lastPartialText = text
  port.postMessage({ event: 'partial', sessionId: session.id, text })
}

function decodeReadyFrames(session: ActiveSession): void {
  if (!cachedRecognizer) throw new Error('Streaming ASR recognizer is not initialized')

  let iterations = 0
  while (cachedRecognizer.isReady(session.stream)) {
    cachedRecognizer.decode(session.stream)
    iterations += 1
    if (iterations > 10_000) {
      throw new Error('Streaming ASR decode loop exceeded its safety limit')
    }
  }

  emitPartial(session)

  if (cachedRecognizer.isEndpoint(session.stream)) {
    const endpointText = cachedRecognizer.getResult(session.stream).text?.trim() ?? ''
    if (endpointText) {
      session.committedSegments.push(endpointText)
    }
    cachedRecognizer.reset(session.stream)
    emitPartial(session, true)
  }
}

function startSession(sessionId: string, modelDir: string): void {
  releaseActiveSession()
  const recognizer = getRecognizer(modelDir)
  activeSession = {
    id: sessionId,
    stream: recognizer.createStream(),
    committedSegments: [],
    lastPartialText: '',
    lastSequence: -1,
  }
}

function acceptAudio(message: Extract<WorkerCommand, { command: 'audio' }>): void {
  const session = activeSession
  if (!session || session.id !== message.sessionId) return
  if (message.sequence <= session.lastSequence) return

  const samples = new Float32Array(message.buffer)
  if (samples.length === 0) return

  session.lastSequence = message.sequence
  session.stream.acceptWaveform(message.sampleRate, samples)
  decodeReadyFrames(session)
}

function finishSession(sessionId: string): { text: string } {
  const session = activeSession
  if (!session || session.id !== sessionId) {
    throw new Error('Streaming ASR session is not active')
  }

  try {
    session.stream.inputFinished()
    decodeReadyFrames(session)
    return { text: getCurrentText(session) }
  } finally {
    releaseActiveSession()
  }
}

function verifyModel(modelDir: string): void {
  const recognizer = createRecognizer(modelDir)
  recognizer.free()
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Streaming ASR worker failed'
}

port.on('message', (message: WorkerCommand) => {
  try {
    if (message.command === 'audio') {
      acceptAudio(message)
      return
    }

    if (message.command === 'verify') {
      verifyModel(message.modelDir)
      port.postMessage({ id: message.id, ok: true })
      return
    }

    if (message.command === 'warm') {
      getRecognizer(message.modelDir)
      port.postMessage({ id: message.id, ok: true })
      return
    }

    if (message.command === 'start') {
      startSession(message.sessionId, message.modelDir)
      port.postMessage({ id: message.id, ok: true })
      return
    }

    if (message.command === 'finish') {
      const result = finishSession(message.sessionId)
      port.postMessage({ id: message.id, ok: true, result })
      return
    }

    if (message.command === 'cancel') {
      if (activeSession?.id === message.sessionId) {
        releaseActiveSession()
      }
      port.postMessage({ id: message.id, ok: true })
      return
    }

    if (message.command === 'release') {
      releaseRecognizer()
      port.postMessage({ id: message.id, ok: true })
      return
    }

    throw new Error(`Unknown streaming ASR worker command`)
  } catch (error) {
    if ('id' in message) {
      port.postMessage({ id: message.id, ok: false, error: getErrorMessage(error) })
      return
    }

    port.postMessage({
      event: 'session-error',
      sessionId: message.sessionId,
      error: getErrorMessage(error),
    })
  }
})
