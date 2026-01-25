/**
 * 会话状态管理模块
 *
 * 负责：
 * - 会话状态（currentSession）的管理
 * - 录音开始/停止/取消的控制
 *
 * @module electron/main/audio/session-manager
 */

import { IPC_CHANNELS, type VoiceSession } from '../../shared/types'
import { showOverlay, hideOverlay, updateOverlay, showErrorAndHide } from '../window/overlay'
import { getBackgroundWindow } from '../window/background'
import { t } from '../i18n'

// 会话状态
let currentSession: VoiceSession | null = null

/**
 * 获取当前会话
 */
export function getCurrentSession(): VoiceSession | null {
  return currentSession
}

/**
 * 设置会话状态为错误
 */
export function setSessionError(): void {
  if (currentSession) {
    currentSession.status = 'error'
  }
}

/**
 * 清除当前会话
 */
export function clearSession(): void {
  currentSession = null
}

/**
 * 更新会话数据
 *
 * @param updates - 要更新的会话属性
 */
export function updateSession(updates: Partial<VoiceSession>): void {
  if (currentSession) {
    Object.assign(currentSession, updates)
  }
}

/**
 * 开始录音
 *
 * 创建新的会话并通知后台窗口开始录音
 */
export async function handleStartRecording(): Promise<void> {
  const startTimestamp = Date.now()
  console.log(`[Audio:Session] handleStartRecording triggered`)

  // 如果已经在录音中，忽略
  if (currentSession && currentSession.status === 'recording') {
    console.log('[Audio:Session] Already recording, ignoring')
    return
  }

  try {
    // 显示录音状态 HUD
    showOverlay({ status: 'recording' })

    // 创建新会话
    currentSession = {
      id: `session-${Date.now()}`,
      startTime: new Date(),
      status: 'recording',
    }

    // 通知后台窗口开始录音
    const bgWindow = getBackgroundWindow()
    if (bgWindow) {
      bgWindow.webContents.send(IPC_CHANNELS.SESSION_START)
      const duration = Date.now() - startTimestamp
      console.log(`[Audio:Session] ⏱️ Recording start completed in ${duration}ms`)
    } else {
      console.error('[Audio:Session] backgroundWindow is not available')
      showErrorAndHide(t('errors.internal'))
      currentSession = null
    }
  } catch (error) {
    console.error('[Audio:Session] Failed to start recording:', error)
    showErrorAndHide(t('errors.startFailed'))
    currentSession = null
  }
}

/**
 * 停止录音
 *
 * 更新会话状态为 processing 并通知后台窗口停止录音
 */
export async function handleStopRecording(): Promise<void> {
  // 检查是否有活跃的录音会话
  if (!currentSession || currentSession.status !== 'recording') {
    console.log(
      '[Audio:Session] handleStopRecording: no active recording session, status:',
      currentSession?.status,
    )
    return
  }

  try {
    // 计算录音时长
    const recordingDuration = Date.now() - currentSession.startTime.getTime()
    console.log(`[Audio:Session] ⏱️ Recording duration: ${recordingDuration}ms`)

    // 更新会话状态
    currentSession.duration = recordingDuration
    currentSession.status = 'processing'

    // 显示处理中状态
    updateOverlay({ status: 'processing' })

    // 通知后台窗口停止录音
    const bgWindow = getBackgroundWindow()
    if (bgWindow) {
      console.log('[Audio:Session] Sending SESSION_STOP to backgroundWindow')
      bgWindow.webContents.send(IPC_CHANNELS.SESSION_STOP)
    } else {
      console.error('[Audio:Session] Cannot send SESSION_STOP: backgroundWindow not available')
      showErrorAndHide(t('errors.stopFailed'))
    }
  } catch (error) {
    console.error('[Audio:Session] Failed to stop recording:', error)
    showErrorAndHide(t('errors.stopFailed'))
  }
}

/**
 * 取消会话
 *
 * 立即隐藏 HUD 并取消当前会话
 * 用于用户主动取消或按下 ESC 键
 */
export async function handleCancelSession(): Promise<void> {
  console.log('[Audio:Session] handleCancelSession triggered')

  // 1. 立即隐藏 HUD
  hideOverlay()

  // 2. 标记当前会话为已取消
  if (currentSession) {
    console.log('[Audio:Session] Cancelling session:', currentSession.id)
    currentSession = null
  }

  // 3. 通知后台窗口停止录音（如果正在录音）
  const bgWindow = getBackgroundWindow()
  if (bgWindow) {
    bgWindow.webContents.send(IPC_CHANNELS.SESSION_STOP)
  }

  // 4. (关键) 在 handleAudioData 中会检查 currentSession 是否为 null
  // 如果为 null 或 status 为 aborted，则直接丢弃音频数据，不执行 ASR 和注入
}
