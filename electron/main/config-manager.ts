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
import { defaultLLMRefineConfig, normalizeLLMRefineConfig } from '../shared/llm-config'
import { DEFAULT_HOTKEYS, MICROPHONE_INPUT, TRANSLATION } from '../shared/constants'

const ENCRYPTED_PREFIX = 'enc:'

interface ConfigSchema {
  app: AppPreferences
  asr: ASRConfig
  llmRefine: LLMRefineConfig
  hotkey: HotkeyConfig
  translation: TranslationConfig
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
    microphoneDeviceId: '',
    microphoneDeviceLabel: '',
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

  if ('provider' in rawConfig && rawConfig.provider !== 'openai-compatible') {
    return normalizeLLMRefineConfig(rawConfig as Partial<LLMRefineConfig>)
  }

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
    'provider' in rawConfig ||
    'reasoning' in rawConfig ||
    'deepseek' in rawConfig ||
    'openrouter' in rawConfig ||
    'custom' in rawConfig ||
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

function normalizeConfigString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
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
    if (plainText.startsWith(ENCRYPTED_PREFIX)) return plainText

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

  private decryptLLMRefineConfig(config: Partial<LLMRefineConfig>): LLMRefineConfig {
    const normalized = normalizeLLMRefineConfig(config)
    return normalizeLLMRefineConfig({
      ...normalized,
      apiKey: this.decryptKey(normalized.apiKey),
      deepseek: {
        ...normalized.deepseek,
        apiKey: this.decryptKey(normalized.deepseek.apiKey),
      },
      openrouter: {
        ...normalized.openrouter,
        apiKey: this.decryptKey(normalized.openrouter.apiKey),
      },
      custom: {
        ...normalized.custom,
        apiKey: this.decryptKey(normalized.custom.apiKey),
      },
    })
  }

  private encryptLLMRefineConfig(config: Partial<LLMRefineConfig>): LLMRefineConfig {
    const normalized = normalizeLLMRefineConfig(config)
    return normalizeLLMRefineConfig({
      ...normalized,
      apiKey: this.encryptKey(normalized.apiKey),
      deepseek: {
        ...normalized.deepseek,
        apiKey: this.encryptKey(normalized.deepseek.apiKey),
      },
      openrouter: {
        ...normalized.openrouter,
        apiKey: this.encryptKey(normalized.openrouter.apiKey),
      },
      custom: {
        ...normalized.custom,
        apiKey: this.encryptKey(normalized.custom.apiKey),
      },
    })
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
      }
      // Always remove the legacy plaintext key, even when apiKeys.cn already exists.
      this.store.delete('asr.apiKey' as never)
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

    const llmRefine = this.decryptLLMRefineConfig(
      this.store.get('llmRefine', defaultConfig.llmRefine),
    )
    this.store.set('llmRefine', this.encryptLLMRefineConfig(llmRefine))
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
    config.microphoneDeviceId = normalizeConfigString(
      config.microphoneDeviceId,
      MICROPHONE_INPUT.DEVICE_ID_MAX_LENGTH,
    )
    config.microphoneDeviceLabel = normalizeConfigString(
      config.microphoneDeviceLabel,
      MICROPHONE_INPUT.DEVICE_LABEL_MAX_LENGTH,
    )
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
      microphoneDeviceId: normalizeConfigString(
        config.microphoneDeviceId ?? current.microphoneDeviceId,
        MICROPHONE_INPUT.DEVICE_ID_MAX_LENGTH,
      ),
      microphoneDeviceLabel: normalizeConfigString(
        config.microphoneDeviceLabel ?? current.microphoneDeviceLabel,
        MICROPHONE_INPUT.DEVICE_LABEL_MAX_LENGTH,
      ),
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
    return this.decryptLLMRefineConfig(this.store.get('llmRefine', defaultConfig.llmRefine))
  }

  setLLMRefineConfig(config: Partial<LLMRefineConfig>): void {
    const current = this.getLLMRefineConfig()
    const merged = normalizeLLMRefineConfig({
      ...current,
      ...config,
      reasoning: {
        ...current.reasoning,
        ...(config.reasoning ?? {}),
      },
      deepseek: {
        ...current.deepseek,
        ...(config.deepseek ?? {}),
      },
      openrouter: {
        ...current.openrouter,
        ...(config.openrouter ?? {}),
      },
      custom: {
        ...current.custom,
        ...(config.custom ?? {}),
      },
    })
    this.store.set('llmRefine', this.encryptLLMRefineConfig(merged))
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
