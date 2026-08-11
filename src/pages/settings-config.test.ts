import { describe, expect, it } from 'vitest'
import { STORED_SECRET_PLACEHOLDER } from '@electron/shared/constants'
import { defaultLLMRefineConfig } from '@electron/shared/llm-config'
import type { AppConfig } from '@electron/shared/types'
import { applyPersistedSecretState, isRefineConfigComplete } from './settings-config'

function createConfig(asrKey: string, llmKey: string): AppConfig {
  return {
    app: { language: 'system', autoLaunch: false },
    asr: {
      provider: 'glm',
      region: 'cn',
      apiKeys: { cn: asrKey, intl: '' },
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

describe('settings persisted secret state', () => {
  it('replaces successfully saved plaintext keys with renderer placeholders', () => {
    const current = createConfig('new-asr-key', 'new-llm-key')
    const persisted = createConfig(STORED_SECRET_PLACEHOLDER, STORED_SECRET_PLACEHOLDER)
    const result = applyPersistedSecretState(
      current,
      { asr: current.asr, llmRefine: current.llmRefine },
      persisted,
    )

    expect(result.asr.apiKeys.cn).toBe(STORED_SECRET_PLACEHOLDER)
    expect(result.llmRefine.deepseek.apiKey).toBe(STORED_SECRET_PLACEHOLDER)
  })

  it('preserves secrets and settings edited again while the save was in flight', () => {
    const saved = createConfig('first-asr-key', 'first-llm-key')
    const current = createConfig('second-asr-key', 'second-llm-key')
    current.asr.lowVolumeMode = false
    current.translation.enabled = true
    const persisted = createConfig(STORED_SECRET_PLACEHOLDER, STORED_SECRET_PLACEHOLDER)

    const result = applyPersistedSecretState(
      current,
      { asr: saved.asr, llmRefine: saved.llmRefine },
      persisted,
    )

    expect(result.asr.apiKeys.cn).toBe('second-asr-key')
    expect(result.llmRefine.deepseek.apiKey).toBe('second-llm-key')
    expect(result.asr.lowVolumeMode).toBe(false)
    expect(result.translation.enabled).toBe(true)
  })

  it('masks a persisted OpenAI key without changing the selected provider', () => {
    const current = createConfig('', '')
    current.llmRefine.provider = 'openai'
    current.llmRefine.openai.apiKey = 'openai-key'
    const persisted = createConfig('', '')
    persisted.llmRefine.provider = 'openai'
    persisted.llmRefine.openai.apiKey = STORED_SECRET_PLACEHOLDER

    const result = applyPersistedSecretState(current, { llmRefine: current.llmRefine }, persisted)

    expect(result.llmRefine.provider).toBe('openai')
    expect(result.llmRefine.openai.apiKey).toBe(STORED_SECRET_PLACEHOLDER)
  })
})

describe('refinement configuration completeness', () => {
  it('accepts a configured provider connection, including a stored-key placeholder', () => {
    const config = createConfig('', STORED_SECRET_PLACEHOLDER)

    expect(isRefineConfigComplete(config.llmRefine)).toBe(true)
  })

  it('rejects a provider connection without an API key', () => {
    const config = createConfig('', '')

    expect(isRefineConfigComplete(config.llmRefine)).toBe(false)
  })
})
