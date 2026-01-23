// 共享常量

// GLM ASR API 配置
export const GLM_ASR = {
  ENDPOINT: 'https://open.bigmodel.cn/api/paas/v4/audio/transcriptions',
  ENDPOINT_INTL: 'https://api.z.ai/api/paas/v4/audio/transcriptions',
  MODEL: 'glm-asr-2512',
  MAX_DURATION: 30, // 最大录音时长（秒）
  MAX_FILE_SIZE: 25 * 1024 * 1024, // 最大文件大小（25MB）
} as const

// GLM LLM API 配置
export const GLM_LLM = {
  ENDPOINT: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  ENDPOINT_INTL: 'https://api.z.ai/api/paas/v4/chat/completions',
  MODEL: 'glm-4.7-flashx',
} as const

const isMacPlatform = typeof process !== 'undefined' && process.platform === 'darwin'

// 默认快捷键配置
export const DEFAULT_HOTKEYS = {
  PTT: isMacPlatform ? 'Alt' : 'Control+Shift+Space',
  SETTINGS: isMacPlatform ? 'Command+Shift+,' : 'Control+Shift+,',
} as const

// 录音配置
export const AUDIO_CONFIG = {
  SAMPLE_RATE: 16000,
  CHANNELS: 1,
  ENCODING: 'signed-integer',
  BIT_DEPTH: 16,
} as const
