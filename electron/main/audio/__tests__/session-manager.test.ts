import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '@electron/shared/types'

const mockShowOverlay = vi.fn()
const mockUpdateOverlay = vi.fn()
const mockHideOverlay = vi.fn()
const mockShowErrorAndHide = vi.fn()
const mockGetBackgroundWindow = vi.fn()

vi.mock('../../window/overlay', () => ({
  showOverlay: mockShowOverlay,
  updateOverlay: mockUpdateOverlay,
  hideOverlay: mockHideOverlay,
  showErrorAndHide: mockShowErrorAndHide,
}))

vi.mock('../../window/background', () => ({
  getBackgroundWindow: mockGetBackgroundWindow,
}))

vi.mock('../../i18n', () => ({
  t: (key: string) => key,
}))

const createWindow = () => ({
  webContents: {
    send: vi.fn(),
  },
})

const loadSessionManager = async () => {
  const module = await import('../session-manager')
  return module
}

describe('session-manager', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockGetBackgroundWindow.mockReturnValue(null)
  })

  it('starts recording and sends SESSION_START', async () => {
    const window = createWindow()
    mockGetBackgroundWindow.mockReturnValue(window)

    const { handleStartRecording, getCurrentSession } = await loadSessionManager()
    await handleStartRecording()

    expect(mockShowOverlay).toHaveBeenCalledWith({ status: 'recording' })
    expect(window.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.SESSION_START)
    expect(getCurrentSession()?.status).toBe('recording')
  })

  it('ignores duplicate start while recording', async () => {
    const window = createWindow()
    mockGetBackgroundWindow.mockReturnValue(window)

    const { handleStartRecording } = await loadSessionManager()
    await handleStartRecording()
    await handleStartRecording()

    expect(mockShowOverlay).toHaveBeenCalledTimes(1)
    expect(window.webContents.send).toHaveBeenCalledTimes(1)
  })

  it('reports error when background window is missing', async () => {
    const { handleStartRecording, getCurrentSession } = await loadSessionManager()
    await handleStartRecording()

    expect(mockShowErrorAndHide).toHaveBeenCalledWith('errors.internal')
    expect(getCurrentSession()).toBeNull()
  })

  it('stops recording and sends SESSION_STOP', async () => {
    const window = createWindow()
    mockGetBackgroundWindow.mockReturnValue(window)

    const { handleStartRecording, handleStopRecording, getCurrentSession } =
      await loadSessionManager()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-27T00:00:00Z'))
    await handleStartRecording()
    vi.setSystemTime(new Date('2026-01-27T00:00:01Z'))
    await handleStopRecording()
    vi.useRealTimers()

    expect(mockUpdateOverlay).toHaveBeenCalledWith({ status: 'processing' })
    expect(window.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.SESSION_STOP)
    expect(getCurrentSession()?.status).toBe('processing')
    expect(getCurrentSession()?.duration ?? 0).toBeGreaterThan(0)
  })

  it('does nothing when stopping without an active session', async () => {
    const { handleStopRecording } = await loadSessionManager()
    await handleStopRecording()

    expect(mockUpdateOverlay).not.toHaveBeenCalled()
  })

  it('shows error when stopping without background window', async () => {
    const window = createWindow()
    mockGetBackgroundWindow.mockReturnValueOnce(window).mockReturnValueOnce(null)

    const { handleStartRecording, handleStopRecording } = await loadSessionManager()
    await handleStartRecording()
    await handleStopRecording()

    expect(mockShowErrorAndHide).toHaveBeenCalledWith('errors.stopFailed')
  })

  it('cancels session and hides overlay', async () => {
    const window = createWindow()
    mockGetBackgroundWindow.mockReturnValue(window)

    const { handleStartRecording, handleCancelSession, getCurrentSession } =
      await loadSessionManager()
    await handleStartRecording()
    await handleCancelSession()

    expect(mockHideOverlay).toHaveBeenCalled()
    expect(window.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.SESSION_STOP)
    expect(getCurrentSession()).toBeNull()
  })
})
