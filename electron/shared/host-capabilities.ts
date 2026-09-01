import { STREAMING_ASR } from './constants'

const GIB = 1024 * 1024 * 1024

export type StreamingAsrHostEvaluation = {
  logicalCpuCount: number
  memoryBytes: number
  meetsCpu: boolean
  meetsMemory: boolean
  meetsStreamingAsrRecommendation: boolean
}

export function evaluateStreamingAsrHost(input: {
  logicalCpuCount: number
  memoryBytes: number
}): StreamingAsrHostEvaluation {
  const logicalCpuCount = Number.isFinite(input.logicalCpuCount)
    ? Math.max(0, Math.trunc(input.logicalCpuCount))
    : 0
  const memoryBytes = Number.isFinite(input.memoryBytes) ? Math.max(0, input.memoryBytes) : 0
  const meetsCpu = logicalCpuCount >= STREAMING_ASR.MIN_LOGICAL_CPU_CORES
  const meetsMemory = memoryBytes >= STREAMING_ASR.MEMORY_CLASS_BYTES

  return {
    logicalCpuCount,
    memoryBytes,
    meetsCpu,
    meetsMemory,
    meetsStreamingAsrRecommendation: meetsCpu && meetsMemory,
  }
}

export function formatHostMemoryGiB(memoryBytes: number): number {
  if (!Number.isFinite(memoryBytes) || memoryBytes <= 0) return 0
  return Math.max(1, Math.round(memoryBytes / GIB))
}
