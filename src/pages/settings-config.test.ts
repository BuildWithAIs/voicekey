import { describe, expect, it } from 'vitest'
import { STORED_SECRET_PLACEHOLDER } from '@electron/shared/constants'
import { defaultLLMRefineConfig } from '@electron/shared/llm-config'
import type { AppConfig } from '@electron/shared/types'
import { applyPersistedSecretState, isRefineConfigComplete } from './settings-config'

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
