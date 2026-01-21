import { useEffect, useRef, useState } from 'react'
import { Check, CheckCheck, Mic, Sparkles, X, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { OverlayState, OverlayStatus } from '../../electron/shared/types'

export function HUD() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<OverlayStatus>('recording')
  const [message, setMessage] = useState<string>('')
  const [audioLevel, setAudioLevel] = useState(0)
  const [isVisible, setIsVisible] = useState(false)

  // 模拟波形数据 (结合真实的 audioLevel)
  const [waveform, setWaveform] = useState<number[]>([])
  const audioLevelRef = useRef(0)

  useEffect(() => {
    document.documentElement.classList.add('overlay-html')
    requestAnimationFrame(() => setIsVisible(true))
    return () => document.documentElement.classList.remove('overlay-html')
  }, [])

  useEffect(() => {
    const removeOverlayUpdateListener = window.electronAPI.onOverlayUpdate(
      (state: OverlayState) => {
        setStatus(state.status)
        setMessage(state.message ?? '')
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

  useEffect(() => {
    audioLevelRef.current = audioLevel
  }, [audioLevel])

  useEffect(() => {
    if (status === 'recording') {
      const interval = setInterval(() => {
        setWaveform(() => {
          const currentLevel = audioLevelRef.current
          const newData = Array.from({ length: 7 }, () =>
            Math.max(0.2, (currentLevel * 1.5 + Math.random() * 0.5) * Math.random()),
          )
          return newData
        })
      }, 80)
      return () => clearInterval(interval)
    }
  }, [status])

  const handleCancel = () => {
    if (status === 'recording') {
      window.electronAPI.stopSession()
    }
  }

  const handleConfirm = () => {
    if (status === 'recording') {
      window.electronAPI.stopSession()
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
      <div
        className={`
          relative
        bg-neutral-900/90 backdrop-blur-xl
          rounded-full p-2
          flex items-center gap-3
          min-w-[200px]
          pointer-events-auto
          transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]
          ${isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95'}
        `}
        onMouseEnter={() => window.electronAPI.setIgnoreMouseEvents(false)}
        onMouseLeave={() => window.electronAPI.setIgnoreMouseEvents(true, { forward: true })}
      >
        {/* Status Orb / Icon - 左侧状态球 */}
        <div
          className={`
            w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-lg relative overflow-hidden transition-all duration-500
            ${status === 'recording' ? 'bg-gradient-to-br from-red-500 to-orange-600 text-white shadow-red-500/20' : ''}
            ${status === 'processing' ? 'bg-neutral-800 border border-neutral-700' : ''}
            ${status === 'success' ? 'bg-emerald-500 text-white shadow-emerald-500/20' : ''}
            ${status === 'error' ? 'bg-red-900/50 text-red-500 border border-red-500/30' : ''}
        `}
        >
          {status === 'recording' && (
            <>
              <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
              <Mic className="w-3.5 h-3.5 relative z-10" />
            </>
          )}
          {status === 'processing' && (
            <div className="relative w-full h-full flex items-center justify-center">
              <div className="absolute inset-0 border-2 border-t-indigo-500 border-r-transparent border-b-indigo-900 border-l-transparent rounded-full animate-spin"></div>
              <Zap className="w-3.5 h-3.5 text-indigo-400" fill="currentColor" />
            </div>
          )}
          {status === 'success' && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
          {status === 'error' && <X className="w-3.5 h-3.5" strokeWidth={3} />}
        </div>

        {/* Content Container - 右侧内容区 */}
        <div className="flex-1 flex flex-col justify-center min-h-[32px] overflow-hidden pr-2">
          {/* 1. Recording State */}
          {status === 'recording' && (
            <div className="flex items-center gap-3">
              {/* Dynamic Waveform Visualizer */}
              <div className="flex items-center gap-[2px] h-4">
                {waveform.map((h, i) => (
                  <div
                    key={i}
                    className="w-0.5 bg-white/80 rounded-full transition-all duration-100 ease-in-out"
                    style={{
                      height: `${Math.max(20, h * 100)}%`,
                    }}
                  />
                ))}
                {waveform.length === 0 && <div className="text-[10px] text-neutral-500">...</div>}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-0.5 border-l border-white/10 pl-2">
                <button
                  onClick={handleConfirm}
                  className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                  title={t('hud.finish')}
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleCancel}
                  className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 text-neutral-400 hover:text-red-400 transition-colors"
                  title={t('hud.cancel')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* 2. Processing State */}
          {status === 'processing' && (
            <div className="flex flex-col px-1">
              <span className="text-sm font-medium text-white animate-pulse">
                {t('hud.thinking')}
              </span>
            </div>
          )}

          {/* 3. Success State */}
          {status === 'success' && (
            <div className="flex flex-col px-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white line-clamp-1 max-w-[180px]">
                  {message || t('hud.done')}
                </span>
                <div className="flex items-center text-[10px] text-emerald-400 font-medium bg-emerald-400/10 px-1.5 py-0.5 rounded">
                  <Sparkles className="w-3 h-3 mr-1" />
                  <span>{t('hud.injected')}</span>
                </div>
              </div>
            </div>
          )}

          {/* 4. Error State */}
          {status === 'error' && (
            <div className="flex flex-col px-1">
              <span className="text-sm font-medium text-red-400 line-clamp-1">
                {t('hud.error')}
              </span>
              <span className="text-xs text-neutral-500 line-clamp-1 max-w-[200px]" title={message}>
                {message || t('hud.errorFallback')}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
