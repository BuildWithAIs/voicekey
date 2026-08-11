import Store from 'electron-store'
import {
  AppConfig,
  AppPreferences,
  ASRConfig,
  ASRProviderType,
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
    const asrConfig = this.store.get('asr') as unknown as Record<string, unknown> | undefined
    const legacyASRKey = normalizeSecretString(asrConfig?.apiKey)
    if (legacyASRKey) {
      const currentApiKeys = this.store.get('asr.apiKeys', { cn: '', intl: '' })
      const currentCNKey = normalizeSecretString(currentApiKeys.cn)
      let migratedCNKey = currentCNKey
      if (!currentCNKey || (!isUsableStoredKey(currentCNKey) && isUsableStoredKey(legacyASRKey))) {
        this.store.set('asr.apiKeys.cn', legacyASRKey)
        migratedCNKey = legacyASRKey
      }
      if (isUsableStoredKey(migratedCNKey)) {
        // Delete the deprecated duplicate only after a usable key exists in the canonical field.
        // This fixes v0.1.18's data-loss bug without resurrecting a stale backup after users clear it.
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
    const storedAsr = this.getStoredASRConfig()
    const asr: ASRConfig = {
      ...storedAsr,
      apiKeys: {
        cn: isUsableStoredKey(storedAsr.apiKeys.cn) ? STORED_SECRET_PLACEHOLDER : '',
        intl: isUsableStoredKey(storedAsr.apiKeys.intl) ? STORED_SECRET_PLACEHOLDER : '',
      },
    }
    const storedLLMRefine = normalizeLLMRefineConfig(
      this.store.get('llmRefine', defaultConfig.llmRefine),
    )
    const llmRefine = normalizeLLMRefineConfig({
      ...storedLLMRefine,
      apiKey: '',
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
      asr,
      llmRefine,
      hotkey: this.getHotkeyConfig(),
      translation: this.getTranslationConfig(),
    }
  }

  getConfigSecret(request: ConfigSecretRequest): string {
    if (request.scope === 'asr') {
      return this.getASRConfig().apiKeys[request.region]
    }

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
    const config = this.getStoredASRConfig()
    return {
      ...config,
      apiKeys: {
        cn: this.resolveStoredKey(config.apiKeys.cn),
        intl: this.resolveStoredKey(config.apiKeys.intl),
      },
    }
  }

  private getStoredASRConfig(): ASRConfig {
    const storedConfig = this.store.get('asr', defaultConfig.asr)
    const config: ASRConfig = {
      provider: normalizeASRProvider(storedConfig.provider),
      region: storedConfig.region === 'intl' ? 'intl' : 'cn',
      apiKeys: {
        ...defaultConfig.asr.apiKeys,
        ...(storedConfig.apiKeys ?? {}),
      },
      lowVolumeMode:
        typeof storedConfig.lowVolumeMode === 'boolean'
          ? storedConfig.lowVolumeMode
          : defaultConfig.asr.lowVolumeMode,
      microphoneDeviceId: normalizeConfigString(
        storedConfig.microphoneDeviceId,
        MICROPHONE_INPUT.DEVICE_ID_MAX_LENGTH,
      ),
      microphoneDeviceLabel: normalizeConfigString(
        storedConfig.microphoneDeviceLabel,
        MICROPHONE_INPUT.DEVICE_LABEL_MAX_LENGTH,
      ),
      endpoint: normalizeSecretString(storedConfig.endpoint),
      language: normalizeSecretString(storedConfig.language) || defaultConfig.asr.language,
    }
    config.apiKeys = {
      cn: normalizeSecretString(config.apiKeys.cn),
      intl: normalizeSecretString(config.apiKeys.intl),
    }
    return config
  }

  setASRConfig(config: Partial<ASRConfig>): void {
    const stored = this.getStoredASRConfig()
    const current = stored
    const { apiKey: _legacyApiKey, ...configWithoutLegacyKey } = config
    const merged = {
      ...current,
      ...configWithoutLegacyKey,
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
        cn: this.prepareKeyForStorage(merged.apiKeys.cn, stored.apiKeys?.cn ?? ''),
        intl: this.prepareKeyForStorage(merged.apiKeys.intl, stored.apiKeys?.intl ?? ''),
      }
    }
    const rawStored = this.store.get('asr', defaultConfig.asr) as unknown
    this.store.set('asr', {
      ...(isRecord(rawStored) ? rawStored : {}),
      ...merged,
    })
  }

  getLLMRefineConfig(): LLMRefineConfig {
    return this.resolveStoredLLMRefineConfig(this.store.get('llmRefine', defaultConfig.llmRefine))
  }

  resolveASRConfig(config: Partial<ASRConfig>): ASRConfig {
    const stored = this.getASRConfig()
    return {
      ...stored,
      ...config,
      apiKeys: {
        cn:
          config.apiKeys?.cn === STORED_SECRET_PLACEHOLDER
            ? stored.apiKeys.cn
            : (config.apiKeys?.cn ?? stored.apiKeys.cn),
        intl:
          config.apiKeys?.intl === STORED_SECRET_PLACEHOLDER
            ? stored.apiKeys.intl
            : (config.apiKeys?.intl ?? stored.apiKeys.intl),
      },
    }
  }

  resolveLLMRefineConfig(config: Partial<LLMRefineConfig>): LLMRefineConfig {
    const stored = this.getLLMRefineConfig()
    const merged = normalizeLLMRefineConfig({
      ...stored,
      ...config,
      deepseek: { ...stored.deepseek, ...(config.deepseek ?? {}) },
      openrouter: { ...stored.openrouter, ...(config.openrouter ?? {}) },
      custom: { ...stored.custom, ...(config.custom ?? {}) },
    })

    for (const provider of ['deepseek', 'openrouter', 'custom'] as const) {
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
