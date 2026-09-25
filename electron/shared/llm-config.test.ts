import { describe, expect, it } from 'vitest'
import { LLM_PROVIDERS } from './constants'
import {
  buildDisabledReasoningPayloadFields,
  buildLLMAttributionHeaders,
  normalizeLLMRefineConfig,
  resolveLLMConnection,
} from './llm-config'
import type { LLMRefineConfig } from './types'

describe('LLM model selection', () => {
  it('uses the official OpenAI endpoint and fixed GPT-6 Luna model', () => {
    const config = normalizeLLMRefineConfig({
      provider: 'openai',
      openai: { apiKey: 'openai-key', model: 'gpt-6-luna' },
    })

    expect(resolveLLMConnection(config)).toEqual({
      provider: 'openai',
      endpoint: LLM_PROVIDERS.OPENAI_ENDPOINT,
      apiKey: 'openai-key',
      model: LLM_PROVIDERS.DEFAULT_OPENAI_MODEL,
    })
    expect(buildDisabledReasoningPayloadFields(resolveLLMConnection(config))).toEqual({
      reasoning_effort: 'none',
    })
  })

  it('migrates saved GPT-5.6 Luna settings to GPT-6 Luna', () => {
    const config = normalizeLLMRefineConfig({
      provider: 'openai',
      openai: { apiKey: 'openai-key', model: 'gpt-5.6-luna' },
    } as unknown as Partial<LLMRefineConfig>)

    expect(config.openai.model).toBe(LLM_PROVIDERS.DEFAULT_OPENAI_MODEL)
    expect(config.apiKey).toBe('openai-key')
  })

  it('migrates saved DeepSeek V4 Flash settings to the official V4.1 Flash ID', () => {
    const config = normalizeLLMRefineConfig({
      provider: 'deepseek',
      deepseek: { apiKey: 'test-key', model: 'deepseek-v4-flash' },
    } as unknown as Partial<LLMRefineConfig>)

    expect(LLM_PROVIDERS.DEEPSEEK_MODELS).toEqual(['deepseek-flash'])
    expect(resolveLLMConnection(config)).toEqual({
      provider: 'deepseek',
      endpoint: LLM_PROVIDERS.DEEPSEEK_ENDPOINT,
      apiKey: 'test-key',
      model: 'deepseek-flash',
    })
    expect(buildDisabledReasoningPayloadFields(resolveLLMConnection(config))).toEqual({
      thinking: { type: 'disabled' },
    })
  })
})

describe('built-in LLM reasoning policy', () => {
  it.each([
    ['openai', { reasoning_effort: 'none' }],
    ['deepseek', { thinking: { type: 'disabled' } }],
    ['openrouter', { reasoning: { enabled: false, exclude: true } }],
  ] as const)('explicitly disables reasoning for %s', (provider, fields) => {
    expect(
      buildDisabledReasoningPayloadFields({
        provider,
        endpoint: 'https://example.com/v1',
        apiKey: 'test-key',
        model: 'test-model',
      }),
    ).toEqual(fields)
  })

  it('disables thinking for TokenDance DeepSeek V4.1 Flash', () => {
    const connection = resolveLLMConnection(
      normalizeLLMRefineConfig({
        provider: 'tokendance',
        tokendance: { apiKey: 'td-key', model: 'deepseek-v4.1-flash' },
      }),
    )

    expect(buildDisabledReasoningPayloadFields(connection)).toEqual({
      thinking: { type: 'disabled' },
    })
  })

  it('leaves custom-compatible request parameters to the custom provider', () => {
    expect(
      buildDisabledReasoningPayloadFields({
        provider: 'custom-compatible',
        endpoint: 'https://example.com/v1',
        apiKey: 'test-key',
        model: 'custom-model',
      }),
    ).toEqual({})
  })
})

