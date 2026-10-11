import { isManagingASRModels } from '../asr-runtime-policy'
import { randomUUID } from 'node:crypto'
import { IPC_CHANNELS, type RecordingStartPayload, type VoiceSession } from '../../shared/types'
import { RECORDING } from '../../shared/constants'
import { showOverlay, hideOverlay, updateOverlay, showErrorAndHide } from '../window/overlay'
import { getBackgroundWindow } from '../window/background'
import { createSettingsWindow } from '../window/settings'
import { t } from '../i18n'
import { configManager } from '../config-manager'
import { abortChunkSession, hasReceivedFinalChunk, hasReceivedStreamingFinal } from './processor'
import { cancelLocalASR, getLocalASRStatus, releaseLocalASR } from '../local-asr-manager'
import {
  cancelStreamingASRSession,
  getStreamingASRStatus,
  releaseStreamingASR,
  startStreamingASRSession,
} from '../streaming-asr-manager'

let currentSession: VoiceSession | null = null
let cleanup: Promise<void> | null = null
let finalChunkWatchdog: ReturnType<typeof setTimeout> | null = null
let processingWatchdog: ReturnType<typeof setTimeout> | null = null
let recordingWatchdog: ReturnType<typeof setTimeout> | null = null
const captureStops = new Map<string, () => void>()
const stoppedCaptures = new Set<string>()

function clearTimers(): void {
  if (finalChunkWatchdog) clearTimeout(finalChunkWatchdog)
  if (processingWatchdog) clearTimeout(processingWatchdog)
  if (recordingWatchdog) clearTimeout(recordingWatchdog)
  finalChunkWatchdog = processingWatchdog = recordingWatchdog = null
}

export function recordingStopped(sessionId: string): void {
  if (currentSession?.id !== sessionId && !captureStops.has(sessionId)) return
  stoppedCaptures.add(sessionId)
  captureStops.get(sessionId)?.()
}

function stopCapture(sessionId: string): Promise<void> {
  if (stoppedCaptures.has(sessionId)) return Promise.resolve()
  const window = getBackgroundWindow()
  if (!window || window.isDestroyed()) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      // A dead recorder must be replaced before accepting another capture.
      if (!window.isDestroyed()) window.webContents.reload()
      done()
    }, 2000)
    const done = () => {
      clearTimeout(timer)
      captureStops.delete(sessionId)
      resolve()
    }
    captureStops.set(sessionId, done)
    window.webContents.send(IPC_CHANNELS.SESSION_STOP, { sessionId, cancel: true })
  })
}

export function getCurrentSession(): VoiceSession | null {
  return currentSession
}
export function isSessionBusy(): boolean {
  return Boolean(currentSession || cleanup)
}

export function setSessionError(): void {
  if (currentSession) void endSession(currentSession.id, true)
}

// Keep the session locked until model teardown and capture acknowledgement finish.
// Results arriving after cancellation see the error state and are discarded.
async function endSession(sessionId: string, abort: boolean): Promise<void> {
  if (currentSession?.id !== sessionId) return
  if (cleanup) return cleanup
  clearTimers()
  const session = currentSession
  if (abort) session.status = 'error'
  cleanup = (async () => {
    if (abort) {
      abortChunkSession(sessionId)
      await Promise.all([
        stopCapture(sessionId),
        session.asrMode === 'streaming' ? cancelStreamingASRSession(sessionId) : cancelLocalASR(),
      ])
    }
    // A mode change during recording takes effect here, before another model loads.
    if (configManager.getASRConfig().streamingEnabled) await releaseLocalASR()
    else await releaseStreamingASR()
  })()
    .catch((error: unknown) => {
      console.error(
        '[Audio:Session] Cleanup failed:',
        error instanceof Error ? error.message : 'unknown',
      )
    })
    .finally(() => {
      stoppedCaptures.delete(sessionId)
      if (currentSession === session) currentSession = null
      cleanup = null
    })
  return cleanup
}

export async function clearSession(sessionId = currentSession?.id): Promise<void> {
  if (sessionId) await endSession(sessionId, false)
}

export function failRecordingSession(sessionId: string, message: string): void {
  if (currentSession?.id !== sessionId || currentSession.status === 'error') return
  void endSession(sessionId, true)
  showErrorAndHide(message)
}

export function handleBackgroundRendererGone(): void {
  if (!currentSession) return
  recordingStopped(currentSession.id)
  failRecordingSession(currentSession.id, t('errors.internal'))
}

