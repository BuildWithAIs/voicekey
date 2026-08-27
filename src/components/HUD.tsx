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
    iconColor: 'text-indigo-300',
    titleColor: 'text-indigo-200',
    badgeBorder: 'border-indigo-400/30',
    badgeBg: 'bg-indigo-500/10',
    badgeText: 'text-indigo-200',
    spinnerTop: 'border-t-indigo-400',
    spinnerBottom: 'border-b-indigo-500/20',
    pillActiveBorder: 'border-indigo-400/40',
    pillActiveBg: 'bg-indigo-500/15',
    pillActiveText: 'text-indigo-100',
  },
  refining: {
    icon: Sparkles,
    iconColor: 'text-violet-300',
    titleColor: 'text-violet-200',
    badgeBorder: 'border-violet-400/30',
    badgeBg: 'bg-violet-500/10',
    badgeText: 'text-violet-200',
    spinnerTop: 'border-t-violet-400',
    spinnerBottom: 'border-b-violet-500/20',
    pillActiveBorder: 'border-violet-400/40',
    pillActiveBg: 'bg-violet-500/15',
    pillActiveText: 'text-violet-100',
  },
  translating: {
    icon: Globe,
    iconColor: 'text-cyan-300',
    titleColor: 'text-cyan-200',
    badgeBorder: 'border-cyan-400/30',
    badgeBg: 'bg-cyan-500/10',
    badgeText: 'text-cyan-200',
    spinnerTop: 'border-t-cyan-400',
    spinnerBottom: 'border-b-cyan-500/20',
    pillActiveBorder: 'border-cyan-400/40',
    pillActiveBg: 'bg-cyan-500/15',
    pillActiveText: 'text-cyan-100',
  },
}

