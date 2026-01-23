import axios from 'axios'
import { GLM_LLM } from '../shared/constants'
import type { AIConfig, ASRConfig } from '../shared/types'

const ROUTER_SYSTEM_PROMPT = `# Role
你是一个文本意图识别与切割引擎。

# Input
用户的语音转文字（ASR）原始内容。

# Task
分析文本**最后一句或后30%片段**，判断用户是否发出了**针对文本的编辑/处理指令**。
注意：“帮我搜索XXX”、“去买菜”属于【正文内容】，不是文本处理指令。

# Output Format (JSON Only)
必须严格输出合法的 JSON 格式，**不要**使用 Markdown 代码块（即不要包含 \`\`\`json 标记），不要输出任何额外文字。
JSON 需包含：
- "type": "CLEANUP" (无指令/对人的指令) 或 "COMMAND" (对文本的操作指令)。
- "body": 需要处理的正文部分（COMMAND模式下需去除指令文本）。
- "instruction": 提取出的具体指令内容（CLEANUP模式下为空字符串）。

# Logic Rules
1. **指令判定**：只有当末尾明确包含“翻译”、“改写”、“代码”、“列表”、“润色”等针对**前文文本**的操作时，才是 COMMAND。
2. **歧义处理**：“帮我查一下”、“去搜索”是对人的指令，视为正文 -> CLEANUP。
3. **复合指令**：如“整理并翻译”，instruction 应包含完整要求。

# Few-Shot Examples
Input: "今天天气真不错适合野餐"
Output: {"type": "CLEANUP", "body": "今天天气真不错适合野餐", "instruction": ""}

Input: "苹果和香蕉都很健康，整理成列表并翻译成英文"
Output: {"type": "COMMAND", "body": "苹果和香蕉都很健康，", "instruction": "整理成列表并翻译成英文"}

Input: "帮我搜索一下奥特曼的信息"
Output: {"type": "CLEANUP", "body": "帮我搜索一下奥特曼的信息", "instruction": ""}

Input: "这段代码有问题帮我修一下"
Output: {"type": "COMMAND", "body": "这段代码有问题", "instruction": "帮我修一下"}
`

const CLEANER_SYSTEM_PROMPT = `# Role
你是一个严格的语音文本清洗助手。

# Input
用户输入的原始文本。

# Rules (Strict)
1. **修正**：修复同音错字（如“在见”->“再见”）、漏字、错误标点。
2. **微调**：去除无意义的口语赘词（如“那个...呃”、“就是那个”）。
3. **禁止**：
   - 严禁改变原意或语气（如“俺”不要改为“我”）。
   - 严禁增加用户没说的内容。
   - 严禁执行“搜索”、“回答问题”等操作，只负责修饰文字。
   - **严禁输出任何“好的”、“修正如下”等废话，只输出结果。**

# Examples
Input: 今天天气呃...真不错，那个适合出去野餐。
Output: 今天天气真不错，适合出去野餐。

Input: 帮我搜索一下奥特曼。
Output: 帮我搜索一下奥特曼。
`

