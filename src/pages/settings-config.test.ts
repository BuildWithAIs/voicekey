import { describe, expect, it } from 'vitest'
import { STORED_SECRET_PLACEHOLDER } from '@electron/shared/constants'
import { defaultLLMRefineConfig, normalizeLLMRefineConfig } from '@electron/shared/llm-config'
import type { AppConfig } from '@electron/shared/types'
import {
  applyPersistedSecretState,
  isRefineConfigComplete,
  readRefineFeatureFlags,
  reconcileRefineFeaturesAfterConnectionChange,
} from './settings-config'

function createConfig(llmKey: string): AppConfig {
  return {
    app: { language: 'system', autoLaunch: false },
    asr: {
      lowVolumeMode: true,
      microphoneDeviceId: '',
      microphoneDeviceLabel: '',
    },
    llmRefine: {
      ...defaultLLMRefineConfig,
      deepseek: {
        ...defaultLLMRefineConfig.deepseek,
        apiKey: llmKey,
      },
    },
    hotkey: { pttKey: 'F2', toggleSettings: 'CommandOrControl+,', translateKey: 'F4' },
    translation: { enabled: false, targetLanguage: 'en' },
  }
}

function createOpenRouterConfig(options?: {
  apiKey?: string
  enabled?: boolean
  translateOutput?: boolean
  translationEnabled?: boolean
}): AppConfig {
  const config = createConfig('')
  config.llmRefine = normalizeLLMRefineConfig({
    ...config.llmRefine,
    enabled: options?.enabled ?? false,
    translateOutput: options?.translateOutput ?? false,
    provider: 'openrouter',
    openrouter: {
      ...defaultLLMRefineConfig.openrouter,
      apiKey: options?.apiKey ?? 'openrouter-key',
    },
  })
  config.translation.enabled = options?.translationEnabled ?? false
  return config
}

describe('settings persisted secret state', () => {
  it('replaces a successfully saved plaintext LLM key with the renderer placeholder', () => {
    const current = createConfig('new-llm-key')
    const persisted = createConfig(STORED_SECRET_PLACEHOLDER)
    const result = applyPersistedSecretState(current, { llmRefine: current.llmRefine }, persisted)

    expect(result.llmRefine.deepseek.apiKey).toBe(STORED_SECRET_PLACEHOLDER)
  })

  it('preserves secrets and settings edited again while the save was in flight', () => {
    const saved = createConfig('first-llm-key')
    const current = createConfig('second-llm-key')
    current.asr.lowVolumeMode = false
    current.translation.enabled = true
    const persisted = createConfig(STORED_SECRET_PLACEHOLDER)

    const result = applyPersistedSecretState(
      current,
      { asr: saved.asr, llmRefine: saved.llmRefine },
      persisted,
    )

    expect(result.llmRefine.deepseek.apiKey).toBe('second-llm-key')
    expect(result.asr.lowVolumeMode).toBe(false)
    expect(result.translation.enabled).toBe(true)
  })

  it('masks a persisted OpenAI key without changing the selected provider', () => {
    const current = createConfig('')
    current.llmRefine.provider = 'openai'
    current.llmRefine.openai.apiKey = 'openai-key'
    const persisted = createConfig('')
    persisted.llmRefine.provider = 'openai'
    persisted.llmRefine.openai.apiKey = STORED_SECRET_PLACEHOLDER

    const result = applyPersistedSecretState(current, { llmRefine: current.llmRefine }, persisted)

    expect(result.llmRefine.provider).toBe('openai')
    expect(result.llmRefine.openai.apiKey).toBe(STORED_SECRET_PLACEHOLDER)
  })
})

describe('refinement configuration completeness', () => {
  it('accepts a configured provider connection, including a stored-key placeholder', () => {
    const config = createConfig(STORED_SECRET_PLACEHOLDER)

    expect(isRefineConfigComplete(config.llmRefine)).toBe(true)
  })

  it('rejects a provider connection without an API key', () => {
    const config = createConfig('')

    expect(isRefineConfigComplete(config.llmRefine)).toBe(false)
  })
})

