import { IPC_CHANNELS, type RecordingStartPayload, type VoiceSession } from '../../shared/types'
import { showOverlay, hideOverlay, updateOverlay, showErrorAndHide } from '../window/overlay'
import { getBackgroundWindow } from '../window/background'
import { t } from '../i18n'
import { configManager } from '../config-manager'
import {
  abortChunkSession,
  failStreamingSession,
  hasReceivedFinalChunk,
  hasReceivedStreamingFinal,
} from './processor'
import {
  cancelStreamingASRSession,
  getStreamingASRStatus,
  startStreamingASRSession,
} from '../streaming-asr-manager'

// How long after SESSION_STOP the final audio chunk may take to arrive before
// the session is considered lost (renderer crashed or dropped the marker).
const FINAL_CHUNK_TIMEOUT_MS = 10_000

let currentSession: VoiceSession | null = null
let finalChunkWatchdog: ReturnType<typeof setTimeout> | null = null

function clearFinalChunkWatchdog(): void {
  if (finalChunkWatchdog) {
    clearTimeout(finalChunkWatchdog)
    finalChunkWatchdog = null
  }
}

function startFinalChunkWatchdog(sessionId: string): void {
  clearFinalChunkWatchdog()
  finalChunkWatchdog = setTimeout(() => {
    finalChunkWatchdog = null
    if (!currentSession || currentSession.id !== sessionId) return
    if (currentSession.status !== 'processing') return
    if (
      currentSession.asrMode === 'streaming'
        ? hasReceivedStreamingFinal(sessionId)
        : hasReceivedFinalChunk(sessionId)
    )
      return

    console.error(
      `[Audio:Session] Final audio chunk never arrived for ${sessionId}, aborting session`,
    )
    abortChunkSession(sessionId)
    if (currentSession.asrMode === 'streaming') {
      void cancelStreamingASRSession(sessionId)
    }
    currentSession = null
    showErrorAndHide(t('errors.stopFailed'))
  }, FINAL_CHUNK_TIMEOUT_MS)
}

// Called when the hidden recording renderer crashes or hangs: fail the active
// session so the HUD does not stay stuck and chunk state does not leak.
export function handleBackgroundRendererGone(): void {
  clearFinalChunkWatchdog()
  if (!currentSession) return

  console.error('[Audio:Session] Background renderer gone, aborting session', currentSession.id)
  const wasActive = currentSession.status === 'recording' || currentSession.status === 'processing'
  abortChunkSession(currentSession.id)
  if (currentSession.asrMode === 'streaming') {
    void cancelStreamingASRSession(currentSession.id)
  }
  currentSession = null
  if (wasActive) {
    showErrorAndHide(t('errors.internal'))
  }
}

type HandleStopRecordingOptions = {
  willRunRefine?: boolean
}

export function getCurrentSession(): VoiceSession | null {
  return currentSession
}

export function setSessionError(): void {
  if (currentSession) {
    currentSession.status = 'error'
  }
}

export function clearSession(): void {
  currentSession = null
}

export function updateSession(updates: Partial<VoiceSession>): void {
  if (currentSession) {
    Object.assign(currentSession, updates)
  }
}