const EXECUTOR_SYSTEM_PROMPT = `# Role
你是一个高标准的文本处理与转换引擎。
你的目标不仅仅是完成任务，而是要根据任务类型提供**专家级**的输出结果。

# Input Structure
用户输入包含两部分：
1. 【待处理文本】(Body)
2. 【处理指令】(Instruction)

# 🚀 Specialized Protocols (核心任务规范)
在执行指令时，必须智能识别任务类型，并严格遵守以下高标准要求：

## 1. 翻译类任务 (Translation)
如果指令涉及翻译（如中译英、英译中等）：
- **信达雅原则**：追求意思表达准确，但**拒绝逐字直译**。
- **地道表达**：使用目标语言母语者常用的习惯用语和句式，避免“翻译腔”（Machine Translation Style）。
- **语体匹配**：除非原文非常正式或指令明确要求，否则**避免使用过于晦涩、书面化**的词汇。保持自然、流畅的交流感。
- **专有名词**：确保人名、地名、技术术语的翻译符合标准惯例。

## 2. 润色/改写类任务 (Polishing/Rewriting)
如果指令涉及润色、修改语病：
- **语义红线**：**严禁改变原文的核心事实和观点**。
- **优化目标**：主要提升流畅度、清晰度和逻辑性。删除冗余的口语废话，使句子紧凑有力。

## 3. 摘要/列表类任务 (Summarization/Formatting)
如果指令涉及总结或转列表：
- **结构化**：优先使用 Markdown 列表格式，确保层级分明。
- **去噪**：剔除无关的寒暄、语气词，只保留核心信息点。

# Execution Logic (执行逻辑)
1. **预处理**：先对【Body】进行静默清洗（修正ASR造成的同音错字、标点缺失）。
2. **执行**：应用上述 [Specialized Protocols] 执行【Instruction】。
3. **复合指令**：若指令为“润色并翻译”，先在原语言下润色，再应用高标准翻译协议。

# Output Constraints
- **结果唯一**：只输出最终处理结果，不包含任何“好的”、“翻译如下”等废话。
- **不重复**：不要在输出前重复原文。
- **代码保护**：如果用户要求转代码，只输出代码块。

# Examples

## Case 1 (Translation - Idiomatic)
Body: "这个项目太难了，我感觉我要挂了。"
Instruction: "翻译成地道的英文"
Output: This project is insane; I feel like I'm going to fail.
*(注：使用了 insane 和 fail，而不是 literal translation "hang up" or overly formal "terminate")*

## Case 2 (Polishing)
Body: "那个...我觉得吧，这个方案可能、大概不太行，因为成本太高了。"
Instruction: "润色一下，要专业点"
Output: 我认为该方案不可行，因为成本过高。

## Case 3 (Mixed)
Body: "苹果富含维C，香蕉有钾，都挺好的"
Instruction: "整理成列表并翻译成英文"
Output:
- Apples: Rich in Vitamin C.
- Bananas: Rich in potassium.
`

interface LLMDeltaContentItem {
  type?: string
  text?: string
}

interface LLMStreamChunkChoiceDelta {
  role?: string
  content?: string | LLMDeltaContentItem[]
}

interface LLMStreamChunkChoice {
  index?: number
  delta?: LLMStreamChunkChoiceDelta
}

interface LLMStreamChunk {
  choices?: LLMStreamChunkChoice[]
  error?: {
    message?: string
    code?: string
  }
}

interface LLMChatMessage {
  role: 'system' | 'user'
  content: string
}

interface LLMChatResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>
    }
  }>
  error?: {
    message?: string
    code?: string
  }
}

type RouterType = 'CLEANUP' | 'COMMAND'

interface RouterResult {
  type: RouterType
  body: string
  instruction: string
}

type StreamListener = (...args: unknown[]) => void

type StreamLike = {
  on: (event: 'data' | 'end' | 'error', listener: StreamListener) => void
  off: (event: 'data' | 'end' | 'error', listener: StreamListener) => void
  destroy?: () => void
}

export interface LLMStreamOptions {
  onToken?: (token: string) => void
}

export class LLMProvider {
  private asrConfig: ASRConfig
  private aiConfig: AIConfig

  constructor(asrConfig: ASRConfig, aiConfig: AIConfig) {
    this.asrConfig = asrConfig
    this.aiConfig = aiConfig
  }

  updateConfig(asrConfig: ASRConfig, aiConfig: AIConfig): void {
    this.asrConfig = asrConfig
    this.aiConfig = aiConfig
  }

  async processText(input: string, options: LLMStreamOptions = {}): Promise<string> {
    const routerResult = await this.routeInput(input)
    if (routerResult.type === 'CLEANUP') {
      return await this.streamWithPrompt(CLEANER_SYSTEM_PROMPT, routerResult.body, options)
    }
    return await this.streamWithPrompt(
      EXECUTOR_SYSTEM_PROMPT,
      this.formatExecutorInput(routerResult.body, routerResult.instruction),
      options,
    )
  }

  private resolveRequestConfig(): { endpoint: string; apiKey: string; model: string } {
    const region = this.asrConfig.region || 'cn'
    const apiKey = this.asrConfig.apiKeys?.[region]
    if (!apiKey) {
      throw new Error(`API Key not configured for region: ${region}`)
    }
    const endpoint = region === 'intl' ? GLM_LLM.ENDPOINT_INTL : GLM_LLM.ENDPOINT
    const model = this.aiConfig.model || GLM_LLM.MODEL
    return { endpoint, apiKey, model }
  }

  private async routeInput(input: string): Promise<RouterResult> {
    const messages: LLMChatMessage[] = [
      { role: 'system', content: ROUTER_SYSTEM_PROMPT },
      { role: 'user', content: input },
    ]
    const raw = await this.requestCompletion(messages, { response_format: { type: 'json_object' } })
    return this.parseRouterResult(raw, input)
  }

