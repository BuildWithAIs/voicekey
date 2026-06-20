export interface HistoryItem {
  id: string
  text: string
  timestamp: number
  duration?: number
}

export interface DictationStats {
  totalCharacters: number
  totalAudioMs: number
  recentCharacters: number
  recentAudioMs: number
  todaySessions: number
  todayDuration: number
  todayCharacters: number
  activeDays: number
  peakDayCharacters: number
  peakDayKey: string | null
}

export const countCharacters = (text: string): number => text.replace(/\s+/g, '').length

const sumValues = (values: number[]): number => values.reduce((total, value) => total + value, 0)

const buildDateKey = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 从听写历史计算概览统计（今日 / 近 N 天 / 累计 / 活跃天数 / 峰值日）。 */
export function computeStats(historyItems: HistoryItem[], rangeDays = 7): DictationStats {
  const totalCharacters = sumValues(historyItems.map((item) => countCharacters(item.text)))
  const totalAudioMs = sumValues(historyItems.map((item) => item.duration ?? 0))

  const now = new Date()
  const cutoff = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000)
  const recentItems = historyItems.filter((item) => item.timestamp >= cutoff.getTime())
  const recentCharacters = sumValues(recentItems.map((item) => countCharacters(item.text)))
  const recentAudioMs = sumValues(recentItems.map((item) => item.duration ?? 0))

  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  ).getTime()
  const todayEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  ).getTime()
  const todayItems = historyItems.filter(
    (item) => item.timestamp >= todayStart && item.timestamp <= todayEnd,
  )
  const todaySessions = todayItems.length
  const todayDuration = sumValues(todayItems.map((item) => item.duration ?? 0))
  const todayCharacters = sumValues(todayItems.map((item) => countCharacters(item.text)))

  const dailyMap = new Map<string, number>()
  historyItems.forEach((item) => {
    const key = buildDateKey(new Date(item.timestamp))
    dailyMap.set(key, (dailyMap.get(key) ?? 0) + countCharacters(item.text))
  })

  let peakDayCharacters = 0
  let peakDayKey: string | null = null
  dailyMap.forEach((chars, key) => {
    if (chars > peakDayCharacters) {
      peakDayCharacters = chars
      peakDayKey = key
    }
  })

  return {
    totalCharacters,
    totalAudioMs,
    recentCharacters,
    recentAudioMs,
    todaySessions,
    todayDuration,
    todayCharacters,
    activeDays: dailyMap.size,
    peakDayCharacters,
    peakDayKey,
  }
}