export async function handleStartRecording(): Promise<void> {
  const startTimestamp = Date.now()
  console.log('[Audio:Session] handleStartRecording triggered')

  if (currentSession && currentSession.status === 'recording') {
    console.log('[Audio:Session] Already recording, ignoring')
    return
  }

  clearFinalChunkWatchdog()

  try {
    showOverlay({ status: 'recording' })

    currentSession = {
      id: `session-${Date.now()}`,
      startTime: new Date(),
      status: 'recording',
    }

    const bgWindow = getBackgroundWindow()
    if (!bgWindow) {
      console.error('[Audio:Session] backgroundWindow is not available')
      showErrorAndHide(t('errors.internal'))
      currentSession = null
      return
    }

    const asrConfig = configManager.getASRConfig()
    const asrMode = asrConfig.streamingEnabled ? 'streaming' : 'classic'
    if (asrMode === 'streaming' && !getStreamingASRStatus().ready) {
      showErrorAndHide(t('errors.streamingModelMissing'))
      currentSession = null
      return
    }

    currentSession.asrMode = asrMode
    const payload: RecordingStartPayload = {
      sessionId: currentSession.id,
      microphoneDeviceId: asrConfig.microphoneDeviceId || undefined,
      asrMode,
      lowVolumeMode: asrConfig.lowVolumeMode ?? true,
    }

    if (asrMode === 'streaming') {
      const sessionId = currentSession.id
      void startStreamingASRSession(sessionId, {
        onPartial: (text) => {
          const session = currentSession
          if (!session || session.id !== sessionId || session.status === 'error') return
          updateSession({ transcription: text })
          updateOverlay({
            status: session.status === 'recording' ? 'recording' : 'processing',
            processingStage: session.status === 'processing' ? 'transcribing' : undefined,
            processingTotalStages: optionsForOverlayTotalStages(),
            transcript: text,
          })
        },
        onError: (error) => {
          failStreamingSession(sessionId, error)
          void cancelStreamingASRSession(sessionId)
        },
      }).catch(() => {
        // The callback above owns the visible error state.
      })
    }
    bgWindow.webContents.send(IPC_CHANNELS.SESSION_START, payload)
    const duration = Date.now() - startTimestamp
    console.log(`[Audio:Session] Recording start completed in ${duration}ms`)
  } catch (error) {
    console.error('[Audio:Session] Failed to start recording:', error)
    showErrorAndHide(t('errors.startFailed'))
    currentSession = null
  }
}

export async function handleStopRecording(options: HandleStopRecordingOptions = {}): Promise<void> {
  if (!currentSession || currentSession.status !== 'recording') {
    console.log(
      '[Audio:Session] handleStopRecording: no active recording session, status:',
      currentSession?.status,
    )
    return
  }

  try {
    const recordingDuration = Date.now() - currentSession.startTime.getTime()
    console.log(`[Audio:Session] Recording duration: ${recordingDuration}ms`)

    currentSession.duration = recordingDuration
    currentSession.status = 'processing'

    updateOverlay({
      status: 'processing',
      processingStage: 'transcribing',
      processingTotalStages: options.willRunRefine ? 2 : 1,
      transcript: currentSession.transcription,
    })

    const bgWindow = getBackgroundWindow()
    if (bgWindow) {
      console.log('[Audio:Session] Sending SESSION_STOP to backgroundWindow')
      bgWindow.webContents.send(IPC_CHANNELS.SESSION_STOP)
      startFinalChunkWatchdog(currentSession.id)
    } else {
      console.error('[Audio:Session] Cannot send SESSION_STOP: backgroundWindow not available')
      abortChunkSession(currentSession.id)
      if (currentSession.asrMode === 'streaming') {
        void cancelStreamingASRSession(currentSession.id)
      }
      currentSession = null
      showErrorAndHide(t('errors.stopFailed'))
    }
  } catch (error) {
    console.error('[Audio:Session] Failed to stop recording:', error)
    showErrorAndHide(t('errors.stopFailed'))
  }
}

export async function handleCancelSession(): Promise<void> {
  console.log('[Audio:Session] handleCancelSession triggered')

  hideOverlay()
  clearFinalChunkWatchdog()

  if (currentSession) {
    console.log('[Audio:Session] Cancelling session:', currentSession.id)
    abortChunkSession(currentSession.id)
    if (currentSession.asrMode === 'streaming') {
      void cancelStreamingASRSession(currentSession.id)
    }
    currentSession = null
  }

  const bgWindow = getBackgroundWindow()
  if (bgWindow) {
    bgWindow.webContents.send(IPC_CHANNELS.SESSION_STOP)
  }
}

function optionsForOverlayTotalStages(): 1 | 2 {
  return configManager.isLLMRefineEnabled() ? 2 : 1
}
