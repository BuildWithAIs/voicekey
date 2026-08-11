import Store from 'electron-store'
import {
  AppConfig,
  AppPreferences,
  ASRConfig,
  ConfigSecretRequest,
  HotkeyConfig,
  LLMRefineConfig,
  TranslationConfig,
} from '../shared/types'
import { defaultLLMRefineConfig, normalizeLLMRefineConfig } from '../shared/llm-config'
import {
  DEFAULT_HOTKEYS,
  MICROPHONE_INPUT,
  STORED_SECRET_PLACEHOLDER,
  TRANSLATION,
} from '../shared/constants'

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
    lowVolumeMode: true,
    microphoneDeviceId: '',
    microphoneDeviceLabel: '',
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
    'openai' in rawConfig ||
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

function normalizeConfigString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizeSecretString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isLegacyEncryptedKey(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX)
}

function isUsableStoredKey(value: string): boolean {
  return Boolean(value) && !isLegacyEncryptedKey(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeASRConfig(config: unknown, defaultLowVolumeMode = true): ASRConfig {
  const rawConfig = isRecord(config) ? config : {}
  return {
    lowVolumeMode:
      typeof rawConfig.lowVolumeMode === 'boolean' ? rawConfig.lowVolumeMode : defaultLowVolumeMode,
    microphoneDeviceId: normalizeConfigString(
      rawConfig.microphoneDeviceId,
      MICROPHONE_INPUT.DEVICE_ID_MAX_LENGTH,
    ),
    microphoneDeviceLabel: normalizeConfigString(
      rawConfig.microphoneDeviceLabel,
      MICROPHONE_INPUT.DEVICE_LABEL_MAX_LENGTH,
    ),
  }
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

  private resolveStoredLLMRefineConfig(config: Partial<LLMRefineConfig>): LLMRefineConfig {
    const normalized = normalizeLLMRefineConfig(config)
    return normalizeLLMRefineConfig({
      ...normalized,
      // The top-level apiKey is a compatibility alias of the active provider.
      apiKey: '',
      openai: {
        ...normalized.openai,
        apiKey: this.resolveStoredKey(normalized.openai.apiKey),
      },
      deepseek: {
        ...normalized.deepseek,
        apiKey: this.resolveStoredKey(normalized.deepseek.apiKey),
      },
      openrouter: {
        ...normalized.openrouter,
        apiKey: this.resolveStoredKey(normalized.openrouter.apiKey),
      },
      custom: {
        ...normalized.custom,
        apiKey: this.resolveStoredKey(normalized.custom.apiKey),
      },
    })
  }

  private prepareLLMRefineConfigForStorage(
    config: Partial<LLMRefineConfig>,
    storedConfig?: Partial<LLMRefineConfig>,
  ): LLMRefineConfig {
    const normalized = normalizeLLMRefineConfig(config)
    const normalizedStored = normalizeLLMRefineConfig(storedConfig ?? config)
    return normalizeLLMRefineConfig({
      ...normalized,
      // normalizeLLMRefineConfig derives this compatibility alias from the active provider.
      apiKey: '',
      openai: {
        ...normalized.openai,
        apiKey: this.prepareKeyForStorage(normalized.openai.apiKey, normalizedStored.openai.apiKey),
      },
      deepseek: {
        ...normalized.deepseek,
        apiKey: this.prepareKeyForStorage(
          normalized.deepseek.apiKey,
          normalizedStored.deepseek.apiKey,
        ),
      },
      openrouter: {
        ...normalized.openrouter,
        apiKey: this.prepareKeyForStorage(
          normalized.openrouter.apiKey,
          normalizedStored.openrouter.apiKey,
        ),
      },
      custom: {
        ...normalized.custom,
        apiKey: this.prepareKeyForStorage(normalized.custom.apiKey, normalizedStored.custom.apiKey),
      },
    })
  }

  private resolveStoredKey(value: string): string {
    // v0.1.9-v0.1.20 stored safeStorage ciphertext with this prefix. This version deliberately
    // never accesses Keychain, so an old ciphertext stays on disk but cannot be used as an API key.
    return isLegacyEncryptedKey(value) ? '' : value
  }

  private prepareKeyForStorage(plainText: string, storedValue: string): string {
    // CONFIG_GET deliberately sends only this marker to the renderer. Preserve the main-process
    // value when an unrelated settings autosave echoes the marker back.
    if (plainText === STORED_SECRET_PLACEHOLDER && storedValue) {
      return storedValue
    }

    // Old safeStorage ciphertext is intentionally unreadable without Keychain. Preserve it during
    // unrelated saves until the user replaces it with a new plaintext key.
    if (plainText === '' && isLegacyEncryptedKey(storedValue)) {
      return storedValue
    }

    return plainText
  }

  private migrate(): void {
    const asrConfig = this.store.get('asr') as unknown
    if (isRecord(asrConfig)) {
      // Old installations had no gain toggle and therefore behaved as if it were disabled.
      // Rewriting the object also removes obsolete GLM provider, endpoint, and API-key fields.
      this.store.set('asr', normalizeASRConfig(asrConfig, false))
    }

    const llmRefineConfig = this.store.get('llmRefine')
    const migratedLLMRefineConfig = migrateLLMRefineConfig(llmRefineConfig)
    if (migratedLLMRefineConfig) {
      const legacyLLMKey = isRecord(llmRefineConfig)
        ? normalizeSecretString(llmRefineConfig.apiKey)
        : ''
      const activeProvider = migratedLLMRefineConfig.provider
      const activeConfig =
        activeProvider === 'custom-compatible'
          ? migratedLLMRefineConfig.custom
          : migratedLLMRefineConfig[activeProvider]
      if (isUsableStoredKey(legacyLLMKey) && !isUsableStoredKey(activeConfig.apiKey)) {
        activeConfig.apiKey = legacyLLMKey
        migratedLLMRefineConfig.apiKey = legacyLLMKey
      }
      this.store.set('llmRefine', migratedLLMRefineConfig)
    }
  }

  getConfig(): AppConfig {
    // Renderer configuration never receives plaintext secrets. New keys are stored directly in
    // electron-store, while old enc: values remain unsupported and appear unconfigured.
    const storedLLMRefine = normalizeLLMRefineConfig(
      this.store.get('llmRefine', defaultConfig.llmRefine),
    )
    const llmRefine = normalizeLLMRefineConfig({
      ...storedLLMRefine,
      apiKey: '',
      openai: {
        ...storedLLMRefine.openai,
        apiKey: isUsableStoredKey(storedLLMRefine.openai.apiKey) ? STORED_SECRET_PLACEHOLDER : '',
      },
      deepseek: {
        ...storedLLMRefine.deepseek,
        apiKey: isUsableStoredKey(storedLLMRefine.deepseek.apiKey) ? STORED_SECRET_PLACEHOLDER : '',
      },
      openrouter: {
        ...storedLLMRefine.openrouter,
        apiKey: isUsableStoredKey(storedLLMRefine.openrouter.apiKey)
          ? STORED_SECRET_PLACEHOLDER
          : '',
      },
      custom: {
        ...storedLLMRefine.custom,
        apiKey: isUsableStoredKey(storedLLMRefine.custom.apiKey) ? STORED_SECRET_PLACEHOLDER : '',
      },
    })
    return {
      app: this.getAppConfig(),
      asr: this.getASRConfig(),
      llmRefine,
      hotkey: this.getHotkeyConfig(),
      translation: this.getTranslationConfig(),
    }
  }

  getConfigSecret(request: ConfigSecretRequest): string {
    const config = this.getLLMRefineConfig()
    if (request.provider === 'custom-compatible') {
      return config.custom.apiKey
    }
    return config[request.provider].apiKey
  }

  getAppConfig(): AppPreferences {
    return this.store.get('app', defaultConfig.app)
  }

  setAppConfig(config: Partial<AppPreferences>): void {
    const current = this.getAppConfig()
    this.store.set('app', { ...current, ...config })
  }

  getASRConfig(): ASRConfig {
    return this.getStoredASRConfig()
  }

  private getStoredASRConfig(): ASRConfig {
    return normalizeASRConfig(this.store.get('asr', defaultConfig.asr))
  }

  setASRConfig(config: Partial<ASRConfig>): void {
    const current = this.getStoredASRConfig()
    this.store.set('asr', {
      lowVolumeMode:
        typeof config.lowVolumeMode === 'boolean' ? config.lowVolumeMode : current.lowVolumeMode,
      microphoneDeviceId: normalizeConfigString(
        config.microphoneDeviceId ?? current.microphoneDeviceId,
        MICROPHONE_INPUT.DEVICE_ID_MAX_LENGTH,
      ),
      microphoneDeviceLabel: normalizeConfigString(
        config.microphoneDeviceLabel ?? current.microphoneDeviceLabel,
        MICROPHONE_INPUT.DEVICE_LABEL_MAX_LENGTH,
      ),
    })
  }

  getLLMRefineConfig(): LLMRefineConfig {
    return this.resolveStoredLLMRefineConfig(this.store.get('llmRefine', defaultConfig.llmRefine))
  }

  resolveLLMRefineConfig(config: Partial<LLMRefineConfig>): LLMRefineConfig {
    const stored = this.getLLMRefineConfig()
    const merged = normalizeLLMRefineConfig({
      ...stored,
      ...config,
      openai: { ...stored.openai, ...(config.openai ?? {}) },
      deepseek: { ...stored.deepseek, ...(config.deepseek ?? {}) },
      openrouter: { ...stored.openrouter, ...(config.openrouter ?? {}) },
      custom: { ...stored.custom, ...(config.custom ?? {}) },
    })

    for (const provider of ['openai', 'deepseek', 'openrouter', 'custom'] as const) {
      if (merged[provider].apiKey === STORED_SECRET_PLACEHOLDER) {
        merged[provider].apiKey = stored[provider].apiKey
      }
    }

    return normalizeLLMRefineConfig(merged)
  }

  setLLMRefineConfig(config: Partial<LLMRefineConfig>): void {
    const stored = this.store.get('llmRefine', defaultConfig.llmRefine)
    const current = normalizeLLMRefineConfig(stored)
    const merged = normalizeLLMRefineConfig({
      ...current,
      ...config,
      openai: {
        ...current.openai,
        ...(config.openai ?? {}),
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
    this.store.set('llmRefine', this.prepareLLMRefineConfigForStorage(merged, stored))
  }

  isLLMRefineEnabled(): boolean {
    return normalizeLLMRefineConfig(this.store.get('llmRefine', defaultConfig.llmRefine)).enabled
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
}

export const configManager = new ConfigManager()
