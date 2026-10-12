import { useEffect, useState } from 'react'
import { ArrowUpRight, Info, Keyboard, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { HotkeyKeys } from '@/components/HotkeyKeys'
import InteractiveCharts from '@/components/InteractiveCharts'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { HistorySummary } from '@electron/shared/types'
import { useStatFormatters } from '@/lib/useStatFormatters'
import { characterMilestones } from '@/lib/analytics'

export default function HomePage() {
  const { t } = useTranslation()
  const { formatNumber, formatDuration, locale } = useStatFormatters()
  const [pttKey, setPttKey] = useState('')
  const [stats, setStats] = useState<HistorySummary | null>(null)
  const [failed, setFailed] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    let request = 0
    const refresh = async () => {
      const version = ++request
      try {
        const data = await window.electronAPI.getHistorySummary()
        if (active && version === request) {
          setStats(data)
          setFailed(false)
        }
      } catch {
        if (active && version === request) setFailed(true)
      }
    }
    const config = () => {
      void window.electronAPI
        .getConfig()
        .then((value) => {
          if (active) setPttKey(value.hotkey.pttKey || '')
        })
        .catch(() => {})
    }
    const onFocus = () => {
      void refresh()
      config()
    }
    onFocus()
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh()
    }, 60000)
    window.addEventListener('focus', onFocus)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [revision])

  const milestones = characterMilestones(stats?.totalCharacters ?? 0)
  const target = milestones[milestones.length - 1]
  const effectivePtt =
    pttKey || (window.electronAPI.platform === 'darwin' ? 'Alt' : 'Control+Shift+Space')
  const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 })

  return (
    <div className="achievement-home mx-auto max-w-[1200px] px-5 py-4 lg:px-7">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[24px] font-bold tracking-tight">
            {t('home.achievement.title')}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <Keyboard className="h-4 w-4" />
            <HotkeyKeys value={effectivePtt} />
            {t('home.hero.holdToTalk')}
          </span>
          <Dialog>
            <DialogTrigger asChild>
              <button className="inline-flex items-center gap-1.5 rounded-md p-2 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring">
                {t('home.achievement.method')}
                <Info className="h-3.5 w-3.5" />
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('home.achievement.method')}</DialogTitle>
                <DialogDescription>{t('home.achievement.methodIntro')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm leading-6 text-muted-foreground">
                <p>{t('home.achievement.methodCounts')}</p>
                <p>{t('home.achievement.methodPeriod')}</p>
                <p>{t('home.achievement.methodRetention')}</p>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {failed && (
        <div
          role="alert"
          className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          <span>{t('home.achievement.loadFailed')}</span>
          <Button variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}>
            <RefreshCw className="h-3.5 w-3.5" />
            {t('home.achievement.retry')}
          </Button>
        </div>
      )}
      {!stats ? (
        !failed && (
          <div
            role="status"
            className="mt-6 flex h-72 items-center justify-center rounded-2xl border bg-card text-sm text-muted-foreground"
          >
            {t('common.loading')}
          </div>
        )
      ) : (
        <>
          <section
            className="achievement-total rounded-2xl border p-4 lg:px-5"
            aria-label={t('home.achievement.total')}
          >
            <div className="grid items-center gap-4 min-[1000px]:grid-cols-[1.1fr_1fr]">
              <div>
                <h2 className="text-sm font-medium text-muted-foreground">
                  {t('home.achievement.total')}
                </h2>
                <div className="mt-2 flex flex-wrap items-baseline gap-3">
                  <span className="achievement-number tnum font-display text-[clamp(2.5rem,5vh,4rem)] font-bold leading-[1.12] tracking-[-0.055em]">
                    {formatNumber(stats.totalCharacters)}
                  </span>
                  <span className="text-xl font-semibold text-muted-foreground">
                    {t('home.charUnit')}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-[0.8fr_1.2fr] divide-x border-t pt-3 min-[1000px]:border-t-0 min-[1000px]:pt-0">
                <div className="pr-5">
                  <div className="tnum font-display text-3xl font-semibold">
                    {formatNumber(stats.activeDays)}
                    <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                      {t('home.achievement.dayUnit')}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{t('home.stats.activeDays')}</p>
                </div>
                <div className="pl-5">
                  <div className="tnum font-display text-xl font-semibold leading-9">
                    {formatDuration(stats.totalAudioMs)}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('home.achievement.audio')}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center">
              <div className="min-w-0 flex-1 px-2">
                <div
                  className="relative h-2 rounded-full bg-border/70"
                  role="progressbar"
                  aria-label={t('home.achievement.next')}
                  aria-valuemin={0}
                  aria-valuemax={target}
                  aria-valuenow={stats.totalCharacters}
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-primary"
                    style={{ width: `${Math.min(stats.totalCharacters / target, 1) * 100}%` }}
                  />
                  {milestones.map((value) => (
                    <span
                      key={value}
                      className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${stats.totalCharacters >= value ? 'border-card bg-primary' : 'border-border bg-card'}`}
                      style={{ left: `${(value / target) * 100}%` }}
                    />
                  ))}
                </div>
                <div className="relative mt-3 h-4 text-[11px] text-muted-foreground">
                  {milestones.map((value) => (
                    <span
                      key={value}
                      className="absolute -translate-x-1/2 whitespace-nowrap"
                      style={{ left: `${(value / target) * 100}%` }}
                    >
                      {compact.format(value)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="shrink-0 text-xs md:border-l md:pl-6">
                <p className="text-muted-foreground">
                  {t('home.achievement.next')}{' '}
                  <strong className="ml-1 text-sm font-semibold text-foreground">
                    {formatNumber(target)} {t('home.charUnit')}
                  </strong>
                </p>
                <p className="mt-2 text-muted-foreground">
                  {t('home.achievement.remaining', {
                    value: formatNumber(target - stats.totalCharacters),
                  })}
                </p>
              </div>
            </div>
          </section>
          {stats.activeDays === 0 && (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <ArrowUpRight className="h-4 w-4 text-primary" />
              {t('home.achievement.empty')}
            </p>
          )}
          <div className="achievement-trends">
            <InteractiveCharts days={stats.days} />
          </div>
          <p className="achievement-retention text-[11px] text-muted-foreground">
            {t('home.achievement.retention')}
          </p>
        </>
      )}
    </div>
  )
}
