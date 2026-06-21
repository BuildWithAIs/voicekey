import { ReactNode, useMemo } from 'react'
import { Type, Volume2, CalendarDays, TrendingUp } from 'lucide-react'
import { computeStats, type HistoryItem } from '@/lib/stats'
import { useStatFormatters } from '@/lib/useStatFormatters'

interface StatsOverviewProps {
  historyItems: HistoryItem[]
}

const rangeDays = 7

function StatTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode
  label: string
  value: string
  sub?: ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md">
      <div className="flex items-center gap-2 text-[11.5px] font-semibold text-muted-foreground">
        <span className="grid h-[26px] w-[26px] place-items-center rounded-lg bg-accent text-accent-foreground">
          {icon}
        </span>
        {label}
      </div>
      <div className="tnum mt-3 font-display text-[27px] font-bold tracking-tight text-foreground">
        {value}
      </div>
      {sub ? <div className="mt-1.5 text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  )
}

export default function StatsOverview({ historyItems }: StatsOverviewProps) {
  const { t, formatNumber, formatDuration, formatPeakDay } = useStatFormatters()
  const stats = useMemo(() => computeStats(historyItems, rangeDays), [historyItems])
  const rangeLabel = t('home.range.label', { count: rangeDays })

  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatTile
        icon={<Type className="h-[15px] w-[15px]" />}
        label={t('home.stats.totalCharacters')}
        value={formatNumber(stats.totalCharacters)}
        sub={
          <span>
            {rangeLabel}{' '}
            <span className="font-semibold text-green-600 dark:text-green-500">
              +{formatNumber(stats.recentCharacters)}
            </span>
          </span>
        }
      />
      <StatTile
        icon={<Volume2 className="h-[15px] w-[15px]" />}
        label={t('home.stats.totalAudio')}
        value={formatDuration(stats.totalAudioMs)}
        sub={`${rangeLabel} +${formatDuration(stats.recentAudioMs)}`}
      />
      <StatTile
        icon={<CalendarDays className="h-[15px] w-[15px]" />}
        label={t('home.stats.activeDays')}
        value={formatNumber(stats.activeDays)}
        sub={t('home.stats.activeDaysHint')}
      />
      <StatTile
        icon={<TrendingUp className="h-[15px] w-[15px]" />}
        label={t('home.stats.peakDay')}
        value={stats.peakDayCharacters > 0 ? formatNumber(stats.peakDayCharacters) : '—'}
        sub={
          stats.peakDayCharacters > 0
            ? t('home.stats.peakDayValue', {
                date: formatPeakDay(stats.peakDayKey),
                value: formatNumber(stats.peakDayCharacters),
              })
            : t('home.summary.noActivity')
        }
      />
    </section>
  )
}
