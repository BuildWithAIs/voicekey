import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import {
  DEFAULT_LANGUAGE,
  resolveLanguage,
  resources,
  type LanguageSetting,
} from '@electron/shared/i18n'

export const initI18n = async (): Promise<void> => {
  let languageSetting: LanguageSetting = 'system'

  try {
    const config = await window.electronAPI?.getConfig?.()
    if (config?.app?.language) {
      languageSetting = config.app.language
    }
  } catch (error) {
    console.warn('[i18n] Failed to load config, using system language.', error)
  }

  const systemLanguage = typeof navigator !== 'undefined' ? navigator.language : DEFAULT_LANGUAGE
  const resolvedLanguage = resolveLanguage(languageSetting, systemLanguage)

  await i18n.use(initReactI18next).init({
    resources,
    lng: resolvedLanguage,
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: {
      escapeValue: false,
    },
  })
}

export default i18n
