import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  key: 'Command+Alt',
  session: null as { id: string; status: string } | null,
  start: vi.fn(),
  stop: vi.fn(),
  listeners: new Map<string, (event: { type: number; keycode: number }) => void>(),
}))

vi.mock('uiohook-napi', () => ({
  UiohookKey: {
    Shift: 42,
    ShiftRight: 54,
    Ctrl: 29,
    CtrlRight: 3613,
    Alt: 56,
    AltRight: 3640,
    Meta: 3675,
    MetaRight: 3676,
    Space: 57,
    A: 30,
  },
  uIOhook: {
    on: (name: string, callback: (event: { type: number; keycode: number }) => void) =>
      mocks.listeners.set(name, callback),
    start: vi.fn(),
    stop: vi.fn(),
  },
}))
vi.mock('../config-manager', () => ({
  configManager: {
    getHotkeyConfig: () => ({ pttKey: mocks.key }),
    getTranslationConfig: () => ({ enabled: false }),
  },
}))
vi.mock('../hotkey-manager', () => ({ hotkeyManager: { register: vi.fn() } }))
vi.mock('../window', () => ({ createSettingsWindow: vi.fn() }))
vi.mock('../translation/translator', () => ({ translator: { translate: vi.fn() } }))
vi.mock('../platform/hyprland-integration', () => ({
  hyprlandIntegration: { isActiveSession: () => false },
}))
vi.mock('../audio', () => ({
  getCurrentSession: () => mocks.session,
  handleStartRecording: mocks.start,
  handleStopRecording: mocks.stop,
}))

import { ioHookManager } from '../iohook-manager'
import { registerGlobalHotkeys } from './ptt-handler'

function input(name: 'keydown' | 'keyup', keycode: number): void {
  const listener = mocks.listeners.get(name)
  if (!listener) throw new Error('Native keyboard listener was not registered')
  listener({ type: name === 'keydown' ? 4 : 5, keycode })
}
const down = (keycode: number) => input('keydown', keycode)
const up = (keycode: number) => input('keyup', keycode)

describe('native push-to-talk hold lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.key = 'Command+Alt'
    mocks.session = null
    mocks.start.mockImplementation(() => {
      if (!mocks.session) mocks.session = { id: 'test-session', status: 'recording' }
    })
    mocks.stop.mockImplementation(() => {
      if (mocks.session) mocks.session.status = 'processing'
    })
  })
  afterEach(() => {
    ioHookManager.removeAllListeners()
    ioHookManager.stop()
    vi.useRealTimers()
  })

  it('keeps Command+Option recording through extra modifiers and stops on a required release', async () => {
    await registerGlobalHotkeys()
    down(3675)
    down(56)
    await vi.advanceTimersByTimeAsync(50)
    expect(mocks.start).toHaveBeenCalledOnce()
    down(42)
    up(42)
    down(29)
    expect(mocks.stop).not.toHaveBeenCalled()
    up(3675)
    expect(mocks.stop).toHaveBeenCalledOnce()
    expect(mocks.stop).toHaveBeenCalledWith(expect.objectContaining({ source: 'hotkey-release' }))
  })

  it('keeps a bare Option hold through ordinary keys without restarting on their release', async () => {
    mocks.key = 'Alt'
    await registerGlobalHotkeys()
    down(56)
    await vi.advanceTimersByTimeAsync(50)
    down(30)
    up(30)
    await vi.advanceTimersByTimeAsync(50)
    expect(mocks.stop).not.toHaveBeenCalled()
    expect(mocks.start).toHaveBeenCalledOnce()
    up(56)
    expect(mocks.stop).toHaveBeenCalledOnce()
  })

  it('rejects extra modifiers, then starts immediately once the shortcut matches', async () => {
    await registerGlobalHotkeys()
    down(42)
    down(3675)
    down(56)
    await vi.advanceTimersByTimeAsync(100)
    expect(mocks.start).not.toHaveBeenCalled()
    up(42)
    expect(mocks.start).toHaveBeenCalledOnce()
    up(56)
    expect(mocks.stop).toHaveBeenCalledOnce()
  })

  it('consumes a busy press until a required key is released, including extra-key changes', async () => {
    mocks.session = { id: 'previous', status: 'processing' }
    await registerGlobalHotkeys()
    down(3675)
    down(56)
    await vi.advanceTimersByTimeAsync(50)
    mocks.start.mockClear()
    mocks.session = null
    down(42)
    up(42)
    down(56)
    await vi.advanceTimersByTimeAsync(100)
    expect(mocks.start).not.toHaveBeenCalled()
    up(56)
    down(56)
    await vi.advanceTimersByTimeAsync(50)
    expect(mocks.start).toHaveBeenCalledOnce()
  })
})
