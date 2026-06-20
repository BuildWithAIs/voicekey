import { useMemo, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'

interface VoiceWaveProps {
  bars?: number
  active?: boolean
  level?: number
  className?: string
}

/**
 * 品牌装饰声波：一排高度各异的竖条，active 时上下脉动。
 * 颜色继承自 currentColor，可通过外层 text-* 控制。纯装饰，不读取真实音频。
 */
export function VoiceWave({ bars = 32, active = true, level = 1, className }: VoiceWaveProps) {
  const heights = useMemo(
    () =>
      Array.from({ length: bars }, (_, i) => {
        const v = Math.abs(Math.sin(i * 0.7) * 0.6 + Math.sin(i * 0.27 + 1) * 0.4)
        return 0.18 + v * 0.82
      }),
    [bars],
  )

  return (
    <div
      className={cn('vk-wave', active && 'is-active', className)}
      style={{ ['--wave-level' as string]: String(level) } as CSSProperties}
      aria-hidden="true"
    >
      {heights.map((h, i) => (
        <span
          key={i}
          className="vk-wave-bar"
          style={
            {
              ['--h' as string]: `${Math.round(h * 100)}%`,
              animationDelay: `${(i % 14) * 75}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
