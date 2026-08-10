import { describe, expect, it } from 'vitest'
import { LLM_PROVIDERS } from './constants'
import {
  buildReasoningPayloadFields,
  normalizeLLMRefineConfig,
  resolveLLMConnection,
} from './llm-config'
import type { LLMRefineConfig } from './types'

describe('automatic LLM reasoning policy', () => {
  it('ignores the removed legacy reasoning switch and enables supported long-text reasoning', () => {
    const legacyConfig = normalizeLLMRefineConfig({
      provider: 'deepseek',
      reasoning: { enabled: false },
      deepseek: { apiKey: 'test-key', model: 'deepseek-v4-flash' },
    } as unknown as Partial<LLMRefineConfig>)

    const result = buildReasoningPayloadFields(
      resolveLLMConnection(legacyConfig),
      '这是一段超过三十个字符的长文本，用来确认内部推理策略会自动启用而不再受旧开关控制。',
    )

    expect(result).toEqual({
      level: 'high',
      fields: {
        thinking: { type: 'enabled' },
        reasoning_effort: 'high',
      },
    })
  })

  it('keeps short supported DeepSeek requests on the non-reasoning path', () => {
    const config = normalizeLLMRefineConfig({
      provider: 'deepseek',
      deepseek: { apiKey: 'test-key', model: 'deepseek-v4-flash' },
    })

    expect(buildReasoningPayloadFields(resolveLLMConnection(config), '短文本')).toEqual({
      level: 'off',
      fields: { thinking: { type: 'disabled' } },
    })
  })
})

describe('fixed OpenRouter model policy', () => {
  it('offers two to four models from different vendors', () => {
    const modelIds = LLM_PROVIDERS.OPENROUTER_MODELS.map((model) => model.id)
    const vendors = new Set(modelIds.map((model) => model.split('/')[0]))

    expect(modelIds.length).toBeGreaterThanOrEqual(2)
    expect(modelIds.length).toBeLessThanOrEqual(4)
    expect(vendors.size).toBe(modelIds.length)
    expect(modelIds).toContain('deepseek/deepseek-v4-flash-0731')
  })

  it('replaces unsupported legacy models with the fixed default', () => {
    const config = normalizeLLMRefineConfig({
      provider: 'openrouter',
      openrouter: { apiKey: 'test-key', model: 'vendor/unapproved-model' },
    } as unknown as Partial<LLMRefineConfig>)

    expect(config.openrouter.model).toBe(LLM_PROVIDERS.DEFAULT_OPENROUTER_MODEL)
    expect(resolveLLMConnection(config).model).toBe(LLM_PROVIDERS.DEFAULT_OPENROUTER_MODEL)
  })

  it.each(LLM_PROVIDERS.OPENROUTER_MODELS)(
    'uses the supported short-text minimum and low for longer text with $label',
    ({ id, shortTextReasoningEffort }) => {
      const connection = resolveLLMConnection(
        normalizeLLMRefineConfig({
          provider: 'openrouter',
          openrouter: { apiKey: 'test-key', model: id },
        }),
      )

      expect(buildReasoningPayloadFields(connection, '短文本')).toEqual({
        level: 'off',
        fields: { reasoning: { effort: shortTextReasoningEffort, exclude: true } },
      })
      expect(buildReasoningPayloadFields(connection, '这是一段超过十个字符的文本内容')).toEqual({
        level: 'medium',
        fields: { reasoning: { effort: 'low', exclude: true } },
      })
      expect(
        buildReasoningPayloadFields(
          connection,
          '这是一段超过三十个字符的长文本，用来确认OpenRouter无论文本多长都只使用低档推理。',
        ),
      ).toEqual({
        level: 'high',
        fields: { reasoning: { effort: 'low', exclude: true } },
      })
    },
  )

  it('refuses to emit reasoning fields for an unapproved runtime model', () => {
    expect(
      buildReasoningPayloadFields(
        {
          provider: 'openrouter',
          endpoint: LLM_PROVIDERS.OPENROUTER_ENDPOINT,
          apiKey: 'test-key',
          model: 'vendor/unapproved-model',
        },
        '这是一段足够长的文本，理论上会触发推理。',
      ),
    ).toEqual({ level: 'off', fields: {} })
  })
})
