import { describe, expect, it } from 'vitest'
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
