import * as React from 'react'
import { Search, SlidersHorizontal, Clock, Copy, Trash2, Mic, Type } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { HISTORY_RETENTION_DAYS } from '@electron/shared/constants'
import { getLocale } from '@electron/shared/i18n'
import { cn } from '@/lib/utils'
import { VoiceWave } from '@/components/VoiceWave'
import { countCharacters, type HistoryItem } from '@/lib/stats'

interface DayGroup {
  label: string
  weekday: string
  items: HistoryItem[]
}

export default function HistoryPage() {
  const { t, i18n } = useTranslation()
  const [searchQuery, setSearchQuery] = React.useState('')
  const [sortOrder, setSortOrder] = React.useState<'newest' | 'oldest'>('newest')
  const [items, setItems] = React.useState<HistoryItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)

  const locale = getLocale(i18n.language)
  const numberFormatter = React.useMemo(() => new Intl.NumberFormat(locale), [locale])
  const formatNumber = React.useCallback(
    (value: number) => numberFormatter.format(value),
    [numberFormatter],
  )

  const formatTime = React.useCallback(
    (timestamp: number) =>
      new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
        new Date(timestamp),
      ),
    [locale],
  )

  const weekdayFormatter = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: 'short' }),
    [locale],
  )
  const formatWeekday = React.useCallback(
    (timestamp: number) => weekdayFormatter.format(new Date(timestamp)),
    [weekdayFormatter],
  )

  const formatDateGroup = React.useCallback(
    (timestamp: number) => {
      const date = new Date(timestamp)
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

      if (itemDate.getTime() === today.getTime()) return t('history.today')
      if (itemDate.getTime() === yesterday.getTime()) return t('history.yesterday')

      return new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
        year: itemDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      }).format(date)
    },
    [locale, t],
  )

  const loadHistory = React.useCallback(async () => {
    try {
      setLoading(true)
      const data = await window.electronAPI.getHistory()
      setItems(data)
      setSelectedId((prev) => prev ?? data[0]?.id ?? null)
    } catch (error) {
      console.error('Failed to load history:', error)
      toast.error(t('history.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  React.useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const filteredItems = React.useMemo(() => {
    const filtered = items.filter((item) =>
      item.text.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    return filtered.sort((a, b) =>
      sortOrder === 'newest' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp,
    )
  }, [items, searchQuery, sortOrder])

  const groupedItems = React.useMemo<DayGroup[]>(() => {
    const groups: DayGroup[] = []
    const index = new Map<string, DayGroup>()
    filteredItems.forEach((item) => {
      const label = formatDateGroup(item.timestamp)
      let group = index.get(label)
      if (!group) {
        group = { label, weekday: formatWeekday(item.timestamp), items: [] }
        index.set(label, group)
        groups.push(group)
      }
      group.items.push(item)
    })
    return groups
  }, [filteredItems, formatDateGroup, formatWeekday])

  const selected = React.useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  )

  const copyToClipboard = React.useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text)
      toast.success(t('history.copySuccess'))
    },
    [t],
  )

  const deleteItem = React.useCallback(
    async (id: string) => {
      try {
        await window.electronAPI.deleteHistoryItem(id)
        setItems((prev) => prev.filter((item) => item.id !== id))
        setSelectedId((prev) => (prev === id ? null : prev))
        toast.success(t('history.deleteSuccess'))
      } catch (error) {
        console.error('Failed to delete item:', error)
        toast.error(t('history.deleteFailed'))
      }
    },
    [t],
  )

  const clearAll = React.useCallback(async () => {
    if (!window.confirm(t('history.clearConfirm'))) return
    try {
      await window.electronAPI.clearHistory()
      setItems([])
      setSelectedId(null)
      toast.success(t('history.clearSuccess'))
    } catch (error) {
      console.error('Failed to clear history:', error)
      toast.error(t('history.clearFailed'))
    }
  }, [t])

  const recordCount = t('history.recordCount', {
    count: items.length,
    formattedCount: formatNumber(items.length),
  })

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">{t('history.loading')}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1040px] px-8 py-7">
      {/* 页头 */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            <Clock className="h-3 w-3" />
            {t('history.eyebrow')}
          </span>
          <h1 className="mt-2 font-display text-[27px] font-bold tracking-tight text-foreground">
            {t('history.title')}
          </h1>
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <span>{items.length > 0 ? recordCount : t('history.empty')}</span>
            {items.length > 0 && (
              <>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                <span className="text-muted-foreground/70">
                  {t('history.autoSaveLimit', {
                    count: HISTORY_RETENTION_DAYS,
                    formattedCount: formatNumber(HISTORY_RETENTION_DAYS),
                  })}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('history.searchPlaceholder')}
              className="h-9 pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as 'newest' | 'oldest')}>
            <SelectTrigger className="h-9 w-[124px]">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder={t('history.sortPlaceholder')} />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">{t('history.sortNewest')}</SelectItem>
              <SelectItem value="oldest">{t('history.sortOldest')}</SelectItem>
            </SelectContent>
          </Select>
          {items.length > 0 && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={clearAll}
              title={t('history.clearTitle')}
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="mt-6 rounded-2xl border bg-card shadow-sm">
          <EmptyState
            none={items.length === 0}
            title={
              items.length === 0 ? t('history.emptyTitleNone') : t('history.emptyTitleNoMatch')
            }
            desc={items.length === 0 ? t('history.emptyDescNone') : t('history.emptyDescNoMatch')}
          />
        </div>
      ) : (
        <div className="mt-6 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_332px]">
          {/* 列表 */}
          <div className="flex flex-col gap-5">
            {groupedItems.map((group) => (
              <div key={group.label}>
                <div className="mb-2.5 flex items-center gap-2.5">
                  <span className="font-display text-sm font-semibold text-foreground">
                    {group.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{group.weekday}</span>
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                    {t('history.groupCount', {
                      count: group.items.length,
                      formattedCount: formatNumber(group.items.length),
                    })}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {group.items.map((item) => (
                    <HistoryRow
                      key={item.id}
                      item={item}
                      selected={selectedId === item.id}
                      time={formatTime(item.timestamp)}
                      charLabel={formatNumber(countCharacters(item.text))}
                      seconds={Math.max(1, Math.round((item.duration ?? 0) / 1000))}
                      onSelect={() => setSelectedId(item.id)}
                      onCopy={() => copyToClipboard(item.text)}
                      onDelete={() => deleteItem(item.id)}
                      copyTitle={t('history.copyTitle')}
                      deleteTitle={t('history.deleteTitle')}
                      secondsLabel={(count) =>
                        t('time.seconds', { count, formattedCount: formatNumber(count) })
                      }
                      charUnit={t('home.charUnit')}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* 详情 */}
          <DetailPane
            item={selected}
            formatNumber={formatNumber}
            formatTime={formatTime}
            dateLabel={selected ? formatDateGroup(selected.timestamp) : ''}
            weekday={selected ? formatWeekday(selected.timestamp) : ''}
            onCopy={copyToClipboard}
            onDelete={deleteItem}
          />
        </div>
      )}
    </div>
  )
}

function EmptyState({ none, title, desc }: { none: boolean; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
      <div className="mb-5 grid h-[72px] w-[72px] place-items-center rounded-[22px] bg-accent text-accent-foreground">
        {none ? <Mic className="h-8 w-8" /> : <Search className="h-8 w-8" />}
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-[280px] text-sm leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  )
}

interface HistoryRowProps {
  item: HistoryItem
  selected: boolean
  time: string
  charLabel: string
  seconds: number
  onSelect: () => void
  onCopy: () => void
  onDelete: () => void
  copyTitle: string
  deleteTitle: string
  secondsLabel: (count: number) => string
  charUnit: string
}

function HistoryRow({
  item,
  selected,
  time,
  charLabel,
  seconds,
  onSelect,
  onCopy,
  onDelete,
  copyTitle,
  deleteTitle,
  secondsLabel,
  charUnit,
}: HistoryRowProps) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        'group relative flex cursor-pointer gap-3 rounded-xl border bg-card p-3.5 shadow-sm transition-all hover:-translate-y-px hover:shadow-md',
        selected
          ? 'border-primary ring-3 ring-primary/15'
          : 'border-transparent hover:border-border',
      )}
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-accent text-accent-foreground">
        <Mic className="h-[17px] w-[17px]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[13.5px] leading-relaxed text-foreground">{item.text}</p>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="tnum inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-0.5">
            <Clock className="h-3 w-3" />
            {time}
          </span>
          <span className="tnum inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-0.5">
            <span className="h-3 w-6 text-primary">
              <VoiceWave bars={7} active={false} />
            </span>
            {secondsLabel(seconds)}
          </span>
          <span className="tnum inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-0.5">
            <Type className="h-3 w-3" />
            {charLabel} {charUnit}
          </span>
        </div>
      </div>
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute right-2.5 top-2.5 flex gap-0.5 rounded-lg border bg-card p-0.5 opacity-0 shadow-md transition-opacity group-hover:opacity-100"
      >
        <Button variant="ghost" size="icon-sm" title={copyTitle} onClick={onCopy}>
          <Copy className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title={deleteTitle}
          onClick={onDelete}
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

interface DetailPaneProps {
  item: HistoryItem | null
  formatNumber: (value: number) => string
  formatTime: (timestamp: number) => string
  dateLabel: string
  weekday: string
  onCopy: (text: string) => void
  onDelete: (id: string) => void
}

function DetailPane({
  item,
  formatNumber,
  formatTime,
  dateLabel,
  weekday,
  onCopy,
  onDelete,
}: DetailPaneProps) {
  const { t } = useTranslation()
  if (!item) {
    return (
      <div className="sticky top-0 flex flex-col items-center justify-center rounded-2xl border bg-card px-6 py-14 text-center shadow-sm">
        <div className="mb-4 grid h-[60px] w-[60px] place-items-center rounded-[20px] bg-accent text-accent-foreground">
          <Mic className="h-7 w-7" />
        </div>
        <p className="max-w-[220px] text-sm leading-relaxed text-muted-foreground">
          {t('history.detailPlaceholder')}
        </p>
      </div>
    )
  }

  const seconds = Math.max(1, Math.round((item.duration ?? 0) / 1000))
  const chars = countCharacters(item.text)
  const cpm = Math.round(chars / (seconds / 60))

  return (
    <div className="sticky top-0 flex max-h-[600px] flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="border-b bg-gradient-to-b from-accent/60 to-transparent px-5 pb-4 pt-5">
        <div className="mb-3.5 h-[34px] text-primary">
          <VoiceWave bars={48} active={false} />
        </div>
        <div className="font-display text-[19px] font-semibold text-foreground">
          {formatTime(item.timestamp)}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {dateLabel} · {weekday}
        </div>
      </div>
      <div className="vk-scroll overflow-y-auto px-5 py-4">
        <p className="text-sm leading-[1.8] text-foreground">{item.text}</p>
      </div>
      <div className="grid grid-cols-3 gap-2 px-5 pb-4">
        <DetailStat value={formatNumber(chars)} label={t('history.detail.chars')} />
        <DetailStat value={`${seconds}s`} label={t('history.detail.duration')} />
        <DetailStat value={formatNumber(cpm)} label={t('history.detail.speed')} />
      </div>
      <div className="flex items-center gap-2 border-t px-5 py-3.5">
        <Button className="flex-1" size="sm" onClick={() => onCopy(item.text)}>
          <Copy className="h-4 w-4" />
          {t('history.copyTitle')}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title={t('history.deleteTitle')}
          onClick={() => onDelete(item.id)}
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function DetailStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg bg-secondary px-1.5 py-2.5 text-center">
      <div className="tnum font-display text-[17px] font-semibold text-foreground">{value}</div>
      <div className="mt-0.5 text-[10.5px] text-muted-foreground">{label}</div>
    </div>
  )
}
