import { useMemo } from 'react'
import { FileText, Mic, Hash, Clock, CalendarDays, TrendingUp } from 'lucide-react'
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

const buildDateKey = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getTodayBounds = (): { start: number; end: number } => {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  return { start: start.getTime(), end: end.getTime() }
}

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

  const {
    totalCharacters,
    totalAudioMs,
    recentCharacters,
    recentAudioMs,
    todaySessions,
    todayDuration,
    todayCharacters,
    activeDays,
    peakDayCharacters,
    peakDayDate,
  } = useMemo(() => {
    const totalCharactersValue = sumValues(historyItems.map((item) => countCharacters(item.text)))
    const totalAudioMsValue = sumValues(historyItems.map((item) => item.duration ?? 0))

    // Recent stats (last 7 days)
    const now = new Date()
    const cutoff = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000)
    const recentItems = historyItems.filter((item) => item.timestamp >= cutoff.getTime())
    const recentCharactersValue = sumValues(recentItems.map((item) => countCharacters(item.text)))
    const recentAudioMsValue = sumValues(recentItems.map((item) => item.duration ?? 0))

    // Today stats
    const { start: todayStart, end: todayEnd } = getTodayBounds()
    const todayItems = historyItems.filter(
      (item) => item.timestamp >= todayStart && item.timestamp <= todayEnd,
    )
    const todaySessionsValue = todayItems.length
    const todayDurationValue = sumValues(todayItems.map((item) => item.duration ?? 0))
    const todayCharactersValue = sumValues(todayItems.map((item) => countCharacters(item.text)))

    // Active days & peak day
    const dailyMap = new Map<string, number>()
    historyItems.forEach((item) => {
      const key = buildDateKey(new Date(item.timestamp))
      dailyMap.set(key, (dailyMap.get(key) ?? 0) + countCharacters(item.text))
    })

    const activeDaysValue = dailyMap.size

    let peakDayCharactersValue = 0
    let peakDayKey: string | null = null
    dailyMap.forEach((chars, key) => {
      if (chars > peakDayCharactersValue) {
        peakDayCharactersValue = chars
        peakDayKey = key
      }
    })

    return {
      totalCharacters: totalCharactersValue,
      totalAudioMs: totalAudioMsValue,
      recentCharacters: recentCharactersValue,
      recentAudioMs: recentAudioMsValue,
      todaySessions: todaySessionsValue,
      todayDuration: todayDurationValue,
      todayCharacters: todayCharactersValue,
      activeDays: activeDaysValue,
      peakDayCharacters: peakDayCharactersValue,
      peakDayDate: peakDayKey,
    }
  }, [historyItems])

  const formatPeakDay = (dateKey: string | null): string => {
    if (!dateKey) return '-'
    const date = new Date(`${dateKey}T00:00:00`)
    return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
  }

  return (
    <section className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {/* Today Sessions */}
      <Card className="gap-3 py-4">
        <CardHeader className="space-y-1 pb-0">
          <CardDescription className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-muted-foreground" />
            {t('home.stats.todaySessions')}
          </CardDescription>
          <CardTitle className="text-2xl">{formatNumber(todaySessions)}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{t('common.today')}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Today Duration */}
      <Card className="gap-3 py-4">
        <CardHeader className="space-y-1 pb-0">
          <CardDescription className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            {t('home.stats.todayDuration')}
          </CardDescription>
          <CardTitle className="text-2xl">{formatDuration(todayDuration)}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{t('common.today')}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Today Characters */}
      <Card className="gap-3 py-4">
        <CardHeader className="space-y-1 pb-0">
          <CardDescription className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            {t('home.stats.todayCharacters')}
          </CardDescription>
          <CardTitle className="text-2xl">{formatNumber(todayCharacters)}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{t('common.today')}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Active Days */}
      <Card className="gap-3 py-4">
        <CardHeader className="space-y-1 pb-0">
          <CardDescription className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            {t('home.stats.activeDays')}
          </CardDescription>
          <CardTitle className="text-2xl">{formatNumber(activeDays)}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{t('common.allTime')}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Total Characters */}
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

      {/* Total Audio */}
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

      {/* Peak Day */}
      <Card className="gap-3 py-4">
        <CardHeader className="space-y-1 pb-0">
          <CardDescription className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            {t('home.stats.peakDay')}
          </CardDescription>
          <CardTitle className="text-2xl">
            {peakDayCharacters > 0 ? formatNumber(peakDayCharacters) : '-'}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{t('common.allTime')}</Badge>
            {peakDayCharacters > 0 && (
              <span>
                {t('home.stats.peakDayValue', {
                  date: formatPeakDay(peakDayDate),
                  value: formatNumber(peakDayCharacters),
                })}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
