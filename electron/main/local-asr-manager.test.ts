import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import workerThreads from 'node:worker_threads'
import { syncBuiltinESMExports } from 'node:module'
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_ASR, RECORDING } from '../shared/constants'
const mocks = vi.hoisted(() => ({ directory: '', reply: true }))
vi.mock('electron', () => ({ app: { isPackaged: true } }))
vi.mock('./asr-model-storage', () => ({
  getASRModelStorageDir: () => mocks.directory,
  removeManagedASRInstallDir: vi.fn(),
}))
vi.mock('./asr-runtime-policy', () => ({
  getASRThreadCount: () => 2,
  getASRIdleTimeout: () => 60_000,
  watchASRMemory: () => () => {},
}))
vi.mock('./i18n', () => ({ t: (key: string) => key }))
import { runLocalASR, cancelLocalASR, releaseLocalASR } from './local-asr-manager'
const workers: FakeWorker[] = []
class FakeWorker extends EventEmitter {
  postMessage = vi.fn((message: { id: number }) => {
    if (mocks.reply)
      queueMicrotask(() =>
        this.emit('message', {
          id: message.id,
          ok: true,
          result: { stdout: 'Hello.', stderr: '' },
        }),
      )
  })
  terminate = vi.fn(async () => 0)
  constructor() {
    super()
    workers.push(this)
  }
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  // eslint-disable-next-line prefer-arrow-callback -- Vitest 4 requires constructible Worker mocks.
  vi.spyOn(workerThreads, 'Worker').mockImplementation(function () {
    return new FakeWorker() as unknown as workerThreads.Worker
  })
  syncBuiltinESMExports()
  workers.length = 0
  mocks.reply = true
  mocks.directory = fs.mkdtempSync(path.join(os.tmpdir(), 'voicekey-local-test-'))
  const directory = path.join(mocks.directory, 'sensevoice', 'models', LOCAL_ASR.MODEL_VERSION)
  fs.mkdirSync(directory, { recursive: true })
  for (const file of LOCAL_ASR.MODEL_FILES) {
    const output = path.join(directory, file.name)
    fs.writeFileSync(output, '')
    fs.truncateSync(output, file.sizeBytes)
  }
  fs.writeFileSync(
    path.join(directory, 'model.json'),
    JSON.stringify({
      version: LOCAL_ASR.HEALTH_CHECK_VERSION,
      modelVersion: LOCAL_ASR.MODEL_VERSION,
    }),
  )
})
afterEach(async () => {
  await cancelLocalASR()
  await releaseLocalASR()
  vi.useRealTimers()
  vi.restoreAllMocks()
  syncBuiltinESMExports()
  fs.rmSync(mocks.directory, { recursive: true, force: true })
})
describe('classic worker lifecycle', () => {
  it('cancels active and queued recognition without restarting a worker', async () => {
    mocks.reply = false
    const first = expect(runLocalASR('one.wav')).rejects.toThrow()
    const second = expect(runLocalASR('two.wav')).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(1)
    await cancelLocalASR()
    await Promise.all([first, second])
    expect(workers).toHaveLength(1)
    expect(workers[0].terminate).toHaveBeenCalledOnce()
    mocks.reply = true
    await expect(runLocalASR('next.wav')).resolves.toMatchObject({ stdout: 'Hello.' })
  })
  it('times out a hung full-recording inference and allows a subsequent attempt', async () => {
    mocks.reply = false
    const pending = expect(runLocalASR('long.wav')).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(RECORDING.TRANSCRIPTION_TIMEOUT_MS + 1)
    await pending
    expect(workers[0].terminate).toHaveBeenCalledOnce()
    mocks.reply = true
    await expect(runLocalASR('next.wav')).resolves.toMatchObject({ stdout: 'Hello.' })
  })
  it('reuses a warm worker, then destroys it after the idle budget', async () => {
    await runLocalASR('one.wav')
    await runLocalASR('two.wav')
    expect(workers).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(workers[0].terminate).toHaveBeenCalledOnce()
  })
})