describe('fixed OpenRouter model policy', () => {
  it('keeps the two approved models with their provider-specific IDs', () => {
    const modelIds = LLM_PROVIDERS.OPENROUTER_MODELS.map((model) => model.id)

    expect(modelIds).toEqual(['openai/gpt-6-luna', 'deepseek/deepseek-v4.1-flash'])
    expect(modelIds).not.toContain('tencent/hy3')
  })

  it('replaces unsupported legacy models with the fixed default', () => {
    const config = normalizeLLMRefineConfig({
      provider: 'openrouter',
      openrouter: { apiKey: 'test-key', model: 'vendor/unapproved-model' },
    } as unknown as Partial<LLMRefineConfig>)

    expect(config.openrouter.model).toBe(LLM_PROVIDERS.DEFAULT_OPENROUTER_MODEL)
    expect(resolveLLMConnection(config).model).toBe(LLM_PROVIDERS.DEFAULT_OPENROUTER_MODEL)
  })

  it('migrates both older OpenRouter presets without changing the provider choice or API key', () => {
    for (const [model, expected] of [
      ['openai/gpt-5.6-luna', 'openai/gpt-6-luna'],
      ['deepseek/deepseek-v4-flash-0731', 'deepseek/deepseek-v4.1-flash'],
    ]) {
      const config = normalizeLLMRefineConfig({
        provider: 'openrouter',
        openrouter: { apiKey: 'test-key', model },
      } as unknown as Partial<LLMRefineConfig>)

      expect(config.openrouter.model).toBe(expected)
      expect(config.openrouter.apiKey).toBe('test-key')
    }
  })
})

describe('TokenDance provider', () => {
  it('uses the gateway endpoint with the curated default model', () => {
    const config = normalizeLLMRefineConfig({
      provider: 'tokendance',
      tokendance: { apiKey: 'td-key', model: 'deepseek-v4.1-flash' },
    })

    expect(resolveLLMConnection(config)).toEqual({
      provider: 'tokendance',
      endpoint: LLM_PROVIDERS.TOKENDANCE_ENDPOINT,
      apiKey: 'td-key',
      model: LLM_PROVIDERS.DEFAULT_TOKENDANCE_MODEL,
    })
  })

  it('replaces unapproved TokenDance models with the curated default', () => {
    const config = normalizeLLMRefineConfig({
      provider: 'tokendance',
      tokendance: { apiKey: 'td-key', model: 'vendor/unapproved-model' },
    } as unknown as Partial<LLMRefineConfig>)

    expect(config.tokendance.model).toBe(LLM_PROVIDERS.DEFAULT_TOKENDANCE_MODEL)
  })

  it.each(['deepseek-v4-flash-0731', 'glm-5.3-flash'])(
    'migrates the saved %s TokenDance selection without changing the API key',
    (model) => {
      const config = normalizeLLMRefineConfig({
        provider: 'tokendance',
        tokendance: { apiKey: 'td-key', model },
      } as unknown as Partial<LLMRefineConfig>)

      expect(config.tokendance.model).toBe('deepseek-v4.1-flash')
      expect(config.tokendance.apiKey).toBe('td-key')
    },
  )

  it('infers the tokendance provider from a legacy gateway endpoint', () => {
    const config = normalizeLLMRefineConfig({
      endpoint: 'https://tokendance.space/gateway/v1',
      model: 'deepseek-v4.1-flash',
      apiKey: 'td-key',
    })

    expect(config.provider).toBe('tokendance')
    expect(resolveLLMConnection(config)).toMatchObject({
      provider: 'tokendance',
      endpoint: LLM_PROVIDERS.TOKENDANCE_ENDPOINT,
      apiKey: 'td-key',
      model: 'deepseek-v4.1-flash',
    })
  })

  it('sends the X-App-URL attribution header only for tokendance connections', () => {
    const tokendanceConnection = resolveLLMConnection(
      normalizeLLMRefineConfig({
        provider: 'tokendance',
        tokendance: { apiKey: 'td-key', model: 'deepseek-v4.1-flash' },
      }),
    )
    expect(buildLLMAttributionHeaders(tokendanceConnection)).toEqual({
      'X-App-URL': LLM_PROVIDERS.TOKENDANCE_APP_URL,
    })

    const deepseekConnection = resolveLLMConnection(
      normalizeLLMRefineConfig({
        provider: 'deepseek',
        deepseek: { apiKey: 'test-key', model: 'deepseek-flash' },
      }),
    )
    expect(buildLLMAttributionHeaders(deepseekConnection)).toEqual({})
  })
})
