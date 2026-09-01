import { describe, expect, it } from 'vitest'
import { normalizeStreamingASRText } from './streaming-asr-text'

describe('streaming ASR text formatting', () => {
  it('removes model token spaces between Chinese text and punctuation', () => {
    expect(normalizeStreamingASRText(' 今 天 天 气 很 好 ， 我 们 正 在 测 试 。 ')).toBe(
      '今天天气很好，我们正在测试。',
    )
  })

  it('preserves intentional spaces around English spans in mixed text', () => {
    expect(normalizeStreamingASRText('今天用 voice key 测试 local speech recognition 的效果')).toBe(
      '今天用 voice key 测试 local speech recognition 的效果',
    )
  })

  it('removes spaces before ASCII punctuation without rewriting words', () => {
    expect(normalizeStreamingASRText('Voice Key works in real time .')).toBe(
      'Voice Key works in real time.',
    )
  })
})
