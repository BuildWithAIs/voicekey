import * as React from 'react'
import { Search, Filter, Clock, Copy, Trash2, Mic } from 'lucide-react'
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
import { getLocale } from '@electron/shared/i18n'

interface HistoryItem {
  id: string
  text: string
  timestamp: number
  duration?: number
}

export default function HistoryPage() {
  const { t, i18n } = useTranslation()
  const [searchQuery, setSearchQuery] = React.useState('')
  const [sortOrder, setSortOrder] = React.useState<'newest' | 'oldest'>('newest')
  const [items, setItems] = React.useState<HistoryItem[]>([])
  const [loading, setLoading] = React.useState(true)

  const locale = getLocale(i18n.language)
  const numberFormatter = React.useMemo(() => new Intl.NumberFormat(locale), [locale])

  const formatNumber = React.useCallback(
    (value: number) => numberFormatter.format(value),
    [numberFormatter],
  )

  const formatTime = React.useCallback(
    (timestamp: number) => {
      const date = new Date(timestamp)
      return new Intl.DateTimeFormat(locale, {
        hour: 'numeric',
        minute: 'numeric',
      }).format(date)
    },
    [locale],
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

    return filtered.sort((a, b) => {
      if (sortOrder === 'newest') {
        return b.timestamp - a.timestamp
      }
      return a.timestamp - b.timestamp
    })
  }, [items, searchQuery, sortOrder])

  const groupedItems = React.useMemo(() => {
    const groups: Record<string, HistoryItem[]> = {}
    filteredItems.forEach((item) => {
      const group = formatDateGroup(item.timestamp)
      if (!groups[group]) groups[group] = []
      groups[group].push(item)
    })
    return groups
  }, [filteredItems, formatDateGroup])

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
      toast.success(t('history.clearSuccess'))
    } catch (error) {
      console.error('Failed to clear history:', error)
      toast.error(t('history.clearFailed'))
    }
  }, [t])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">{t('history.loading')}</p>
      </div>
    )
  }

  const recordCount = t('history.recordCount', {
    count: items.length,
    formattedCount: formatNumber(items.length),
  })

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex items-center justify-between sticky pb-6 top-0 z-10 bg-background/80 backdrop-blur-md  transition-all duration-300">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('history.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1.5 flex items-center gap-2">
            <span>{items.length > 0 ? recordCount : t('history.empty')}</span>
            {items.length > 0 && (
              <>
                <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                <span className="text-muted-foreground/70">
                  {t('history.autoSaveLimit', {
                    count: 1000,
                    formattedCount: formatNumber(1000),
                  })}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64 group/search">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/70 group-focus-within/search:text-primary transition-colors" />
            <Input
              placeholder={t('history.searchPlaceholder')}
              className="pl-9 bg-secondary/30 border-transparent hover:bg-secondary/50 focus:bg-background transition-all duration-200"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as 'newest' | 'oldest')}>
            <SelectTrigger className="w-[140px] bg-secondary/30 border-transparent hover:bg-secondary/50 transition-colors">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
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
              size="sm"
              onClick={clearAll}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar rounded-xl border border-border/40 px-3">
        {Object.entries(groupedItems).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-muted-foreground">
            <div className="bg-secondary/30 p-8 rounded-full mb-6 ring-1 ring-border/50">
              <Search className="h-10 w-10 opacity-40 text-primary/60" />
            </div>
            <p className="text-lg font-medium text-foreground/80">
              {items.length === 0 ? t('history.emptyTitleNone') : t('history.emptyTitleNoMatch')}
            </p>
            <p className="text-sm mt-2 text-muted-foreground/60 max-w-xs text-center">
              {items.length === 0 ? t('history.emptyDescNone') : t('history.emptyDescNoMatch')}
            </p>
          </div>
        ) : (
          <div className="space-y-8 pb-10 mt-4">
            {Object.entries(groupedItems).map(([group, groupItems]) => (
              <div key={group} className="space-y-2">
                <div className="">
                  <h3 className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-widest pl-2 mb-2 backdrop-blur-[2px]">
                    {group}
                  </h3>
                </div>
                <div className="grid gap-2">
                  {groupItems.map((item) => (
                    <div
                      key={item.id}
                      className="group relative flex items-start gap-4 p-4 rounded-xl border border-transparent hover:bg-secondary/40 hover:border-border/40 transition-all duration-200"
                    >
                      <div className="flex-shrink-0 mt-1">
                        <div className="h-9 w-9 rounded-full bg-primary/5 ring-1 ring-primary/10 flex items-center justify-center text-primary/80 group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                          <Mic className="h-4.5 w-4.5" />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0 grid gap-2">
                        <p className="text-sm text-foreground/90 leading-relaxed font-medium line-clamp-3 group-hover:text-foreground transition-colors selection:bg-primary/20">
                          {item.text}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground/60 group-hover:text-muted-foreground/80 transition-colors">
                          <div className="flex items-center gap-1.5 bg-secondary/30 px-2 py-0.5 rounded-md">
                            <Clock className="h-3 w-3" />
                            <span className="tabular-nums font-medium">
                              {formatTime(item.timestamp)}
                            </span>
                          </div>
                          {item.duration && (
                            <div className="flex items-center gap-1.5 bg-secondary/30 px-2 py-0.5 rounded-md">
                              <span className="font-medium">
                                {t('time.seconds', {
                                  count: Math.round(item.duration / 1000),
                                  formattedCount: formatNumber(Math.round(item.duration / 1000)),
                                })}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 absolute right-2 top-2 scale-95 group-hover:scale-100">
                        <div className="flex items-center bg-background/95 backdrop-blur shadow-sm border border-border/40 rounded-lg p-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="cursor-pointer h-8 w-8 text-muted-foreground hover:text-foreground rounded-md transition-colors"
                            onClick={() => copyToClipboard(item.text)}
                            title={t('history.copyTitle')}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <div className="w-px h-4 bg-border/60 mx-1" />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="cursor-pointer h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                            onClick={() => deleteItem(item.id)}
                            title={t('history.deleteTitle')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
