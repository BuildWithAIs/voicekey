import { createRequire } from 'node:module'
import path from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import { hasSameTranscriptContent, normalizePunctuationOutput } from './streaming-punctuation-text'

type StreamingPunctuationWorkerData = {
  sherpaModulePath: string
  modelFile: string
}

type WorkerCommand =
  | { id: number; command: 'verify'; modelDir: string }
  | { id: number; command: 'warm'; modelDir: string }
  | { id: number; command: 'punctuate'; modelDir: string; text: string }
  | { id: number; command: 'release' }

type OfflinePunctuation = {
  addPunct(text: string): string
  free(): void
}

type SherpaModule = {
  createOfflinePunctuation(config: unknown): OfflinePunctuation
}

if (!parentPort) {
  throw new Error('Streaming punctuation worker requires parentPort')
}

const port = parentPort
const nodeRequire = createRequire(import.meta.url)
const data = workerData as StreamingPunctuationWorkerData
const sherpa = nodeRequire(data.sherpaModulePath) as SherpaModule

let cachedPunctuation: OfflinePunctuation | null = null
let cachedModelDir: string | null = null

function createPunctuation(modelDir: string): OfflinePunctuation {
  return sherpa.createOfflinePunctuation({
    model: {
      ctTransformer: path.join(modelDir, data.modelFile),
      numThreads: 1,
      provider: 'cpu',
      debug: 0,
    },
  })
}

function releasePunctuation(): void {
  cachedPunctuation?.free()
  cachedPunctuation = null
  cachedModelDir = null
}

function getPunctuation(modelDir: string): OfflinePunctuation {
  if (!cachedPunctuation || cachedModelDir !== modelDir) {
    releasePunctuation()
    cachedPunctuation = createPunctuation(modelDir)
    cachedModelDir = modelDir
  }
  return cachedPunctuation
}

function addPunctuation(text: string, modelDir: string): string {
  if (!text.trim()) return text

  const punctuated = normalizePunctuationOutput(getPunctuation(modelDir).addPunct(text.trim()))
  if (!punctuated || !hasSameTranscriptContent(text, punctuated)) {
    throw new Error('Local punctuation changed transcript content')
  }
  return punctuated
}

function verifyModel(modelDir: string): void {
  const punctuation = createPunctuation(modelDir)
  punctuation.free()
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Streaming punctuation worker failed'
}

port.on('message', (message: WorkerCommand) => {
  try {
    if (message.command === 'verify') {
      verifyModel(message.modelDir)
      port.postMessage({ id: message.id, ok: true })
      return
    }

    if (message.command === 'warm') {
      getPunctuation(message.modelDir)
      port.postMessage({ id: message.id, ok: true })
      return
    }

    if (message.command === 'punctuate') {
      port.postMessage({
        id: message.id,
        ok: true,
        result: { text: addPunctuation(message.text, message.modelDir) },
      })
      return
    }

    if (message.command === 'release') {
      releasePunctuation()
      port.postMessage({ id: message.id, ok: true })
      return
    }

    throw new Error('Unknown streaming punctuation worker command')
  } catch (error) {
    port.postMessage({ id: message.id, ok: false, error: getErrorMessage(error) })
  }
})
