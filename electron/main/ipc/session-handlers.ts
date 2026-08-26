import { ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  type AudioChunkPayload,
  type StreamingAudioEndPayload,
  type StreamingAudioFramePayload,
  type VoiceSession,
} from '../../shared/types'

// Session ids are `session-<timestamp>`; chunks rotate every 30s within a
// 5-minute session, so these bounds are generous.
const MAX_SESSION_ID_LENGTH = 128
const MAX_CHUNK_INDEX = 10_000
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
    typeof isFinal === 'boolean' &&
    typeof mimeType === 'string' &&
    mimeType.length <= MAX_MIME_TYPE_LENGTH &&
    (buffer instanceof ArrayBuffer || ArrayBuffer.isView(buffer))
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
  ipcMain.handle(IPC_CHANNELS.SESSION_START, async () => {
    await deps.handleStartRecording()
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_STOP, async () => {
    await deps.handleStopRecording()
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_STATUS, () => {
    return deps.getCurrentSession()?.status || 'idle'
  })

  ipcMain.on(IPC_CHANNELS.AUDIO_DATA, (_event, payload: unknown) => {
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

  ipcMain.on(IPC_CHANNELS.STREAMING_AUDIO_FRAME, (_event, payload: unknown) => {
    if (!isValidStreamingAudioFramePayload(payload)) {
      console.error('[IPC:Session] Dropping malformed streaming audio frame')
      return
    }
    if (deps.getCurrentSession()?.asrMode !== 'streaming') return
    deps.handleStreamingAudioFrame(payload)
  })

  ipcMain.on(IPC_CHANNELS.STREAMING_AUDIO_END, (_event, payload: unknown) => {
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
