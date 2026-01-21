import en from './locales/en.json'
import zh from './locales/zh.json'

export const resources = {
  en: { translation: en },
  zh: { translation: zh },
} as const

export type AppLanguage = keyof typeof resources
export type LanguageSetting = AppLanguage | 'system'

export const DEFAULT_LANGUAGE: AppLanguage = 'en'

const normalizeLanguage = (value?: string): AppLanguage => {
  if (!value) {
    return DEFAULT_LANGUAGE
  }

  const normalized = value.toLowerCase()
  if (normalized.startsWith('zh')) {
    return 'zh'
  }

  return 'en'
}

export const resolveLanguage = (
  setting?: LanguageSetting,
  systemLanguage?: string,
): AppLanguage => {
  if (!setting || setting === 'system') {
    return normalizeLanguage(systemLanguage)
  }

  return normalizeLanguage(setting)
}

export const getLocale = (language?: string): string =>
  normalizeLanguage(language) === 'zh' ? 'zh-CN' : 'en-US'