describe('reconcileRefineFeaturesAfterConnectionChange', () => {
  it('keeps feature flags when switching between complete providers', () => {
    const prev = createOpenRouterConfig({
      enabled: true,
      translateOutput: true,
      translationEnabled: true,
    })
    const nextRefine = normalizeLLMRefineConfig({
      ...prev.llmRefine,
      provider: 'deepseek',
      deepseek: { ...defaultLLMRefineConfig.deepseek, apiKey: 'deepseek-key' },
    })

    const result = reconcileRefineFeaturesAfterConnectionChange(prev, nextRefine, null)

    expect(result.config.llmRefine.provider).toBe('deepseek')
    expect(readRefineFeatureFlags(result.config)).toEqual({
      enabled: true,
      translateOutput: true,
      translationEnabled: true,
    })
    expect(result.snapshot).toBeNull()
    expect(result.shouldReverifyConnection).toBe(true)
  })

  it('disables features and snapshots intent when the target provider is incomplete', () => {
    const prev = createOpenRouterConfig({
      enabled: true,
      translateOutput: true,
      translationEnabled: true,
    })
    const nextRefine = normalizeLLMRefineConfig({
      ...prev.llmRefine,
      provider: 'deepseek',
      deepseek: { ...defaultLLMRefineConfig.deepseek, apiKey: '' },
    })

    const result = reconcileRefineFeaturesAfterConnectionChange(prev, nextRefine, null)

    expect(result.config.llmRefine.provider).toBe('deepseek')
    expect(readRefineFeatureFlags(result.config)).toEqual({
      enabled: false,
      translateOutput: false,
      translationEnabled: false,
    })
    expect(result.snapshot).toEqual({
      enabled: true,
      translateOutput: true,
      translationEnabled: true,
    })
    expect(result.shouldReverifyConnection).toBe(false)
  })

  it('restores snapshotted flags when returning to a complete provider', () => {
    const incomplete = createOpenRouterConfig({ enabled: false })
    incomplete.llmRefine = normalizeLLMRefineConfig({
      ...incomplete.llmRefine,
      provider: 'deepseek',
      enabled: false,
      translateOutput: false,
      deepseek: { ...defaultLLMRefineConfig.deepseek, apiKey: '' },
    })
    incomplete.translation.enabled = false

    const snapshot = {
      enabled: true,
      translateOutput: true,
      translationEnabled: true,
    }
    const nextRefine = normalizeLLMRefineConfig({
      ...incomplete.llmRefine,
      provider: 'openrouter',
      openrouter: {
        ...defaultLLMRefineConfig.openrouter,
        apiKey: 'openrouter-key',
      },
    })

    const result = reconcileRefineFeaturesAfterConnectionChange(incomplete, nextRefine, snapshot)

    expect(result.config.llmRefine.provider).toBe('openrouter')
    expect(readRefineFeatureFlags(result.config)).toEqual(snapshot)
    expect(result.snapshot).toBeNull()
    expect(result.shouldReverifyConnection).toBe(true)
  })

  it('does not invent an on state when no snapshot and features were already off', () => {
    const prev = createOpenRouterConfig({ enabled: false })
    const nextRefine = normalizeLLMRefineConfig({
      ...prev.llmRefine,
      provider: 'deepseek',
      deepseek: { ...defaultLLMRefineConfig.deepseek, apiKey: 'deepseek-key' },
    })

    const result = reconcileRefineFeaturesAfterConnectionChange(prev, nextRefine, null)

    expect(readRefineFeatureFlags(result.config)).toEqual({
      enabled: false,
      translateOutput: false,
      translationEnabled: false,
    })
    expect(result.snapshot).toBeNull()
    expect(result.shouldReverifyConnection).toBe(false)
  })

  it('preserves an existing snapshot when switching across incomplete providers', () => {
    const prev = createOpenRouterConfig({ enabled: false })
    prev.llmRefine = normalizeLLMRefineConfig({
      ...prev.llmRefine,
      provider: 'deepseek',
      deepseek: { ...defaultLLMRefineConfig.deepseek, apiKey: '' },
    })
    const existingSnapshot = {
      enabled: true,
      translateOutput: false,
      translationEnabled: true,
    }
    const nextRefine = normalizeLLMRefineConfig({
      ...prev.llmRefine,
      provider: 'openai',
      openai: { ...defaultLLMRefineConfig.openai, apiKey: '' },
    })

    const result = reconcileRefineFeaturesAfterConnectionChange(prev, nextRefine, existingSnapshot)

    expect(result.config.llmRefine.provider).toBe('openai')
    expect(readRefineFeatureFlags(result.config)).toEqual({
      enabled: false,
      translateOutput: false,
      translationEnabled: false,
    })
    expect(result.snapshot).toEqual(existingSnapshot)
  })

  it('covers the reported round-trip: openrouter on → incomplete deepseek → openrouter on', () => {
    const openrouterOn = createOpenRouterConfig({
      enabled: true,
      translateOutput: false,
      translationEnabled: false,
    })

    const toDeepSeek = reconcileRefineFeaturesAfterConnectionChange(
      openrouterOn,
      normalizeLLMRefineConfig({
        ...openrouterOn.llmRefine,
        provider: 'deepseek',
        deepseek: { ...defaultLLMRefineConfig.deepseek, apiKey: '' },
      }),
      null,
    )

    expect(toDeepSeek.config.llmRefine.enabled).toBe(false)
    expect(toDeepSeek.snapshot?.enabled).toBe(true)

    const backToOpenRouter = reconcileRefineFeaturesAfterConnectionChange(
      toDeepSeek.config,
      normalizeLLMRefineConfig({
        ...toDeepSeek.config.llmRefine,
        provider: 'openrouter',
        openrouter: {
          ...defaultLLMRefineConfig.openrouter,
          apiKey: 'openrouter-key',
        },
      }),
      toDeepSeek.snapshot,
    )

    expect(backToOpenRouter.config.llmRefine.provider).toBe('openrouter')
    expect(backToOpenRouter.config.llmRefine.enabled).toBe(true)
    expect(backToOpenRouter.snapshot).toBeNull()
    expect(backToOpenRouter.shouldReverifyConnection).toBe(true)
  })
})
