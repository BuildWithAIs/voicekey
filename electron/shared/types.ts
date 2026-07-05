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

export type ASRProviderType = 'glm' | 'local-sensevoice'

export interface ASRConfig {
  provider: ASRProviderType
  region: 'cn' | 'intl'
  apiKeys: {
    cn: string
    intl: string
  }
  lowVolumeMode?: boolean

  // Deprecated: for backward compatibility during migration
  apiKey?: string

  endpoint?: string
  language?: string
}

export type LocalASRDownloadPhase = 'model'

export interface LocalASRDownloadProgress {
  phase: LocalASRDownloadPhase
  receivedBytes: number
  totalBytes?: number
  percent?: number
}

export interface LocalASRStatus {
  supported: boolean
  ready: boolean
  downloading: boolean
  modelName: string
  installDir: string
  modelPath?: string
  missing: string[]
  downloadSizeBytes: number
  progress?: LocalASRDownloadProgress
  error?: string
}

export interface LLMRefineConfig {
  enabled: boolean
  endpoint: string
  model: string
  apiKey: string
  /** When true, the refined dictation output is translated into the shared TranslationConfig.targetLanguage. */
  translateOutput: boolean
}

export interface TranslationConfig {
  enabled: boolean
  /** Shared target language used by both selected-text translation and refine output translation. */
  targetLanguage: string
}

export interface HotkeyConfig {
  pttKey: string
  toggleSettings: string
  translateKey: string
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
  llmRefine: LLMRefineConfig
  hotkey: HotkeyConfig
  translation: TranslationConfig
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

export interface RefineConnectionResult {
  ok: boolean
  message?: string
}

export interface RecordingStartPayload {
  sessionId: string
}

export interface AudioChunkPayload {
  sessionId: string
  chunkIndex: number
  isFinal: boolean
  mimeType: string
  buffer: ArrayBuffer
}

export const IPC_CHANNELS = {
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_TEST: 'config:test',
  CONFIG_REFINE_TEST: 'config:refine:test',
  LOCAL_ASR_STATUS: 'local-asr:status',
  LOCAL_ASR_DOWNLOAD: 'local-asr:download',
  LOCAL_ASR_DOWNLOAD_PROGRESS: 'local-asr:download-progress',
  APP_LANGUAGE_GET: 'app:language:get',
  APP_LANGUAGE_CHANGED: 'app:language:changed',

  SESSION_START: 'session:start',
  SESSION_STOP: 'session:stop',
  SESSION_STATUS: 'session:status',
  AUDIO_DATA: 'audio:data',
  ERROR: 'error',

  HOTKEY_REGISTER: 'hotkey:register',
  HOTKEY_UNREGISTER: 'hotkey:unregister',

  NOTIFICATION_SHOW: 'notification:show',

  OVERLAY_SHOW: 'overlay:show',
  OVERLAY_HIDE: 'overlay:hide',
  OVERLAY_UPDATE: 'overlay:update',
  OVERLAY_AUDIO_LEVEL: 'overlay:audio-level',

  HISTORY_GET: 'history:get',
  HISTORY_CLEAR: 'history:clear',
  HISTORY_DELETE: 'history:delete',

  CHECK_FOR_UPDATES: 'update:check',
  GET_UPDATE_STATUS: 'update:get-status',
  GET_APP_VERSION: 'app:version',
  OPEN_EXTERNAL: 'app:open-external',

  CANCEL_SESSION: 'session:cancel',

  LOG_GET_TAIL: 'log:get-tail',
  LOG_OPEN_FOLDER: 'log:open-folder',
  LOG_WRITE: 'log:write',

  TRANSLATION_TRIGGER: 'translation:trigger',
} as const

export type OverlayStatus = 'recording' | 'processing' | 'success' | 'error'
export type OverlayProcessingStage = 'transcribing' | 'refining' | 'translating'

export interface OverlayState {
  status: OverlayStatus
  message?: string
  processingStage?: OverlayProcessingStage
  processingTotalStages?: 1 | 2
}

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
