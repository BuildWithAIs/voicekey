/**
 * 浮窗相关 IPC 处理器
 *
 * 负责处理以下 IPC 通道：
 * - OVERLAY_AUDIO_LEVEL: 音频电平更新
 * - set-ignore-mouse-events: 设置浮窗鼠标穿透
 * - error: 渲染进程错误上报
 *
 * @module electron/main/ipc/overlay-handlers
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS, type VoiceSession } from '../../shared/types'
import { sendAudioLevel, setOverlayIgnoreMouseEvents, showErrorAndHide } from '../window/overlay'
import { t } from '../i18n'

const MAX_RENDERER_ERROR_LENGTH = 500

// 渲染进程可能上报任意值，统一转换为安全的字符串
function coerceErrorMessage(error: unknown): string {
  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : String(error ?? t('errors.generic'))
  return message.length > MAX_RENDERER_ERROR_LENGTH
    ? `${message.slice(0, MAX_RENDERER_ERROR_LENGTH)}…`
    : message
}

/**
 * 浮窗处理器外部依赖
 * 这些函数定义在 main.ts 中，需要通过依赖注入传入
 */
export type OverlayHandlersDeps = {
  /** 显示系统通知 */
  showNotification: (title: string, body: string) => void
  /** 获取当前会话 */
  getCurrentSession: () => VoiceSession | null
  /** 设置会话错误状态 */
  setSessionError: () => void
}

let deps: OverlayHandlersDeps

/**
 * 初始化浮窗处理器依赖
 * 必须在 registerOverlayHandlers 之前调用
 */
export function initOverlayHandlers(dependencies: OverlayHandlersDeps): void {
  deps = dependencies
}

/**
 * 注册浮窗相关 IPC 处理器
 */
export function registerOverlayHandlers(): void {
  // OVERLAY_AUDIO_LEVEL: 音频电平更新
  ipcMain.on(IPC_CHANNELS.OVERLAY_AUDIO_LEVEL, (_event, level: number) => {
    sendAudioLevel(level)
  })

  // set-ignore-mouse-events: 设置浮窗鼠标穿透
  ipcMain.on(
    'set-ignore-mouse-events',
    (_event, ignore: boolean, options?: { forward?: boolean }) => {
      setOverlayIgnoreMouseEvents(ignore, options)
    },
  )

  // error: 渲染进程错误上报（如麦克风/MediaRecorder 失败）
  ipcMain.on('error', (_event, error: unknown) => {
    const message = coerceErrorMessage(error)
    console.error('[IPC:Overlay] 🔴 Renderer Error received:', message)
    console.error('[IPC:Overlay] 🔴 Error type:', typeof error)
    console.error('[IPC:Overlay] 🔴 Current session status:', deps.getCurrentSession()?.status)

    const hadActiveSession = Boolean(deps.getCurrentSession())
    deps.setSessionError()
    deps.showNotification(t('notification.errorTitle'), message)

    // 录音已中断：把 HUD 切到错误态并自动隐藏，避免停留在录音界面
    if (hadActiveSession) {
      showErrorAndHide(message)
    }
  })
}
