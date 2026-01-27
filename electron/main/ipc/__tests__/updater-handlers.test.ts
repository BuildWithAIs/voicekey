import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '@electron/shared/types'

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown

const createIpcMain = () => {
  const handlers = new Map<string, IpcHandler>()
  const ipcMain = {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlers.set(channel, handler)
    }),
  }
  return { ipcMain, handlers }
}

describe('updater-handlers', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('wires updater handlers to UpdaterManager and app', async () => {
    const { ipcMain, handlers } = createIpcMain()
    const mockCheckForUpdates = vi.fn().mockResolvedValue({ hasUpdate: false })
    const mockGetLastUpdateInfo = vi.fn().mockReturnValue({ hasUpdate: true })
    const mockOpenReleasePage = vi.fn()
    const mockGetVersion = vi.fn(() => '0.1.0')

    vi.doMock('electron', () => ({ ipcMain, app: { getVersion: mockGetVersion } }))
    vi.doMock('../../updater-manager', () => ({
      UpdaterManager: {
        checkForUpdates: mockCheckForUpdates,
        getLastUpdateInfo: mockGetLastUpdateInfo,
        openReleasePage: mockOpenReleasePage,
      },
    }))

    const { registerUpdaterHandlers } = await import('../updater-handlers')
    registerUpdaterHandlers()

    const checkResult = await handlers.get(IPC_CHANNELS.CHECK_FOR_UPDATES)?.(null)
    const status = await handlers.get(IPC_CHANNELS.GET_UPDATE_STATUS)?.(null)
    const version = await handlers.get(IPC_CHANNELS.GET_APP_VERSION)?.(null)
    await handlers.get(IPC_CHANNELS.OPEN_EXTERNAL)?.(null, 'https://example.com')

    expect(mockCheckForUpdates).toHaveBeenCalled()
    expect(checkResult).toEqual({ hasUpdate: false })
    expect(mockGetLastUpdateInfo).toHaveBeenCalled()
    expect(status).toEqual({ hasUpdate: true })
    expect(mockGetVersion).toHaveBeenCalled()
    expect(version).toBe('0.1.0')
    expect(mockOpenReleasePage).toHaveBeenCalledWith('https://example.com')
  })
})
