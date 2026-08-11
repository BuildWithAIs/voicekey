import { app } from 'electron'
import fs from 'fs'
import path from 'node:path'
import { LOW_VOLUME_GAIN_DB } from '../../shared/constants'
import { IPC_CHANNELS, type ASRConfig, type AudioChunkPayload } from '../../shared/types'
import { t } from '../i18n'
import { historyManager } from '../history-manager'
import type { ASRProvider } from '../asr-provider'
import type { TextRefiner } from '../refine'
import { textInjector } from '../text-injector'
import { getBackgroundWindow } from '../window/background'
import { hideOverlay, updateOverlay } from '../window/overlay'
import { convertToWAV } from './converter'
import { clearSession, getCurrentSession, updateSession } from './session-manager'

type ProcessorDeps = {
  getAsrProvider: () => ASRProvider | null
  getASRConfig: () => ASRConfig
  initializeASRProvider: () => void
  getRefineService?: () => TextRefiner | null
}

type ChunkSessionState = {
  sessionId: string
  resultsByIndex: Map<number, string>
  pendingCount: number
  finalChunkSeen: boolean
  finalChunkIndex: number | null
  tempFiles: Set<string>
  failed: boolean
  finalized: boolean
}

let deps: ProcessorDeps
const chunkSessions = new Map<string, ChunkSessionState>()

export function initProcessor(dependencies: ProcessorDeps): void {
  deps = dependencies
  console.log('[Audio:Processor] Initialized')
}

export async function handleAudioChunk(payload: AudioChunkPayload): Promise<void> {
  const sessionState = getOrCreateChunkSession(payload.sessionId)

  if (sessionState.failed || sessionState.finalized) {
    console.log(
      `[Audio:Processor] Ignoring chunk ${payload.chunkIndex} for completed/failed session ${payload.sessionId}`,
    )
    return
  }

  sessionState.pendingCount += 1
  if (payload.isFinal) {
    sessionState.finalChunkSeen = true
    sessionState.finalChunkIndex = payload.chunkIndex
  }

  try {
    await processChunk(payload, sessionState)
  } catch (error) {
    failSession(payload.sessionId, sessionState, error)
  } finally {
    sessionState.pendingCount = Math.max(0, sessionState.pendingCount - 1)

    if (!sessionState.failed) {
      try {
        await finalizeSessionIfReady(sessionState)
      } catch (error) {
        failSession(payload.sessionId, sessionState, error)
      }
    }

    releaseChunkSessionIfPossible(sessionState)
  }
}

function getOrCreateChunkSession(sessionId: string): ChunkSessionState {
  const existing = chunkSessions.get(sessionId)
  if (existing) return existing

  const sessionState: ChunkSessionState = {
    sessionId,
    resultsByIndex: new Map(),
    pendingCount: 0,
    finalChunkSeen: false,
    finalChunkIndex: null,
    tempFiles: new Set(),
    failed: false,
    finalized: false,
  }
  chunkSessions.set(sessionId, sessionState)
  return sessionState
}

async function processChunk(
  payload: AudioChunkPayload,
  sessionState: ChunkSessionState,
): Promise<void> {
  if (!isSessionUsable(payload.sessionId)) {
    console.log(
      `[Audio:Processor] Session ${payload.sessionId} is inactive, skipping chunk ${payload.chunkIndex}`,
    )
    return
  }

  // Empty chunks are placeholder markers from the renderer (e.g. recorder
  // produced no data before a final stop); record an empty transcript so the
  // session can still finalize instead of waiting forever.
  if (payload.buffer.byteLength === 0) {
    console.warn(
      `[Audio:Processor] Chunk ${payload.chunkIndex} for ${payload.sessionId} is empty, recording empty transcript`,
    )
    sessionState.resultsByIndex.set(payload.chunkIndex, '')
    return
  }

  const timestamp = Date.now()
  const inputExtension = resolveAudioExtension(payload.mimeType)
  const tempInputPath = path.join(
    app.getPath('temp'),
    `voice-key-${payload.sessionId}-${payload.chunkIndex}-${timestamp}.${inputExtension}`,
  )
  const asrConfig = deps.getASRConfig()
  const tempOutputPath = path.join(
    app.getPath('temp'),
    `voice-key-${payload.sessionId}-${payload.chunkIndex}-${timestamp}.wav`,
  )
  sessionState.tempFiles.add(tempInputPath)
  sessionState.tempFiles.add(tempOutputPath)

  const inputBuffer = Buffer.from(payload.buffer)
  console.log(
    `[Audio:Processor] Received chunk ${payload.chunkIndex} for ${payload.sessionId}: ${inputBuffer.length} bytes`,
  )

  try {
    fs.writeFileSync(tempInputPath, inputBuffer)

    const lowVolumeModeEnabled = asrConfig.lowVolumeMode ?? true
    const conversionOptions = {
      gainDb: lowVolumeModeEnabled ? LOW_VOLUME_GAIN_DB : undefined,
    }
    await convertToWAV(tempInputPath, tempOutputPath, conversionOptions)

    if (sessionState.failed || !isSessionUsable(payload.sessionId)) {
      return
    }

    const asrProvider = getInitializedAsrProvider()
    const requestId = `${payload.sessionId}-chunk-${payload.chunkIndex}`

    const transcription = await asrProvider.transcribe(tempOutputPath, { requestId })

    if (sessionState.failed || !isSessionUsable(payload.sessionId)) {
      return
    }

    sessionState.resultsByIndex.set(payload.chunkIndex, transcription.text)
    console.log(
      `[Audio:Processor] Chunk ${payload.chunkIndex} transcription received (length: ${transcription.text.length})`,
    )
  } finally {
    cleanupTempFiles(sessionState, tempInputPath, tempOutputPath)
  }
}

