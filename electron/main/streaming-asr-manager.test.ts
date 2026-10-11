import workerThreads from 'node:worker_threads'
import { syncBuiltinESMExports } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RECORDING, STREAMING_ASR } from '../shared/constants'

type TestWorker = EventEmitter & {
  postMessage: ReturnType<typeof vi.fn>
  terminate: ReturnType<typeof vi.fn>
}
const mocks = vi.hoisted(() => ({ workers: [] as TestWorker[], reply: true, directory: '' }))
vi.mock('electron', () => ({ app: { isPackaged: true } }))
vi.mock('./config-manager', () => ({ configManager: { getUserDictionary: () => [] } }))
vi.mock('./asr-model-storage', () => ({
  getASRModelStorageDir: () => mocks.directory,
  removeManagedASRInstallDir: vi.fn(),
}))
vi.mock('./asr-runtime-policy', () => ({
  getASRThreadCount: () => 2,
  watchASRMemory: () => () => {},
  getASRIdleTimeout: () => 60_000,
}))
vi.mock('./i18n', () => ({ t: (key: string) => key }))
class FakeWorker extends EventEmitter {
  postMessage = vi.fn((message: { id?: number; command: string }) => {
    if (mocks.reply && message.id)
      queueMicrotask(() =>
        this.emit('message', {
          id: message.id,
          ok: true,
          result: message.command === 'finish' ? { text: 'Hello.' } : undefined,
        }),
      )
  })
  terminate = vi.fn(async () => 0)
  constructor() {
    super()
    mocks.workers.push(this)
  }
}
import {
  startStreamingASRSession,
  pushStreamingAudioFrame,
  cancelStreamingASRSession,
  finishStreamingASRSession,
  releaseStreamingASR,
} from './streaming-asr-manager'
const frame = (sequence: number) => ({
  sessionId: 'session-test',
  sequence,
  sampleRate: 16_000,
  buffer: new Float32Array(1600).buffer,
})
describe('streaming consumption budgets', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.spyOn(workerThreads, 'Worker').mockImplementation(() => {
      return new FakeWorker() as unknown as workerThreads.Worker
    })
    syncBuiltinESMExports()
    mocks.reply = true
    mocks.workers.length = 0
    mocks.directory = fs.mkdtempSync(path.join(os.tmpdir(), 'voicekey-stream-test-'))
    const modelDir = path.join(
      mocks.directory,
      'x-asr-480ms',
      'models',
      STREAMING_ASR.MODEL_VERSION,
    )
    fs.mkdirSync(modelDir, { recursive: true })
    for (const file of STREAMING_ASR.MODEL_FILES) {
      const filePath = path.join(modelDir, file.name)
      fs.writeFileSync(filePath, '')
      fs.truncateSync(filePath, file.sizeBytes)
    }
    fs.writeFileSync(
      path.join(modelDir, 'model.json'),
      JSON.stringify({
        version: STREAMING_ASR.HEALTH_CHECK_VERSION,
        modelVersion: STREAMING_ASR.MODEL_VERSION,
      }),
    )
  })
  afterEach(async () => {
    await cancelStreamingASRSession('session-test')
    await releaseStreamingASR()
    vi.useRealTimers()
    vi.restoreAllMocks()
    syncBuiltinESMExports()
    fs.rmSync(mocks.directory, { recursive: true, force: true })
  })
  it('fails explicitly when unconsumed audio exceeds its time budget', async () => {
    const onError = vi.fn()
    await startStreamingASRSession('session-test', { onPartial: vi.fn(), onError })
    for (let sequence = 0; sequence < 60; sequence++) pushStreamingAudioFrame(frame(sequence))
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0][0].message).toBe('errors.asrOverloaded')
  })
  it('reclaims the budget when the worker acknowledges consumption', async () => {
    const onError = vi.fn()
    await startStreamingASRSession('session-test', { onPartial: vi.fn(), onError })
    for (let sequence = 0; sequence < 200; sequence++) {
      pushStreamingAudioFrame(frame(sequence))
      mocks.workers[0].emit('message', { event: 'consumed', sessionId: 'session-test', sequence })
    }
    expect(onError).not.toHaveBeenCalled()
  })
  it('terminates immediately on cancellation instead of posting a cancel behind audio', async () => {
    await startStreamingASRSession('session-test', { onPartial: vi.fn(), onError: vi.fn() })
    pushStreamingAudioFrame(frame(0))
    await cancelStreamingASRSession('session-test')
    expect(mocks.workers[0].terminate).toHaveBeenCalledOnce()
    expect(
      mocks.workers[0].postMessage.mock.calls.some(([message]) => message.command === 'cancel'),
    ).toBe(false)
  })
  it('rejects a missing last audio frame instead of injecting truncated text', async () => {
    await startStreamingASRSession('session-test', { onPartial: vi.fn(), onError: vi.fn() })
    await expect(finishStreamingASRSession('session-test', 1)).rejects.toThrow(
      'errors.audioSequence',
    )
    expect(mocks.workers[0].terminate).toHaveBeenCalledOnce()
  })
  it('buffers cold-start audio separately and tightens the budget after catching up', async () => {
    mocks.reply = false
    const onError = vi.fn()
    const starting = startStreamingASRSession('session-test', { onPartial: vi.fn(), onError })
    for (let sequence = 0; sequence < 80; sequence++) pushStreamingAudioFrame(frame(sequence))
    expect(onError).not.toHaveBeenCalled()
    const request = mocks.workers[0].postMessage.mock.calls[0][0]
    mocks.workers[0].emit('message', { id: request.id, ok: true })
    await starting
    for (let sequence = 0; sequence < 80; sequence++)
      mocks.workers[0].emit('message', { event: 'consumed', sessionId: 'session-test', sequence })
    for (let sequence = 80; sequence < 140; sequence++) pushStreamingAudioFrame(frame(sequence))
    expect(onError).toHaveBeenCalledOnce()
  })
  it('fails if the recognizer never catches up after cold loading', async () => {
    mocks.reply = false
    const onError = vi.fn()
    const starting = startStreamingASRSession('session-test', { onPartial: vi.fn(), onError })
    for (let sequence = 0; sequence < 80; sequence++) pushStreamingAudioFrame(frame(sequence))
    const request = mocks.workers[0].postMessage.mock.calls[0][0]
    mocks.workers[0].emit('message', { id: request.id, ok: true })
    await starting
    await vi.advanceTimersByTimeAsync(RECORDING.STREAMING_CATCHUP_TIMEOUT_MS + 1)
    pushStreamingAudioFrame(frame(80))
    expect(onError).toHaveBeenCalledOnce()
  })
  it('times out and destroys a hung worker during startup', async () => {
    mocks.reply = false
    const start = startStreamingASRSession('session-test', { onPartial: vi.fn(), onError: vi.fn() })
    const rejection = expect(start).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(RECORDING.WORKER_TIMEOUT_MS)
    await rejection
    expect(mocks.workers[0].terminate).toHaveBeenCalledOnce()
  })
})
