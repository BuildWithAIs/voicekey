import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecordingStartPayload, RecordingStopPayload } from '../../electron/shared/types'
const mocks = vi.hoisted(() => ({ effect: (() => () => {}) as () => () => void }))
vi.mock('react', () => ({
  useEffect: (effect: () => () => void) => {
    mocks.effect = effect
  },
}))
import { AudioRecorder } from './AudioRecorder'

class Recorder {
  static instances: Recorder[] = []
  static isTypeSupported() {
    return true
  }
  state = 'inactive'
  ondataavailable?: (event: { data: Blob }) => void
  onstop?: () => void
  onerror?: () => void
  start = vi.fn(() => {
    this.state = 'recording'
  })
  stop = vi.fn(() => {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['complete audio']) })
    queueMicrotask(() => this.onstop?.())
  })
  constructor() {
    Recorder.instances.push(this)
  }
}
const track = { stop: vi.fn(), onended: null, label: 'USB microphone' }
const stream = { getTracks: () => [track], getAudioTracks: () => [track] }
const getUserMedia = vi.fn(async () => stream)
const api = {
  onStartRecording: vi.fn(),
  onStopRecording: vi.fn(),
  sendAudioChunk: vi.fn(),
  sendStreamingAudioEnd: vi.fn(),
  sendStreamingAudioFrame: vi.fn(),
  sendAudioLevel: vi.fn(),
  sendError: vi.fn(),
  recordingStopped: vi.fn(),
  microphoneFallback: vi.fn(),
  stopSession: vi.fn(async () => {}),
}
let start: (payload: RecordingStartPayload) => void
let stop: (payload: RecordingStopPayload) => void
let unmount: () => void
const payload: RecordingStartPayload = { sessionId: 'one', asrMode: 'classic' }
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  Recorder.instances = []
  api.onStartRecording.mockImplementation((callback) => {
    start = callback
    return () => {}
  })
  api.onStopRecording.mockImplementation((callback) => {
    stop = callback
    return () => {}
  })
  vi.stubGlobal('window', { electronAPI: api })
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.stubGlobal('MediaRecorder', Recorder)
  vi.stubGlobal(
    'AudioContext',
    class {
      createMediaStreamSource() {
        return { connect: vi.fn() }
      }
      createAnalyser() {
        return { fftSize: 256, getFloatTimeDomainData: vi.fn() }
      }
      close() {
        return Promise.resolve()
      }
    },
  )
  AudioRecorder()
  unmount = mocks.effect()
})
afterEach(() => {
  unmount()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
describe('continuous classic capture', () => {
  it('keeps the same recorder past 30 seconds and sends one complete file on stop', async () => {
    start(payload)
    await vi.advanceTimersByTimeAsync(61_000)
    expect(Recorder.instances).toHaveLength(1)
    expect(Recorder.instances[0].stop).not.toHaveBeenCalled()
    expect(api.sendAudioChunk).not.toHaveBeenCalled()
    stop({ sessionId: 'one' })
    await vi.waitFor(() => expect(api.sendAudioChunk).toHaveBeenCalledOnce())
    expect(api.sendAudioChunk.mock.calls[0][0]).toMatchObject({
      sessionId: 'one',
      chunkIndex: 0,
      isFinal: true,
    })
    expect(track.stop).toHaveBeenCalled()
  })
  it('acknowledges cancellation without submitting audio for inference', async () => {
    start(payload)
    await vi.advanceTimersByTimeAsync(1)
    stop({ sessionId: 'one', cancel: true })
    await vi.advanceTimersByTimeAsync(1)
    expect(api.sendAudioChunk).not.toHaveBeenCalled()
    expect(api.recordingStopped).toHaveBeenCalledWith('one')
  })
  it('stops a late microphone stream after cancellation during a permission prompt', async () => {
    let resolve!: (value: typeof stream) => void
    getUserMedia.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    start(payload)
    stop({ sessionId: 'one', cancel: true })
    resolve(stream)
    await vi.advanceTimersByTimeAsync(1)
    expect(Recorder.instances).toHaveLength(0)
    expect(track.stop).toHaveBeenCalled()
  })
  it('does not let a stale stop terminate a newer capture', async () => {
    start({ ...payload, sessionId: 'two' })
    await vi.advanceTimersByTimeAsync(1)
    stop({ sessionId: 'one', cancel: true })
    expect(Recorder.instances[0].stop).not.toHaveBeenCalled()
  })
})
