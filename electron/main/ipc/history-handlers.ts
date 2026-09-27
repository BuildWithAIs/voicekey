/**
 * 历史记录相关 IPC 处理器
 *
 * 负责处理以下 IPC 通道：
 * - HISTORY_GET: 按需查询历史记录
 * - HISTORY_SUMMARY: 获取首页统计
 * - HISTORY_CLEAR: 清空历史记录
 * - HISTORY_DELETE: 删除单条历史记录
 *
 * @module electron/main/ipc/history-handlers
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS, type HistoryPageRequest } from '../../shared/types'
import { historyManager } from '../history-manager'

/**
 * 注册历史记录相关 IPC 处理器
 *
 * 本模块直接使用 historyManager 单例，无需依赖注入
 */
export function registerHistoryHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.HISTORY_GET, (_event, request: HistoryPageRequest) =>
    historyManager.getPage(request),
  )
  ipcMain.handle(IPC_CHANNELS.HISTORY_SUMMARY, () => historyManager.getSummary())

  // HISTORY_CLEAR: 清空历史记录
  ipcMain.handle(IPC_CHANNELS.HISTORY_CLEAR, () => historyManager.clear())

  // HISTORY_DELETE: 删除单条历史记录
  ipcMain.handle(IPC_CHANNELS.HISTORY_DELETE, (_event, id: unknown) => {
    if (typeof id !== 'string' || id.length === 0 || id.length > 200) {
      throw new Error('Invalid history item ID')
    }
    return historyManager.delete(id)
  })
}
