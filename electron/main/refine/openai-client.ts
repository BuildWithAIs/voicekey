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
): Promise<OpenAIResponse> {
  const response = await axios.post<OpenAIResponse>(endpoint, payload, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: timeoutMs,
    responseType: 'json',
    responseEncoding: 'utf8',
  })

  return response.data
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
    return responseError.error.message
  }

  return error.message
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
