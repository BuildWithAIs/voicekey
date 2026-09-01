import { describe, expect, it } from 'vitest'
import {
  getStreamingTailPaddingSampleCount,
  resolveStreamingInputSampleRate,
} from './streaming-asr-audio'

describe('streaming ASR input sample rate', () => {
  it('remembers the sample rate from the first audio frame', () => {
    expect(resolveStreamingInputSampleRate(null, 48_000)).toBe(48_000)
    expect(resolveStreamingInputSampleRate(48_000, 48_000)).toBe(48_000)
  })

  it('rejects a sample-rate change before passing it to sherpa-onnx', () => {
    expect(() => resolveStreamingInputSampleRate(48_000, 16_000)).toThrow(
      'Streaming audio sample rate changed from 48000 Hz to 16000 Hz',
    )
  })

  it('sizes final tail padding with the captured input sample rate', () => {
    expect(getStreamingTailPaddingSampleCount(48_000, 500)).toBe(24_000)
    expect(getStreamingTailPaddingSampleCount(16_000, 500)).toBe(8_000)
  })
})
