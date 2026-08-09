import { LLM_PROVIDERS, LLM_REASONING, LLM_REFINE } from './constants'
import { normalizeRefineBaseUrl } from './refine-url'
import type {
  CustomCompatibleLLMConfig,
  DeepSeekConfig,
  LLMProvider,
  LLMReasoningLevel,
  LLMRefineConfig,
  OpenRouterConfig,
  OpenRouterReasoningCapability,
  OpenRouterReasoningEffort,
} from './types'

export interface ResolvedLLMConnection {
  provider: LLMProvider
  endpoint: string
  apiKey: string
  model: string
  openRouterReasoningCapability?: OpenRouterReasoningCapability
}

const OPENROUTER_REASONING_EFFORTS = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'none',
] as const satisfies readonly OpenRouterReasoningEffort[]

const DEFAULT_DEEPSEEK_CONFIG: DeepSeekConfig = {
  apiKey: LLM_REFINE.API_KEY,
  model: LLM_PROVIDERS.DEFAULT_DEEPSEEK_MODEL,
}

const DEFAULT_OPENROUTER_CONFIG: OpenRouterConfig = {
  apiKey: LLM_REFINE.API_KEY,
  model: LLM_REFINE.MODEL,
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
  if (value === 'deepseek' || value === 'openrouter' || value === 'custom-compatible') {
    return value
  }

  const endpoint = normalizeRefineBaseUrl(readString(rawConfig?.endpoint))
  const lowerEndpoint = endpoint.toLowerCase()

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

function normalizeDeepSeekModel(value: unknown): string {
  const model = readString(value).trim()
  return model || LLM_PROVIDERS.DEFAULT_DEEPSEEK_MODEL
}

function isBuiltInDeepSeekReasoningModel(model: string): boolean {
  return LLM_PROVIDERS.DEEPSEEK_MODELS.includes(
    model as (typeof LLM_PROVIDERS.DEEPSEEK_MODELS)[number],
  )
}

function normalizeOpenRouterReasoningCapability(
  value: unknown,
  model: string,
): OpenRouterReasoningCapability | undefined {
  if (!isRecord(value)) return undefined

  const capabilityModel = readString(value.model)
  if (!capabilityModel || capabilityModel !== model) return undefined

  const rawSupportedEfforts = Array.isArray(value.supportedEfforts) ? value.supportedEfforts : []
  const supportedEfforts = rawSupportedEfforts.filter(
    (effort): effort is OpenRouterReasoningEffort =>
      OPENROUTER_REASONING_EFFORTS.includes(effort as OpenRouterReasoningEffort),
  )
  const defaultEffort = OPENROUTER_REASONING_EFFORTS.includes(
    value.defaultEffort as OpenRouterReasoningEffort,
  )
    ? (value.defaultEffort as OpenRouterReasoningEffort)
    : undefined

  return {
    model: capabilityModel,
    checkedAt: typeof value.checkedAt === 'number' ? value.checkedAt : Date.now(),
    supportsReasoning: readBoolean(value.supportsReasoning, false),
    ...(supportedEfforts.length > 0 ? { supportedEfforts } : {}),
    ...(defaultEffort ? { defaultEffort } : {}),
    mandatory: readBoolean(value.mandatory, false),
  }
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

function normalizeOpenRouterConfig(
  value: unknown,
  rawConfig: Record<string, unknown> | undefined,
  provider: LLMProvider,
): OpenRouterConfig {
  const raw = isRecord(value) ? value : undefined
  const legacyModel = provider === 'openrouter' ? rawConfig?.model : undefined
  const legacyApiKey = provider === 'openrouter' ? rawConfig?.apiKey : undefined
  const model = readString(raw?.model, readString(legacyModel, DEFAULT_OPENROUTER_CONFIG.model))

  return {
    apiKey: readString(raw?.apiKey, readString(legacyApiKey, DEFAULT_OPENROUTER_CONFIG.apiKey)),
    model,
    reasoningCapability: normalizeOpenRouterReasoningCapability(raw?.reasoningCapability, model),
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
      openRouterReasoningCapability: config.openrouter.reasoningCapability,
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
  const deepseek = normalizeDeepSeekConfig(rawConfig?.deepseek, rawConfig, provider)
  const openrouter = normalizeOpenRouterConfig(rawConfig?.openrouter, rawConfig, provider)
  const custom = normalizeCustomConfig(rawConfig?.custom, rawConfig, provider)
  const activeConnection = resolveLLMConnection({
    ...defaultLLMRefineConfig,
    provider,
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

function pickOpenRouterEffort(
  level: Exclude<LLMReasoningLevel, 'off'>,
  supportedEfforts?: OpenRouterReasoningEffort[],
): 'medium' | 'high' {
  if (!supportedEfforts || supportedEfforts.length === 0 || supportedEfforts.includes(level)) {
    return level
  }

  if (level === 'medium' && supportedEfforts.includes('high')) {
    return 'high'
  }

  if (level === 'high' && supportedEfforts.includes('medium')) {
    return 'medium'
  }

  return level
}

export function buildReasoningPayloadFields(
  connection: ResolvedLLMConnection,
  text: string,
): { level: LLMReasoningLevel; fields: Record<string, unknown> } {
  const level = selectReasoningLevel(text)

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
        reasoning_effort: 'high',
      },
    }
  }

  if (connection.provider === 'openrouter') {
    const capability = connection.openRouterReasoningCapability
    if (!capability?.supportsReasoning) {
      return { level: 'off', fields: {} }
    }

    if (level === 'off') {
      return {
        level,
        fields: capability.mandatory ? { reasoning: { exclude: true } } : {},
      }
    }

    return {
      level,
      fields: {
        reasoning: {
          effort: pickOpenRouterEffort(level, capability.supportedEfforts),
          exclude: true,
        },
      },
    }
  }

  return { level: 'off', fields: {} }
}
