// 共享常量

// GLM ASR API 配置
export const GLM_ASR = {
  ENDPOINT: 'https://open.bigmodel.cn/api/paas/v4/audio/transcriptions',
  ENDPOINT_INTL: 'https://api.z.ai/api/paas/v4/audio/transcriptions',
  MODEL: 'glm-asr-2512',
  MAX_DURATION: 30, // 最大录音时长（秒）
  MAX_FILE_SIZE: 25 * 1024 * 1024, // 最大文件大小（25MB）
} as const

// Groq ASR API 配置
export const GROQ_ASR = {
  ENDPOINT: 'https://api.groq.com/openai/v1/audio/transcriptions',
  MODEL: 'whisper-large-v3-turbo',
} as const

// GLM Chat API 配置
export const GLM_CHAT = {
  ENDPOINT: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  ENDPOINT_INTL: 'https://api.z.ai/api/paas/v4/chat/completions',
  MODEL: 'glm-4.7-flashx',
} as const

// Groq Chat API 配置
export const GROQ_CHAT = {
  ENDPOINT: 'https://api.groq.com/openai/v1/chat/completions',
  MODEL: 'moonshotai/kimi-k2-instruct-0905',
} as const

// 默认快捷键配置
const isMac = typeof process !== 'undefined' && process.platform === 'darwin'
export const DEFAULT_HOTKEYS = {
  PTT: isMac ? 'Alt' : 'Control+Shift+Space',
  SETTINGS: isMac ? 'Command+Shift+,' : 'Control+Shift+,',
} as const

// 录音配置
export const AUDIO_CONFIG = {
  SAMPLE_RATE: 16000,
  CHANNELS: 1,
  ENCODING: 'signed-integer',
  BIT_DEPTH: 16,
} as const

export const HISTORY_RETENTION_DAYS = 90

// 日志保留与限制
export const LOG_RETENTION_DAYS = 14
export const LOG_FILE_MAX_SIZE_MB = 5
export const LOG_FILE_MAX_SIZE_BYTES = LOG_FILE_MAX_SIZE_MB * 1024 * 1024
export const LOG_TAIL_MAX_BYTES = 200 * 1024
export const LOG_MESSAGE_MAX_LENGTH = 10000
export const LOG_DATA_MAX_LENGTH = 5000
export const LOG_STACK_HEAD_LINES = 8
export const LOG_STACK_TAIL_LINES = 5
