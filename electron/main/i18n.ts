import i18next, { type TOptions } from 'i18next'
import { app } from 'electron'
import { DEFAULT_LANGUAGE, resolveLanguage, resources, type LanguageSetting } from '../shared/i18n'

let currentSetting: LanguageSetting = 'system'

export const initMainI18n = async (setting?: LanguageSetting): Promise<void> => {
  currentSetting = setting ?? 'system'
  const resolvedLanguage = resolveLanguage(currentSetting, app.getLocale())

  await i18next.init({
    resources,
    lng: resolvedLanguage,
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: {
      escapeValue: false,
    },
  })
}

export const setMainLanguage = async (setting: LanguageSetting): Promise<void> => {
  currentSetting = setting
  const resolvedLanguage = resolveLanguage(currentSetting, app.getLocale())
  await i18next.changeLanguage(resolvedLanguage)
}

export const t = (key: string, options?: TOptions): string => i18next.t(key, options)
