/**
 * IPC 处理器统一注册入口
 *
 * 本模块负责注册所有 IPC 处理器，按功能域拆分为：
 * - config-handlers: 配置、语言、本地模型下载/删除/目录与润色连接相关
 * - session-handlers: 经典/流式录音会话、音频数据与取消相关
 * - history-handlers: 历史记录 (HISTORY_GET, HISTORY_CLEAR, HISTORY_DELETE)
 * - log-handlers: 日志相关 (LOG_GET_TAIL, LOG_OPEN_FOLDER, LOG_WRITE)
 * - updater-handlers: 更新相关 (CHECK_FOR_UPDATES, GET_UPDATE_STATUS, GET_APP_VERSION, OPEN_EXTERNAL)
 * - overlay-handlers: 浮窗相关 (OVERLAY_AUDIO_LEVEL, set-ignore-mouse-events, error)
 * - platform-handlers: Linux/Omarchy Hyprland 集成状态、安装与移除
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

import {
  registerPlatformHandlers,
  initPlatformHandlers,
  type PlatformHandlersDeps,
} from './platform-handlers'

export type IPCHandlersDeps = {
  config: ConfigHandlersDeps
  session: SessionHandlersDeps
  overlay: OverlayHandlersDeps
  platform: PlatformHandlersDeps
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
 *       registerGlobalHotkeys,
 *       getRefineService: () => refineService,
 *       getSettingsWindow,
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
  initPlatformHandlers(deps.platform)
}

/**
 * 注册所有 IPC 处理器
 * 替代 main.ts 中的 setupIPCHandlers()
 *
 * 当前状态：
 * - ✅ config-handlers (12 个通道)
 * - ✅ session-handlers (7 个通道)
 * - ✅ history-handlers (3 个通道)
 * - ✅ log-handlers (3 个通道)
 * - ✅ updater-handlers (4 个通道)
 * - ✅ overlay-handlers (3 个通道)
 * - ✅ platform-handlers (3 个通道)
 */
export function registerAllIPCHandlers(): void {
  registerConfigHandlers()
  registerSessionHandlers()
  registerHistoryHandlers()
  registerLogHandlers()
  registerUpdaterHandlers()
  registerOverlayHandlers()
  registerPlatformHandlers()

  console.log('[IPC] All handlers registered: 7 modules, 35 channels')
}

// Re-export types for external use
export type { ConfigHandlersDeps } from './config-handlers'
export type { SessionHandlersDeps } from './session-handlers'
export type { OverlayHandlersDeps } from './overlay-handlers'
export type { PlatformHandlersDeps } from './platform-handlers'
