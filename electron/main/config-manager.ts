import { safeStorage } from 'electron'
import Store from 'electron-store'
import {
  AppConfig,
  AppPreferences,
  ASRConfig,
  ASRProviderType,
  HotkeyConfig,
  LLMRefineConfig,
  TranslationConfig,
} from '../shared/types'
import { normalizeRefineBaseUrl } from '../shared/refine-url'
import { DEFAULT_HOTKEYS, LLM_REFINE, TRANSLATION } from '../shared/constants'

const ENCRYPTED_PREFIX = 'enc:'

interface ConfigSchema {
  app: AppPreferences
  asr: ASRConfig
  llmRefine: LLMRefineConfig
  hotkey: HotkeyConfig
  translation: TranslationConfig
}

const defaultLLMRefineConfig: LLMRefineConfig = {
  enabled: LLM_REFINE.ENABLED,
  endpoint: LLM_REFINE.ENDPOINT,
  model: LLM_REFINE.MODEL,
  apiKey: LLM_REFINE.API_KEY,
  translateOutput: LLM_REFINE.TRANSLATE_OUTPUT,
}

// Reads the "translate refined output" flag, accepting legacy field names from older configs.
function readTranslateOutputFlag(config?: Record<string, unknown>): boolean {
  if (!config) {
    return defaultLLMRefineConfig.translateOutput
  }

  if (typeof config.translateOutput === 'boolean') {
    return config.translateOutput
  }

  if (typeof config.translateToEnglish === 'boolean') {
    return config.translateToEnglish
  }

  if (typeof config.translateChineseToEnglish === 'boolean') {
    return config.translateChineseToEnglish
  }

  return defaultLLMRefineConfig.translateOutput
}

const defaultTranslationConfig: TranslationConfig = {
  enabled: TRANSLATION.ENABLED,
  targetLanguage: TRANSLATION.TARGET_LANGUAGE,
}

const defaultConfig: AppConfig = {
  app: {
    language: 'system',
    autoLaunch: false,
  },
  asr: {
    provider: 'glm',
    region: 'cn',
    apiKeys: {
      cn: '',
      intl: '',
    },
    lowVolumeMode: true,
    endpoint: '',
    language: 'auto',
  },
  llmRefine: defaultLLMRefineConfig,
  hotkey: {
    pttKey: DEFAULT_HOTKEYS.PTT,
    toggleSettings: DEFAULT_HOTKEYS.SETTINGS,
    translateKey: DEFAULT_HOTKEYS.TRANSLATE,
  },
  translation: defaultTranslationConfig,
}

function normalizeLLMRefineConfig(config?: Partial<LLMRefineConfig>): LLMRefineConfig {
  const rawConfig =
    config && typeof config === 'object'
      ? (config as Partial<LLMRefineConfig> & Record<string, unknown>)
      : undefined

  return {
    ...defaultLLMRefineConfig,
    enabled: typeof config?.enabled === 'boolean' ? config.enabled : defaultLLMRefineConfig.enabled,
    endpoint: normalizeRefineBaseUrl(config?.endpoint ?? defaultLLMRefineConfig.endpoint),
    model: config?.model ?? defaultLLMRefineConfig.model,
    apiKey: config?.apiKey ?? defaultLLMRefineConfig.apiKey,
    translateOutput: readTranslateOutputFlag(rawConfig),
  }
}

