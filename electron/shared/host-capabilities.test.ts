import { describe, expect, it } from 'vitest'
import { STREAMING_ASR } from './constants'
import { evaluateStreamingAsrHost, formatHostMemoryGiB } from './host-capabilities'

const GIB = 1024 * 1024 * 1024

describe('evaluateStreamingAsrHost', () => {
  it('rejects fewer than 6 logical CPU cores', () => {
    const result = evaluateStreamingAsrHost({
      logicalCpuCount: 5,
      memoryBytes: 32 * GIB,
    })

    expect(result.meetsCpu).toBe(false)
    expect(result.meetsMemory).toBe(true)
    expect(result.meetsStreamingAsrRecommendation).toBe(false)
  })

  it('accepts 6 logical CPU cores', () => {
    const result = evaluateStreamingAsrHost({
      logicalCpuCount: 6,
      memoryBytes: 32 * GIB,
    })

    expect(result.meetsCpu).toBe(true)
    expect(result.meetsStreamingAsrRecommendation).toBe(true)
  })

  it('rejects memory below the 16 GB class threshold', () => {
    const result = evaluateStreamingAsrHost({
      logicalCpuCount: 8,
      memoryBytes: 14.9 * GIB,
    })

    expect(result.meetsMemory).toBe(false)
    expect(result.meetsStreamingAsrRecommendation).toBe(false)
  })

  it('accepts 15 GiB as a 16 GB-class machine with reserved RAM', () => {
    const result = evaluateStreamingAsrHost({
      logicalCpuCount: 8,
      memoryBytes: STREAMING_ASR.MEMORY_CLASS_BYTES,
    })

    expect(result.meetsMemory).toBe(true)
    expect(result.meetsStreamingAsrRecommendation).toBe(true)
  })

  it('requires both CPU and memory to meet the recommendation', () => {
    const result = evaluateStreamingAsrHost({
      logicalCpuCount: 4,
      memoryBytes: 8 * GIB,
    })

    expect(result.meetsCpu).toBe(false)
    expect(result.meetsMemory).toBe(false)
    expect(result.meetsStreamingAsrRecommendation).toBe(false)
  })
})

describe('formatHostMemoryGiB', () => {
  it('rounds installed memory to a whole number of GiB', () => {
    expect(formatHostMemoryGiB(8 * GIB)).toBe(8)
    expect(formatHostMemoryGiB(15.6 * GIB)).toBe(16)
    expect(formatHostMemoryGiB(STREAMING_ASR.MIN_MEMORY_BYTES)).toBe(16)
  })
})
