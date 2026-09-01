import { describe, expect, it } from 'vitest'
import { LLM_PROVIDERS, LLM_REFINE, STORED_SECRET_PLACEHOLDER } from '@electron/shared/constants'
import { defaultLLMRefineConfig, normalizeLLMRefineConfig } from '@electron/shared/llm-config'
import type { AppConfig } from '@electron/shared/types'
import {
  applyPersistedSecretState,
  getRefineConnectionFingerprint,
  invalidateRefineConnection,
  isRefineConfigComplete,
  isRefineConnectionCacheFresh,
  markRefineConnectionValidated,
  readRefineFeatureFlags,
  reconcileRefineFeaturesAfterConnectionChange,
  resolveMicrophoneDeviceMigration,
  type RefineConnectionValidationCache,
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

describe('microphone device migration', () => {
  const currentDevices = [
    { deviceId: 'current-realtek-id', label: '麦克风 (Realtek High Definition Audio)' },
    { deviceId: 'usb-id', label: 'USB Microphone' },
  ]

  it('rebinds a missing device ID when exactly one current label matches', () => {
    expect(
      resolveMicrophoneDeviceMigration(
        'stale-realtek-id',
        '麦克风 (Realtek High Definition Audio)',
        currentDevices,
      ),
    ).toEqual(currentDevices[0])
  })

  it('normalizes harmless label casing and whitespace changes', () => {
    expect(
      resolveMicrophoneDeviceMigration('stale-usb-id', '  usb   MICROPHONE ', currentDevices),
    ).toEqual(currentDevices[1])
  })

  it('does nothing while the selected device ID is still available', () => {
    expect(
      resolveMicrophoneDeviceMigration(
        'current-realtek-id',
        '麦克风 (Realtek High Definition Audio)',
        currentDevices,
      ),
    ).toBeNull()
  })

  it('does not guess when multiple devices expose the same label', () => {
    expect(
      resolveMicrophoneDeviceMigration('stale-id', 'USB Microphone', [
        { deviceId: 'usb-1', label: 'USB Microphone' },
        { deviceId: 'usb-2', label: 'USB Microphone' },
      ]),
    ).toBeNull()
  })

  it('does not migrate without a persisted ID and exposed label', () => {
    expect(resolveMicrophoneDeviceMigration('', 'USB Microphone', currentDevices)).toBeNull()
    expect(resolveMicrophoneDeviceMigration('stale-id', '', currentDevices)).toBeNull()
  })
})

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

describe('refine connection fingerprint', () => {
  it('stays stable across normalize round-trips and placeholder keys', () => {
    const config = createOpenRouterConfig({ apiKey: 'openrouter-key' })
    const fingerprint = getRefineConnectionFingerprint(config.llmRefine)

    expect(getRefineConnectionFingerprint(normalizeLLMRefineConfig(config.llmRefine))).toBe(
      fingerprint,
    )

    const masked = createOpenRouterConfig({ apiKey: STORED_SECRET_PLACEHOLDER })
    expect(getRefineConnectionFingerprint(masked.llmRefine)).toBe(
      getRefineConnectionFingerprint(normalizeLLMRefineConfig(masked.llmRefine)),
    )
  })

  it('changes when the api key, model, or provider changes', () => {
    const base = getRefineConnectionFingerprint(createOpenRouterConfig().llmRefine)

    const otherKey = createOpenRouterConfig({ apiKey: 'another-key' })
    expect(getRefineConnectionFingerprint(otherKey.llmRefine)).not.toBe(base)

    const otherProvider = createConfig('deepseek-key')
    expect(getRefineConnectionFingerprint(otherProvider.llmRefine)).not.toBe(base)

    const otherModel = createOpenRouterConfig()
    const alternateModel = LLM_PROVIDERS.OPENROUTER_MODELS.find(
      (option) => option.id !== otherModel.llmRefine.openrouter.model,
    )
    expect(alternateModel).toBeDefined()
    if (!alternateModel) throw new Error('expected an alternate OpenRouter model')
    otherModel.llmRefine = normalizeLLMRefineConfig({
      ...otherModel.llmRefine,
      openrouter: { ...otherModel.llmRefine.openrouter, model: alternateModel.id },
    })
    expect(getRefineConnectionFingerprint(otherModel.llmRefine)).not.toBe(base)
  })
})

describe('refine connection validation cache', () => {
  const fingerprint = 'openrouter\nhttps://openrouter.ai/api/v1\nmodel\nkey'

  function createCache(): RefineConnectionValidationCache {
    return new Map()
  }

  it('misses when the connection was never validated', () => {
    expect(isRefineConnectionCacheFresh(createCache(), fingerprint, Date.now())).toBe(false)
  })

  it('hits while the validation is within the TTL', () => {
    const cache = createCache()
    const now = 1_000_000
    markRefineConnectionValidated(cache, fingerprint, now)

    expect(
      isRefineConnectionCacheFresh(cache, fingerprint, now + LLM_REFINE.CONNECTION_CACHE_TTL_MS),
    ).toBe(true)
  })

  it('misses and evicts the entry once the TTL has passed', () => {
    const cache = createCache()
    const now = 1_000_000
    markRefineConnectionValidated(cache, fingerprint, now)

    const staleNow = now + LLM_REFINE.CONNECTION_CACHE_TTL_MS + 1
    expect(isRefineConnectionCacheFresh(cache, fingerprint, staleNow)).toBe(false)
    expect(cache.has(fingerprint)).toBe(false)
  })

  it('forgets a connection explicitly after a failed test', () => {
    const cache = createCache()
    const now = 1_000_000
    markRefineConnectionValidated(cache, fingerprint, now)
    invalidateRefineConnection(cache, fingerprint)

    expect(isRefineConnectionCacheFresh(cache, fingerprint, now)).toBe(false)
  })
})
