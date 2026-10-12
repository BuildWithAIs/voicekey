import { describe, expect, it } from 'vitest'
import {
  aggregateHistory,
  historyRangeDays,
  buildComparison,
  characterMilestones,
  percentageChange,
} from './analytics'

describe('calendar analytics', () => {
  it('aligns adjacent periods across month and year boundaries and fills inactive days', () => {
    const points = buildComparison(
      [
        { dateKey: '2025-12-31', characters: 12, sessions: 2, durationMs: 5000 },
        { dateKey: '2026-01-07', characters: 24, sessions: 3, durationMs: 8000 },
      ],
      7,
      '2026-01-07',
    )
    expect(points[0]).toMatchObject({
      dateKey: '2026-01-01',
      characters: 0,
      sessions: 0,
      durationMs: 0,
    })
    expect(points[6]).toMatchObject({
      dateKey: '2026-01-07',
      characters: 24,
      previous: { dateKey: '2025-12-31', characters: 12 },
    })
    expect(points).toHaveLength(7)
    expect(percentageChange(24, 12)).toBe(100)
    expect(percentageChange(0, 12)).toBe(-100)
    expect(percentageChange(12, 0)).toBeNull()
    expect(percentageChange(0, 0)).toBeNull()
  })

  it('uses calendar days over leap day and DST transitions', () => {
    expect(buildComparison([], 3, '2024-03-01').map((day) => day.dateKey)).toEqual([
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
    ])
    expect(buildComparison([], 3, '2026-03-30').map((day) => day.dateKey)).toEqual([
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
    ])
    expect(buildComparison([], 3, '2026-10-26').map((day) => day.dateKey)).toEqual([
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
    ])
  })

  it('keeps old dates available and excludes records outside the selected periods', () => {
    const points = buildComparison(
      [{ dateKey: '2020-01-01', characters: 99, sessions: 1, durationMs: 0 }],
      7,
      '2020-01-01',
    )
    expect(points[6].characters).toBe(99)
    expect(
      buildComparison(
        [{ dateKey: '2020-01-01', characters: 99, sessions: 1, durationMs: 0 }],
        7,
        '2026-01-01',
      ).every((day) => day.characters === 0 && day.previous.characters === 0),
    ).toBe(true)
  })

  it('advances beyond achieved milestones without a lifetime cap', () => {
    expect(characterMilestones(0)).toEqual([10000, 50000, 100000, 150000])
    for (const total of [149999, 150000, 200000, 999999, 1000000, 15000000]) {
      const milestones = characterMilestones(total)
      expect(milestones[milestones.length - 1]).toBeGreaterThan(total)
      expect(milestones).toEqual([...milestones].sort((a, b) => a - b))
    }
  })
})

describe('all-history analytics', () => {
  it('includes records older than 90 days and inactive days through today', () => {
    const days = [
      { dateKey: '2020-01-01', characters: 100, sessions: 1, durationMs: 3000 },
      { dateKey: '2026-01-01', characters: 50, sessions: 2, durationMs: 4000 },
    ]
    const span = historyRangeDays(days, '2026-01-01')
    expect(span).toBe(2193)
    const points = buildComparison(days, span, '2026-01-01')
    expect(points[0].dateKey).toBe('2020-01-01')
    const chart = aggregateHistory(points)
    expect(chart.granularity).toBe('month')
    expect(chart.points.reduce((sum, point) => sum + point.characters, 0)).toBe(150)
    expect(chart.points.reduce((sum, point) => sum + point.sessions, 0)).toBe(3)
    expect(chart.points.reduce((sum, point) => sum + point.durationMs, 0)).toBe(7000)
    expect(chart.points[chart.points.length - 1].endDateKey).toBe('2026-01-01')
    expect(chart.points).toHaveLength(73)
  })

  it('uses a single empty day with no history and handles DST spans', () => {
    expect(historyRangeDays([], '2026-03-30')).toBe(1)
    expect(
      historyRangeDays(
        [{ dateKey: '2026-03-28', characters: 1, sessions: 1, durationMs: 0 }],
        '2026-03-30',
      ),
    ).toBe(3)
    expect(aggregateHistory(buildComparison([], 1, '2026-03-30'))).toMatchObject({
      granularity: 'day',
      points: [{ dateKey: '2026-03-30', endDateKey: '2026-03-30', characters: 0 }],
    })
  })

  it('bounds chart density for years of history without mutating daily details', () => {
    for (const [span, granularity] of [
      [90, 'day'],
      [91, 'week'],
      [730, 'week'],
      [731, 'month'],
      [3650, 'month'],
      [3651, 'year'],
    ] as const) {
      const points = buildComparison([], span, '2026-10-12')
      points[0].characters = 12
      points[1].characters = 34
      const chart = aggregateHistory(points)
      expect(chart.granularity).toBe(granularity)
      expect(chart.points.length).toBeLessThanOrEqual(121)
      expect(chart.points.reduce((sum, day) => sum + day.characters, 0)).toBe(46)
      expect(points[0].characters).toBe(12)
      expect(points[1].characters).toBe(34)
      expect(points).toHaveLength(span)
    }
  })
})
