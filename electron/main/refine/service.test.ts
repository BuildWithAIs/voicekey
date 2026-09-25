import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultLLMRefineConfig, normalizeLLMRefineConfig } from '../../shared/llm-config'
import { requestChatCompletion } from './openai-client'
import { RefineService } from './service'

vi.mock('./openai-client', async (importOriginal) => {
  const original = await importOriginal<typeof import('./openai-client')>()
  return {
    ...original,
    requestChatCompletion: vi.fn(),
  }
})

const requestChatCompletionMock = vi.mocked(requestChatCompletion)

function createService(flags: { enabled?: boolean; translateOutput?: boolean } = {}) {
  const config = normalizeLLMRefineConfig({
    ...defaultLLMRefineConfig,
    enabled: flags.enabled ?? true,
    translateOutput: flags.translateOutput ?? false,
    provider: 'deepseek',
    deepseek: {
      ...defaultLLMRefineConfig.deepseek,
      apiKey: 'test-key',
    },
  })

  return new RefineService({
    getRefineConfig: () => config,
    getTargetLanguage: () => 'english',
  })
}

describe('RefineService dictation requests', () => {
  beforeEach(() => {
    requestChatCompletionMock.mockReset()
    requestChatCompletionMock.mockResolvedValue({
      choices: [{ message: { content: 'https://GitHub.com/OpenAI' } }],
    })
  })

  it('does not skip cloud refinement for a short transcript', async () => {
    const service = createService()

    await expect(service.refineText('githab')).resolves.toBe('https://GitHub.com/OpenAI')
    expect(requestChatCompletionMock).toHaveBeenCalledTimes(1)
  })

  it('explicitly disables thinking in the single refinement request', async () => {
    const service = createService()

    await service.refineText('这是一段需要整理的长文本，但不应该触发推理模式。')

    const payload = requestChatCompletionMock.mock.calls[0]?.[2]
    expect(payload).toMatchObject({
      thinking: { type: 'disabled' },
    })
    expect(requestChatCompletionMock).toHaveBeenCalledTimes(1)
  })

  it('cleans up and translates dictation when only translation is enabled', async () => {
    const service = createService({ enabled: false, translateOutput: true })

    expect(service.isEnabled()).toBe(true)
    expect(service.isDictationTranslationEnabled()).toBe(true)
    await service.refineText('嗯，我想说这个方案可以做。')

    expect(requestChatCompletionMock).toHaveBeenCalledTimes(1)
    const payload = requestChatCompletionMock.mock.calls[0]?.[2]
    expect(payload).toMatchObject({
      messages: expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining(
            'First apply the transcript cleanup rules, then translate',
          ),
        }),
      ]),
    })
    expect(payload).toMatchObject({
      messages: expect.arrayContaining([
        expect.objectContaining({ content: expect.stringContaining('only in English') }),
      ]),
    })
  })

  it('skips the LLM when both dictation options are disabled', async () => {
    const service = createService({ enabled: false, translateOutput: false })

    expect(service.isEnabled()).toBe(false)
    expect(service.isDictationTranslationEnabled()).toBe(false)
    await expect(service.refineText('raw transcript')).resolves.toBe('raw transcript')
    expect(requestChatCompletionMock).not.toHaveBeenCalled()
  })
})

describe('RefineService TokenDance attribution', () => {
  beforeEach(() => {
    requestChatCompletionMock.mockReset()
    requestChatCompletionMock.mockResolvedValue({
      choices: [{ message: { content: 'polished text' } }],
    })
  })

  it('sends the X-App-URL attribution header for TokenDance connections', async () => {
    const config = normalizeLLMRefineConfig({
      ...defaultLLMRefineConfig,
      enabled: true,
      provider: 'tokendance',
      tokendance: {
        ...defaultLLMRefineConfig.tokendance,
        apiKey: 'td-key',
      },
    })
    const service = new RefineService({
      getRefineConfig: () => config,
      getTargetLanguage: () => 'en',
    })

    await service.refineText('hello world')

    expect(requestChatCompletionMock).toHaveBeenCalledTimes(1)
    expect(requestChatCompletionMock.mock.calls[0]?.[0]).toBe(
      'https://tokendance.space/gateway/v1/chat/completions',
    )
    expect(requestChatCompletionMock.mock.calls[0]?.[4]).toEqual({
      'X-App-URL': 'https://voicekey.buildwithais.com/',
    })
  })
})
