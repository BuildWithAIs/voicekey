import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../shared/types'

const mocks = vi.hoisted(() => ({
  recorder: {},
  handlers: new Map<string, (event: { sender: object }, payload: unknown) => Promise<void>>(),
  stop: vi.fn(async () => {}),
}))
vi.mock('electron', () => ({
  ipcMain: {
    on: vi.fn(),
    handle: (
      channel: string,
      handler: (event: { sender: object }, payload: unknown) => Promise<void>,
    ) => mocks.handlers.set(channel, handler),
  },
}))
vi.mock('../audio/session-manager', () => ({
  recordingStopped: vi.fn(),
  getCurrentSession: vi.fn(),
}))
vi.mock('../window/background', () => ({
  getBackgroundWindow: () => ({ webContents: mocks.recorder }),
}))
vi.mock('../notification', () => ({ showNotification: vi.fn() }))
vi.mock('../i18n', () => ({ t: (key: string) => key }))
import { initSessionHandlers, registerSessionHandlers } from './session-handlers'

async function request(payload: unknown, sender = mocks.recorder): Promise<void> {
  const handler = mocks.handlers.get(IPC_CHANNELS.SESSION_STOP)
  if (!handler) throw new Error('Stop handler was not registered')
  await handler({ sender }, payload)
}

beforeEach(() => {
  vi.clearAllMocks()
  initSessionHandlers({
    handleStartRecording: vi.fn(),
    handleStopRecording: mocks.stop,
    handleAudioChunk: vi.fn(),
    handleStreamingAudioFrame: vi.fn(),
    handleStreamingAudioEnd: vi.fn(),
    handleCancelSession: vi.fn(),
    getCurrentSession: () => ({ id: 'current', startTime: new Date(), status: 'recording' }),
  })
  registerSessionHandlers()
})

describe('recorder-owned stop requests', () => {
  it.each(['microphone-ended', 'duration-limit'] as const)(
    'preserves the %s stop reason',
    async (reason) => {
      await request({ sessionId: 'current', reason })
      expect(mocks.stop).toHaveBeenCalledWith(reason)
    },
  )
  it('rejects a delayed stop from a previous recording', async () => {
    await request({ sessionId: 'previous', reason: 'microphone-ended' })
    expect(mocks.stop).not.toHaveBeenCalled()
  })
  it('rejects other renderers and unvalidated reasons', async () => {
    await request({ sessionId: 'current', reason: 'microphone-ended' }, {})
    await request({ sessionId: 'current', reason: 'hotkey-release' })
    await request(undefined)
    expect(mocks.stop).not.toHaveBeenCalled()
  })
})
