/**
 * 会话相关 IPC 处理器
 *
 * 负责处理以下 IPC 通道：
 * - SESSION_START: 开始录音
 * - SESSION_STOP: 停止录音
 * - SESSION_STATUS: 获取当前会话状态
 * - AUDIO_DATA: 接收音频数据（来自渲染进程）
 * - CANCEL_SESSION: 取消当前会话
 *
 * @module electron/main/ipc/session-handlers
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS, type VoiceSession } from '../../shared/types'

/**
 * 会话处理器外部依赖
 * 这些函数定义在 main.ts 中，需要通过依赖注入传入
 */
export type SessionHandlersDeps = {
  /** 开始录音处理函数 */
  handleStartRecording: () => Promise<void>
  /** 停止录音处理函数 */
  handleStopRecording: () => Promise<void>
  /** 音频数据处理函数 */
  handleAudioData: (buffer: Buffer) => Promise<void>
  /** 取消会话处理函数 */
  handleCancelSession: () => Promise<void>
  /** 获取当前会话 */
  getCurrentSession: () => VoiceSession | null
}

let deps: SessionHandlersDeps

/**
 * 初始化会话处理器依赖
 * 必须在 registerSessionHandlers 之前调用
 */
export function initSessionHandlers(dependencies: SessionHandlersDeps): void {
  deps = dependencies
}

/**
 * 注册会话相关 IPC 处理器
 */
export function registerSessionHandlers(): void {
  // SESSION_START: 开始录音
  ipcMain.handle(IPC_CHANNELS.SESSION_START, async () => {
    await deps.handleStartRecording()
  })

  // SESSION_STOP: 停止录音
  ipcMain.handle(IPC_CHANNELS.SESSION_STOP, async () => {
    await deps.handleStopRecording()
  })

  // SESSION_STATUS: 获取当前会话状态
  ipcMain.handle(IPC_CHANNELS.SESSION_STATUS, () => {
    return deps.getCurrentSession()?.status || 'idle'
  })

  // AUDIO_DATA: 接收音频数据（来自渲染进程）
  ipcMain.on(IPC_CHANNELS.AUDIO_DATA, (_event, buffer) => {
    deps.handleAudioData(Buffer.from(buffer))
  })

  // CANCEL_SESSION: 取消当前会话
  ipcMain.handle(IPC_CHANNELS.CANCEL_SESSION, () => deps.handleCancelSession())
}