/** 各状态的环境辉光（卡片投影） */
const STATUS_GLOW: Record<OverlayState['status'], string> = {
  recording: 'shadow-[0_16px_48px_-12px_rgba(244,63,94,0.4),0_4px_16px_rgba(0,0,0,0.45)]',
  processing: 'shadow-[0_16px_48px_-12px_rgba(129,140,248,0.35),0_4px_16px_rgba(0,0,0,0.45)]',
  success: 'shadow-[0_16px_48px_-12px_rgba(52,211,153,0.4),0_4px_16px_rgba(0,0,0,0.45)]',
  error: 'shadow-[0_16px_48px_-12px_rgba(248,113,113,0.4),0_4px_16px_rgba(0,0,0,0.45)]',
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

/** 小型脉冲状态点（录音/处理状态行通用） */
function PulseDot({ className }: { className?: string }) {
  return (
    <span className="relative flex h-1.5 w-1.5 shrink-0">
      <span
        className={cn(
          'absolute inline-flex h-full w-full animate-ping rounded-full opacity-70',
          className,
        )}
      />
      <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', className)} />
    </span>
  )
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

  const { status, message, processingStage, processingTotalStages, transcript = '' } = overlayState
  const transcriptCharacters = Array.from(transcript)
  const unstableTailLength = status === 'recording' ? Math.min(6, transcriptCharacters.length) : 0
  const stableTranscript = transcriptCharacters
    .slice(0, transcriptCharacters.length - unstableTailLength)
    .join('')
  const unstableTranscript = transcriptCharacters.slice(-unstableTailLength).join('')

  const showDetailedProcessing = status === 'processing' && Boolean(processingStage)
  const visibleProcessingSteps = useMemo(
    () => (processingTotalStages === 1 ? PROCESSING_STEPS.slice(0, 1) : PROCESSING_STEPS),
    [processingTotalStages],
  )
  const currentProcessingIndex = processingStage ? PROCESSING_STEPS.indexOf(processingStage) : -1

  const meta = processingStage ? STAGE_META[processingStage] : null
  const showStepPills = showDetailedProcessing && (!transcript || processingStage === 'translating')

  return (
    <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
      <div
        className={cn(
          'pointer-events-auto relative flex min-h-[92px] w-[400px] items-start gap-3 rounded-2xl p-3.5 backdrop-blur-2xl',
          'transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]',
          STATUS_GLOW[status],
          isVisible
            ? 'translate-y-0 scale-100 opacity-100 blur-0'
            : 'translate-y-3 scale-[0.96] opacity-0 blur-sm',
        )}
        style={{
          background:
            'linear-gradient(rgba(16,16,18,0.86), rgba(16,16,18,0.86)) padding-box, linear-gradient(140deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05) 45%, rgba(255,255,255,0.02)) border-box',
          border: '1px solid transparent',
        }}
        onMouseEnter={() => window.electronAPI.setIgnoreMouseEvents(false)}
        onMouseLeave={() => window.electronAPI.setIgnoreMouseEvents(true, { forward: true })}
      >
        {/* Left status icon */}
        <div className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center">
          {status === 'recording' && (
            <>
              {/* 双层涟漪光环 */}
              <span className="absolute inset-0 animate-ping rounded-full bg-red-500/30 [animation-duration:1.8s]" />
              <span className="absolute inset-0 animate-ping rounded-full bg-orange-400/20 [animation-delay:600ms] [animation-duration:1.8s]" />
              {/* 随音量呼吸缩放 */}
              <div
                className="relative flex h-9 w-9 items-center justify-center rounded-full bg-linear-to-br from-red-500 to-orange-500 text-white shadow-lg shadow-red-500/30 transition-transform duration-150 ease-out"
                style={{ transform: `scale(${1 + Math.min(audioLevel, 1) * 0.18})` }}
              >
                <Mic className="h-4 w-4" strokeWidth={2.2} />
              </div>
            </>
          )}

          {status === 'processing' && (
            <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/5">
              <div
                className={cn(
                  'absolute inset-[3px] animate-spin rounded-full border-2 border-l-transparent border-r-transparent [animation-duration:1.2s]',
                  meta
                    ? [meta.spinnerBottom, meta.spinnerTop]
                    : 'border-b-indigo-500/20 border-t-indigo-400',
                )}
              />
              {meta ? (
                <meta.icon className={cn('h-3.5 w-3.5', meta.iconColor)} />
              ) : (
                <Zap className="h-3.5 w-3.5 text-indigo-300" fill="currentColor" />
              )}
            </div>
          )}

          {status === 'success' && (
            <div className="hud-pop flex h-9 w-9 items-center justify-center rounded-full bg-linear-to-br from-emerald-400 to-teal-500 text-white shadow-lg shadow-emerald-500/30">
              <Check className="h-4 w-4" strokeWidth={3} />
            </div>
          )}

          {status === 'error' && (
            <div className="hud-pop flex h-9 w-9 items-center justify-center rounded-full border border-red-400/25 bg-red-500/10 text-red-400">
              <X className="h-4 w-4" strokeWidth={2.5} />
            </div>
          )}
        </div>

        {/* Center content */}
        <div className="flex min-h-[64px] min-w-0 flex-1 flex-col justify-center overflow-hidden pr-1">
          {status === 'recording' &&
            (transcript ? (
              /* 流式识别：实时文本为主视觉 */
              <div className="flex min-w-0 flex-col gap-2">
                <p className="line-clamp-3 text-[14px] leading-5 text-neutral-100">
                  <span>{stableTranscript}</span>
                  <span className="text-neutral-500">{unstableTranscript}</span>
                  <span className="hud-caret ml-[3px] inline-block h-[14px] w-[2px] translate-y-[2px] rounded-full bg-linear-to-b from-orange-400 to-red-500" />
                </p>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-[10px] font-medium text-neutral-400">
                    <PulseDot className="bg-red-400" />
                    {t('hud.listening')}
                  </span>
                  <Waveform
                    audioLevel={audioLevel}
                    barCount={14}
                    className="h-3.5 w-20 gap-[2px]"
                    barClassName="w-[2px] bg-linear-to-t from-red-500/70 to-orange-300/70"
                  />
                </div>
              </div>
            ) : (
              /* 非流式（SenseVoice）：波形为主视觉 */
              <div className="flex w-full flex-col gap-1.5">
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-400">
                  <PulseDot className="bg-red-400" />
                  {t('hud.listening')}
                </span>
                <Waveform
                  audioLevel={audioLevel}
                  barCount={28}
                  className="h-7"
                  barClassName="bg-linear-to-t from-red-500 to-orange-400"
                />
              </div>
            ))}

          {status === 'processing' &&
            (transcript && processingStage !== 'translating' ? (
              /* 展示已识别文本 + 当前阶段 */
              <div className="flex min-w-0 flex-col gap-2">
                <p className="line-clamp-3 text-[14px] leading-5 text-neutral-100">{transcript}</p>
                <span
                  className={cn(
                    'flex items-center gap-1.5 text-[10px] font-medium',
                    meta?.titleColor ?? 'text-indigo-200',
                  )}
                >
                  <PulseDot
                    className={cn(
                      processingStage === 'refining' && 'bg-violet-400',
                      processingStage === 'transcribing' && 'bg-indigo-400',
                      !processingStage && 'bg-indigo-400',
                    )}
                  />
                  {getProcessingTitle(processingStage, t)}
                </span>
              </div>
            ) : showStepPills ? (
              <div className="flex w-full flex-col gap-1.5 px-1">
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
                  {processingTotalStages === 2 &&
                    currentProcessingIndex >= 0 &&
                    processingStage !== 'translating' && (
                      <span
                        className={cn(
                          'rounded-full border px-1.5 py-0.5 text-[10px] font-medium tabular-nums transition-colors duration-300',
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
                  {(processingStage === 'translating'
                    ? (['translating'] as OverlayProcessingStage[])
                    : visibleProcessingSteps
                  ).map((step, index) => {
                    const isCurrent = step === processingStage
                    const isCompleted = currentProcessingIndex > index
                    const stepMeta = STAGE_META[step]

                    return (
                      <div key={step} className="flex flex-1 items-center gap-1.5">
                        {index > 0 && (
                          <div
                            className={cn(
                              'h-px w-2 shrink-0 transition-colors duration-300',
                              currentProcessingIndex >= index ? 'bg-white/25' : 'bg-white/8',
                            )}
                          />
                        )}
                        <div
                          className={cn(
                            'relative flex flex-1 items-center justify-center gap-1 overflow-hidden rounded-full border px-2 py-1 text-center text-[10px] font-medium transition-colors duration-300',
                            isCurrent && [
                              stepMeta.pillActiveBorder,
                              stepMeta.pillActiveBg,
                              stepMeta.pillActiveText,
                            ],
                            isCompleted && 'border-white/10 bg-white/10 text-white/80',
                            !isCurrent &&
                              !isCompleted &&
                              'border-white/6 bg-white/[0.03] text-neutral-500',
                          )}
                        >
                          {isCurrent && (
                            <span className="hud-shimmer pointer-events-none absolute inset-0" />
                          )}
                          {isCompleted && (
                            <Check className="h-2.5 w-2.5 shrink-0" strokeWidth={3} />
                          )}
                          <span className="relative">{getProcessingStepLabel(step, t)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex w-full items-center gap-2 px-1">
                <PulseDot className="bg-indigo-400" />
                <span className="animate-pulse text-sm font-medium text-white">
                  {t('hud.thinking')}
                </span>
              </div>
            ))}

          {status === 'success' && (
            <div className="flex w-full items-center gap-2">
              <span className="hud-pop flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-400 ring-1 ring-emerald-400/30">
                <Sparkles className="h-3 w-3" />
              </span>
              <span className="text-sm font-medium text-emerald-300">{t('hud.injected')}</span>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col gap-0.5 px-1">
              <span className="line-clamp-1 text-sm font-medium text-red-400">
                {t('hud.error')}
              </span>
              <span className="line-clamp-1 max-w-[240px] text-xs text-neutral-500" title={message}>
                {message || t('hud.errorFallback')}
              </span>
            </div>
          )}
        </div>

        {/* Cancel button */}
        <button
          onClick={handleCancel}
          className="mt-0.5 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-neutral-500 transition-all duration-150 hover:bg-white/10 hover:text-neutral-200 active:scale-90"
          title={t('hud.cancel')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
