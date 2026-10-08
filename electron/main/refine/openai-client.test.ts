import { afterEach, describe, expect, it, vi } from 'vitest'
import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import {
  extractAxiosErrorMessage,
  extractMessageContent,
  extractTokenDanceRecoveryHint,
  requestChatCompletion,
  type ChatCompletionPayload,
} from './openai-client'

afterEach(() => vi.restoreAllMocks())

describe('Anthropic Messages requests', () => {
  const payload: ChatCompletionPayload = {
    model: 'claude-haiku-5-5',
    messages: [
      { role: 'system', content: 'Edit the transcript.' },
      { role: 'user', content: '你好世界' },
    ],
  }

  it('sends native authentication and system instructions with thinking disabled', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: {
        content: [
          { type: 'thinking', text: 'hidden thoughts' },
          { type: 'text', text: '你好，' },
          { type: 'text', text: '世界！' },
        ],
        stop_reason: 'end_turn',
      },
    })

    const response = await requestChatCompletion(
      'https://api.anthropic.com/v1/messages',
      'anthropic-key',
      payload,
      30000,
      {},
      'anthropic',
    )

    expect(post).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-5-5',
        system: 'Edit the transcript.',
        messages: [{ role: 'user', content: '你好世界' }],
        max_tokens: expect.any(Number),
        thinking: { type: 'disabled' },
        output_config: { effort: 'low' },
      },
      {
        headers: {
          'x-api-key': 'anthropic-key',
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout: 30000,
        responseType: 'json',
        responseEncoding: 'utf8',
      },
    )
    expect(extractMessageContent(response)).toBe('你好，世界！')
  })

  it('rejects truncated output so it cannot replace the original text', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({
      data: { content: [{ type: 'text', text: 'partial' }], stop_reason: 'max_tokens' },
    })

    await expect(
      requestChatCompletion(
        'https://api.anthropic.com/v1/messages',
        'key',
        payload,
        30000,
        {},
        'anthropic',
      ),
    ).rejects.toThrow('output token limit reached')
  })

  it('preserves Anthropic API errors for the existing error handler', async () => {
    const error = createAxiosError('Unauthorized', {
      status: 401,
      data: { type: 'error', error: { type: 'authentication_error', message: 'Invalid API key' } },
      headers: {},
    })
    vi.spyOn(axios, 'post').mockRejectedValue(error)

    await expect(
      requestChatCompletion(
        'https://api.anthropic.com/v1/messages',
        'key',
        payload,
        30000,
        {},
        'anthropic',
      ),
    ).rejects.toBe(error)
    expect(extractAxiosErrorMessage(error)).toBe('Invalid API key')
  })
})

function createAxiosError(
  message: string,
  response?: Pick<AxiosResponse, 'status' | 'data' | 'headers'>,
): AxiosError {
  const config = { headers: new axios.AxiosHeaders() } as InternalAxiosRequestConfig
  const fullResponse: AxiosResponse | undefined = response && {
    statusText: '',
    config,
    ...response,
  }
  return new AxiosError(message, 'ERR_BAD_REQUEST', config, undefined, fullResponse)
}

describe('TokenDance recovery action hints', () => {
  it('appends a top-up hint when TokenDance reports insufficient balance', () => {
    const error = createAxiosError('Request failed with status code 402', {
      status: 402,
      data: { error: { message: 'Insufficient balance' } },
      headers: { 'tokendance-recovery-action': 'top_up_balance' },
    })

    expect(extractAxiosErrorMessage(error)).toBe(
      'Insufficient balance TokenDance balance is insufficient. Top up your TokenDance account, then retry.',
    )
  })

  it('hints reauthorization when the API key is invalid or expired', () => {
    const error = createAxiosError('Request failed with status code 401', {
      status: 401,
      data: { error: { message: 'Invalid API key' } },
      headers: { 'tokendance-recovery-action': 'reauthorize_api_key' },
    })

    expect(extractTokenDanceRecoveryHint(error)).toContain('Reconnect TokenDance')
    expect(extractAxiosErrorMessage(error)).toContain('Invalid API key')
  })

  it('ignores unknown recovery actions and non-axios errors', () => {
    const unknownAction = createAxiosError('Request failed', {
      status: 500,
      data: { error: { message: 'Server error' } },
      headers: { 'tokendance-recovery-action': 'something_else' },
    })

    expect(extractTokenDanceRecoveryHint(unknownAction)).toBe('')
    expect(extractAxiosErrorMessage(unknownAction)).toBe('Server error')
    expect(extractTokenDanceRecoveryHint(new Error('boom'))).toBe('')
  })
})
