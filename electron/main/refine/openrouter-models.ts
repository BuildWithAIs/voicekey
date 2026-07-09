import axios from 'axios'
import type {
  OpenRouterModelCheckResult,
  OpenRouterReasoningCapability,
  OpenRouterReasoningEffort,
} from '../../shared/types'

const OPENROUTER_MODEL_LOOKUP_TIMEOUT_MS = 10000
const OPENROUTER_MODEL_BASE_URL = 'https://openrouter.ai/api/v1/model'
const REASONING_EFFORTS = new Set<OpenRouterReasoningEffort>([
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'none',
])

type OpenRouterModelResponse = {
  data?: {
    id?: string
    supported_parameters?: string[]
    reasoning?: {
      supported_efforts?: OpenRouterReasoningEffort[] | null
      default_effort?: OpenRouterReasoningEffort
      default_enabled?: boolean
      mandatory?: boolean
      supports_max_tokens?: boolean
    }
  }
}

function buildModelLookupUrl(model: string): string {
  return `${OPENROUTER_MODEL_BASE_URL}/${model
    .trim()
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`
}

function normalizeSupportedEfforts(value: unknown): OpenRouterReasoningEffort[] | undefined {
  if (!Array.isArray(value)) return undefined

  const efforts = value.filter((item): item is OpenRouterReasoningEffort =>
    REASONING_EFFORTS.has(item as OpenRouterReasoningEffort),
  )

  return efforts.length > 0 ? efforts : undefined
}

function normalizeCapability(
  requestedModel: string,
  response: OpenRouterModelResponse,
): OpenRouterReasoningCapability {
  const model = response.data?.id || requestedModel
  const supportedParameters = response.data?.supported_parameters ?? []
  const reasoning = response.data?.reasoning
  const supportsReasoning = supportedParameters.includes('reasoning') || Boolean(reasoning)
  const supportedEfforts = normalizeSupportedEfforts(reasoning?.supported_efforts)
  const defaultEffort = REASONING_EFFORTS.has(
    reasoning?.default_effort as OpenRouterReasoningEffort,
  )
    ? reasoning?.default_effort
    : undefined

  return {
    model,
    checkedAt: Date.now(),
    supportsReasoning,
    ...(supportedEfforts ? { supportedEfforts } : {}),
    ...(defaultEffort ? { defaultEffort } : {}),
    mandatory: Boolean(reasoning?.mandatory),
  }
}

export async function checkOpenRouterModel(model: string): Promise<OpenRouterModelCheckResult> {
  const normalizedModel = model.trim()
  if (!normalizedModel) {
    return {
      ok: false,
      message: 'OpenRouter model is required',
    }
  }

  try {
    const response = await axios.get<OpenRouterModelResponse>(
      buildModelLookupUrl(normalizedModel),
      {
        timeout: OPENROUTER_MODEL_LOOKUP_TIMEOUT_MS,
        responseType: 'json',
        responseEncoding: 'utf8',
      },
    )
    return {
      ok: true,
      capability: normalizeCapability(normalizedModel, response.data),
    }
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      return {
        ok: false,
        message: status === 404 ? 'OpenRouter model was not found' : error.message,
      }
    }

    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
