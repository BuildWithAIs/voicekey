import { GLM_LLM } from '../shared/constants'
import type { ASRConfig, LLMConfig } from '../shared/types'

export interface PolishResult {
  text: string
  success: boolean
}

// 只定义我们需要的最小响应结构
interface LLMResponse {
  choices: Array<{
    message: { content: string }
  }>
}

const POLISH_PROMPT = `润色以下语音转写文本，要求：
1. 去除语气词（嗯、啊、那个等）
2. 精简冗余但保留原意
3. 保持段落结构
4. 直接输出文本，不要解释`

export class LLMProvider {
  private llmConfig: LLMConfig
  private asrConfig: ASRConfig

  constructor(llmConfig: LLMConfig, asrConfig: ASRConfig) {
    this.llmConfig = llmConfig
    this.asrConfig = asrConfig
  }

  // 更新配置
  updateConfig(llmConfig: LLMConfig, asrConfig: ASRConfig): void {
    this.llmConfig = llmConfig
    this.asrConfig = asrConfig
  }

  // 获取 API Key
  private getApiKey(): string {
    const region = this.asrConfig.region || 'cn'
    
    // 如果使用 ASR 相同的 Key，则使用 ASR 的 Key
    if (this.llmConfig.useASRKey) {
      return this.asrConfig.apiKeys[region]
    }
    
    // 否则使用 LLM 自己的 Key
    return this.llmConfig.apiKeys[region]
  }

  // 获取 Endpoint
  private getEndpoint(): string {
    const region = this.asrConfig.region || 'cn'
    
    // 使用用户配置的 endpoint 如果有的话
    if (this.llmConfig.endpoint) {
      return this.llmConfig.endpoint
    }
    
    // 根据 region 选择默认 endpoint
    return region === 'intl' ? GLM_LLM.ENDPOINT_INTL : GLM_LLM.ENDPOINT
  }

  // 润色文本
  async polishText(text: string): Promise<PolishResult> {
    const startTime = Date.now()
    
    // 如果 LLM 功能未启用，直接返回原文
    if (!this.llmConfig.enabled) {
      return { text, success: true }
    }

    const apiKey = this.getApiKey()
    if (!apiKey) {
      console.log('[LLM] No API key available, skipping polish')
      return { text, success: true }
    }

    const endpoint = this.getEndpoint()
    const model = this.llmConfig.model || GLM_LLM.DEFAULT_MODEL

    try {
      console.log(`[LLM] Starting text polish with model: ${model}`)
      console.log(`[LLM] Text length: ${text.length} characters`)

      const requestBody = {
        model,
        messages: [
          { role: 'system', content: POLISH_PROMPT },
          { role: 'user', content: text },
        ],
        max_tokens: GLM_LLM.MAX_TOKENS,
        temperature: GLM_LLM.TEMPERATURE,
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(GLM_LLM.TIMEOUT),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const data: LLMResponse = await response.json()
      const polishedText = data.choices?.[0]?.message?.content?.trim()
      
      if (!polishedText) {
        throw new Error('Empty response from LLM')
      }

      console.log(`[LLM] Polish completed in ${Date.now() - startTime}ms, length: ${polishedText.length}`)

      return { text: polishedText, success: true }
    } catch (error) {
      console.error('[LLM] Polish failed:', error)
      return { text, success: false }
    }
  }

  async testConnection(): Promise<boolean> {
    const apiKey = this.getApiKey()
    if (!apiKey) return false

    try {
      const response = await fetch(this.getEndpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.llmConfig.model || GLM_LLM.DEFAULT_MODEL,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(10000),
      })
      return response.ok
    } catch {
      return false
    }
  }
}
