import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import {
  IPC_CHANNELS,
  type OverlayState,
  type HistoryItem,
  type AppConfig,
  type ASRConfig,
  type UpdateInfo,
  type LogEntryPayload,
  type LogTailOptions,
} from '../shared/types'

// 定义暴露给渲染进程的API接口
export interface ElectronAPI {
  // 系统信息
  platform: string

  // 配置相关
  getConfig: () => Promise<AppConfig>
  setConfig: (config: Partial<AppConfig>) => Promise<void>
  testConnection: (config?: ASRConfig) => Promise<boolean>

  // 录音会话相关
  startSession: () => Promise<void>
  stopSession: () => Promise<void>
  getSessionStatus: () => Promise<string>

  // 历史记录相关
  getHistory: () => Promise<HistoryItem[]>
  clearHistory: () => Promise<void>
  deleteHistoryItem: (id: string) => Promise<void>

  // 快捷键相关
  registerHotkey: (accelerator: string) => Promise<boolean>
  unregisterHotkey: (accelerator: string) => Promise<void>

  // 事件监听
  onSessionStatus: (callback: (status: string) => void) => () => void
  onTranscription: (callback: (text: string) => void) => () => void
  onError: (callback: (error: string) => void) => () => void

  onStartRecording: (callback: () => void) => () => void
  onStopRecording: (callback: () => void) => () => void
  sendAudioData: (buffer: ArrayBuffer) => void
  sendError: (error: string) => void
  sendAudioLevel: (level: number) => void

  onOverlayUpdate: (callback: (state: OverlayState) => void) => () => void
  onAudioLevel: (callback: (level: number) => void) => () => void

  // Overlay mouse event handling
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) => void

  // 更新相关
  checkForUpdates: () => Promise<UpdateInfo>
  getUpdateStatus: () => Promise<UpdateInfo | null>
  getAppVersion: () => Promise<string>
  openExternal: (url: string) => Promise<void>

  // 取消会话 (来自 main 分支的新功能)
  cancelSession: () => Promise<void>

  // 日志相关 (来自我们分支的新功能)
  getLogTail: (options?: LogTailOptions) => Promise<string>
  openLogFolder: () => Promise<void>
  log: (entry: LogEntryPayload) => void
}

// 暴露安全的API到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 系统信息
  platform: process.platform,

  // 配置相关
  getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET),
  setConfig: (config: Partial<AppConfig>) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET, config),
  testConnection: (config?: ASRConfig) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_TEST, config),

  // 录音会话相关
  startSession: () => ipcRenderer.invoke(IPC_CHANNELS.SESSION_START),
  stopSession: () => ipcRenderer.invoke(IPC_CHANNELS.SESSION_STOP),
  getSessionStatus: () => ipcRenderer.invoke(IPC_CHANNELS.SESSION_STATUS),

  // 历史记录相关
  getHistory: () => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_GET),
  clearHistory: () => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_CLEAR),
  deleteHistoryItem: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_DELETE, id),

  // 快捷键相关
  registerHotkey: (accelerator: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.HOTKEY_REGISTER, accelerator),
  unregisterHotkey: (accelerator: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.HOTKEY_UNREGISTER, accelerator),

  // 事件监听
  onSessionStatus: (callback: (status: string) => void) => {
    const listener = (_event: IpcRendererEvent, status: string) => callback(status)
    ipcRenderer.on(IPC_CHANNELS.SESSION_STATUS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SESSION_STATUS, listener)
  },
  onTranscription: (callback: (text: string) => void) => {
    const listener = (_event: IpcRendererEvent, text: string) => callback(text)
    ipcRenderer.on('transcription:result', listener)
    return () => ipcRenderer.removeListener('transcription:result', listener)
  },
  onError: (callback: (error: string) => void) => {
    const listener = (_event: IpcRendererEvent, error: string) => callback(error)
    ipcRenderer.on('error', listener)
    return () => ipcRenderer.removeListener('error', listener)
  },

  // [NEW] Audio Recording (Main -> Renderer)
  onStartRecording: (callback: () => void) => {
    const listener = () => {
      console.log('[Preload] Received SESSION_START')
      callback()
    }
    ipcRenderer.on(IPC_CHANNELS.SESSION_START, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SESSION_START, listener)
  },
  onStopRecording: (callback: () => void) => {
    const listener = () => {
      console.log('[Preload] Received SESSION_STOP')
      callback()
    }
    ipcRenderer.on(IPC_CHANNELS.SESSION_STOP, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SESSION_STOP, listener)
  },

  sendAudioData: (buffer: ArrayBuffer) => {
    ipcRenderer.send('audio:data', buffer)
  },
  sendError: (error: string) => {
    ipcRenderer.send('error', error)
  },
  sendAudioLevel: (level: number) => {
    ipcRenderer.send(IPC_CHANNELS.OVERLAY_AUDIO_LEVEL, level)
  },

  onOverlayUpdate: (callback: (state: OverlayState) => void) => {
    const listener = (_event: any, state: OverlayState) => callback(state)
    ipcRenderer.on(IPC_CHANNELS.OVERLAY_UPDATE, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.OVERLAY_UPDATE, listener)
  },
  onAudioLevel: (callback: (level: number) => void) => {
    const listener = (_event: any, level: number) => callback(level)
    ipcRenderer.on(IPC_CHANNELS.OVERLAY_AUDIO_LEVEL, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.OVERLAY_AUDIO_LEVEL, listener)
  },

  setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore, options)
  },

  // 更新相关
  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.CHECK_FOR_UPDATES),
  getUpdateStatus: () => ipcRenderer.invoke(IPC_CHANNELS.GET_UPDATE_STATUS),
  getAppVersion: () => ipcRenderer.invoke(IPC_CHANNELS.GET_APP_VERSION),
  openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_EXTERNAL, url),

  // 取消会话 (来自 main 分支的新功能)
  cancelSession: () => ipcRenderer.invoke(IPC_CHANNELS.CANCEL_SESSION),

  // 日志相关 (来自我们分支的新功能)
  getLogTail: (options?: LogTailOptions) => ipcRenderer.invoke(IPC_CHANNELS.LOG_GET_TAIL, options),
  openLogFolder: () => ipcRenderer.invoke(IPC_CHANNELS.LOG_OPEN_FOLDER),
  log: (entry: LogEntryPayload) => ipcRenderer.send(IPC_CHANNELS.LOG_WRITE, entry),
} as ElectronAPI)
