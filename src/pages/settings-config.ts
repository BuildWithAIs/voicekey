import { TRANSLATION } from '@electron/shared/constants'
import { normalizeLLMRefineConfig, resolveLLMConnection } from '@electron/shared/llm-config'
import type { AppConfig, LLMRefineConfig } from '@electron/shared/types'

const LLM_CONNECTION_KEYS = ['openai', 'deepseek', 'openrouter', 'custom'] as const

export function isRefineConfigComplete(config: LLMRefineConfig): boolean {
  const connection = resolveLLMConnection(config)
  return Boolean(connection.endpoint.trim() && connection.model.trim() && connection.apiKey.trim())
}

export function normalizeRendererConfig(loadedConfig: AppConfig): AppConfig {
  return {
    ...loadedConfig,
    asr: {
      ...loadedConfig.asr,
      lowVolumeMode: loadedConfig.asr?.lowVolumeMode ?? true,
      microphoneDeviceId: loadedConfig.asr?.microphoneDeviceId ?? '',
      microphoneDeviceLabel: loadedConfig.asr?.microphoneDeviceLabel ?? '',
    },
    llmRefine: normalizeLLMRefineConfig(loadedConfig.llmRefine),
    translation: {
      enabled: loadedConfig.translation?.enabled ?? TRANSLATION.ENABLED,
      targetLanguage: loadedConfig.translation?.targetLanguage || TRANSLATION.TARGET_LANGUAGE,
    },
  }
}

/**
 * Apply only the persisted secret placeholders after an autosave. Values edited again while the
 * IPC request was in flight are left untouched, so refreshing the masked state cannot lose input.
 */
export function applyPersistedSecretState(
  currentConfig: AppConfig,
  savedPatch: Partial<AppConfig>,
  persistedConfig: AppConfig,
): AppConfig {
  let llmRefine = normalizeLLMRefineConfig(currentConfig.llmRefine)
  if (savedPatch.llmRefine) {
    const savedLLMRefine = normalizeLLMRefineConfig(savedPatch.llmRefine)
    const persistedLLMRefine = normalizeLLMRefineConfig(persistedConfig.llmRefine)
    const nextLLMRefine = {
      ...llmRefine,
      openai: { ...llmRefine.openai },
      deepseek: { ...llmRefine.deepseek },
      openrouter: { ...llmRefine.openrouter },
      custom: { ...llmRefine.custom },
    }

    for (const provider of LLM_CONNECTION_KEYS) {
      if (nextLLMRefine[provider].apiKey === savedLLMRefine[provider].apiKey) {
        nextLLMRefine[provider].apiKey = persistedLLMRefine[provider].apiKey
      }
    }
    llmRefine = normalizeLLMRefineConfig(nextLLMRefine)
  }

  return {
    ...currentConfig,
    llmRefine,
  }
}
