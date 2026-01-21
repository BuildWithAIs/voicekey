// 跨进程共享的类型定义

import type { LanguageSetting } from './i18n'

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
  provider: 'glm'
  region: 'cn' | 'intl'
  apiKeys: {
    cn: string
    intl: string
  }

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

// IPC 通道定义
export const IPC_CHANNELS = {
  // 配置相关
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_TEST: 'config:test',

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
} as const

export type OverlayStatus = 'recording' | 'processing' | 'success' | 'error'

export interface OverlayState {
  status: OverlayStatus
  message?: string
}

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
