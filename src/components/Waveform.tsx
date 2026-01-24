import { useEffect, useRef, useState } from 'react'

interface WaveformProps {
  /** Current audio level (0-1) */
  audioLevel: number
  /** Number of bars to render */
  barCount?: number
  /** Color of the bars */
  barColor?: string
}

export function Waveform({ audioLevel, barCount = 12, barColor = 'bg-white/80' }: WaveformProps) {
  const [data, setData] = useState<number[]>([])
  const audioLevelRef = useRef(0)

  // Sync ref with prop for access inside interval
  useEffect(() => {
    audioLevelRef.current = audioLevel
  }, [audioLevel])

  // Animation loop
  useEffect(() => {
    const update = () => {
      const currentLevel = audioLevelRef.current
      // Create variations:
      // - Base idle movement (0.1 ~ 0.3)
      // - Active movement (currentLevel * multiplier) applied randomly
      const newData = Array.from({ length: barCount }, () => {
        const idle = 0.15 + Math.random() * 0.15
        const active = currentLevel * 2 * Math.random() // High multiplier for visibility
        return Math.min(1.0, Math.max(0.15, idle + active))
      })
      setData(newData)
    }

    // Faster update rate for smoother look (approx 20fps)
    const interval = setInterval(update, 50)
    update()

    return () => clearInterval(interval)
  }, [barCount])

  return (
    <div className="w-full flex items-center justify-center gap-[3px] h-5">
      {data.map((h, i) => (
        <div
          key={i}
          className={`w-[3px] ${barColor} rounded-full transition-all duration-75 ease-out`}
          style={{
            height: `${h * 100}%`,
            opacity: Math.max(0.5, h), // Fade out shorter bars slightly
          }}
        />
      ))}
      {data.length === 0 && <div className="text-[10px] text-neutral-500">...</div>}
    </div>
  )
}
