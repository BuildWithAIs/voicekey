import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  LOG_FILE_MAX_SIZE_MB,
  LOG_RETENTION_DAYS,
  LOG_TAIL_MAX_BYTES,
} from '@electron/shared/constants'

interface LogViewerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LogViewerDialog({ open, onOpenChange }: LogViewerDialogProps) {
  const { t } = useTranslation()
  const [logContent, setLogContent] = useState('')
  const [loading, setLoading] = useState(false)

  const maxKb = Math.round(LOG_TAIL_MAX_BYTES / 1024)

  const loadLogs = useCallback(async () => {
    setLoading(true)
    try {
      const content = await window.electronAPI.getLogTail({ maxBytes: LOG_TAIL_MAX_BYTES })
      setLogContent(content)
    } catch (error) {
      console.error('Failed to load logs:', error)
      toast.error(t('settings.logLoadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (open) {
      void loadLogs()
    }
  }, [open, loadLogs])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(logContent)
      toast.success(t('settings.logCopied'))
    } catch (error) {
      console.error('Failed to copy logs:', error)
      toast.error(t('settings.logCopyFailed'))
    }
  }

  const handleOpenFolder = async () => {
    try {
      await window.electronAPI.openLogFolder()
    } catch (error) {
      console.error('Failed to open log folder:', error)
      toast.error(t('settings.logOpenFailed'))
    }
  }

  const emptyState = t('settings.logEmpty')
  const content = loading ? t('common.loading') : logContent || emptyState

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('settings.logDialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('settings.logDialogDescription', { size: maxKb })}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border/60 bg-muted/20 p-3 h-72 overflow-auto text-xs font-mono whitespace-pre-wrap text-foreground/90">
          {content}
        </div>

        <DialogFooter className="sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadLogs} disabled={loading}>
              {t('settings.logRefresh')}
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopy} disabled={!logContent}>
              {t('settings.logCopy')}
            </Button>
            <Button variant="outline" size="sm" onClick={handleOpenFolder}>
              {t('settings.logOpenFolder')}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground mt-2 sm:mt-0">
            {t('settings.logsRetentionNote', {
              days: LOG_RETENTION_DAYS,
              size: LOG_FILE_MAX_SIZE_MB,
            })}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