function getInitializedAsrProvider(): ASRProvider {
  let asrProvider = deps.getAsrProvider()
  if (asrProvider) return asrProvider

  console.log('[Audio:Processor] Initializing ASR provider...')
  deps.initializeASRProvider()
  asrProvider = deps.getAsrProvider()
  if (!asrProvider) {
    throw new Error('ASR Provider initialization failed')
  }

  return asrProvider
}

async function finalizeSessionIfReady(sessionState: ChunkSessionState): Promise<void> {
  if (sessionState.finalized || sessionState.failed) return
  if (!sessionState.finalChunkSeen || sessionState.finalChunkIndex === null) return
  if (sessionState.pendingCount > 0) return

  for (let index = 0; index <= sessionState.finalChunkIndex; index += 1) {
    if (!sessionState.resultsByIndex.has(index)) {
      return
    }
  }

  const currentSession = getCurrentSession()
  if (
    !currentSession ||
    currentSession.id !== sessionState.sessionId ||
    currentSession.status === 'error'
  ) {
    console.log(
      `[Audio:Processor] Session ${sessionState.sessionId} is no longer active during finalize, skipping`,
    )
    return
  }

  sessionState.finalized = true

  const orderedTexts: string[] = []
  for (let index = 0; index <= sessionState.finalChunkIndex; index += 1) {
    orderedTexts.push(sessionState.resultsByIndex.get(index) ?? '')
  }

  const rawText = mergeTranscriptSegments(orderedTexts)

  if (rawText.trim().length === 0) {
    console.warn('[Audio:Processor] Final transcript is empty, skipping refine/history/injection')
    updateSession({ transcription: '', status: 'completed' })
    hideOverlay()
    clearSession()
    return
  }

  let finalText = rawText

  const refineService = deps.getRefineService?.() ?? null
  if (refineService?.isEnabled()) {
    if (refineService.hasValidConfig()) {
      if (!isSessionUsable(sessionState.sessionId)) return

      try {
        updateOverlay({
          status: 'processing',
          processingStage: 'refining',
          processingTotalStages: 2,
        })
        console.log('[Audio:Processor] Refining aggregated transcription...')
        const refined = await refineService.refineText(rawText)
        if (refined.trim().length > 0) {
          finalText = refined
        } else {
          console.warn(
            '[Audio:Processor] Text refinement returned empty text, using raw transcription',
          )
        }
      } catch (error) {
        console.error('[Audio:Processor] Text refinement failed, using raw transcription:', error)
      }
    } else {
      console.warn('[Audio:Processor] Text refinement enabled but config is incomplete, skipped')
    }
  }

  if (!isSessionUsable(sessionState.sessionId)) {
    return
  }

  const lineBreakCount = countLineBreaks(finalText)
  console.log('[Audio:Processor] Final text formatting:', {
    length: finalText.length,
    hasLineBreaks: lineBreakCount > 0,
    lineBreakCount,
  })

  updateSession({
    transcription: finalText,
    status: 'completed',
  })

  historyManager.add({
    text: finalText,
    duration: getCurrentSession()?.duration,
  })

  if (!isSessionUsable(sessionState.sessionId)) {
    return
  }

  console.log('[Audio:Processor] Injecting final text...')
  await textInjector.injectText(finalText)

  updateOverlay({ status: 'success' })
  setTimeout(() => hideOverlay(), 800)
  clearSession()
}

