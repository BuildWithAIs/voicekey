import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { IPC_CHANNELS } from '../../shared/types'
import { configManager } from '../config-manager'
import { hyprlandIntegration } from '../platform/hyprland-integration'

export type PlatformHandlersDeps = {
  getSettingsWindow: () => BrowserWindow | null
}

let deps: PlatformHandlersDeps

export function initPlatformHandlers(dependencies: PlatformHandlersDeps): void {
  deps = dependencies
}

function assertSettingsWindowSender(event: IpcMainInvokeEvent, action: string): void {
  const settingsWindow = deps.getSettingsWindow()
  if (!settingsWindow || settingsWindow.webContents !== event.sender) {
    throw new Error(`${action} is only available from the settings window`)
  }
}

function getIntegrationConfig() {
  return {
    hotkeys: configManager.getHotkeyConfig(),
    translationEnabled: configManager.getTranslationConfig().enabled,
  }
}

export function registerPlatformHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.LINUX_INTEGRATION_STATUS, (event) => {
    assertSettingsWindowSender(event, 'Linux integration status')
    const config = getIntegrationConfig()
    return hyprlandIntegration.getStatus(config.hotkeys, config.translationEnabled)
  })

  ipcMain.handle(IPC_CHANNELS.LINUX_INTEGRATION_INSTALL, (event) => {
    assertSettingsWindowSender(event, 'Linux integration installation')
    const config = getIntegrationConfig()
    return hyprlandIntegration.install(config.hotkeys, config.translationEnabled)
  })

  ipcMain.handle(IPC_CHANNELS.LINUX_INTEGRATION_REMOVE, (event) => {
    assertSettingsWindowSender(event, 'Linux integration removal')
    const config = getIntegrationConfig()
    return hyprlandIntegration.remove(config.hotkeys, config.translationEnabled)
  })
}
