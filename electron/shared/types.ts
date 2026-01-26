// 跨进程共享的类型定义

import type { AppLanguage, LanguageSetting } from './i18n'

export interface VoiceSession {
  id: string
  startTime: Date
  status: 'recording' | 'processing' | 'completed' | 'error'
  audioData?: Buffer
  transcription?: string
  error?: string
  duration?: number
}

export interface ASRConfig {
  provider: 'glm' | 'groq'
  region: 'cn' | 'intl'
  apiKeys: {
    cn: string
    intl: string
  }
  groqApiKey?: string

  // Deprecated: for backward compatibility during migration
  apiKey?: string

  endpoint?: string
  language?: string
}

export interface HotkeyConfig {
  pttKey: string
  toggleSettings: string
}

export interface AppPreferences {
  language: LanguageSetting
  autoLaunch?: boolean
}

export interface LanguageSnapshot {
  setting: LanguageSetting
  resolved: AppLanguage
  locale: string
}

export interface AppConfig {
  app: AppPreferences
  asr: ASRConfig
  hotkey: HotkeyConfig
}

export interface HistoryItem {
  id: string
  text: string
  timestamp: number
  duration?: number
}

export interface UpdateInfo {
  hasUpdate: boolean
  latestVersion: string
  releaseUrl: string
  releaseNotes: string
  error?: string
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntryPayload {
  level: LogLevel
  message: string
  scope?: string
  data?: unknown
}

export interface LogTailOptions {
  maxBytes?: number
}

// IPC 通道定义
export const IPC_CHANNELS = {
  // 配置相关
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_TEST: 'config:test',
  APP_LANGUAGE_GET: 'app:language:get',
  APP_LANGUAGE_CHANGED: 'app:language:changed',

  // 录音会话相关
  SESSION_START: 'session:start',
  SESSION_STOP: 'session:stop',
  SESSION_STATUS: 'session:status',
  AUDIO_DATA: 'audio:data', // [NEW] Renderer -> Main (Audio Buffer)
  ERROR: 'error', // [NEW] Renderer -> Main (Error)

  // 快捷键相关
  HOTKEY_REGISTER: 'hotkey:register',
  HOTKEY_UNREGISTER: 'hotkey:unregister',

  // 通知相关
  NOTIFICATION_SHOW: 'notification:show',

  // Overlay 相关
  OVERLAY_SHOW: 'overlay:show',
  OVERLAY_HIDE: 'overlay:hide',
  OVERLAY_UPDATE: 'overlay:update',
  OVERLAY_AUDIO_LEVEL: 'overlay:audio-level',

  // 历史记录相关
  HISTORY_GET: 'history:get',
  HISTORY_CLEAR: 'history:clear',
  HISTORY_DELETE: 'history:delete',

  // 更新相关
  CHECK_FOR_UPDATES: 'update:check',
  GET_UPDATE_STATUS: 'update:get-status',
  GET_APP_VERSION: 'app:version',
  OPEN_EXTERNAL: 'app:open-external',

  // 取消会话 (来自 main 分支的新功能)
  CANCEL_SESSION: 'session:cancel',

  // 日志相关 (来自我们分支的新功能)
  LOG_GET_TAIL: 'log:get-tail',
  LOG_OPEN_FOLDER: 'log:open-folder',
  LOG_WRITE: 'log:write',
} as const

export type OverlayStatus = 'recording' | 'processing' | 'success' | 'error'

export interface OverlayState {
  status: OverlayStatus
  message?: string
}

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
