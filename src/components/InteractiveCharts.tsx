import { useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, CalendarDays, ChevronDown } from 'lucide-react'
import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts'
import { useTranslation } from 'react-i18next'
import type { HistoryDay } from '@electron/shared/types'
import { cn } from '@/lib/utils'
import {
  aggregateHistory,
  buildComparison,
  historyRangeDays,
  localDateKey,
  percentageChange,
  type ChartPoint,
  type TrendMetric,
} from '@/lib/analytics'
import { useStatFormatters } from '@/lib/useStatFormatters'
import { ChartContainer } from '@/components/ui/chart'
import { Button } from '@/components/ui/button'

interface InteractiveChartsProps {
  days: HistoryDay[]
}
const METRICS: TrendMetric[] = ['characters', 'sessions', 'durationMs']

export default function InteractiveCharts({ days }: InteractiveChartsProps) {
  const { t } = useTranslation()
  const { locale, formatNumber, formatDuration } = useStatFormatters()
  const [range, setRange] = useState<number | 'all'>(30)
  const [metric, setMetric] = useState<TrendMetric>('characters')
  const [endKey, setEndKey] = useState('')
  const [showDetails, setShowDetails] = useState(false)
  const [detailPage, setDetailPage] = useState(0)
  const allHistory = range === 'all'
  const today = localDateKey(new Date())
  const end = allHistory ? today : endKey || today
  const rangeDays = allHistory ? historyRangeDays(days, end) : range
  const points = useMemo(() => buildComparison(days, rangeDays, end), [days, rangeDays, end])
  const chart = useMemo(
    () =>
      allHistory
        ? aggregateHistory(points)
        : {
            granularity: 'day' as const,
            points: points.map((point) => ({ ...point, endDateKey: point.dateKey })),
          },
    [points, allHistory],
  )
  const detailPages = allHistory ? Math.ceil(points.length / 50) : 1
  const currentPage = Math.min(detailPage, detailPages - 1)
  const detailPoints = allHistory
    ? points
        .slice(
          Math.max(0, points.length - (currentPage + 1) * 50),
          points.length - currentPage * 50,
        )
        .reverse()
    : [...points].reverse()
  const periodLabel = t(allHistory ? 'home.analytics.allHistory' : 'home.analytics.current')
  const current = points.reduce((sum, day) => sum + day[metric], 0)
  const previous = points.reduce((sum, day) => sum + day.previous[metric], 0)
  const change = percentageChange(current, previous)
  const activeDays = points.filter((day) => day.sessions > 0).length
  const peak = points.reduce((best, day) => Math.max(best, day[metric]), 0)
  const value = (amount: number) =>
    metric === 'durationMs' ? formatDuration(amount) : formatNumber(amount)
  const unit = metric === 'durationMs' ? '' : t(`home.analytics.units.${metric}`)
  const dateLabel = (key: string) =>
    new Date(`${key}T12:00:00`).toLocaleDateString(
      locale,
      allHistory && chart.granularity === 'year'
        ? { year: 'numeric' }
        : allHistory && chart.granularity === 'month'
          ? { year: '2-digit', month: 'short' }
          : { month: 'short', day: 'numeric' },
    )
  const fullDate = (key: string) =>
    new Date(`${key}T12:00:00`).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  const chartPoints = chart.points.map((point) => ({
    ...point,
    currentValue: metric === 'durationMs' ? point.durationMs / 60000 : point[metric],
    previousValue:
      metric === 'durationMs' ? point.previous.durationMs / 60000 : point.previous[metric],
  }))
  const changeLabel =
    change === null
      ? t(current > 0 ? 'home.analytics.noBaseline' : 'home.analytics.noActivity')
      : `${change > 0 ? '+' : ''}${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(change)}%`

  return (
    <section
      className="rounded-2xl border bg-card p-5 lg:p-7"
      aria-label={t('home.analytics.title')}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">{t('home.analytics.title')}</h2>
        <div className="flex flex-wrap gap-4">
          <div
            className="flex rounded-lg border bg-secondary/60 p-0.5"
            role="group"
            aria-label={t('home.analytics.metric')}
          >
            {METRICS.map((item) => (
              <button
                key={item}
                aria-pressed={metric === item}
                onClick={() => setMetric(item)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                  metric === item
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(`home.analytics.metrics.${item}`)}
              </button>
            ))}
          </div>
          <div
            className="flex rounded-lg border bg-secondary/60 p-0.5"
            role="group"
            aria-label={t('home.chart.rangeSelectAriaLabel')}
          >
            {([7, 30, 90, 'all'] as const).map((item) => (
              <button
                key={item}
                aria-pressed={range === item}
                onClick={() => {
                  setRange(item)
                  setDetailPage(0)
                }}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                  range === item
                    ? 'bg-accent text-accent-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {item === 'all' ? t('common.allTime') : t('home.chart.days', { count: item })}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex items-baseline gap-2">
            <span className="text-sm text-muted-foreground">{periodLabel}</span>
            <strong className="achievement-number tnum font-display text-3xl tracking-tight">
              {value(current)}
            </strong>
            <span className="text-sm text-muted-foreground">{unit}</span>
          </div>
          {!allHistory && (
            <div className="text-xs">
              <div
                className={cn(
                  'flex items-center gap-1 font-semibold',
                  change !== null && change > 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-muted-foreground',
                )}
              >
                {change !== null &&
                  change !== 0 &&
                  (change > 0 ? (
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDownRight className="h-3.5 w-3.5" />
                  ))}
                {changeLabel}
              </div>
              <p className="mt-1 text-muted-foreground">{t('home.analytics.vsPrevious')}</p>
            </div>
          )}
        </div>
        <label className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          <span>{fullDate(points[0].dateKey)} —</span>
          {allHistory ? (
            <span>{fullDate(end)}</span>
          ) : (
            <input
              type="date"
              aria-label={t('home.analytics.endDate')}
              max={today}
              value={end}
              className="min-w-0 rounded bg-transparent text-foreground outline-offset-2 focus-visible:outline-ring [color-scheme:light] dark:[color-scheme:dark]"
              onChange={(event) => {
                const key = event.target.value
                if (
                  /^\d{4}-\d{2}-\d{2}$/.test(key) &&
                  key <= today &&
                  localDateKey(new Date(`${key}T12:00:00`)) === key
                ) {
                  setEndKey(key === today ? '' : key)
                  setDetailPage(0)
                }
              }}
            />
          )}
        </label>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          {t(`home.analytics.axis.${metric}`)}
          {allHistory && ` · ${t(`home.analytics.granularity.${chart.granularity}`)}`}
        </span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-full bg-primary" />
            {periodLabel}
          </span>
          {!allHistory && (
            <span className="flex items-center gap-1.5">
              <i className="w-5 border-t-2 border-dashed border-[var(--analytics-comparison)]" />
              {t('home.analytics.previous')}
            </span>
          )}
        </div>
      </div>
      <ChartContainer
        config={{
          currentValue: { label: periodLabel, color: 'var(--primary)' },
          previousValue: {
            label: t('home.analytics.previous'),
            color: 'var(--analytics-comparison)',
          },
        }}
        className="mt-3 aspect-auto h-[240px] w-full lg:h-[250px]"
      >
        <ComposedChart
          accessibilityLayer
          data={chartPoints}
          margin={{ top: 12, right: 8, bottom: 4, left: 0 }}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 4" />
          <XAxis
            dataKey="dateKey"
            tickFormatter={dateLabel}
            tickLine={false}
            axisLine={false}
            tickMargin={12}
            minTickGap={30}
          />
          <YAxis
            width={48}
            tickLine={false}
            axisLine={false}
            allowDecimals={metric === 'durationMs'}
            tickFormatter={(amount: number) =>
              new Intl.NumberFormat(locale, {
                notation: 'compact',
                maximumFractionDigits: 1,
              }).format(amount)
            }
          />
          <Tooltip
            cursor={{ fill: 'var(--primary)', fillOpacity: 0.05 }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as ChartPoint | undefined
              if (!active || !point) return null
              return (
                <div className="min-w-40 rounded-xl border bg-popover p-3 text-xs shadow-lg">
                  <p className="font-medium">
                    {fullDate(point.dateKey)}
                    {point.endDateKey !== point.dateKey && ` — ${fullDate(point.endDateKey)}`}
                  </p>
                  <p className="achievement-number mt-2 text-lg font-semibold">
                    {value(point[metric])} {unit}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {t('home.analytics.tooltipSessions', { value: formatNumber(point.sessions) })} ·{' '}
                    {formatDuration(point.durationMs)}
                  </p>
                  {!allHistory && (
                    <div className="mt-2 border-t pt-2 text-muted-foreground">
                      <p>
                        {t('home.analytics.previous')} · {dateLabel(point.previous.dateKey)}
                      </p>
                      <p className="mt-1">
                        {value(point.previous[metric])} {unit}
                      </p>
                    </div>
                  )}
                </div>
              )
            }}
          />
          <Bar
            dataKey="currentValue"
            fill="var(--primary)"
            fillOpacity={0.8}
            radius={[3, 3, 0, 0]}
            maxBarSize={32}
            isAnimationActive={false}
          />
          {!allHistory && (
            <Line
              dataKey="previousValue"
              type="linear"
              stroke="var(--analytics-comparison)"
              strokeWidth={1.8}
              strokeDasharray="5 5"
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ChartContainer>
      {current === 0 && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          {t('home.analytics.emptyPeriod')}
        </p>
      )}
      <div className="mt-6 grid grid-cols-2 items-center gap-5 border-t pt-5 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <div>
          <p className="text-xs text-muted-foreground">{t('home.analytics.peak')}</p>
          <p className="tnum mt-2 font-display text-xl font-semibold">
            {value(peak)} <span className="text-xs font-normal text-muted-foreground">{unit}</span>
          </p>
        </div>
        <div className="border-l pl-5">
          <p className="text-xs text-muted-foreground">{t('home.analytics.active')}</p>
          <p className="tnum mt-2 font-display text-xl font-semibold">
            {formatNumber(activeDays)}{' '}
            <span className="text-xs font-normal text-muted-foreground">
              / {t('home.chart.days', { count: rangeDays })}
            </span>
          </p>
        </div>
        <div className="lg:border-l lg:pl-5">
          <p className="text-xs text-muted-foreground">{t('home.analytics.average')}</p>
          <p className="tnum mt-2 font-display text-xl font-semibold">
            {value(Math.round(current / rangeDays))}{' '}
            <span className="text-xs font-normal text-muted-foreground">{unit}</span>
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-accent-foreground"
          aria-expanded={showDetails}
          aria-controls="daily-analytics"
          onClick={() => setShowDetails(!showDetails)}
        >
          {t(showDetails ? 'home.analytics.hideDetails' : 'home.analytics.details')}
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', showDetails && 'rotate-180')}
          />
        </Button>
      </div>
      {showDetails && (
        <div id="daily-analytics" className="mt-6 overflow-x-auto border-t pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">{t('home.analytics.daily')}</h3>
            <a href="#/history" className="text-xs text-accent-foreground hover:underline">
              {t('nav.history')} →
            </a>
          </div>
          <div className="max-h-80 overflow-auto rounded-lg border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-secondary text-muted-foreground">
                <tr>
                  {['date', 'characters', 'sessions', 'durationMs'].map((key) => (
                    <th scope="col" key={key} className="whitespace-nowrap px-4 py-3 font-medium">
                      {t(`home.analytics.columns.${key}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detailPoints.map((point) => (
                  <tr key={point.dateKey} className="border-t hover:bg-muted">
                    <td className="whitespace-nowrap px-4 py-3">{fullDate(point.dateKey)}</td>
                    <td className="tnum px-4 py-3">{formatNumber(point.characters)}</td>
                    <td className="tnum px-4 py-3">{formatNumber(point.sessions)}</td>
                    <td className="tnum whitespace-nowrap px-4 py-3">
                      {formatDuration(point.durationMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {detailPages > 1 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {t('home.analytics.page', { current: currentPage + 1, total: detailPages })}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage === 0}
                  onClick={() => setDetailPage(currentPage - 1)}
                >
                  {t('home.analytics.newer')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage === detailPages - 1}
                  onClick={() => setDetailPage(currentPage + 1)}
                >
                  {t('home.analytics.older')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
