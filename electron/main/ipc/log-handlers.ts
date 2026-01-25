/**
 * 日志相关 IPC 处理器
 *
 * 负责处理以下 IPC 通道：
 * - LOG_GET_TAIL: 读取日志末尾内容
 * - LOG_OPEN_FOLDER: 打开日志目录
 * - LOG_WRITE: 写入日志（渲染进程 → 主进程）
 *
 * @module electron/main/ipc/log-handlers
 */

import { ipcMain, shell } from 'electron'
import { IPC_CHANNELS, type LogTailOptions, type LogEntryPayload } from '../../shared/types'
import { LOG_TAIL_MAX_BYTES } from '../../shared/constants'
import { getLogDirectory, readLogTail, writeLog } from '../logger'

/**
 * 注册日志相关 IPC 处理器
 *
 * 本模块直接使用 logger 模块导出的函数，无需依赖注入
 */
export function registerLogHandlers(): void {
  // LOG_GET_TAIL: 读取日志末尾内容
  ipcMain.handle(IPC_CHANNELS.LOG_GET_TAIL, (_event, options?: LogTailOptions) => {
    const maxBytes = Math.max(
      1024,
      Math.min(options?.maxBytes ?? LOG_TAIL_MAX_BYTES, LOG_TAIL_MAX_BYTES * 5),
    )
    return readLogTail(maxBytes)
  })

  // LOG_OPEN_FOLDER: 打开日志目录
  ipcMain.handle(IPC_CHANNELS.LOG_OPEN_FOLDER, () => {
    return shell.openPath(getLogDirectory())
  })

  // LOG_WRITE: 写入日志（渲染进程 → 主进程）
  ipcMain.on(IPC_CHANNELS.LOG_WRITE, (_event, payload: LogEntryPayload) => {
    if (!payload || !payload.message || !payload.level) return
    writeLog({
      ...payload,
      scope: payload.scope ?? 'renderer',
    })
  })
}
