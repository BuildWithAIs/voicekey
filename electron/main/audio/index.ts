/**
 * 音频处理模块统一导出
 *
 * @module electron/main/audio
 */

// Converter: FFmpeg 音频转换
export { initializeFfmpeg, convertToMP3, isFfmpegInitialized } from './converter'

// Session Manager: 会话状态管理
export {
  getCurrentSession,
  setSessionError,
  clearSession,
  updateSession,
  handleStartRecording,
  handleStopRecording,
  handleCancelSession,
} from './session-manager'

// Processor: 音频数据处理流水线
export { initProcessor, handleAudioData } from './processor'
