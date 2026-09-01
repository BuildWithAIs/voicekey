import axios from 'axios'

export type OpenAIMessageContent =
  | string
  | Array<
      | string
      | {
          type?: string
          text?: string
        }
    >

type OpenAIChoice = {
  message?: {
    content?: OpenAIMessageContent
  }
}

export type OpenAIResponse = {
  choices?: OpenAIChoice[]
  error?: {
    message?: string
    code?: string
  }
}

function stripLeadingThinkBlock(content: string): string {
  return content.replace(/^\s*<think>[\s\S]*?<\/think>\s*/i, '').trim()
}

export async function requestChatCompletion(
  endpoint: string,
  apiKey: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
  extraHeaders?: Record<string, string>,
): Promise<OpenAIResponse> {
  const response = await axios.post<OpenAIResponse>(endpoint, payload, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    timeout: timeoutMs,
    responseType: 'json',
    responseEncoding: 'utf8',
  })

  return response.data
}

/**
 * TokenDance signals a confirmed recovery path for failed authorized-key calls via the
 * `TokenDance-Recovery-Action` response header. Map it to a user-actionable hint.
 */
const TOKENDANCE_RECOVERY_HINTS: Record<string, string> = {
  top_up_balance: 'TokenDance balance is insufficient. Top up your TokenDance account, then retry.',
  reauthorize_api_key:
    'TokenDance API key is missing, disabled, or expired. Reconnect TokenDance or enter a new key.',
  api_key_quota:
    'TokenDance API key quota reached. Wait for the quota to refresh, or reconnect TokenDance.',
}

export function extractTokenDanceRecoveryHint(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return ''
  }

  const action = error.response?.headers?.['tokendance-recovery-action']
  if (typeof action !== 'string') {
    return ''
  }

  return TOKENDANCE_RECOVERY_HINTS[action] ?? ''
}

export function extractAxiosErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return 'Unknown error'
  }

  const responseError = error.response?.data
  if (
    typeof responseError === 'object' &&
    responseError &&
    'error' in responseError &&
    typeof responseError.error === 'object' &&
    responseError.error &&
    'message' in responseError.error &&
    typeof responseError.error.message === 'string'
  ) {
    const recoveryHint = extractTokenDanceRecoveryHint(error)
    return recoveryHint
      ? `${responseError.error.message} ${recoveryHint}`
      : responseError.error.message
  }

  const recoveryHint = extractTokenDanceRecoveryHint(error)
  return recoveryHint ? `${error.message} ${recoveryHint}` : error.message
}

export function extractMessageContent(data: OpenAIResponse): string {
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    return ''
  }

  if (typeof content === 'string') {
    return stripLeadingThinkBlock(content)
  }

  const text = content
    .map((part) => {
      if (typeof part === 'string') {
        return part
      }

      return typeof part.text === 'string' ? part.text : ''
    })
    .join('')

  return stripLeadingThinkBlock(text)
}
