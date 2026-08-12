import { LLM_PROVIDERS, LLM_REASONING, LLM_REFINE } from './constants'
import { normalizeRefineBaseUrl } from './refine-url'
import type {
  CustomCompatibleLLMConfig,
  DeepSeekConfig,
  LLMProvider,
  LLMReasoningLevel,
  LLMRefineConfig,
  OpenAIConfig,
  OpenRouterConfig,
  OpenRouterModel,
} from './types'

export interface ResolvedLLMConnection {
  provider: LLMProvider
  endpoint: string
  apiKey: string
  model: string
}

const DEFAULT_DEEPSEEK_CONFIG: DeepSeekConfig = {
  apiKey: LLM_REFINE.API_KEY,
  model: LLM_PROVIDERS.DEFAULT_DEEPSEEK_MODEL,
}

const DEFAULT_OPENAI_CONFIG: OpenAIConfig = {
  apiKey: LLM_REFINE.API_KEY,
  model: LLM_PROVIDERS.DEFAULT_OPENAI_MODEL,
}

const DEFAULT_OPENROUTER_CONFIG: OpenRouterConfig = {
  apiKey: LLM_REFINE.API_KEY,
  model: LLM_PROVIDERS.DEFAULT_OPENROUTER_MODEL,
}

const DEFAULT_CUSTOM_CONFIG: CustomCompatibleLLMConfig = {
  endpoint: LLM_REFINE.ENDPOINT,
  model: LLM_REFINE.MODEL,
  apiKey: LLM_REFINE.API_KEY,
}

