import { ipcMain } from 'electron'
import { IPC_CHANNELS, type AudioChunkPayload, type VoiceSession } from '../../shared/types'

// Session ids are `session-<timestamp>`; chunks rotate every ~29s within a
// 3-minute session, so these bounds are generous.
const MAX_SESSION_ID_LENGTH = 128
const MAX_CHUNK_INDEX = 10_000
const MAX_MIME_TYPE_LENGTH = 128
const SESSION_ID_PATTERN = /^[A-Za-z0-9._-]+$/

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

export type SessionHandlersDeps = {
  handleStartRecording: () => Promise<void>
  handleStopRecording: () => Promise<void>
  handleAudioChunk: (payload: AudioChunkPayload) => Promise<void>
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
    void deps.handleAudioChunk(payload).catch((error) => {
      console.error('[IPC:Session] Audio chunk processing failed:', error)
    })
  })

  ipcMain.handle(IPC_CHANNELS.CANCEL_SESSION, () => deps.handleCancelSession())
}
