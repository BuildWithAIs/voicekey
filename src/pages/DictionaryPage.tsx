import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BookOpen, Check, Info, Loader2 } from 'lucide-react'
import type { AppConfig } from '@electron/shared/types'
import { normalizeUserDictionary } from '@electron/shared/user-dictionary'
import { UserDictionary } from '@/components/UserDictionary'
import { Button } from '@/components/ui/button'

export default function DictionaryPage() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [reload, setReload] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const pendingSave = useRef(false)

  useEffect(() => {
    let cancelled = false
    setLoadFailed(false)
    void window.electronAPI.getConfig().then(
      (value) => {
        if (!cancelled) setConfig(value)
      },
      () => {
        if (!cancelled) setLoadFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [reload])

  async function saveTerms(terms: string[]): Promise<boolean> {
    if (pendingSave.current) return false
    pendingSave.current = true
    setSaving(true)
    setSaveFailed(false)
    try {
      const userDictionary = normalizeUserDictionary(terms)
      // Persist each explicit action immediately, even if the user navigates away.
      await window.electronAPI.setConfig({ userDictionary })
      setConfig((current) => (current ? { ...current, userDictionary } : current))
      return true
    } catch {
      setSaveFailed(true)
      return false
    } finally {
      pendingSave.current = false
      setSaving(false)
    }
  }

  if (loadFailed) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p role="alert" className="text-muted-foreground">
          {t('dictionary.loadFailed')}
        </p>
        <Button variant="outline" onClick={() => setReload((value) => value + 1)}>
          {t('dictionary.retry')}
        </Button>
      </div>
    )
  }

  if (!config) {
    return (
      <p className="p-8 text-muted-foreground" role="status">
        {t('common.loading')}
      </p>
    )
  }

  const streaming = config.asr.streamingEnabled
  const refinementEnabled = config.llmRefine.enabled || config.llmRefine.translateOutput

  return (
    <div className="mx-auto max-w-[1040px] space-y-6 px-6 py-7 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
            <BookOpen className="h-6 w-6 text-primary" />
            {t('dictionary.title')}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t('dictionary.description')}
          </p>
        </div>
        <span
          role="status"
          className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            !saveFailed && <Check className="h-3.5 w-3.5" />
          )}
          {t(
            saving
              ? 'dictionary.saving'
              : saveFailed
                ? 'dictionary.notSaved'
                : 'dictionary.autoSave',
          )}
        </span>
      </header>

      <div className="flex items-start gap-3 rounded-xl border bg-muted/30 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">
            {t(streaming ? 'dictionary.streamingMode' : 'dictionary.classicMode')}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t(
              streaming
                ? 'dictionary.streaming'
                : refinementEnabled
                  ? 'dictionary.classic'
                  : 'dictionary.inactive',
            )}
          </p>
          {!streaming && !refinementEnabled && (
            <a
              href="#/settings"
              className="inline-block text-xs font-medium text-primary hover:underline"
            >
              {t('dictionary.openSettings')}
            </a>
          )}
        </div>
      </div>

      {saveFailed && (
        <p role="alert" className="text-sm text-destructive">
          {t('dictionary.saveFailed')}
        </p>
      )}
      <UserDictionary terms={config.userDictionary ?? []} onChange={saveTerms} disabled={saving} />
    </div>
  )
}
