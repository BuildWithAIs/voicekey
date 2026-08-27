import { ReactNode, useEffect, useMemo, useState } from 'react'
import { Mic, Hash, Clock, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { VoiceWave } from '@/components/VoiceWave'
import { HotkeyKeys } from '@/components/HotkeyKeys'
import StatsOverview from '@/components/StatsOverview'
import InteractiveCharts from '@/components/InteractiveCharts'
import { computeStats, type HistoryItem } from '@/lib/stats'
import { useStatFormatters } from '@/lib/useStatFormatters'

function greetingKey(): string {
  const hour = new Date().getHours()
  if (hour < 6) return 'night'
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

function Mini({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div>
      <div className="tnum font-display text-[21px] font-semibold text-foreground">{value}</div>
      <div className="mt-1 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        {icon}
        {label}
      </div>
    </div>
  )
}

export default function HomePage() {
  const { t } = useTranslation()
  const { formatNumber, formatDuration } = useStatFormatters()
  const [pttKey, setPttKey] = useState('')
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.electronAPI
      .getConfig()
      .then((config) => setPttKey(config?.hotkey?.pttKey ?? ''))
      .catch((error) => console.error('Failed to load config:', error))
  }, [])

  useEffect(() => {
    const loadHistory = async () => {
      try {
        setLoading(true)
        const data = await window.electronAPI.getHistory()
        setHistoryItems(data)
      } catch (error) {
        console.error('Failed to load history:', error)
      } finally {
        setLoading(false)
      }
    }
    loadHistory()
  }, [])

  const stats = useMemo(() => computeStats(historyItems), [historyItems])
  const isMac = window.electronAPI.platform === 'darwin'
  const effectivePtt = pttKey || (isMac ? 'Alt' : 'Control+Shift+Space')

  return (
    <div className="mx-auto max-w-[940px] px-8 py-7">
      {/* 页头 */}
      <div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
          <Mic className="h-3 w-3" />
          {t('home.eyebrow')}
        </span>
        <h1 className="mt-2 font-display text-[27px] font-bold tracking-tight text-foreground">
          {t(`home.greeting.${greetingKey()}`)}
        </h1>
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          {t('home.subtitle')}
          {loading && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
        </p>
      </div>

      {/* 英雄区 */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[1.05fr_1fr]">
        {/* 按住说话 */}
        <div className="vk-brand-gradient relative flex min-h-[224px] flex-col justify-between overflow-hidden rounded-2xl border border-white/10 p-6 text-white shadow-[0_1px_2px_rgb(0_0_0/0.05),0_20px_36px_-20px_color-mix(in_oklch,var(--primary)_55%,transparent)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(380px_200px_at_90%_-15%,rgba(255,255,255,0.16),transparent_70%)]" />
          <div className="relative z-10 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/85">
            <Mic className="h-3.5 w-3.5" />
            {t('home.hero.standby')}
          </div>
          <div className="relative z-10 mt-4 flex items-center gap-4">
            <div className="rounded-2xl border border-white/25 bg-white/15 px-4 py-4 backdrop-blur">
              <HotkeyKeys value={effectivePtt} />
            </div>
            <div>
              <h3 className="text-[18px] font-semibold">{t('home.hero.holdToTalk')}</h3>
              <p className="mt-1 text-xs leading-relaxed text-white/80">
                {t('home.hero.holdHint')}
              </p>
            </div>
          </div>
          <div className="relative z-10 mt-4 h-10 text-white/90">
            <VoiceWave bars={42} active level={0.5} />
          </div>
        </div>

        {/* 今日字数 */}
        <div className="flex flex-col justify-between rounded-2xl border bg-card p-6 shadow-sm">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
              {t('home.stats.todayCharacters')}
            </span>
            <div className="tnum mt-3 font-display text-[64px] font-bold leading-[0.95] tracking-tight text-foreground">
              {formatNumber(stats.todayCharacters)}
              <span className="ml-2 text-[22px] font-semibold text-muted-foreground">
                {t('home.charUnit')}
              </span>
            </div>
          </div>
          <div className="mt-5 flex gap-7 border-t pt-5">
            <Mini
              icon={<Hash className="h-3 w-3" />}
              value={formatNumber(stats.todaySessions)}
              label={t('home.stats.todaySessions')}
            />
            <Mini
              icon={<Clock className="h-3 w-3" />}
              value={formatDuration(stats.todayDuration)}
              label={t('home.stats.todayDuration')}
            />
            <Mini
              icon={<TrendingUp className="h-3 w-3" />}
              value={formatNumber(stats.recentCharacters)}
              label={t('home.recent7')}
            />
          </div>
        </div>
      </div>

      <div className="mt-4">
        <StatsOverview historyItems={historyItems} />
      </div>

      <div className="mt-4">
        <InteractiveCharts historyItems={historyItems} loading={loading} />
      </div>
    </div>
  )
}
