import { describe, expect, it } from 'vitest'
import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { extractAxiosErrorMessage, extractTokenDanceRecoveryHint } from './openai-client'

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
