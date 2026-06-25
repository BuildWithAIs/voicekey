import axios from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { GLM_ASR, LOCAL_ASR } from '../shared/constants'
import type { ASRConfig } from '../shared/types'
import { ensureLocalASRReady, getLocalASRStatus } from './local-asr-manager'

export interface TranscriptionResult {
  text: string
  id: string
  created: number
  model: string
}

export interface TranscribeAudioOptions {
  prompt?: string
  requestId?: string
}

export class ASRProvider {
  private config: ASRConfig

  constructor(config: ASRConfig) {
    this.config = config
  }

  updateConfig(config: ASRConfig): void {
    this.config = config
  }

  async transcribe(
    audioFilePath: string,
    options: TranscribeAudioOptions = {},
  ): Promise<TranscriptionResult> {
    if (this.config.provider === LOCAL_ASR.PROVIDER) {
      return await this.transcribeLocal(audioFilePath, options)
    }

    return await this.transcribeGlm(audioFilePath, options)
  }

  private async transcribeGlm(
    audioFilePath: string,
    options: TranscribeAudioOptions = {},
  ): Promise<TranscriptionResult> {
    const transcribeStartTime = Date.now()

    const region = this.config.region || 'cn'
    const apiKey = this.config.apiKeys[region]
    if (!apiKey) {
      throw new Error(`API Key not configured for region: ${region}`)
    }

    let endpoint = this.config.endpoint
    if (!endpoint) {
      endpoint = region === 'intl' ? GLM_ASR.ENDPOINT_INTL : GLM_ASR.ENDPOINT
    }

    if (!fs.existsSync(audioFilePath)) {
      throw new Error('Audio file not found')
    }

    try {
      const formDataStartTime = Date.now()
      const formData = new FormData()
      formData.append('file', fs.createReadStream(audioFilePath))
      formData.append('model', GLM_ASR.MODEL)
      formData.append('stream', 'false')

      if (this.config.language) {
        formData.append('language', this.config.language)
      }
      if (options.prompt) {
        formData.append('prompt', options.prompt)
      }
      if (options.requestId) {
        formData.append('request_id', options.requestId)
      }

      const formDataDuration = Date.now() - formDataStartTime
      console.log(`[ASR] FormData preparation took ${formDataDuration}ms`)
      if (options.requestId) {
        console.log(`[ASR] Request ID: ${options.requestId}`)
      }

      const requestStartTime = Date.now()
      console.log(
        `[ASR] [${new Date().toISOString()}] Sending POST request to ASR API (${region})...`,
      )
      console.log(`[ASR] Endpoint: ${endpoint}`)

      const response = await axios.post(endpoint, formData, {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 60000,
        responseType: 'json',
        responseEncoding: 'utf8',
      })

      const requestDuration = Date.now() - requestStartTime
      console.log(`[ASR] [${new Date().toISOString()}] API response received`)
      console.log(`[ASR] API network request took ${requestDuration}ms`)

      if (!response.data || !response.data.text) {
        throw new Error('Invalid response from ASR service')
      }

      const receivedText = response.data.text
      const textHash = createHash('sha256').update(receivedText, 'utf8').digest('hex')
      console.log('[ASR] Text length:', receivedText.length)
      console.log('[ASR] Text hash (sha256):', textHash)

      const totalDuration = Date.now() - transcribeStartTime
      console.log(`[ASR] Total transcribe() call took ${totalDuration}ms`)

      return {
        text: receivedText,
        id: response.data.id || '',
        created: response.data.created || Date.now(),
        model: response.data.model || GLM_ASR.MODEL,
      }
    } catch (error: unknown) {
      const errorDuration = Date.now() - transcribeStartTime
      console.error(`[ASR] Transcription failed after ${errorDuration}ms`)
      if (axios.isAxiosError(error)) {
        const errorData = error.response?.data?.error
        if (errorData) {
          throw new Error(`ASR Error: ${errorData.message || errorData.code || 'Unknown error'}`)
        }
        throw new Error(`Network Error: ${error.message}`)
      }
      throw error
    }
  }

  async testConnection(): Promise<boolean> {
    if (this.config.provider === LOCAL_ASR.PROVIDER) {
      return getLocalASRStatus().ready
    }

    try {
      const region = this.config.region || 'cn'
      const apiKey = this.config.apiKeys[region]

      if (!apiKey) {
        throw new Error('No API Key provided for selected region')
      }

      let endpoint = this.config.endpoint
      if (!endpoint) {
        endpoint = region === 'intl' ? GLM_ASR.ENDPOINT_INTL : GLM_ASR.ENDPOINT
      }

      try {
        await axios.post(
          endpoint,
          {},
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
            timeout: 5000,
          },
        )
        return true
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 400) {
          return true
        }
        throw error
      }
    } catch (error) {
      console.error('Connection test failed:', error)
      return false
    }
  }

  private async transcribeLocal(
    audioFilePath: string,
    options: TranscribeAudioOptions = {},
  ): Promise<TranscriptionResult> {
    const transcribeStartTime = Date.now()

    if (!fs.existsSync(audioFilePath)) {
      throw new Error('Audio file not found')
    }

    const localPaths = ensureLocalASRReady()
    if (options.requestId) {
      console.log(`[ASR:Local] Request ID: ${options.requestId}`)
    }
    console.log(`[ASR:Local] Running ${LOCAL_ASR.MODEL_NAME}`)

    const { stdout, stderr } = await runLocalASR(localPaths.executablePath, [
      '-m',
      localPaths.modelPath,
      '-a',
      audioFilePath,
    ])

    if (stderr.trim().length > 0) {
      console.log(`[ASR:Local] Runtime log: ${stderr.trim()}`)
    }

    const text = normalizeLocalTranscription(stdout)
    const textHash = createHash('sha256').update(text, 'utf8').digest('hex')
    const totalDuration = Date.now() - transcribeStartTime
    console.log('[ASR:Local] Text length:', text.length)
    console.log('[ASR:Local] Text hash (sha256):', textHash)
    console.log(`[ASR:Local] Total transcribe() call took ${totalDuration}ms`)

    return {
      text,
      id: options.requestId || '',
      created: Date.now(),
      model: LOCAL_ASR.MODEL_NAME,
    }
  }
}

function runLocalASR(
  executablePath: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, args, {
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    let settled = false

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new Error('Local ASR timed out'))
    }, LOCAL_ASR.TIMEOUT_MS)

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(error)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)

      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }

      reject(new Error(stderr.trim() || `Local ASR exited with code ${code}`))
    })
  })
}

function normalizeLocalTranscription(stdout: string): string {
  return stdout
    .replace(/<\|[^|]+?\|>/gu, '')
    .replace(/\r\n/g, '\n')
    .trim()
}
