import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/utils'

interface WaveformProps {
  /** Current audio level (0-1) */
  audioLevel: number
  /** Number of bars to render */
  barCount?: number
  /** Bar color / gradient classes */
  barClassName?: string
  /** Container class overrides */
  className?: string
}

/**
 * 音频波形：每根柱子采样略有延迟的历史电平，形成自右向左传播的行波，
 * 配合钟形包络与缓动跟随，静止时有轻微呼吸感。
 */
export function Waveform({
  audioLevel,
  barCount = 24,
  barClassName = 'bg-white/80',
  className,
}: WaveformProps) {
  const [heights, setHeights] = useState<number[]>(() => Array(barCount).fill(0.12))
  const levelRef = useRef(0)
  const historyRef = useRef<number[]>([])
  const smoothRef = useRef<number[]>([])
  const envelopeRef = useRef<number[]>([])

  useEffect(() => {
    levelRef.current = audioLevel
  }, [audioLevel])

  useEffect(() => {
    historyRef.current = Array(barCount).fill(0)
    smoothRef.current = Array(barCount).fill(0.12)
    // 中间高两端低的钟形包络，叠加少量随机扰动
    envelopeRef.current = Array.from({ length: barCount }, (_, i) => {
      const center = 1 - Math.abs(i - (barCount - 1) / 2) / ((barCount + 1) / 2)
      return 0.3 + center * 0.7 * (0.7 + Math.random() * 0.3)
    })

    const update = () => {
      const history = historyRef.current
      history.unshift(levelRef.current)
      if (history.length > barCount) history.length = barCount

      const now = performance.now()
      const next = smoothRef.current.map((current, i) => {
        // 静止时的轻微呼吸（正弦 idle 运动）
        const idle = 0.1 + 0.05 * Math.sin(now / 420 + i * 0.55)
        const target = Math.min(
          1,
          Math.max(0.1, idle + (history[i] ?? 0) * 1.6 * envelopeRef.current[i]),
        )
        return current + (target - current) * 0.4
      })
      smoothRef.current = next
      setHeights([...next])
    }

    const interval = setInterval(update, 50)
    update()

    return () => clearInterval(interval)
  }, [barCount])

  return (
    <div className={cn('flex h-6 w-full items-center gap-[2.5px]', className)}>
      {heights.map((h, i) => (
        <div
          key={i}
          className={cn('w-[3px] shrink-0 rounded-full', barClassName)}
          style={{
            height: `${h * 100}%`,
            opacity: 0.45 + h * 0.55,
          }}
        />
      ))}
    </div>
  )
}
