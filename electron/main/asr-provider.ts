import fs from 'fs'
import { createHash } from 'node:crypto'
import { LOCAL_ASR } from '../shared/constants'
import { runLocalASR } from './local-asr-manager'

export interface TranscriptionResult {
  text: string
  id: string
  created: number
  model: string
}

export interface TranscribeAudioOptions {
  requestId?: string
}

export class ASRProvider {
  async transcribe(
    audioFilePath: string,
    options: TranscribeAudioOptions = {},
  ): Promise<TranscriptionResult> {
    const transcribeStartTime = Date.now()

    if (!fs.existsSync(audioFilePath)) {
      throw new Error('Audio file not found')
    }

    if (options.requestId) {
      console.log(`[ASR:Local] Request ID: ${options.requestId}`)
    }
    console.log(`[ASR:Local] Running ${LOCAL_ASR.MODEL_NAME}`)

    const { stdout, stderr } = await runLocalASR(audioFilePath)

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

function normalizeLocalTranscription(stdout: string): string {
  return stdout
    .replace(/<\|[^|]+?\|>/gu, '')
    .replace(/\r\n/g, '\n')
    .trim()
}
