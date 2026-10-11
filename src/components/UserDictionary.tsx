import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BookOpen, Plus, Search, Trash2, X } from 'lucide-react'
import { normalizeUserDictionary, USER_DICTIONARY_LIMITS } from '@electron/shared/user-dictionary'
import { Button } from './ui/button'
import { Input } from './ui/input'

export function UserDictionary({
  terms,
  onChange,
  disabled,
}: {
  terms: string[]
  onChange: (terms: string[]) => Promise<boolean>
  disabled: boolean
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState<'invalid' | 'duplicate' | null>(null)
  const search = query.trim().normalize('NFC').toLowerCase()
  const visibleTerms = terms.filter((term) => term.toLowerCase().includes(search))

  async function addTerm() {
    if (disabled || !draft.trim()) return
    try {
      const [term] = normalizeUserDictionary([draft])
      if (terms.includes(term)) {
        setError('duplicate')
        return
      }
      const next = normalizeUserDictionary([...terms, term])
      if (await onChange(next)) {
        setDraft('')
        setQuery('')
        setError(null)
      }
    } catch {
      setError('invalid')
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">{t('dictionary.addHeading')}</h2>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void addTerm()
          }}
        >
          <Input
            aria-label={t('dictionary.term')}
            placeholder={t('dictionary.placeholder')}
            value={draft}
            disabled={disabled}
            maxLength={USER_DICTIONARY_LIMITS.termLength}
            onChange={(event) => {
              setDraft(event.target.value)
              setError(null)
            }}
          />
          <Button type="submit" disabled={disabled || !draft.trim()}>
            <Plus className="h-4 w-4" />
            {t('dictionary.add')}
          </Button>
        </form>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {t(`dictionary.${error}`)}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{t('dictionary.entryHint')}</p>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="dictionary-entries-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="dictionary-entries-heading" className="text-sm font-semibold">
            {t('dictionary.listHeading')}
          </h2>
          <span className="text-xs text-muted-foreground">
            {t('dictionary.count', { count: terms.length, max: USER_DICTIONARY_LIMITS.terms })}
          </span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 pr-10"
            aria-label={t('dictionary.search')}
            placeholder={t('dictionary.searchPlaceholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1 h-8 w-8"
              aria-label={t('dictionary.clearSearch')}
              onClick={() => setQuery('')}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        {search && (
          <p role="status" className="text-xs text-muted-foreground">
            {t('dictionary.results', { count: visibleTerms.length })}
          </p>
        )}
        {visibleTerms.length > 0 ? (
          <ul
            className="divide-y overflow-hidden rounded-xl border bg-card"
            aria-label={t('dictionary.listHeading')}
          >
            {visibleTerms.map((term) => (
              <li
                key={term}
                className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 hover:bg-muted/30"
              >
                <span className="min-w-0 break-all text-sm">{term}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={disabled}
                  aria-label={t('dictionary.remove', { term })}
                  onClick={() => void onChange(terms.filter((entry) => entry !== term))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
            <BookOpen className="mb-1 h-7 w-7 text-muted-foreground/60" />
            <p className="text-sm font-medium">
              {t(search ? 'dictionary.noResults' : 'dictionary.empty')}
            </p>
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              {search ? null : t('dictionary.emptyHint')}
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
