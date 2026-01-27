import { beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = () => void

const listeners = vi.hoisted(() => ({
  keydown: [] as Listener[],
  keyup: [] as Listener[],
}))

const mockGetHotkeyConfig = vi.fn()
const mockRegister = vi.fn()
const mockIsPressed = vi.fn()
const mockHandleStartRecording = vi.fn()
const mockHandleStopRecording = vi.fn()
const mockGetCurrentSession = vi.fn()
const mockCreateSettingsWindow = vi.fn()
const mockParseAccelerator = vi.fn()

vi.mock('../../config-manager', () => ({
  configManager: { getHotkeyConfig: mockGetHotkeyConfig },
}))

vi.mock('../../hotkey-manager', () => ({
  hotkeyManager: { register: mockRegister },
}))

vi.mock('../../iohook-manager', () => ({
  ioHookManager: {
    on: (event: 'keydown' | 'keyup', handler: Listener) => {
      listeners[event].push(handler)
    },
    isPressed: mockIsPressed,
  },
}))

vi.mock('../../window', () => ({
  createSettingsWindow: mockCreateSettingsWindow,
}))

vi.mock('../../audio', () => ({
  handleStartRecording: mockHandleStartRecording,
  handleStopRecording: mockHandleStopRecording,
  getCurrentSession: mockGetCurrentSession,
}))

vi.mock('../parser', () => ({
  parseAccelerator: mockParseAccelerator,
}))

const setupDefaults = () => {
  mockGetHotkeyConfig.mockReturnValue({
    pttKey: 'Command+Space',
    toggleSettings: 'Command+,',
  })
  mockParseAccelerator.mockReturnValue({ modifiers: ['meta'], key: 57 })
  mockGetCurrentSession.mockReturnValue(null)
  mockIsPressed.mockReturnValue(true)
}

describe('registerGlobalHotkeys', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    listeners.keydown = []
    listeners.keyup = []
    setupDefaults()
  })

  it('registers settings hotkey and opens settings window', async () => {
    const { registerGlobalHotkeys } = await import('../ptt-handler')
    registerGlobalHotkeys()

    expect(mockRegister).toHaveBeenCalledWith('Command+,', expect.any(Function))
    const callback = mockRegister.mock.calls[0]?.[1] as () => void
    callback()
    expect(mockCreateSettingsWindow).toHaveBeenCalled()
  })

  it('starts recording after debounce when pressed', async () => {
    vi.useFakeTimers()
    const { registerGlobalHotkeys } = await import('../ptt-handler')
    registerGlobalHotkeys()

    listeners.keydown.forEach((listener) => listener())
    vi.advanceTimersByTime(50)

    expect(mockHandleStartRecording).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('cancels debounce when released before timeout', async () => {
    vi.useFakeTimers()
    const { registerGlobalHotkeys } = await import('../ptt-handler')
    registerGlobalHotkeys()

    mockIsPressed.mockReturnValue(true)
    listeners.keydown.forEach((listener) => listener())

    mockIsPressed.mockReturnValue(false)
    listeners.keyup.forEach((listener) => listener())

    vi.advanceTimersByTime(50)
    expect(mockHandleStartRecording).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('stops recording when released', async () => {
    const { registerGlobalHotkeys } = await import('../ptt-handler')
    registerGlobalHotkeys()

    mockGetCurrentSession.mockReturnValue({ status: 'recording' })
    mockIsPressed.mockReturnValue(false)
    listeners.keyup.forEach((listener) => listener())

    expect(mockHandleStopRecording).toHaveBeenCalledTimes(1)
  })

  it('does not register iohook listeners when parseAccelerator returns null', async () => {
    mockParseAccelerator.mockReturnValue(null)
    const { registerGlobalHotkeys } = await import('../ptt-handler')
    registerGlobalHotkeys()

    expect(listeners.keydown).toHaveLength(0)
    expect(listeners.keyup).toHaveLength(0)
  })
})
