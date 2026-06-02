import { useEffect, useMemo, useRef, useState } from 'react'
import { AudioLines, Check, Globe, Mic, Sparkles, X, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { OverlayProcessingStage, OverlayState } from '../../electron/shared/types'
import { cn } from '../lib/utils'
import { Waveform } from './Waveform'

const PROCESSING_STEPS: OverlayProcessingStage[] = ['transcribing', 'refining']

const STAGE_META: Record<
  OverlayProcessingStage,
  {
    icon: typeof AudioLines
    iconColor: string
    circleText: string
    titleColor: string
    badgeBorder: string
    badgeBg: string
    badgeText: string
    spinnerTop: string
    spinnerBottom: string
    pillActiveBorder: string
    pillActiveBg: string
    pillActiveText: string
  }
> = {
  transcribing: {
    icon: AudioLines,
    iconColor: 'text-indigo-400',
    circleText: 'text-indigo-300',
    titleColor: 'text-indigo-100',
    badgeBorder: 'border-indigo-400/30',
    badgeBg: 'bg-indigo-500/10',
    badgeText: 'text-indigo-200',
    spinnerTop: 'border-t-indigo-500',
    spinnerBottom: 'border-b-indigo-900',
    pillActiveBorder: 'border-indigo-400/40',
    pillActiveBg: 'bg-indigo-500/15',
    pillActiveText: 'text-indigo-100',
  },
  refining: {
    icon: Sparkles,
    iconColor: 'text-violet-400',
    circleText: 'text-violet-300',
    titleColor: 'text-violet-100',
    badgeBorder: 'border-violet-400/30',
    badgeBg: 'bg-violet-500/10',
    badgeText: 'text-violet-200',
    spinnerTop: 'border-t-violet-500',
    spinnerBottom: 'border-b-violet-900',
    pillActiveBorder: 'border-violet-400/40',
    pillActiveBg: 'bg-violet-500/15',
    pillActiveText: 'text-violet-100',
  },
  translating: {
    icon: Globe,
    iconColor: 'text-cyan-400',
    circleText: 'text-cyan-300',
    titleColor: 'text-cyan-100',
    badgeBorder: 'border-cyan-400/30',
    badgeBg: 'bg-cyan-500/10',
    badgeText: 'text-cyan-200',
    spinnerTop: 'border-t-cyan-500',
    spinnerBottom: 'border-b-cyan-900',
    pillActiveBorder: 'border-cyan-400/40',
    pillActiveBg: 'bg-cyan-500/15',
    pillActiveText: 'text-cyan-100',
  },
}

function getProcessingTitle(
  stage: OverlayProcessingStage | undefined,
  t: (key: string) => string,
): string {
  switch (stage) {
    case 'transcribing':
      return t('hud.transcribing')
    case 'refining':
      return t('hud.refining')
    case 'translating':
      return t('hud.translating')
    default:
      return t('hud.thinking')
  }
}

function getProcessingStepLabel(stage: OverlayProcessingStage, t: (key: string) => string): string {
  switch (stage) {
    case 'transcribing':
      return t('hud.stepTranscribing')
    case 'refining':
      return t('hud.stepRefining')
    case 'translating':
      return t('hud.stepTranslating')
  }
}

export function HUD() {
  const { t } = useTranslation()
  const [overlayState, setOverlayState] = useState<OverlayState>({ status: 'recording' })
  const [audioLevel, setAudioLevel] = useState(0)
  const [isVisible, setIsVisible] = useState(false)

  // RAF cleanup ref
  const rafIdRef = useRef<number | null>(null)

  useEffect(() => {
    document.documentElement.classList.add('overlay-html')
    rafIdRef.current = requestAnimationFrame(() => setIsVisible(true))
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
      document.documentElement.classList.remove('overlay-html')
    }
  }, [])

  useEffect(() => {
    const removeOverlayUpdateListener = window.electronAPI.onOverlayUpdate(
      (state: OverlayState) => {
        setOverlayState(state)
      },
    )

    const removeAudioLevelListener = window.electronAPI.onAudioLevel((level: number) => {
      setAudioLevel(level)
    })

    return () => {
      removeOverlayUpdateListener?.()
      removeAudioLevelListener?.()
    }
  }, [])

  const handleCancel = () => {
    window.electronAPI.cancelSession()
  }

  const { status, message, processingStage, processingTotalStages } = overlayState

  const showDetailedProcessing = status === 'processing' && Boolean(processingStage)
  const visibleProcessingSteps = useMemo(
    () => (processingTotalStages === 1 ? PROCESSING_STEPS.slice(0, 1) : PROCESSING_STEPS),
    [processingTotalStages],
  )
  const currentProcessingIndex = processingStage ? PROCESSING_STEPS.indexOf(processingStage) : -1

  const meta = processingStage ? STAGE_META[processingStage] : null

  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
      <div
        className={cn(
          'relative flex w-[248px] items-center gap-3 rounded-full bg-neutral-900/90 p-2 backdrop-blur-xl pointer-events-auto',
          'transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]',
          isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95',
        )}
        onMouseEnter={() => window.electronAPI.setIgnoreMouseEvents(false)}
        onMouseLeave={() => window.electronAPI.setIgnoreMouseEvents(true, { forward: true })}
      >
        {/* Left icon circle */}
        <div
          className={cn(
            'relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full shadow-lg transition-all duration-500',
            status === 'recording' &&
              'bg-linear-to-br from-red-500 to-orange-600 text-white shadow-red-500/20',
            status === 'processing' && 'border bg-neutral-800',
            status === 'processing' && meta?.circleText,
            status === 'success' && 'bg-emerald-500 text-white shadow-emerald-500/20',
            status === 'error' && 'border border-red-500/30 bg-red-900/50 text-red-500',
          )}
        >
          {status === 'recording' && (
            <>
              <div className="absolute inset-0 animate-pulse bg-white/20" />
              <Mic className="relative z-10 h-3.5 w-3.5" />
            </>
          )}

          {status === 'processing' && (
            <div className="relative flex h-full w-full items-center justify-center">
              <div
                className={cn(
                  'absolute inset-0 animate-spin rounded-full border-2 border-l-transparent border-r-transparent',
                  meta
                    ? [meta.spinnerBottom, meta.spinnerTop]
                    : 'border-b-indigo-900 border-t-indigo-500',
                )}
              />
              {meta ? (
                <meta.icon className={cn('h-3.5 w-3.5', meta.iconColor)} />
              ) : (
                <Zap className="h-3.5 w-3.5 text-indigo-400" fill="currentColor" />
              )}
            </div>
          )}

          {status === 'success' && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
          {status === 'error' && <X className="h-3.5 w-3.5" strokeWidth={3} />}
        </div>

        {/* Center content */}
        <div className="flex min-h-[40px] flex-1 flex-col justify-center overflow-hidden pr-2">
          {status === 'recording' && (
            <div className="flex w-full items-center gap-3">
              <Waveform audioLevel={audioLevel} />
            </div>
          )}

          {status === 'processing' &&
            (processingStage === 'translating' ? (
              <div className="flex w-full flex-col gap-1 px-1">
                {/* Single-step translating view */}
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      'text-sm font-medium transition-colors duration-300',
                      meta?.titleColor ?? 'text-white',
                    )}
                  >
                    {getProcessingTitle(processingStage, t)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      'flex flex-1 items-center justify-center gap-1 rounded-full border px-2 py-1 text-center text-[10px] font-medium transition-colors duration-300',
                      meta
                        ? [meta.pillActiveBorder, meta.pillActiveBg, meta.pillActiveText]
                        : 'border-indigo-400/40 bg-indigo-500/15 text-indigo-100',
                    )}
                  >
                    <span>{getProcessingStepLabel(processingStage, t)}</span>
                  </div>
                </div>
              </div>
            ) : showDetailedProcessing ? (
              <div className="flex w-full flex-col gap-1 px-1">
                {/* Title row */}
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      'text-sm font-medium transition-colors duration-300',
                      meta?.titleColor ?? 'text-white',
                    )}
                  >
                    {getProcessingTitle(processingStage, t)}
                  </span>
                  {processingTotalStages === 2 && currentProcessingIndex >= 0 && (
                    <span
                      className={cn(
                        'rounded-full border px-1.5 py-0.5 text-[10px] font-medium transition-colors duration-300',
                        meta
                          ? [meta.badgeBorder, meta.badgeBg, meta.badgeText]
                          : 'border-indigo-400/30 bg-indigo-500/10 text-indigo-200',
                      )}
                    >
                      {currentProcessingIndex + 1}/2
                    </span>
                  )}
                </div>

                {/* Step pills */}
                <div className="flex items-center gap-1.5">
                  {visibleProcessingSteps.map((step, index) => {
                    const isCurrent = step === processingStage
                    const isCompleted = currentProcessingIndex > index
                    const stepMeta = STAGE_META[step]

                    return (
                      <div key={step} className="flex items-center gap-1.5">
                        {index > 0 && (
                          <div
                            className={cn(
                              'h-px w-2 transition-colors duration-300',
                              currentProcessingIndex >= index ? 'bg-white/25' : 'bg-neutral-800',
                            )}
                          />
                        )}
                        <div
                          className={cn(
                            'flex flex-1 items-center justify-center gap-1 rounded-full border px-2 py-1 text-center text-[10px] font-medium transition-colors duration-300',
                            isCurrent && [
                              stepMeta.pillActiveBorder,
                              stepMeta.pillActiveBg,
                              stepMeta.pillActiveText,
                            ],
                            isCompleted && 'border-white/10 bg-white/10 text-white/80',
                            !isCurrent &&
                              !isCompleted &&
                              'border-neutral-800 bg-neutral-900/70 text-neutral-500',
                          )}
                        >
                          {isCompleted && (
                            <Check className="h-2.5 w-2.5 shrink-0" strokeWidth={3} />
                          )}
                          <span>{getProcessingStepLabel(step, t)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex w-full justify-center px-1">
                <span className="w-full animate-pulse text-sm font-medium text-white">
                  {t('hud.thinking')}
                </span>
              </div>
            ))}

          {status === 'success' && (
            <div className="flex w-full items-center justify-center">
              <div className="rounded bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                <div className="flex items-center">
                  <Sparkles className="mr-1 h-3 w-3" />
                  <span>{t('hud.injected')}</span>
                </div>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col px-1">
              <span className="line-clamp-1 text-sm font-medium text-red-400">
                {t('hud.error')}
              </span>
              <span className="line-clamp-1 max-w-[200px] text-xs text-neutral-500" title={message}>
                {message || t('hud.errorFallback')}
              </span>
            </div>
          )}
        </div>

        {/* Cancel button */}
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full shadow-lg transition-all duration-500">
          <button
            onClick={handleCancel}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/10 hover:text-red-400"
            title={t('hud.cancel')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
