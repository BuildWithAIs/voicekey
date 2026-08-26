import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { STREAMING_PUNCTUATION } from '../shared/constants'

type PunctuationResult = { text: string }
type WorkerCommandInput =
  | { command: 'verify'; modelDir: string }
  | { command: 'warm'; modelDir: string }
  | { command: 'punctuate'; modelDir: string; text: string }
  | { command: 'release' }
type WorkerCommand = WorkerCommandInput & { id: number }
type WorkerResponse =
  | { id: number; ok: true; result?: PunctuationResult }
  | { id: number; ok: false; error: string }
type WorkerRequest = {
  resolve: (value: PunctuationResult | void) => void
  reject: (error: Error) => void
}

const nodeRequire = createRequire(import.meta.url)

let punctuationWorker: Worker | null = null
let warmState: { modelDir: string; promise: Promise<void> } | null = null
let nextRequestId = 1
const workerRequests = new Map<number, WorkerRequest>()

export function warmStreamingPunctuation(modelDir: string): Promise<void> {
  if (warmState?.modelDir === modelDir) return warmState.promise

  const promise = preparePunctuationWorker(modelDir)
  warmState = { modelDir, promise }
  void promise.catch(() => {
    if (warmState?.promise === promise) warmState = null
  })
  return promise
}

export async function punctuateStreamingText(text: string, modelDir: string): Promise<string> {
  try {
    await warmStreamingPunctuation(modelDir)
    const result = await callWorker<PunctuationResult>({ command: 'punctuate', modelDir, text })
    return result.text
  } finally {
    try {
      await releaseStreamingPunctuation()
    } catch (error) {
      console.error(
        '[ASR:Streaming] Failed to release punctuation worker after inference:',
        error instanceof Error ? error.message : error,
      )
    }
  }
}

export async function verifyStreamingPunctuation(modelDir: string): Promise<void> {
  try {
    await callWorker<void>({ command: 'verify', modelDir })
  } finally {
    await releaseStreamingPunctuation()
  }
}

export async function releaseStreamingPunctuation(): Promise<void> {
  warmState = null
  const worker = punctuationWorker
  if (!worker) return

  punctuationWorker = null
  rejectAllWorkerRequests(new Error('Streaming punctuation worker was restarted'))
  await worker.terminate()
}

async function preparePunctuationWorker(modelDir: string): Promise<void> {
  if (warmState && warmState.modelDir !== modelDir) {
    await releaseStreamingPunctuation()
  }
  await callWorker<void>({ command: 'warm', modelDir })
}

function getWorker(): Worker {
  if (punctuationWorker) return punctuationWorker

  const worker = new Worker(getWorkerUrl(), {
    workerData: {
      sherpaModulePath: nodeRequire.resolve('sherpa-onnx'),
      modelFile: STREAMING_PUNCTUATION.MODEL_FILE,
    },
  })
  punctuationWorker = worker

  worker.on('message', (response: WorkerResponse) => {
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
    if (punctuationWorker !== worker) return
    punctuationWorker = null
    warmState = null
    rejectAllWorkerRequests(
      error instanceof Error ? error : new Error('Streaming punctuation worker failed'),
    )
  })

  worker.on('exit', (code) => {
    if (punctuationWorker !== worker) return
    punctuationWorker = null
    warmState = null
    if (code !== 0) {
      rejectAllWorkerRequests(new Error(`Streaming punctuation worker exited with code ${code}`))
    }
  })

  return worker
}

function getWorkerUrl(): URL {
  const currentFilePath = fileURLToPath(import.meta.url)
  return pathToFileURL(path.join(path.dirname(currentFilePath), 'streaming-punctuation-worker.mjs'))
}

function callWorker<T extends PunctuationResult | void>(command: WorkerCommandInput): Promise<T> {
  const worker = getWorker()
  const id = nextRequestId++

  return new Promise<T>((resolve, reject) => {
    workerRequests.set(id, {
      resolve: resolve as (value: PunctuationResult | void) => void,
      reject,
    })
    try {
      worker.postMessage({ ...command, id } satisfies WorkerCommand)
    } catch (error) {
      workerRequests.delete(id)
      reject(error instanceof Error ? error : new Error('Failed to post punctuation request'))
    }
  })
}

function rejectAllWorkerRequests(error: Error): void {
  for (const request of workerRequests.values()) request.reject(error)
  workerRequests.clear()
}
