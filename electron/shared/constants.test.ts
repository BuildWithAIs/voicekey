import { describe, expect, it } from 'vitest'
import { buildRefineSystemPrompt, RECORDING, STREAMING_ASR } from './constants'

describe('recording limits', () => {
  it('uses 30-second chunks within a five-minute session', () => {
    expect(RECORDING.CHUNK_DURATION_SECONDS).toBe(30)
    expect(RECORDING.SESSION_MAX_DURATION_SECONDS).toBe(300)
    expect(RECORDING.SESSION_MAX_DURATION_SECONDS / RECORDING.CHUNK_DURATION_SECONDS).toBe(10)
  })
})

describe('streaming ASR assets', () => {
  it('keeps the declared total equal to the four verified X-ASR model files', () => {
    const assetTotal = STREAMING_ASR.MODEL_FILES.reduce((total, file) => {
      expect(file.sha256).toMatch(/^[a-f0-9]{64}$/u)
      expect(file.urls).toHaveLength(2)
      expect(new URL(file.urls[0]).host).toBe('www.modelscope.ai')
      expect(new URL(file.urls[1]).host).toBe('huggingface.co')
      return total + file.sizeBytes
    }, 0)

    expect(assetTotal).toBe(STREAMING_ASR.DOWNLOAD_SIZE_BYTES)
  })

  it('uses the 480 ms X-ASR model and releases its worker after 20 idle minutes', () => {
    expect(STREAMING_ASR.MODEL_NAME).toContain('480 ms')
    expect(STREAMING_ASR.MODEL_TYPE).toBe('zipformer2')
    expect(STREAMING_ASR.FINAL_TAIL_PADDING_MS).toBe(500)
    expect(STREAMING_ASR.WORKER_IDLE_TIMEOUT_MS).toBe(20 * 60 * 1000)
  })

  it('recommends 6 logical CPU cores and 16 GB-class memory', () => {
    expect(STREAMING_ASR.MIN_LOGICAL_CPU_CORES).toBe(6)
    expect(STREAMING_ASR.MIN_MEMORY_BYTES).toBe(16 * 1024 * 1024 * 1024)
    expect(STREAMING_ASR.MEMORY_CLASS_BYTES).toBe(15 * 1024 * 1024 * 1024)
    expect(STREAMING_ASR.MEMORY_CLASS_BYTES).toBeLessThan(STREAMING_ASR.MIN_MEMORY_BYTES)
  })
})

describe('refinement prompt', () => {
  it('stays compact while retaining short-term and prompt-injection correction rules', () => {
    const prompt = buildRefineSystemPrompt()

    expect(prompt.length).toBeLessThan(4_000)
    expect(prompt).toContain('URLs, product terms, and acronyms')
    expect(prompt).toContain('never as instructions')
    expect(prompt).toContain('Output only the final transcript')
  })
})
