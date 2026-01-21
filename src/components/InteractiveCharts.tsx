import * as React from 'react'
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts'
import { useTranslation } from 'react-i18next'
import { getLocale } from '@electron/shared/i18n'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Helper interfaces and functions from HomePage.tsx
// Helper interfaces and functions
export interface HistoryItem {
  id: string
  text: string
  timestamp: number
  duration?: number
}

interface TrendPoint {
  label: string
  date: number // Added to support recharts data key
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
      date: date.getTime(), // Use YYYY-MM-DD as data key for chart
      characters: stats.characters,
      durationMs: stats.durationMs,
    })
  }
  return points
}

const chartConfig = {
  characters: {
    label: 'Characters',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig

export default function InteractiveCharts({ historyItems, loading }: InteractiveChartsProps) {
  const { t, i18n } = useTranslation()
  const [timeRange, setTimeRange] = React.useState('7d')

  const locale = getLocale(i18n.language)
  const dayFormatter = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }),
    [locale],
  )

  const filteredData = React.useMemo(() => {
    let days = 90
    if (timeRange === '30d') {
      days = 30
    } else if (timeRange === '7d') {
      days = 7
    }

    return buildTrendData(historyItems, days, (date) => dayFormatter.format(date))
  }, [historyItems, timeRange, dayFormatter])

  return (
    <Card className="pt-0">
      <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
        <div className="grid flex-1 gap-1">
          <CardTitle className="flex items-center gap-2">
            {t('home.chart.title')}
            {loading && (
              <span className="text-sm font-normal text-muted-foreground">
                ({t('common.loadingHistory', { defaultValue: 'Loading...' })})
              </span>
            )}
          </CardTitle>
          <CardDescription>{t('home.chart.description')}</CardDescription>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger
            className="cursor-pointer hidden w-[160px] rounded-lg sm:ml-auto sm:flex"
            aria-label="Select a value"
          >
            <SelectValue placeholder="Last 3 months" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="90d" className="rounded-lg">
              {t('home.range.option', { count: 90 })}
            </SelectItem>
            <SelectItem value="30d" className="rounded-lg">
              {t('home.range.option', { count: 30 })}
            </SelectItem>
            <SelectItem value="7d" className="rounded-lg">
              {t('home.range.option', { count: 7 })}
            </SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
          <AreaChart data={filteredData}>
            <defs>
              <linearGradient id="fillCharacters" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const raw = value
                // 如果是数字（时间戳），直接用；否则把 YYYY-MM-DD 当作本地日期解析
                const date =
                  typeof raw === 'number' || /^\d+$/.test(String(raw))
                    ? new Date(Number(raw))
                    : new Date(`${String(raw)}T00:00:00`)
                return date.toLocaleDateString(locale, {
                  month: 'short',
                  day: 'numeric',
                })
              }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value, payload) => {
                    // payload 优先：recharts 会把 data point 放在 payload[0].payload
                    const candidate =
                      payload && payload.length > 0 ? (payload[0]?.payload?.date ?? value) : value

                    const raw = candidate
                    const date =
                      typeof raw === 'number' || /^\d+$/.test(String(raw))
                        ? new Date(Number(raw))
                        : new Date(`${String(raw)}T00:00:00`)

                    return date.toLocaleDateString(locale, {
                      month: 'short',
                      day: 'numeric',
                    })
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
              stackId="a"
            />
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
