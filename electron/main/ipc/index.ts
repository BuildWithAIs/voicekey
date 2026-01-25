/**
 * IPC 处理器统一注册入口
 *
 * 本模块负责注册所有 IPC 处理器，按功能域拆分为：
 * - config-handlers: 配置相关 (CONFIG_GET, CONFIG_SET, CONFIG_TEST)
 * - session-handlers: 会话相关 (SESSION_START, SESSION_STOP, SESSION_STATUS, AUDIO_DATA, CANCEL_SESSION)
 * - history-handlers: 历史记录 (HISTORY_GET, HISTORY_CLEAR, HISTORY_DELETE)
 * - log-handlers: 日志相关 (LOG_GET_TAIL, LOG_OPEN_FOLDER, LOG_WRITE)
 * - updater-handlers: 更新相关 (CHECK_FOR_UPDATES, GET_UPDATE_STATUS, GET_APP_VERSION, OPEN_EXTERNAL)
 * - overlay-handlers: 浮窗相关 (OVERLAY_AUDIO_LEVEL, set-ignore-mouse-events, error)
 *
 * @module electron/main/ipc
 */

// 已实现的处理器模块
import {
  registerConfigHandlers,
  initConfigHandlers,
  type ConfigHandlersDeps,
} from './config-handlers'

import {
  registerSessionHandlers,
  initSessionHandlers,
  type SessionHandlersDeps,
} from './session-handlers'

import { registerHistoryHandlers } from './history-handlers'

import { registerLogHandlers } from './log-handlers'

import { registerUpdaterHandlers } from './updater-handlers'

import {
  registerOverlayHandlers,
  initOverlayHandlers,
  type OverlayHandlersDeps,
} from './overlay-handlers'

export type IPCHandlersDeps = {
  config: ConfigHandlersDeps
  session: SessionHandlersDeps
  overlay: OverlayHandlersDeps
}

/**
 * 初始化 IPC 处理器依赖
 * 在 registerAllIPCHandlers 之前调用
 *
 * @example
 * ```typescript
 * import { initIPCHandlers, registerAllIPCHandlers } from './ipc'
 *
 * app.whenReady().then(() => {
 *   initIPCHandlers({
 *     config: {
 *       updateAutoLaunchState,
 *       refreshLocalizedUi,
 *       initializeASRProvider,
 *       registerGlobalHotkeys,
 *       getAsrProvider: () => asrProvider,
 *     },
 *   })
 *   registerAllIPCHandlers()
 * })
 * ```
 */
export function initIPCHandlers(deps: IPCHandlersDeps): void {
  initConfigHandlers(deps.config)
  initSessionHandlers(deps.session)
  initOverlayHandlers(deps.overlay)
}

/**
 * 注册所有 IPC 处理器
 * 替代 main.ts 中的 setupIPCHandlers()
 *
 * 当前状态：
 * - ✅ config-handlers (3 个通道)
 * - ✅ session-handlers (5 个通道)
 * - ✅ history-handlers (3 个通道)
 * - ✅ log-handlers (3 个通道)
 * - ✅ updater-handlers (4 个通道)
 * - ✅ overlay-handlers (3 个通道)
 */
export function registerAllIPCHandlers(): void {
  registerConfigHandlers()
  registerSessionHandlers()
  registerHistoryHandlers()
  registerLogHandlers()
  registerUpdaterHandlers()
  registerOverlayHandlers()

  console.log('[IPC] All handlers registered: 6 modules, 21 channels')
}

// Re-export types for external use
export type { ConfigHandlersDeps } from './config-handlers'
export type { SessionHandlersDeps } from './session-handlers'
export type { OverlayHandlersDeps } from './overlay-handlers'
