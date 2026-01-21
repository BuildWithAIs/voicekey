import { useMemo } from 'react'
import { FileText, Mic } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getLocale } from '@electron/shared/i18n'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { HistoryItem } from './InteractiveCharts'

interface StatsOverviewProps {
  historyItems: HistoryItem[]
}

const rangeDays = 7

const sumValues = (values: number[]): number => values.reduce((total, value) => total + value, 0)

const clampRangeDays = (value: number): number => Math.min(Math.max(value, 1), 365)

const countCharacters = (text: string): number => text.replace(/\s+/g, '').length

export default function StatsOverview({ historyItems }: StatsOverviewProps) {
  const { t, i18n } = useTranslation()

  const locale = getLocale(i18n.language)
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale])

  const formatNumber = (value: number): string => numberFormatter.format(value)

  const formatDuration = (milliseconds: number): string => {
    const totalMinutes = Math.round(milliseconds / 60000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    if (hours === 0) {
      return t('time.minutes', { count: minutes, formattedCount: formatNumber(minutes) })
    }

    if (minutes === 0) {
      return t('time.hours', { count: hours, formattedCount: formatNumber(hours) })
    }

    return t('time.hoursMinutes', {
      hours: t('time.hours', { count: hours, formattedCount: formatNumber(hours) }),
      minutes: t('time.minutes', { count: minutes, formattedCount: formatNumber(minutes) }),
    })
  }

  const normalizedRangeDays = clampRangeDays(rangeDays)
  const rangeLabel = t('home.range.label', { count: normalizedRangeDays })

  const { totalCharacters, totalAudioMs, recentCharacters, recentAudioMs } = useMemo(() => {
    const totalCharactersValue = sumValues(historyItems.map((item) => countCharacters(item.text)))
    const totalAudioMsValue = sumValues(historyItems.map((item) => item.duration ?? 0))

    // Calculate recent stats (last 7 days by default) without full trend data
    const now = new Date()
    const cutoff = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000)
    const recentItems = historyItems.filter((item) => item.timestamp >= cutoff.getTime())

    const recentCharactersValue = sumValues(recentItems.map((item) => countCharacters(item.text)))
    const recentAudioMsValue = sumValues(recentItems.map((item) => item.duration ?? 0))

    return {
      totalCharacters: totalCharactersValue,
      totalAudioMs: totalAudioMsValue,
      recentCharacters: recentCharactersValue,
      recentAudioMs: recentAudioMsValue,
    }
  }, [historyItems])

  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <Card className="gap-3 py-4">
        <CardHeader className="space-y-1 pb-0">
          <CardDescription className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            {t('home.stats.totalCharacters')}
          </CardDescription>
          <CardTitle className="text-2xl">{formatNumber(totalCharacters)}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{t('common.allTime')}</Badge>
            <span>
              {t('home.stats.recentChange', {
                value: formatNumber(recentCharacters),
                range: rangeLabel,
              })}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader className="space-y-1 pb-0">
          <CardDescription className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-muted-foreground" />
            {t('home.stats.totalAudio')}
          </CardDescription>
          <CardTitle className="text-2xl">{formatDuration(totalAudioMs)}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{t('common.allTime')}</Badge>
            <span>
              {t('home.stats.recentChange', {
                value: formatDuration(recentAudioMs),
                range: rangeLabel,
              })}
            </span>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
