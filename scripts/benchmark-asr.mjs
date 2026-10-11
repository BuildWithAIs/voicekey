import { Worker } from 'node:worker_threads'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

// Run after `npx vite build`. No downloads, microphone access or transcript output.
const [mode, modelDirectory, wavPath, threadArgument = '2', termsPath] = process.argv.slice(2)
const numThreads = Number(threadArgument)
if (
  !['classic', 'streaming'].includes(mode) ||
  !modelDirectory ||
  !wavPath ||
  ![1, 2, 4].includes(numThreads)
) {
  throw new Error(
    'Usage: node scripts/benchmark-asr.mjs classic|streaming MODEL_DIR PCM16_MONO_16KHZ_WAV [1|2|4] [DICTIONARY_JSON]',
  )
}
const terms = termsPath ? JSON.parse(readFileSync(termsPath, 'utf8')) : []
if (!Array.isArray(terms) || terms.length > 200 || !terms.every((term) => typeof term === 'string'))
  throw new Error('Dictionary must be a JSON array of at most 200 strings')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const wav = readFileSync(wavPath)
let pcm
let validFormat = false
for (let offset = 12; offset + 8 <= wav.length; ) {
  const size = wav.readUInt32LE(offset + 4)
  const name = wav.toString('ascii', offset, offset + 4)
  if (offset + 8 + size > wav.length) throw new Error('Truncated WAV')
  if (name === 'fmt ')
    validFormat =
      wav.readUInt16LE(offset + 8) === 1 &&
      wav.readUInt16LE(offset + 10) === 1 &&
      wav.readUInt32LE(offset + 12) === 16000 &&
      wav.readUInt16LE(offset + 22) === 16
  if (name === 'data') {
    pcm = new Float32Array(size / 2)
    for (let i = 0; i < pcm.length; i++) pcm[i] = wav.readInt16LE(offset + 8 + i * 2) / 32768
  }
  offset += 8 + size + (size % 2)
}
if (!pcm?.length || !validFormat || pcm.length > 16000 * 300)
  throw new Error('Use a PCM16 mono 16kHz WAV up to five minutes')
const worker = new Worker(
  path.join(
    root,
    'dist-electron',
    mode === 'classic' ? 'local-asr-worker.mjs' : 'streaming-asr-worker.mjs',
  ),
  {
    workerData: {
      sherpaModulePath: require.resolve('sherpa-onnx'),
      numThreads,
      audioConfig: { sampleRate: 16000 },
      localASR: { modelFile: 'model.int8.onnx', tokensFile: 'tokens.txt', language: 'auto' },
      model: {
        encoderFile: 'encoder-480ms.onnx',
        decoderFile: 'decoder-480ms.onnx',
        joinerFile: 'joiner-480ms.onnx',
        tokensFile: 'tokens.txt',
        modelType: 'zipformer2',
        finalTailPaddingMs: 500,
        endpointRules: {
          rule1MinTrailingSilence: 2.4,
          rule2MinTrailingSilence: 1.2,
          rule3MinUtteranceLength: 20,
        },
      },
    },
  },
)
let nextId = 0
const requests = new Map()
let firstPartialMs = null
let captureStart = 0
let pendingFrames = 0
let maxBacklogMs = 0
let peakRSS = process.memoryUsage.rss()
let failure
function fail(error) {
  failure = error
  for (const request of requests.values()) request.reject(error)
  requests.clear()
  void worker.terminate()
}
worker.on('message', (message) => {
  if (message.id) {
    const request = requests.get(message.id)
    requests.delete(message.id)
    if (request) {
      if (message.ok) request.resolve(message.result)
      else request.reject(new Error(message.error))
    }
  } else if (message.event === 'partial' && message.text && firstPartialMs === null)
    firstPartialMs = Date.now() - captureStart
  else if (message.event === 'consumed') pendingFrames--
  else if (message.event === 'session-error') fail(new Error(message.error))
})
worker.on('error', fail)
worker.on('exit', (code) => {
  if (requests.size) fail(new Error(`Worker exited: ${code}`))
})
const guard = setInterval(() => {
  peakRSS = Math.max(peakRSS, process.memoryUsage.rss())
  if (peakRSS > 2 * 1024 ** 3) fail(new Error('Benchmark exceeded 2 GiB RSS'))
}, 100)
const timeout = setTimeout(() => fail(new Error('Benchmark exceeded ten minutes')), 600_000)
function call(command) {
  if (failure) return Promise.reject(failure)
  return new Promise((resolve, reject) => {
    const id = ++nextId
    requests.set(id, { resolve, reject })
    worker.postMessage({ ...command, id })
  })
}
try {
  const started = Date.now()
  const cpu = process.cpuUsage()
  let loadMs = null
  let finalStarted = started
  let result
  if (mode === 'classic')
    result = await call({
      command: 'transcribe',
      audioFilePath: path.resolve(wavPath),
      modelDir: path.resolve(modelDirectory),
    })
  else {
    await call({
      command: 'start',
      sessionId: 'benchmark',
      modelDir: path.resolve(modelDirectory),
      terms,
    })
    loadMs = Date.now() - started
    captureStart = Date.now()
    for (let offset = 0, sequence = 0; offset < pcm.length; offset += 1600, sequence++) {
      if (failure) throw failure
      const samples = pcm.slice(offset, offset + 1600)
      pendingFrames++
      maxBacklogMs = Math.max(maxBacklogMs, pendingFrames * 100)
      worker.postMessage(
        {
          command: 'audio',
          sessionId: 'benchmark',
          sequence,
          sampleRate: 16000,
          buffer: samples.buffer,
        },
        [samples.buffer],
      )
      await delay(Math.max(0, captureStart + (sequence + 1) * 100 - Date.now()))
    }
    finalStarted = Date.now()
    result = await call({ command: 'finish', sessionId: 'benchmark' })
  }
  const usedCPU = process.cpuUsage(cpu)
  console.log(
    JSON.stringify({
      mode,
      numThreads,
      dictionaryEntries: terms.length,
      audioSeconds: pcm.length / 16000,
      elapsedMs: Date.now() - started,
      loadMs,
      firstPartialMs,
      finalWaitMs: Date.now() - finalStarted,
      maxBacklogMs,
      cpuMs: (usedCPU.user + usedCPU.system) / 1000,
      peakRSSMiB: Math.round(peakRSS / 1024 ** 2),
      characters: (result.text ?? result.stdout ?? '').length,
    }),
  )
} finally {
  clearInterval(guard)
  clearTimeout(timeout)
  const started = Date.now()
  await worker.terminate()
  const terminationMs = Date.now() - started
  await delay(500)
  console.log(
    JSON.stringify({
      terminationMs,
      rssAfterMiB: Math.round(process.memoryUsage.rss() / 1024 ** 2),
    }),
  )
}
