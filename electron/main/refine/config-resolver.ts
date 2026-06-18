import { buildRefineSystemPrompt, OPENAI_CHAT } from '../../shared/constants'
import { buildRefineChatEndpoint, normalizeRefineBaseUrl } from '../../shared/refine-url'
import type { LLMRefineConfig } from '../../shared/types'

export interface ResolvedRefineRequestConfig {
  endpoint: string
  apiKey: string
  model: string
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
  const baseUrl = normalizeRefineBaseUrl(refineConfig.endpoint)
  const endpoint = buildRefineChatEndpoint(baseUrl)
  const model = refineConfig.model.trim()
  const apiKey = refineConfig.apiKey.trim()

  if (!baseUrl || !endpoint || !model || !apiKey) {
    return null
  }

  return {
    endpoint,
    model,
    apiKey,
    timeoutMs: OPENAI_CHAT.TIMEOUT_MS,
    systemPrompt: buildRefineSystemPrompt({
      glossaryTerms: options.glossaryTerms,
      translateOutput: refineConfig.translateOutput,
      targetLanguage: options.targetLanguage,
    }),
  }
}
