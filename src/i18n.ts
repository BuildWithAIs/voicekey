import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_LANGUAGE, resolveLanguage, resources } from '@electron/shared/i18n'
import type { LanguageSnapshot } from '@electron/shared/types'

export const initI18n = async (): Promise<void> => {
  let snapshot: LanguageSnapshot | null = null

  try {
    snapshot = await window.electronAPI?.getAppLanguage?.()
  } catch (error) {
    console.warn('[i18n] Failed to load language snapshot, using default.', error)
  }

  const systemLanguage = typeof navigator !== 'undefined' ? navigator.language : DEFAULT_LANGUAGE
  const resolvedLanguage =
    snapshot?.resolved ?? resolveLanguage('system', systemLanguage) ?? DEFAULT_LANGUAGE

  await i18n.use(initReactI18next).init({
    resources,
    lng: resolvedLanguage,
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: {
      escapeValue: false,
    },
  })

  if (typeof document !== 'undefined') {
    document.documentElement.lang = resolvedLanguage
  }
}

export default i18n
