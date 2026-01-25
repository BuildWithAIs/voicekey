/**
 * 更新相关 IPC 处理器
 *
 * 负责处理以下 IPC 通道：
 * - CHECK_FOR_UPDATES: 检查更新
 * - GET_UPDATE_STATUS: 获取上次更新检查结果
 * - GET_APP_VERSION: 获取应用版本
 * - OPEN_EXTERNAL: 打开外部链接（发布页面）
 *
 * @module electron/main/ipc/updater-handlers
 */

import { app, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/types'
import { UpdaterManager } from '../updater-manager'

/**
 * 注册更新相关 IPC 处理器
 *
 * 本模块直接使用 UpdaterManager 和 app API，无需依赖注入
 */
export function registerUpdaterHandlers(): void {
  // CHECK_FOR_UPDATES: 检查更新
  ipcMain.handle(IPC_CHANNELS.CHECK_FOR_UPDATES, async () => {
    return await UpdaterManager.checkForUpdates()
  })

  // GET_UPDATE_STATUS: 获取上次更新检查结果
  ipcMain.handle(IPC_CHANNELS.GET_UPDATE_STATUS, () => {
    return UpdaterManager.getLastUpdateInfo()
  })

  // GET_APP_VERSION: 获取应用版本
  ipcMain.handle(IPC_CHANNELS.GET_APP_VERSION, () => {
    return app.getVersion()
  })

  // OPEN_EXTERNAL: 打开外部链接（发布页面）
  ipcMain.handle(IPC_CHANNELS.OPEN_EXTERNAL, (_event, url: string) => {
    UpdaterManager.openReleasePage(url)
  })
}
