import type { HistoryDay } from '@electron/shared/types'

export type TrendMetric = 'characters' | 'sessions' | 'durationMs'

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Calendar-day arithmetic preserves local dates across daylight-saving changes. */
export function buildComparison(days: HistoryDay[], range: number, endKey: string) {
  const daily = new Map(days.map((day) => [day.dateKey, day]))
  const end = new Date(`${endKey}T12:00:00`)
  const atOffset = (offset: number): HistoryDay => {
    const date = new Date(end)
    date.setDate(date.getDate() + offset)
    const dateKey = localDateKey(date)
    return daily.get(dateKey) ?? { dateKey, characters: 0, sessions: 0, durationMs: 0 }
  }
  return Array.from({ length: range }, (_, index) => {
    const offset = index - range + 1
    return { ...atOffset(offset), previous: atOffset(offset - range) }
  })
}

/** Continue milestones indefinitely after the introductory 10k / 50k / 100k targets. */
export function characterMilestones(total: number): number[] {
  if (total < 150000) return [10000, 50000, 100000, 150000]
  const step = 10 ** Math.floor(Math.log10(total)) / 2
  const next = (Math.floor(total / step) + 1) * step
  return [next - 3 * step, next - 2 * step, next - step, next].filter((value) => value > 0)
}

export function percentageChange(current: number, previous: number): number | null {
  return previous === 0 ? null : ((current - previous) / previous) * 100
}

/** Inclusive calendar span, unaffected by DST or the browser's UTC offset. */
export function historyRangeDays(days: HistoryDay[], endKey: string): number {
  const first = days.reduce(
    (earliest, day) => (day.dateKey < earliest ? day.dateKey : earliest),
    endKey,
  )
  return Math.max(
    1,
    Math.round((Date.parse(`${endKey}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86400000) +
      1,
  )
}

export type TrendPoint = ReturnType<typeof buildComparison>[number]
export type ChartPoint = TrendPoint & { endDateKey: string }

/** Bound chart density without dropping any daily values. Details remain unaggregated. */
export function aggregateHistory(points: TrendPoint[]): {
  granularity: 'day' | 'week' | 'month' | 'year'
  points: ChartPoint[]
} {
  const granularity =
    points.length <= 90
      ? 'day'
      : points.length <= 730
        ? 'week'
        : points.length <= 3650
          ? 'month'
          : 'year'
  const groups = new Map<string, ChartPoint>()
  for (const point of points) {
    let key = point.dateKey
    if (granularity === 'year') key = key.slice(0, 4)
    else if (granularity === 'month') key = key.slice(0, 7)
    else if (granularity === 'week') {
      const date = new Date(`${key}T12:00:00`)
      date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
      key = localDateKey(date)
    }
    const group = groups.get(key)
    if (!group)
      groups.set(key, { ...point, previous: { ...point.previous }, endDateKey: point.dateKey })
    else {
      group.endDateKey = point.dateKey
      for (const metric of ['characters', 'sessions', 'durationMs'] as const) {
        group[metric] += point[metric]
        group.previous[metric] += point.previous[metric]
      }
    }
  }
  return { granularity, points: [...groups.values()] }
}
