import * as React from 'react'
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts'
import { useTranslation } from 'react-i18next'
import { getLocale } from '@electron/shared/i18n'
import { cn } from '@/lib/utils'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

export interface HistoryItem {
  id: string
  text: string
  timestamp: number
  duration?: number
}

interface TrendPoint {
  label: string
  date: number
  characters: number
  durationMs: number
}

interface InteractiveChartsProps {
  historyItems: HistoryItem[]
  loading: boolean
}

const countCharacters = (text: string): number => text.replace(/\s+/g, '').length

const buildDateKey = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const buildTrendData = (
  items: HistoryItem[],
  rangeDays: number,
  formatLabel: (date: Date) => string,
): TrendPoint[] => {
  const now = new Date()
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  const startOfRange = new Date(endOfToday)
  startOfRange.setDate(startOfRange.getDate() - (rangeDays - 1))
  startOfRange.setHours(0, 0, 0, 0)

  const dailyMap = new Map<string, { characters: number; durationMs: number }>()
  items.forEach((item) => {
    if (item.timestamp < startOfRange.getTime() || item.timestamp > endOfToday.getTime()) {
      return
    }
    const date = new Date(item.timestamp)
    const key = buildDateKey(date)
    const existing = dailyMap.get(key) ?? { characters: 0, durationMs: 0 }
    dailyMap.set(key, {
      characters: existing.characters + countCharacters(item.text),
      durationMs: existing.durationMs + (item.duration ?? 0),
    })
  })

  const points: TrendPoint[] = []
  for (let offset = 0; offset < rangeDays; offset += 1) {
    const date = new Date(startOfRange)
    date.setDate(startOfRange.getDate() + offset)
    const key = buildDateKey(date)
    const stats = dailyMap.get(key) ?? { characters: 0, durationMs: 0 }
    points.push({
      label: formatLabel(date),
      date: date.getTime(),
      characters: stats.characters,
      durationMs: stats.durationMs,
    })
  }
  return points
}

const RANGE_OPTIONS = [
  { value: '7d', days: 7 },
  { value: '30d', days: 30 },
  { value: '90d', days: 90 },
] as const

export default function InteractiveCharts({ historyItems, loading }: InteractiveChartsProps) {
  const { t, i18n } = useTranslation()
  const [timeRange, setTimeRange] = React.useState<'7d' | '30d' | '90d'>('7d')

  const locale = getLocale(i18n.language)
  const chartConfig = React.useMemo<ChartConfig>(
    () => ({
      characters: {
        label: t('home.chart.seriesLabel'),
        color: 'var(--chart-1)',
      },
    }),
    [i18n.language, t],
  )
  const dayFormatter = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }),
    [locale],
  )

  const days = timeRange === '90d' ? 90 : timeRange === '30d' ? 30 : 7

  const filteredData = React.useMemo(
    () => buildTrendData(historyItems, days, (date) => dayFormatter.format(date)),
    [historyItems, days, dayFormatter],
  )

  return (
    <Card className="gap-0 overflow-hidden pt-0">
      <CardHeader className="flex flex-col gap-3 border-b py-5 sm:flex-row sm:items-center">
        <div className="grid flex-1 gap-1">
          <CardTitle className="flex items-center gap-2 text-[15px]">
            {t('home.chart.title')}
            {loading && (
              <span className="text-xs font-normal text-muted-foreground">
                {t('common.loading')}
              </span>
            )}
          </CardTitle>
          <CardDescription className="text-xs">{t('home.chart.description')}</CardDescription>
        </div>
        <div className="inline-flex rounded-lg border bg-secondary p-0.5">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setTimeRange(option.value)}
              className={cn(
                'cursor-pointer rounded-md px-3 py-1 text-xs font-semibold transition-colors',
                timeRange === option.value
                  ? 'bg-card text-primary shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t('home.chart.days', { count: option.days })}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
          <AreaChart data={filteredData}>
            <defs>
              <linearGradient id="fillCharacters" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.38} />
                <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 4" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const raw = value
                const date =
                  typeof raw === 'number' || /^\d+$/.test(String(raw))
                    ? new Date(Number(raw))
                    : new Date(`${String(raw)}T00:00:00`)
                return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
              }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value, payload) => {
                    const candidate =
                      payload && payload.length > 0 ? (payload[0]?.payload?.date ?? value) : value
                    const raw = candidate
                    const date =
                      typeof raw === 'number' || /^\d+$/.test(String(raw))
                        ? new Date(Number(raw))
                        : new Date(`${String(raw)}T00:00:00`)
                    return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
                  }}
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="characters"
              type="monotone"
              fill="url(#fillCharacters)"
              stroke="var(--chart-1)"
              strokeWidth={2.5}
              stackId="a"
            />
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
