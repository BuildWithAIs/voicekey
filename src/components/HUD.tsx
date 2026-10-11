import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AlertCircle, Check, LoaderCircle, Mic, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { OverlayProcessingStage, OverlayState } from '../../electron/shared/types'
import { cn } from '../lib/utils'
import { Waveform } from './Waveform'

const PROCESSING_LABELS: Record<OverlayProcessingStage, string> = {
  transcribing: 'hud.transcribing',
  refining: 'hud.refining',
  translating: 'hud.translating',
}

export function HUD() {
  const { t } = useTranslation()
  const [overlayState, setOverlayState] = useState<OverlayState>({ status: 'recording' })
  const [audioLevel, setAudioLevel] = useState(0)
  const transcriptRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    document.documentElement.classList.add('overlay-html')
    return () => document.documentElement.classList.remove('overlay-html')
  }, [])

  useEffect(() => {
    const removeOverlayListener = window.electronAPI.onOverlayUpdate(setOverlayState)
    const removeAudioListener = window.electronAPI.onAudioLevel(setAudioLevel)
    return () => {
      removeOverlayListener?.()
      removeAudioListener?.()
    }
  }, [])

  const { status, message, processingStage, transcript = '' } = overlayState
  const isRecording = status === 'recording'
  const isProcessing = status === 'processing'
  const isError = status === 'error'
  const hasTranscript = !isError && transcript.length > 0
  const characters = Array.from(transcript)
  // The model can revise its trailing text; this is a visual hint, not confidence data.
  const tailStart = characters.length - (isRecording ? Math.min(6, characters.length) : 0)
  const label = isRecording
    ? t('hud.listening')
    : isProcessing
      ? message || t(processingStage ? PROCESSING_LABELS[processingStage] : 'hud.thinking')
      : isError
        ? t('hud.error')
        : t('hud.injected')

  useLayoutEffect(() => {
    const element = transcriptRef.current
    if (!element) return
    if (isRecording || processingStage === 'transcribing') {
      // Follow the newest words instead of clamping away the live end of a long utterance.
      element.scrollTop = element.scrollHeight
    } else if (status === 'success') {
      element.scrollTop = 0
    }
  }, [transcript, isRecording, processingStage, status])

  return (
    <div className="pointer-events-none fixed inset-0 flex items-end justify-center pb-6">
      <div
        className={cn('hud-card pointer-events-auto', isError && 'hud-card-error')}
        data-status={status}
        onMouseEnter={() => window.electronAPI.setIgnoreMouseEvents(false)}
        onMouseLeave={() => window.electronAPI.setIgnoreMouseEvents(true, { forward: true })}
      >
        <div className="flex min-h-7 items-center gap-2.5">
          <span className="hud-status-icon" aria-hidden="true">
            {isRecording && <Mic className="h-[18px] w-[18px]" strokeWidth={1.8} />}
            {isProcessing && (
              <LoaderCircle className="h-[18px] w-[18px] animate-spin motion-reduce:animate-none" />
            )}
            {status === 'success' && (
              <span className="hud-success-icon">
                <Check className="h-3 w-3" strokeWidth={2.5} />
              </span>
            )}
            {isError && <AlertCircle className="h-[18px] w-[18px]" />}
          </span>
          <span className="hud-label min-w-0" role="status" aria-live="polite">
            {label}
          </span>
          {isRecording && (
            <div className="ml-1 min-w-0 flex-1 overflow-hidden" aria-hidden="true">
              <Waveform
                audioLevel={audioLevel}
                barCount={hasTranscript ? 16 : 26}
                className="h-5 gap-[3px]"
                barClassName="hud-wave-bar w-[2px]"
              />
            </div>
          )}
          {status !== 'success' && (
            <button
              type="button"
              onClick={() => window.electronAPI.cancelSession()}
              className="hud-cancel ml-auto"
              title={t('hud.cancel')}
              aria-label={t('hud.cancel')}
            >
              <X className="h-4 w-4" strokeWidth={1.6} />
            </button>
          )}
        </div>

        {hasTranscript && (
          <div className={cn('hud-transcript-wrap', isRecording && 'hud-transcript-live')}>
            <p ref={transcriptRef} className="hud-transcript">
              <span>{characters.slice(0, tailStart).join('')}</span>
              {isRecording && (
                <>
                  <span className="hud-transcript-tail">
                    {characters.slice(tailStart).join('')}
                  </span>
                  <span className="hud-caret" aria-hidden="true" />
                </>
              )}
            </p>
          </div>
        )}

        {isRecording && message ? (
          <p className="mt-2 text-xs text-muted-foreground" role="status">
            {message}
          </p>
        ) : null}

        {isError && (
          <p className="hud-error-message" role="alert">
            {message || t('hud.errorFallback')}
          </p>
        )}
      </div>
    </div>
  )
}