function readLegacyOpenAICompatibleField(
  config: Record<string, unknown>,
  key: 'endpoint' | 'model' | 'apiKey',
): string {
  const openaiCompatible = config.openaiCompatible
  if (!openaiCompatible || typeof openaiCompatible !== 'object') {
    return defaultLLMRefineConfig[key]
  }

  const value = (openaiCompatible as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : defaultLLMRefineConfig[key]
}

function migrateLLMRefineConfig(config: unknown): LLMRefineConfig | null {
  if (typeof config === 'boolean') {
    return defaultLLMRefineConfig
  }

  if (!config || typeof config !== 'object') {
    return null
  }

  const rawConfig = config as Record<string, unknown>

  if ('provider' in rawConfig || 'openaiCompatible' in rawConfig) {
    if (rawConfig.provider === 'openai-compatible') {
      return normalizeLLMRefineConfig({
        enabled:
          typeof rawConfig.enabled === 'boolean'
            ? rawConfig.enabled
            : defaultLLMRefineConfig.enabled,
        endpoint: readLegacyOpenAICompatibleField(rawConfig, 'endpoint'),
        model: readLegacyOpenAICompatibleField(rawConfig, 'model'),
        apiKey: readLegacyOpenAICompatibleField(rawConfig, 'apiKey'),
      })
    }

    return defaultLLMRefineConfig
  }

  if (
    'endpoint' in rawConfig ||
    'model' in rawConfig ||
    'apiKey' in rawConfig ||
    'enabled' in rawConfig ||
    'translateOutput' in rawConfig ||
    'translateToEnglish' in rawConfig ||
    'translateChineseToEnglish' in rawConfig
  ) {
    return normalizeLLMRefineConfig(rawConfig as Partial<LLMRefineConfig>)
  }

  return null
}

function normalizeASRProvider(provider: unknown): ASRProviderType {
  return provider === 'local-sensevoice' ? 'local-sensevoice' : 'glm'
}

export class ConfigManager {
  private store: Store<ConfigSchema>

  constructor() {
    this.store = new Store<ConfigSchema>({
      defaults: defaultConfig,
      name: 'voice-key-config',
    })
    this.migrate()
  }

  private encryptKey(plainText: string): string {
    if (!plainText) return plainText

    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(plainText)
        return ENCRYPTED_PREFIX + encrypted.toString('base64')
      }
    } catch (error) {
      console.error('[ConfigManager] Failed to encrypt API key:', error)
    }

    return plainText
  }

  private decryptKey(value: string): string {
    if (!value || !value.startsWith(ENCRYPTED_PREFIX)) {
      return value
    }

    try {
      const base64 = value.slice(ENCRYPTED_PREFIX.length)
      const buffer = Buffer.from(base64, 'base64')
      return safeStorage.decryptString(buffer)
    } catch (error) {
      console.error('[ConfigManager] Failed to decrypt API key:', error)
      return ''
    }
  }

  private migrate(): void {
    const asrConfig = this.store.get('asr') as unknown as Record<string, unknown> | undefined
    if (asrConfig?.apiKey) {
      const currentApiKeys = this.store.get('asr.apiKeys', { cn: '', intl: '' })
      if (!currentApiKeys.cn) {
        this.store.set('asr.apiKeys.cn', asrConfig.apiKey)
        this.store.delete('asr.apiKey' as never)
      }
    }

    if (
      asrConfig &&
      typeof asrConfig === 'object' &&
      !Object.prototype.hasOwnProperty.call(asrConfig, 'lowVolumeMode')
    ) {
      this.store.set('asr.lowVolumeMode', false)
    }

    const llmRefineConfig = this.store.get('llmRefine')
    const migratedLLMRefineConfig = migrateLLMRefineConfig(llmRefineConfig)
    if (migratedLLMRefineConfig) {
      this.store.set('llmRefine', migratedLLMRefineConfig)
    }
  }

  // Must be called after app.whenReady() because safeStorage needs ready on Windows/Linux.
  migrateApiKeysEncryption(): void {
    if (!safeStorage.isEncryptionAvailable()) return

    const apiKeys = this.store.get('asr.apiKeys', { cn: '', intl: '' })
    for (const region of ['cn', 'intl'] as const) {
      const key = apiKeys[region]
      if (key && !key.startsWith(ENCRYPTED_PREFIX)) {
        apiKeys[region] = this.encryptKey(key)
      }
    }
    this.store.set('asr.apiKeys', apiKeys)

    const llmRefine = normalizeLLMRefineConfig(this.store.get('llmRefine', defaultConfig.llmRefine))
    if (llmRefine.apiKey && !llmRefine.apiKey.startsWith(ENCRYPTED_PREFIX)) {
      this.store.set('llmRefine', {
        ...llmRefine,
        apiKey: this.encryptKey(llmRefine.apiKey),
      })
    }
  }

  getConfig(): AppConfig {
    return {
      app: this.getAppConfig(),
      asr: this.getASRConfig(),
      llmRefine: this.getLLMRefineConfig(),
      hotkey: this.getHotkeyConfig(),
      translation: this.getTranslationConfig(),
    }
  }

  getAppConfig(): AppPreferences {
    return this.store.get('app', defaultConfig.app)
  }

  setAppConfig(config: Partial<AppPreferences>): void {
    const current = this.getAppConfig()
    this.store.set('app', { ...current, ...config })
  }

  getASRConfig(): ASRConfig {
    const storedConfig = this.store.get('asr', defaultConfig.asr)
    const config: ASRConfig = {
      ...defaultConfig.asr,
      ...storedConfig,
      provider: normalizeASRProvider(storedConfig.provider),
      apiKeys: {
        ...defaultConfig.asr.apiKeys,
        ...(storedConfig.apiKeys ?? {}),
      },
    }
    config.apiKeys = {
      cn: this.decryptKey(config.apiKeys.cn),
      intl: this.decryptKey(config.apiKeys.intl),
    }
    if (!config.region) {
      config.region = 'cn'
    }
    if (typeof config.lowVolumeMode !== 'boolean') {
      config.lowVolumeMode = defaultConfig.asr.lowVolumeMode
    }
    return config
  }

  setASRConfig(config: Partial<ASRConfig>): void {
    const current = this.getASRConfig()
    const merged = {
      ...current,
      ...config,
      provider: normalizeASRProvider(config.provider ?? current.provider),
      apiKeys: {
        ...current.apiKeys,
        ...(config.apiKeys ?? {}),
      },
    }
    if (merged.apiKeys) {
      merged.apiKeys = {
        cn: this.encryptKey(merged.apiKeys.cn),
        intl: this.encryptKey(merged.apiKeys.intl),
      }
    }
    this.store.set('asr', merged)
  }

  getLLMRefineConfig(): LLMRefineConfig {
    const config = normalizeLLMRefineConfig(this.store.get('llmRefine', defaultConfig.llmRefine))
    return {
      ...config,
      apiKey: this.decryptKey(config.apiKey),
    }
  }

  setLLMRefineConfig(config: Partial<LLMRefineConfig>): void {
    const current = this.getLLMRefineConfig()
    const merged = normalizeLLMRefineConfig({ ...current, ...config })
    this.store.set('llmRefine', {
      ...merged,
      apiKey: this.encryptKey(merged.apiKey),
    })
  }

  getHotkeyConfig(): HotkeyConfig {
    const config = this.store.get('hotkey', defaultConfig.hotkey)
    return {
      ...config,
      translateKey: config.translateKey || defaultConfig.hotkey.translateKey,
    }
  }

  setHotkeyConfig(config: Partial<HotkeyConfig>): void {
    const current = this.getHotkeyConfig()
    this.store.set('hotkey', { ...current, ...config })
  }

  getTranslationConfig(): TranslationConfig {
    const config = this.store.get('translation', defaultConfig.translation)
    return {
      enabled:
        typeof config?.enabled === 'boolean' ? config.enabled : defaultConfig.translation.enabled,
      targetLanguage: config?.targetLanguage || defaultConfig.translation.targetLanguage,
    }
  }

  setTranslationConfig(config: Partial<TranslationConfig>): void {
    const current = this.getTranslationConfig()
    this.store.set('translation', { ...current, ...config })
  }

  reset(): void {
    this.store.clear()
  }

  isValid(): boolean {
    const asr = this.getASRConfig()
    if (asr.provider === 'local-sensevoice') {
      return true
    }
    const region = asr.region || 'cn'
    const key = asr.apiKeys?.[region]
    return !!key && key.length > 0
  }
}

export const configManager = new ConfigManager()