export function hasReceivedFinalChunk(sessionId: string): boolean {
  return chunkSessions.get(sessionId)?.finalChunkSeen ?? false
}

// Marks a session's chunk state as failed so in-flight chunk work is discarded,
// cleans up temp files, and releases the state once nothing is pending.
export function abortChunkSession(sessionId: string): void {
  const sessionState = chunkSessions.get(sessionId)
  if (!sessionState) return

  sessionState.failed = true
  cleanupAllSessionTempFiles(sessionState)
  if (sessionState.pendingCount === 0) {
    chunkSessions.delete(sessionId)
  }
}

function failSession(sessionId: string, sessionState: ChunkSessionState, error: unknown): void {
  if (sessionState.failed) return
  sessionState.failed = true

  const message = error instanceof Error ? error.message : t('errors.generic')
  console.error(`[Audio:Processor] Session ${sessionId} failed:`, error)

  cleanupAllSessionTempFiles(sessionState)

  const currentSession = getCurrentSession()
  if (!currentSession || currentSession.id !== sessionId) {
    return
  }

  const wasRecording = currentSession.status === 'recording'
  updateSession({ status: 'error', error: message })

  if (wasRecording) {
    const bgWindow = getBackgroundWindow()
    if (bgWindow) {
      bgWindow.webContents.send(IPC_CHANNELS.SESSION_STOP)
    }
  }

  updateOverlay({
    status: 'error',
    message,
  })
  setTimeout(() => hideOverlay(), 2000)
}

function releaseChunkSessionIfPossible(sessionState: ChunkSessionState): void {
  if (sessionState.pendingCount > 0) return

  const currentSession = getCurrentSession()
  const isCurrentSession = currentSession?.id === sessionState.sessionId
  const shouldRelease = sessionState.finalized || sessionState.failed || !isCurrentSession

  if (!shouldRelease) return

  cleanupAllSessionTempFiles(sessionState)
  chunkSessions.delete(sessionState.sessionId)
}

function cleanupAllSessionTempFiles(sessionState: ChunkSessionState): void {
  if (sessionState.tempFiles.size === 0) return
  cleanupTempFiles(sessionState, ...sessionState.tempFiles)
}

function cleanupTempFiles(sessionState: ChunkSessionState, ...paths: string[]): void {
  for (const filePath of paths) {
    try {
      sessionState.tempFiles.delete(filePath)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        console.log(`[Audio:Processor] Cleaned up: ${path.basename(filePath)}`)
      }
    } catch (error) {
      console.error(`[Audio:Processor] Cleanup failed for ${filePath}:`, error)
    }
  }
}

function mergeTranscriptSegments(segments: string[]): string {
  let merged = ''

  for (const segment of segments) {
    const normalizedSegment = segment.trim()
    if (!normalizedSegment) continue

    if (!merged) {
      merged = normalizedSegment
      continue
    }

    const left = merged.replace(/\s+$/u, '')
    const right = normalizedSegment.replace(/^\s+/u, '')
    const leftLastChar = left.length > 0 ? left[left.length - 1] : undefined
    const needsSpace = isAsciiWordBoundary(leftLastChar, right[0])
    merged = needsSpace ? `${left} ${right}` : `${left}${right}`
  }

  return merged
}

function countLineBreaks(text: string): number {
  return text.match(/\r\n|\r|\n/gu)?.length ?? 0
}

function isAsciiWordBoundary(left?: string, right?: string): boolean {
  return isAsciiWordChar(left) && isAsciiWordChar(right)
}

function isAsciiWordChar(value?: string): boolean {
  return typeof value === 'string' && /^[A-Za-z0-9_]$/.test(value)
}

function resolveAudioExtension(mimeType: string): string {
  const normalized = mimeType.toLowerCase()
  if (normalized.includes('wav')) return 'wav'
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3'
  if (normalized.includes('ogg')) return 'ogg'
  if (normalized.includes('webm')) return 'webm'
  return 'webm'
}

function isSessionUsable(sessionId: string): boolean {
  const currentSession = getCurrentSession()
  return Boolean(
    currentSession && currentSession.id === sessionId && currentSession.status !== 'error',
  )
}

export const __testUtils = {
  mergeTranscriptSegments,
  resolveAudioExtension,
  resetChunkSessions: () => {
    chunkSessions.clear()
  },
  getChunkSession: (sessionId: string) => chunkSessions.get(sessionId),
}
