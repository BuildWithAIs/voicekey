import { describe, expect, it } from 'vitest'
import {
  buildRefineSystemPrompt,
  RECORDING,
  STREAMING_ASR,
  STREAMING_PUNCTUATION,
} from './constants'

describe('recording limits', () => {
  it('uses 30-second chunks within a five-minute session', () => {
    expect(RECORDING.CHUNK_DURATION_SECONDS).toBe(30)
    expect(RECORDING.SESSION_MAX_DURATION_SECONDS).toBe(300)
    expect(RECORDING.SESSION_MAX_DURATION_SECONDS / RECORDING.CHUNK_DURATION_SECONDS).toBe(10)
  })
})

describe('streaming ASR assets', () => {
  it('keeps the declared total equal to the three verified model files', () => {
    const assetTotal = STREAMING_ASR.MODEL_FILES.reduce((total, file) => {
      expect(file.sha256).toMatch(/^[a-f0-9]{64}$/u)
      return total + file.sizeBytes
    }, 0)

    expect(assetTotal).toBe(STREAMING_ASR.DOWNLOAD_SIZE_BYTES)
  })

  it('keeps the punctuation asset metadata internally consistent', () => {
    const assetTotal = STREAMING_PUNCTUATION.MODEL_FILES.reduce((total, file) => {
      expect(file.sha256).toMatch(/^[a-f0-9]{64}$/u)
      return total + file.sizeBytes
    }, 0)

    expect(assetTotal).toBe(STREAMING_PUNCTUATION.DOWNLOAD_SIZE_BYTES)
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