  private parseRouterResult(raw: string, fallbackBody: string): RouterResult {
    const fallback: RouterResult = {
      type: 'CLEANUP',
      body: fallbackBody,
      instruction: '',
    }
    if (!raw) {
      return fallback
    }

    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```$/i, '')
      .trim()
    let parsed: Partial<RouterResult> | null = null

    try {
      parsed = JSON.parse(cleaned) as Partial<RouterResult>
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (match) {
        try {
          parsed = JSON.parse(match[0]) as Partial<RouterResult>
        } catch {
          parsed = null
        }
      }
    }

    if (!parsed) {
      return fallback
    }

    const type = parsed.type === 'COMMAND' ? 'COMMAND' : 'CLEANUP'
    const body =
      typeof parsed.body === 'string' && parsed.body.trim() ? parsed.body.trim() : fallbackBody
    const instruction = typeof parsed.instruction === 'string' ? parsed.instruction.trim() : ''

    if (type === 'COMMAND' && (!instruction || !body)) {
      return fallback
    }

    return { type, body, instruction }
  }

  private formatExecutorInput(body: string, instruction: string): string {
    return `待处理文本：${body}\n用户指令：${instruction}`
  }

  private async requestCompletion(
    messages: LLMChatMessage[],
    extraPayload: Record<string, unknown> = {},
  ): Promise<string> {
    const { endpoint, apiKey, model } = this.resolveRequestConfig()
    const response = await axios.post<LLMChatResponse>(
      endpoint,
      {
        model,
        stream: false,
        do_sample: false,
        messages,
        ...extraPayload,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      },
    )

    const data = response.data
    if (data.error?.message || data.error?.code) {
      throw new Error(data.error.message || data.error.code || 'LLM request error')
    }

    const content = data.choices?.[0]?.message?.content
    if (typeof content === 'string') {
      return content
    }
    if (Array.isArray(content)) {
      return content.map((item) => item.text || '').join('')
    }
    throw new Error('Invalid LLM response')
  }

  private async streamWithPrompt(
    systemPrompt: string,
    input: string,
    options: LLMStreamOptions = {},
  ): Promise<string> {
    const { endpoint, apiKey, model } = this.resolveRequestConfig()

    const response = await axios.post(
      endpoint,
      {
        model,
        stream: true,
        do_sample: false,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: input,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        responseType: 'stream',
        timeout: 120000,
      },
    )

    const stream = response.data as StreamLike
    let buffered = ''
    let done = false
    let output = ''

    const extractContent = (chunk: LLMStreamChunk): string => {
      const content = chunk.choices?.[0]?.delta?.content
      if (typeof content === 'string') {
        return content
      }
      if (Array.isArray(content)) {
        return content.map((item) => item.text || '').join('')
      }
      return ''
    }

    return await new Promise((resolve, reject) => {
      let settled = false

      const cleanup = () => {
        stream.off('data', onData as StreamListener)
        stream.off('error', onError as StreamListener)
        stream.off('end', onEnd as StreamListener)
      }

      const finish = (error?: Error, text?: string) => {
        if (settled) return
        settled = true
        cleanup()
        if (error) {
          reject(error)
          return
        }
        resolve(text ?? '')
      }

      const handleLine = (line: string) => {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) return

        const payload = trimmed.replace(/^data:\s*/, '')
        if (!payload) {
          return
        }
        if (payload === '[DONE]') {
          done = true
          stream.destroy?.()
          finish(undefined, output)
          return
        }

        try {
          const parsed = JSON.parse(payload) as LLMStreamChunk
          if (parsed.error?.message || parsed.error?.code) {
            const message = parsed.error?.message || parsed.error?.code || 'LLM stream error'
            finish(new Error(message))
            return
          }
          const delta = extractContent(parsed)
          if (delta) {
            output += delta
            options.onToken?.(delta)
          }
        } catch (error) {
          console.warn('[LLM] Failed to parse stream chunk:', error)
        }
      }

      const onData = (chunk: Buffer) => {
        buffered += chunk.toString('utf8')
        const lines = buffered.split(/\r?\n/)
        buffered = lines.pop() ?? ''
        lines.forEach(handleLine)
      }

      const onEnd = () => {
        if (!done) {
          finish(new Error('LLM stream ended unexpectedly'))
        }
      }

      const onError = (error: Error) => {
        finish(error)
      }

      stream.on('data', onData as StreamListener)
      stream.on('end', onEnd as StreamListener)
      stream.on('error', onError as StreamListener)
    })
  }
}
