import type { AppLanguage, LanguageSetting } from './i18n'

export interface VoiceSession {
  id: string
  startTime: Date
  status: 'recording' | 'processing' | 'completed' | 'error'
  audioData?: Buffer
  transcription?: string
  error?: string
  duration?: number
  asrMode?: ASRMode
}

export type ASRMode = 'classic' | 'streaming'

export interface ASRConfig {
  lowVolumeMode?: boolean
  microphoneDeviceId?: string
  microphoneDeviceLabel?: string
  streamingEnabled?: boolean
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
  storageDir: string
  modelPath?: string
  missing: string[]
  downloadSizeBytes: number
  progress?: LocalASRDownloadProgress
  error?: string
}

export type LLMProvider = 'openai' | 'deepseek' | 'openrouter' | 'custom-compatible'

export type OpenAIModel = typeof import('./constants').LLM_PROVIDERS.DEFAULT_OPENAI_MODEL

export type DeepSeekModel = (typeof import('./constants').LLM_PROVIDERS.DEEPSEEK_MODELS)[number]

export type OpenRouterModel =
  (typeof import('./constants').LLM_PROVIDERS.OPENROUTER_MODELS)[number]['id']

export type LLMReasoningLevel = 'off' | 'medium' | 'high'

export interface OpenAIConfig {
  apiKey: string
  model: OpenAIModel
}

export interface DeepSeekConfig {
  apiKey: string
  model: DeepSeekModel
}

export interface OpenRouterConfig {
  apiKey: string
  model: OpenRouterModel
}

export interface CustomCompatibleLLMConfig {
  endpoint: string
  model: string
  apiKey: string
}

export interface LLMRefineConfig {
  enabled: boolean
  provider: LLMProvider
  endpoint: string
  model: string
  apiKey: string
  /** When true, the refined dictation output is translated into the shared TranslationConfig.targetLanguage. */
  translateOutput: boolean
  openai: OpenAIConfig
  deepseek: DeepSeekConfig
  openrouter: OpenRouterConfig
  custom: CustomCompatibleLLMConfig
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

export interface ConfigSecretRequest {
  scope: 'llm-refine'
  provider: LLMProvider
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
  microphoneDeviceId?: string
  asrMode: ASRMode
  lowVolumeMode?: boolean
}

export interface AudioChunkPayload {
  sessionId: string
  chunkIndex: number
  isFinal: boolean
  mimeType: string
  buffer: ArrayBuffer
}

export interface StreamingAudioFramePayload {
  sessionId: string
  sequence: number
  sampleRate: number
  buffer: ArrayBuffer
}

export interface StreamingAudioEndPayload {
  sessionId: string
  sequence: number
}

export const IPC_CHANNELS = {
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_SECRET_GET: 'config:secret:get',
  CONFIG_REFINE_TEST: 'config:refine:test',
  LOCAL_ASR_STATUS: 'local-asr:status',
  LOCAL_ASR_DOWNLOAD: 'local-asr:download',
  LOCAL_ASR_DELETE: 'local-asr:delete',
  LOCAL_ASR_DOWNLOAD_PROGRESS: 'local-asr:download-progress',
  STREAMING_ASR_STATUS: 'streaming-asr:status',
  STREAMING_ASR_DOWNLOAD: 'streaming-asr:download',
  STREAMING_ASR_DELETE: 'streaming-asr:delete',
  STREAMING_ASR_DOWNLOAD_PROGRESS: 'streaming-asr:download-progress',
  ASR_MODEL_DIRECTORY_OPEN: 'asr-model-directory:open',
  APP_LANGUAGE_GET: 'app:language:get',
  APP_LANGUAGE_CHANGED: 'app:language:changed',

  SESSION_START: 'session:start',
  SESSION_STOP: 'session:stop',
  SESSION_STATUS: 'session:status',
  AUDIO_DATA: 'audio:data',
  STREAMING_AUDIO_FRAME: 'streaming-audio:frame',
  STREAMING_AUDIO_END: 'streaming-audio:end',
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
  transcript?: string
}

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