export function updateSession(updates: Partial<VoiceSession>): void {
  if (currentSession) Object.assign(currentSession, updates)
}

export async function handleStartRecording(): Promise<void> {
  if (isSessionBusy()) {
    if (currentSession?.status === 'processing')
      updateOverlay({
        status: 'processing',
        message: t('errors.asrBusy'),
        transcript: currentSession.transcription,
      })
    return
  }
  if (isManagingASRModels()) {
    showErrorAndHide(t('errors.modelManagementBusy'))
    return
  }
  const asrConfig = configManager.getASRConfig()
  const asrMode = asrConfig.streamingEnabled ? 'streaming' : 'classic'
  const model = asrMode === 'streaming' ? getStreamingASRStatus() : getLocalASRStatus()
  if (!model.ready || model.downloading) {
    showErrorAndHide(
      t(asrMode === 'streaming' ? 'errors.streamingModelMissing' : 'errors.localModelMissing'),
    )
    createSettingsWindow()
    return
  }
  const bgWindow = getBackgroundWindow()
  if (!bgWindow) {
    showErrorAndHide(t('errors.internal'))
    return
  }
  const sessionId = `session-${randomUUID()}`
  currentSession = {
    id: sessionId,
    startTime: new Date(),
    status: 'recording',
    asrMode,
    lowVolumeMode: asrConfig.lowVolumeMode ?? false,
  }
  showOverlay({
    status: 'recording',
    message:
      asrMode === 'streaming' && model.runtimeState !== 'ready' ? t('hud.loadingModel') : undefined,
  })
  try {
    // Main owns the hard duration limit, even if renderer timers are throttled.
    recordingWatchdog = setTimeout(() => {
      void handleStopRecording()
    }, RECORDING.SESSION_MAX_DURATION_SECONDS * 1000)
    if (asrMode === 'streaming') {
      void startStreamingASRSession(sessionId, {
        onPartial: (text) => {
          const session = currentSession
          if (!session || session.id !== sessionId || session.status === 'error') return
          updateSession({ transcription: text })
          updateOverlay({
            status: session.status === 'recording' ? 'recording' : 'processing',
            processingStage: session.status === 'processing' ? 'transcribing' : undefined,
            processingTotalStages: configManager.isDictationProcessingEnabled() ? 2 : 1,
            transcript: text,
          })
        },
        onError: (error) => failRecordingSession(sessionId, error.message),
      }).catch((error: unknown) =>
        failRecordingSession(
          sessionId,
          error instanceof Error ? error.message : t('errors.startFailed'),
        ),
      )
    }
    const payload: RecordingStartPayload = {
      sessionId,
      microphoneDeviceId: asrConfig.microphoneDeviceId || undefined,
      asrMode,
      lowVolumeMode: currentSession.lowVolumeMode,
    }
    bgWindow.webContents.send(IPC_CHANNELS.SESSION_START, payload)
  } catch {
    failRecordingSession(sessionId, t('errors.startFailed'))
  }
}

export async function handleStopRecording(
  options: { willProcessDictation?: boolean } = {},
): Promise<void> {
  const session = currentSession
  if (!session || session.status !== 'recording') return
  clearTimers()
  session.duration = Date.now() - session.startTime.getTime()
  session.status = 'processing'
  updateOverlay({
    status: 'processing',
    processingStage: 'transcribing',
    processingTotalStages:
      (options.willProcessDictation ?? configManager.isDictationProcessingEnabled()) ? 2 : 1,
    transcript: session.transcription,
  })
  const window = getBackgroundWindow()
  if (!window) {
    failRecordingSession(session.id, t('errors.stopFailed'))
    return
  }
  window.webContents.send(IPC_CHANNELS.SESSION_STOP, { sessionId: session.id })
  finalChunkWatchdog = setTimeout(() => {
    const received =
      session.asrMode === 'streaming'
        ? hasReceivedStreamingFinal(session.id)
        : hasReceivedFinalChunk(session.id)
    if (!received) failRecordingSession(session.id, t('errors.stopFailed'))
  }, 10_000)
  processingWatchdog = setTimeout(
    () => failRecordingSession(session.id, t('errors.asrTimeout')),
    RECORDING.PROCESSING_TIMEOUT_MS,
  )
}

export async function handleCancelSession(): Promise<void> {
  hideOverlay()
  if (currentSession) await endSession(currentSession.id, true)
}
