import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../shared/types'
import {
  destroyOverlayWindow,
  hideOverlay,
  showErrorAndHide,
  showOverlay,
  updateOverlay,
} from './overlay'

const windowMock = vi.hoisted(() => ({
  isDestroyed: () => false,
  webContents: { on: vi.fn(), send: vi.fn() },
  setVisibleOnAllWorkspaces: vi.fn(),
  setIgnoreMouseEvents: vi.fn(),
  loadFile: vi.fn(),
  on: vi.fn(),
  showInactive: vi.fn(),
  hide: vi.fn(),
  close: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: class {
    constructor() {
      Object.assign(this, windowMock)
    }
  },
  screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }) },
}))
vi.mock('../env', () => ({
  VITE_DEV_SERVER_URL: undefined,
  getMainDist: () => '/app/dist-electron',
  getRendererDist: () => '/app/dist',
}))

describe('HUD feedback lifetime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    destroyOverlayWindow()
    vi.useRealTimers()
  })

  it('shows the final transcript without focusing and hides after its reading interval', () => {
    const state = { status: 'success', transcript: '最终输入结果。' } as const
    showOverlay(state, 1800)
    expect(windowMock.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.OVERLAY_UPDATE, state)
    expect(windowMock.showInactive).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(1799)
    expect(windowMock.hide).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(windowMock.hide).toHaveBeenCalledOnce()
  })

  it('does not let a previous success timer hide a new recording', () => {
    showOverlay({ status: 'success' }, 1800)
    vi.advanceTimersByTime(500)
    showOverlay({ status: 'recording' })
    vi.advanceTimersByTime(2000)
    expect(windowMock.hide).not.toHaveBeenCalled()
  })

  it('cancels an old error timer when a new processing state arrives', () => {
    showOverlay({ status: 'recording' })
    showErrorAndHide('Test error')
    updateOverlay({ status: 'processing', processingStage: 'transcribing' })
    vi.advanceTimersByTime(2000)
    expect(windowMock.hide).not.toHaveBeenCalled()
  })

  it('cancels the automatic hide when explicitly dismissed', () => {
    showOverlay({ status: 'success' }, 1800)
    hideOverlay()
    vi.advanceTimersByTime(2000)
    expect(windowMock.hide).toHaveBeenCalledOnce()
  })

  it('does not let a destroyed window timer hide its replacement', () => {
    showOverlay({ status: 'success' }, 1800)
    destroyOverlayWindow()
    showOverlay({ status: 'recording' })
    vi.advanceTimersByTime(2000)
    expect(windowMock.hide).not.toHaveBeenCalled()
  })
})
