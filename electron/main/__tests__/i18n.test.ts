import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '@electron/shared/types'

const mockInit = vi.fn()
const mockChangeLanguage = vi.fn()
const mockT = vi.fn((key: string) => key)

const mockGetLocale = vi.fn()
const mockResolveLanguage = vi.fn()
const mockGetLocaleLabel = vi.fn()

const windowsState = vi.hoisted(() => ({
  windows: [] as Array<{
    isDestroyed: () => boolean
    webContents: { send: ReturnType<typeof vi.fn> }
  }>,
}))

vi.mock('i18next', () => ({
  default: {
    init: mockInit,
    changeLanguage: mockChangeLanguage,
    t: mockT,
  },
}))

vi.mock('electron', () => ({
  app: {
    getLocale: mockGetLocale,
  },
  BrowserWindow: {
    getAllWindows: () => windowsState.windows,
  },
}))

vi.mock('../../shared/i18n', () => ({
  DEFAULT_LANGUAGE: 'en',
  resources: { en: { translation: {} } },
  resolveLanguage: mockResolveLanguage,
  getLocale: mockGetLocaleLabel,
}))

const importModule = async () => {
  const module = await import('../i18n')
  return module
}

describe('main i18n', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    windowsState.windows = []
    mockGetLocale.mockReturnValue('en-US')
    mockResolveLanguage.mockReturnValue('en')
    mockGetLocaleLabel.mockReturnValue('en-US')
  })

  it('initializes i18next with resolved language', async () => {
    const i18n = await importModule()
    await i18n.initMainI18n('system')

    expect(mockResolveLanguage).toHaveBeenCalledWith('system', 'en-US')
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        resources: { en: { translation: {} } },
        lng: 'en',
        fallbackLng: 'en',
      }),
    )
  })

  it('sets main language and changes i18next language', async () => {
    const i18n = await importModule()
    mockResolveLanguage.mockReturnValue('zh')
    await i18n.setMainLanguage('system')

    expect(mockResolveLanguage).toHaveBeenCalledWith('system', 'en-US')
    expect(mockChangeLanguage).toHaveBeenCalledWith('zh')
  })

  it('returns language snapshot', async () => {
    const i18n = await importModule()
    await i18n.initMainI18n('system')
    mockResolveLanguage.mockReturnValue('en')
    mockGetLocaleLabel.mockReturnValue('en-US')

    const snapshot = i18n.getMainLanguageSnapshot()
    expect(snapshot).toEqual({
      setting: 'system',
      resolved: 'en',
      locale: 'en-US',
    })
  })

  it('does not sync system locale when setting is not system', async () => {
    const i18n = await importModule()
    await i18n.setMainLanguage('en')
    mockChangeLanguage.mockClear() // Clear the call made by setMainLanguage

    const result = await i18n.syncSystemLocaleIfNeeded()
    expect(result).toBe(false)
    expect(mockChangeLanguage).not.toHaveBeenCalled()
  })

  it('syncs system locale when locale changes and resolves to new language', async () => {
    const i18n = await importModule()

    // Setup sequence for initMainI18n call
    mockGetLocale.mockReturnValueOnce('en-US')
    mockResolveLanguage.mockReturnValueOnce('en')

    await i18n.initMainI18n('system')

    // Setup sequence for syncSystemLocaleIfNeeded call
    mockGetLocale.mockReturnValueOnce('zh-CN')
    mockResolveLanguage.mockReturnValueOnce('zh')

    const result = await i18n.syncSystemLocaleIfNeeded()
    expect(result).toBe(true)
    expect(mockChangeLanguage).toHaveBeenCalledWith('zh')
  })

  it('sends language snapshot to window when not destroyed', async () => {
    const i18n = await importModule()
    await i18n.initMainI18n('system')
    const send = vi.fn()
    const window = { isDestroyed: () => false, webContents: { send } }

    i18n.sendLanguageSnapshotToWindow(window as never)
    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.APP_LANGUAGE_CHANGED, {
      setting: 'system',
      resolved: 'en',
      locale: 'en-US',
    })
  })

  it('broadcasts language snapshot to all alive windows', async () => {
    const i18n = await importModule()
    await i18n.initMainI18n('system')
    const alive = { isDestroyed: () => false, webContents: { send: vi.fn() } }
    const dead = { isDestroyed: () => true, webContents: { send: vi.fn() } }
    windowsState.windows = [alive, dead]

    i18n.broadcastLanguageSnapshot()
    expect(alive.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.APP_LANGUAGE_CHANGED, {
      setting: 'system',
      resolved: 'en',
      locale: 'en-US',
    })
    expect(dead.webContents.send).not.toHaveBeenCalled()
  })
})