export const defaultLLMRefineConfig: LLMRefineConfig = {
  enabled: LLM_REFINE.ENABLED,
  provider: LLM_REFINE.PROVIDER,
  endpoint: LLM_PROVIDERS.DEEPSEEK_ENDPOINT,
  model: DEFAULT_DEEPSEEK_CONFIG.model,
  apiKey: LLM_REFINE.API_KEY,
  translateOutput: LLM_REFINE.TRANSLATE_OUTPUT,
  openai: DEFAULT_OPENAI_CONFIG,
  deepseek: DEFAULT_DEEPSEEK_CONFIG,
  openrouter: DEFAULT_OPENROUTER_CONFIG,
  custom: DEFAULT_CUSTOM_CONFIG,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

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

function normalizeProvider(value: unknown, rawConfig?: Record<string, unknown>): LLMProvider {
  if (
    value === 'openai' ||
    value === 'deepseek' ||
    value === 'openrouter' ||
    value === 'custom-compatible'
  ) {
    return value
  }

  const endpoint = normalizeRefineBaseUrl(readString(rawConfig?.endpoint))
  const lowerEndpoint = endpoint.toLowerCase()

  if (lowerEndpoint.includes('api.openai.com')) {
    return 'openai'
  }

  if (lowerEndpoint.includes('api.deepseek.com')) {
    return 'deepseek'
  }

  if (lowerEndpoint.includes('openrouter.ai')) {
    return 'openrouter'
  }

  if (endpoint || readString(rawConfig?.model) || readString(rawConfig?.apiKey)) {
    return 'custom-compatible'
  }

  return LLM_REFINE.PROVIDER
}

function normalizeOpenAIModel(value: unknown): OpenAIConfig['model'] {
  const model = readString(value).trim()
  return model === LLM_PROVIDERS.DEFAULT_OPENAI_MODEL ? model : LLM_PROVIDERS.DEFAULT_OPENAI_MODEL
}

function normalizeDeepSeekModel(value: unknown): DeepSeekConfig['model'] {
  const model = readString(value).trim()
  return LLM_PROVIDERS.DEEPSEEK_MODELS.includes(
    model as (typeof LLM_PROVIDERS.DEEPSEEK_MODELS)[number],
  )
    ? (model as DeepSeekConfig['model'])
    : LLM_PROVIDERS.DEFAULT_DEEPSEEK_MODEL
}

function isBuiltInDeepSeekReasoningModel(model: string): boolean {
  return LLM_PROVIDERS.DEEPSEEK_MODELS.includes(
    model as (typeof LLM_PROVIDERS.DEEPSEEK_MODELS)[number],
  )
}

function findBuiltInOpenRouterModel(model: string) {
  return LLM_PROVIDERS.OPENROUTER_MODELS.find((option) => option.id === model)
}

function isBuiltInOpenRouterModel(model: string): model is OpenRouterModel {
  return findBuiltInOpenRouterModel(model) !== undefined
}

function normalizeOpenRouterModel(value: unknown): OpenRouterModel {
  const model = readString(value).trim()
  return isBuiltInOpenRouterModel(model) ? model : LLM_PROVIDERS.DEFAULT_OPENROUTER_MODEL
}

function normalizeDeepSeekConfig(
  value: unknown,
  rawConfig: Record<string, unknown> | undefined,
  provider: LLMProvider,
): DeepSeekConfig {
  const raw = isRecord(value) ? value : undefined
  const legacyModel = provider === 'deepseek' ? rawConfig?.model : undefined
  const legacyApiKey = provider === 'deepseek' ? rawConfig?.apiKey : undefined

  return {
    apiKey: readString(raw?.apiKey, readString(legacyApiKey, DEFAULT_DEEPSEEK_CONFIG.apiKey)),
    model: normalizeDeepSeekModel(raw?.model ?? legacyModel ?? DEFAULT_DEEPSEEK_CONFIG.model),
  }
}

function normalizeOpenAIConfig(
  value: unknown,
  rawConfig: Record<string, unknown> | undefined,
  provider: LLMProvider,
): OpenAIConfig {
  const raw = isRecord(value) ? value : undefined
  const legacyModel = provider === 'openai' ? rawConfig?.model : undefined
  const legacyApiKey = provider === 'openai' ? rawConfig?.apiKey : undefined

  return {
    apiKey: readString(raw?.apiKey, readString(legacyApiKey, DEFAULT_OPENAI_CONFIG.apiKey)),
    model: normalizeOpenAIModel(raw?.model ?? legacyModel),
  }
}

function normalizeOpenRouterConfig(
  value: unknown,
  rawConfig: Record<string, unknown> | undefined,
  provider: LLMProvider,
): OpenRouterConfig {
  const raw = isRecord(value) ? value : undefined
  const legacyModel = provider === 'openrouter' ? rawConfig?.model : undefined
  const legacyApiKey = provider === 'openrouter' ? rawConfig?.apiKey : undefined

  return {
    apiKey: readString(raw?.apiKey, readString(legacyApiKey, DEFAULT_OPENROUTER_CONFIG.apiKey)),
    model: normalizeOpenRouterModel(raw?.model ?? legacyModel),
  }
}

function normalizeCustomConfig(
  value: unknown,
  rawConfig: Record<string, unknown> | undefined,
  provider: LLMProvider,
): CustomCompatibleLLMConfig {
  const raw = isRecord(value) ? value : undefined
  const legacyEndpoint = provider === 'custom-compatible' ? rawConfig?.endpoint : undefined
  const legacyModel = provider === 'custom-compatible' ? rawConfig?.model : undefined
  const legacyApiKey = provider === 'custom-compatible' ? rawConfig?.apiKey : undefined

  return {
    endpoint: normalizeRefineBaseUrl(
      readString(raw?.endpoint, readString(legacyEndpoint, DEFAULT_CUSTOM_CONFIG.endpoint)),
    ),
    model: readString(raw?.model, readString(legacyModel, DEFAULT_CUSTOM_CONFIG.model)),
    apiKey: readString(raw?.apiKey, readString(legacyApiKey, DEFAULT_CUSTOM_CONFIG.apiKey)),
  }
}

export function resolveLLMConnection(config: LLMRefineConfig): ResolvedLLMConnection {
  if (config.provider === 'openai') {
    return {
      provider: 'openai',
      endpoint: LLM_PROVIDERS.OPENAI_ENDPOINT,
      model: config.openai.model,
      apiKey: config.openai.apiKey,
    }
  }

  if (config.provider === 'deepseek') {
    return {
      provider: 'deepseek',
      endpoint: LLM_PROVIDERS.DEEPSEEK_ENDPOINT,
      model: config.deepseek.model,
      apiKey: config.deepseek.apiKey,
    }
  }

  if (config.provider === 'openrouter') {
    return {
      provider: 'openrouter',
      endpoint: LLM_PROVIDERS.OPENROUTER_ENDPOINT,
      model: config.openrouter.model,
      apiKey: config.openrouter.apiKey,
    }
  }

  return {
    provider: 'custom-compatible',
    endpoint: config.custom.endpoint,
    model: config.custom.model,
    apiKey: config.custom.apiKey,
  }
}

export function normalizeLLMRefineConfig(config?: Partial<LLMRefineConfig>): LLMRefineConfig {
  const rawConfig =
    config && typeof config === 'object'
      ? (config as Partial<LLMRefineConfig> & Record<string, unknown>)
      : undefined
  const provider = normalizeProvider(rawConfig?.provider, rawConfig)
  const openai = normalizeOpenAIConfig(rawConfig?.openai, rawConfig, provider)
  const deepseek = normalizeDeepSeekConfig(rawConfig?.deepseek, rawConfig, provider)
  const openrouter = normalizeOpenRouterConfig(rawConfig?.openrouter, rawConfig, provider)
  const custom = normalizeCustomConfig(rawConfig?.custom, rawConfig, provider)
  const activeConnection = resolveLLMConnection({
    ...defaultLLMRefineConfig,
    provider,
    openai,
    deepseek,
    openrouter,
    custom,
  })

  return {
    ...defaultLLMRefineConfig,
    enabled: readBoolean(rawConfig?.enabled, defaultLLMRefineConfig.enabled),
    provider,
    endpoint: activeConnection.endpoint,
    model: activeConnection.model,
    apiKey: activeConnection.apiKey,
    translateOutput: readTranslateOutputFlag(rawConfig),
    openai,
    deepseek,
    openrouter,
    custom,
  }
}

export function selectReasoningLevel(text: string): LLMReasoningLevel {
  const length = Array.from(text.trim()).length
  if (length <= LLM_REASONING.OFF_MAX_CHARACTERS) {
    return 'off'
  }
  if (length <= LLM_REASONING.MEDIUM_MAX_CHARACTERS) {
    return 'medium'
  }
  return 'high'
}

export function getReasoningTimeoutMs(level: LLMReasoningLevel): number {
  return LLM_REASONING.TIMEOUT_MS[level]
}

export function buildReasoningPayloadFields(
  connection: ResolvedLLMConnection,
  text: string,
): { level: LLMReasoningLevel; fields: Record<string, unknown> } {
  const level = selectReasoningLevel(text)

  if (connection.provider === 'openai') {
    return {
      level,
      fields: {
        reasoning_effort: level === 'off' ? 'none' : 'low',
      },
    }
  }

  if (connection.provider === 'deepseek') {
    if (!isBuiltInDeepSeekReasoningModel(connection.model)) {
      return { level: 'off', fields: {} }
    }

    if (level === 'off') {
      return { level, fields: { thinking: { type: 'disabled' } } }
    }

    return {
      level,
      fields: {
        thinking: { type: 'enabled' },
        reasoning_effort: 'low',
      },
    }
  }

  if (connection.provider === 'openrouter') {
    const model = findBuiltInOpenRouterModel(connection.model)
    if (!model) {
      return { level: 'off', fields: {} }
    }

    return {
      level,
      fields: {
        reasoning: {
          effort: level === 'off' ? model.shortTextReasoningEffort : 'low',
          exclude: true,
        },
      },
    }
  }

  return { level: 'off', fields: {} }
}
