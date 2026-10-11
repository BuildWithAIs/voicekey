import { ipcMain } from 'electron'
import { RECORDING } from '../../shared/constants'
import { recordingStopped, getCurrentSession } from '../audio/session-manager'
import { getBackgroundWindow } from '../window/background'
import { showNotification } from '../notification'
import { t } from '../i18n'
import {
  IPC_CHANNELS,
  type AudioChunkPayload,
  type StreamingAudioEndPayload,
  type StreamingAudioFramePayload,
  type VoiceSession,
} from '../../shared/types'

// Classic capture submits a single final file; sessions use opaque UUIDs.
const MAX_SESSION_ID_LENGTH = 128
const MAX_CHUNK_INDEX = 0
const MAX_MIME_TYPE_LENGTH = 128
const SESSION_ID_PATTERN = /^[A-Za-z0-9._-]+$/
const MAX_STREAMING_FRAME_BYTES = 1024 * 1024
const MAX_AUDIO_SEQUENCE = 10_000_000

// sessionId feeds temp file names and chunkIndex drives finalize loops, so
// reject malformed payloads before they reach the audio pipeline.
function isValidAudioChunkPayload(payload: unknown): payload is AudioChunkPayload {
  if (!payload || typeof payload !== 'object') return false
  const { sessionId, chunkIndex, isFinal, mimeType, buffer } = payload as Record<string, unknown>

  return (
    typeof sessionId === 'string' &&
    sessionId.length > 0 &&
    sessionId.length <= MAX_SESSION_ID_LENGTH &&
    SESSION_ID_PATTERN.test(sessionId) &&
    typeof chunkIndex === 'number' &&
    Number.isSafeInteger(chunkIndex) &&
    chunkIndex >= 0 &&
    chunkIndex <= MAX_CHUNK_INDEX &&
    isFinal === true &&
    typeof mimeType === 'string' &&
    mimeType.length <= MAX_MIME_TYPE_LENGTH &&
    buffer instanceof ArrayBuffer &&
    buffer.byteLength <= RECORDING.MAX_AUDIO_BYTES
  )
}

function hasValidSessionId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_SESSION_ID_LENGTH &&
    SESSION_ID_PATTERN.test(value)
  )
}

function isValidStreamingAudioFramePayload(
  payload: unknown,
): payload is StreamingAudioFramePayload {
  if (!payload || typeof payload !== 'object') return false
  const { sessionId, sequence, sampleRate, buffer } = payload as Record<string, unknown>
  return (
    hasValidSessionId(sessionId) &&
    typeof sequence === 'number' &&
    Number.isSafeInteger(sequence) &&
    sequence >= 0 &&
    sequence <= MAX_AUDIO_SEQUENCE &&
    typeof sampleRate === 'number' &&
    Number.isFinite(sampleRate) &&
    sampleRate >= 8_000 &&
    sampleRate <= 192_000 &&
    buffer instanceof ArrayBuffer &&
    buffer.byteLength > 0 &&
    buffer.byteLength <= MAX_STREAMING_FRAME_BYTES &&
    buffer.byteLength % Float32Array.BYTES_PER_ELEMENT === 0
  )
}

function isValidStreamingAudioEndPayload(payload: unknown): payload is StreamingAudioEndPayload {
  if (!payload || typeof payload !== 'object') return false
  const { sessionId, sequence } = payload as Record<string, unknown>
  return (
    hasValidSessionId(sessionId) &&
    typeof sequence === 'number' &&
    Number.isSafeInteger(sequence) &&
    sequence >= 0 &&
    sequence <= MAX_AUDIO_SEQUENCE
  )
}

export type SessionHandlersDeps = {
  handleStartRecording: () => Promise<void>
  handleStopRecording: () => Promise<void>
  handleAudioChunk: (payload: AudioChunkPayload) => Promise<void>
  handleStreamingAudioFrame: (payload: StreamingAudioFramePayload) => void
  handleStreamingAudioEnd: (payload: StreamingAudioEndPayload) => Promise<void>
  handleCancelSession: () => Promise<void>
  getCurrentSession: () => VoiceSession | null
}

let deps: SessionHandlersDeps

export function initSessionHandlers(dependencies: SessionHandlersDeps): void {
  deps = dependencies
}

export function registerSessionHandlers(): void {
  ipcMain.on(IPC_CHANNELS.RECORDING_STOPPED, (event, sessionId: unknown) => {
    if (event.sender === getBackgroundWindow()?.webContents && hasValidSessionId(sessionId))
      recordingStopped(sessionId)
  })
  ipcMain.on(IPC_CHANNELS.MICROPHONE_FALLBACK, (event, sessionId: unknown, label: unknown) => {
    if (
      event.sender !== getBackgroundWindow()?.webContents ||
      sessionId !== getCurrentSession()?.id
    )
      return
    showNotification(
      t('settings.microphone.label'),
      t('settings.microphone.fallbackNotice', {
        device: typeof label === 'string' ? label.slice(0, 200) : '',
      }),
    )
  })
  ipcMain.handle(IPC_CHANNELS.SESSION_START, async () => {
    await deps.handleStartRecording()
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_STOP, async () => {
    await deps.handleStopRecording()
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_STATUS, () => {
    return deps.getCurrentSession()?.status || 'idle'
  })

  ipcMain.on(IPC_CHANNELS.AUDIO_DATA, (event, payload: unknown) => {
    if (event.sender !== getBackgroundWindow()?.webContents) return
    if (!isValidAudioChunkPayload(payload)) {
      console.error('[IPC:Session] Dropping malformed AUDIO_DATA payload')
      return
    }
    if (deps.getCurrentSession()?.asrMode === 'streaming') {
      console.error('[IPC:Session] Dropping classic audio chunk during streaming ASR session')
      return
    }
    void deps.handleAudioChunk(payload).catch((error) => {
      console.error('[IPC:Session] Audio chunk processing failed:', error)
    })
  })

  ipcMain.on(IPC_CHANNELS.STREAMING_AUDIO_FRAME, (event, payload: unknown) => {
    if (event.sender !== getBackgroundWindow()?.webContents) return
    if (!isValidStreamingAudioFramePayload(payload)) {
      console.error('[IPC:Session] Dropping malformed streaming audio frame')
      return
    }
    if (deps.getCurrentSession()?.asrMode !== 'streaming') return
    deps.handleStreamingAudioFrame(payload)
  })

  ipcMain.on(IPC_CHANNELS.STREAMING_AUDIO_END, (event, payload: unknown) => {
    if (event.sender !== getBackgroundWindow()?.webContents) return
    if (!isValidStreamingAudioEndPayload(payload)) {
      console.error('[IPC:Session] Dropping malformed streaming audio end marker')
      return
    }
    if (deps.getCurrentSession()?.asrMode !== 'streaming') return
    void deps.handleStreamingAudioEnd(payload).catch((error) => {
      console.error('[IPC:Session] Streaming ASR finalization failed:', error)
    })
  })

  ipcMain.handle(IPC_CHANNELS.CANCEL_SESSION, () => deps.handleCancelSession())
}
