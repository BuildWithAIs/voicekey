import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RECORDING } from '../../shared/constants'

const mocks = vi.hoisted(() => ({
  config: { streamingEnabled: false, lowVolumeMode: false },
  localReady: true,
  streamingReady: true,
  management: false,
  send: vi.fn(),
  reload: vi.fn(),
  show: vi.fn(),
  error: vi.fn(),
  settings: vi.fn(),
  cancelLocal: vi.fn(async () => {}),
  cancelStreaming: vi.fn(async () => {}),
  releaseLocal: vi.fn(async () => {}),
  releaseStreaming: vi.fn(async () => {}),
  start: vi.fn(async () => {}),
  abort: vi.fn(),
  final: true,
}))
vi.mock('../window/background', () => ({
  getBackgroundWindow: () => ({
    isDestroyed: () => false,
    webContents: { send: mocks.send, reload: mocks.reload },
  }),
}))
vi.mock('../window/settings', () => ({ createSettingsWindow: mocks.settings }))
vi.mock('../window/overlay', () => ({
  showOverlay: mocks.show,
  hideOverlay: vi.fn(),
  updateOverlay: vi.fn(),
  showErrorAndHide: mocks.error,
}))
vi.mock('../config-manager', () => ({
  configManager: { getASRConfig: () => mocks.config, isDictationProcessingEnabled: () => false },
}))
vi.mock('../asr-runtime-policy', () => ({ isManagingASRModels: () => mocks.management }))
vi.mock('../i18n', () => ({ t: (key: string) => key }))
vi.mock('./processor', () => ({
  abortChunkSession: mocks.abort,
  hasReceivedFinalChunk: () => mocks.final,
  hasReceivedStreamingFinal: () => mocks.final,
}))
vi.mock('../local-asr-manager', () => ({
  cancelLocalASR: mocks.cancelLocal,
  releaseLocalASR: mocks.releaseLocal,
  getLocalASRStatus: () => ({ ready: mocks.localReady }),
}))
vi.mock('../streaming-asr-manager', () => ({
  cancelStreamingASRSession: mocks.cancelStreaming,
  releaseStreamingASR: mocks.releaseStreaming,
  startStreamingASRSession: mocks.start,
  getStreamingASRStatus: () => ({ ready: mocks.streamingReady }),
}))
import {
  handleStartRecording,
  handleStopRecording,
  handleCancelSession,
  getCurrentSession,
  recordingStopped,
  failRecordingSession,
  clearSession,
  isSessionBusy,
} from './session-manager'

describe('recording ownership and cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.config.streamingEnabled = false
    mocks.localReady = mocks.streamingReady = true
    mocks.final = true
    mocks.send.mockImplementation((channel, payload) => {
      if (channel === 'session:stop' && payload.cancel) recordingStopped(payload.sessionId)
    })
  })
  afterEach(async () => {
    await handleCancelSession()
    vi.useRealTimers()
  })
  it('preserves a processing session when another recording is requested', async () => {
    await handleStartRecording()
    const id = getCurrentSession()!.id
    await handleStopRecording()
    await handleStartRecording()
    expect(getCurrentSession()?.id).toBe(id)
    expect(mocks.send.mock.calls.filter(([channel]) => channel === 'session:start')).toHaveLength(1)
  })
  it('rejects either missing model before opening the microphone', async () => {
    mocks.localReady = false
    await handleStartRecording()
    expect(getCurrentSession()).toBeNull()
    expect(mocks.settings).toHaveBeenCalledOnce()
    mocks.config.streamingEnabled = true
    mocks.streamingReady = false
    await handleStartRecording()
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('cleans up a streaming session after microphone acquisition fails', async () => {
    mocks.config.streamingEnabled = true
    await handleStartRecording()
    const id = getCurrentSession()!.id
    failRecordingSession(id, 'permission denied')
    await handleCancelSession()
    expect(mocks.cancelStreaming).toHaveBeenCalledWith(id)
    expect(getCurrentSession()).toBeNull()
    expect(isSessionBusy()).toBe(false)
    await handleStartRecording()
    expect(getCurrentSession()?.id).not.toBe(id)
  })
  it('enforces processing timeout even after the final audio marker arrived', async () => {
    await handleStartRecording()
    await handleStopRecording()
    await vi.advanceTimersByTimeAsync(RECORDING.PROCESSING_TIMEOUT_MS)
    expect(mocks.cancelLocal).toHaveBeenCalledOnce()
    expect(getCurrentSession()).toBeNull()
  })
  it('enforces the five minute recording cap in main', async () => {
    await handleStartRecording()
    await vi.advanceTimersByTimeAsync(300_000)
    expect(getCurrentSession()?.status).toBe('processing')
  })
  it('releases the old mode after a setting change during recording', async () => {
    await handleStartRecording()
    mocks.config.streamingEnabled = true
    await clearSession()
    expect(mocks.releaseLocal).toHaveBeenCalledOnce()
  })
  it('waits for worker teardown before admitting the next session', async () => {
    let done!: () => void
    mocks.cancelLocal.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          done = resolve
        }),
    )
    await handleStartRecording()
    const cancelling = handleCancelSession()
    await handleStartRecording()
    expect(mocks.send.mock.calls.filter(([channel]) => channel === 'session:start')).toHaveLength(1)
    done()
    await cancelling
    await handleStartRecording()
    expect(mocks.send.mock.calls.filter(([channel]) => channel === 'session:start')).toHaveLength(2)
  })
})
