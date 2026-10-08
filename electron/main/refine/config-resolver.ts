import { buildRefineSystemPrompt, OPENAI_CHAT } from '../../shared/constants'
import { normalizeRefineBaseUrl } from '../../shared/refine-url'
import {
  buildLLMRequestEndpoint,
  resolveLLMConnection,
  type ResolvedLLMConnection,
} from '../../shared/llm-config'
import type { LLMRefineConfig } from '../../shared/types'

export interface ResolvedRefineRequestConfig {
  endpoint: string
  apiKey: string
  model: string
  connection: ResolvedLLMConnection
  timeoutMs: number
  systemPrompt: string
}

export interface ResolveRefineRequestConfigOptions {
  glossaryTerms?: readonly string[]
  /** Shared translation target language, used when refineConfig.translateOutput is enabled. */
  targetLanguage?: string
}

export function resolveRefineRequestConfig(
  refineConfig: LLMRefineConfig,
  options: ResolveRefineRequestConfigOptions = {},
): ResolvedRefineRequestConfig | null {
  const connection = resolveLLMConnection(refineConfig)
  const baseUrl = normalizeRefineBaseUrl(connection.endpoint)
  const endpoint = buildLLMRequestEndpoint(connection)
  const model = connection.model.trim()
  const apiKey = connection.apiKey.trim()

  if (!baseUrl || !endpoint || !model || !apiKey) {
    return null
  }

  return {
    endpoint,
    model,
    apiKey,
    connection: {
      ...connection,
      endpoint,
      model,
      apiKey,
    },
    timeoutMs: OPENAI_CHAT.TIMEOUT_MS,
    systemPrompt: buildRefineSystemPrompt({
      glossaryTerms: options.glossaryTerms,
      translateOutput: refineConfig.translateOutput,
      targetLanguage: options.targetLanguage,
    }),
  }
}
