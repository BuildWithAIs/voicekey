import { describe, expect, it } from 'vitest'
import { hasSameTranscriptContent, normalizePunctuationOutput } from './streaming-punctuation-text'

describe('streaming punctuation text guards', () => {
  it('normalizes invalid terminal punctuation combinations', () => {
    expect(normalizePunctuationOutput('今天天气很好。。')).toBe('今天天气很好。')
    expect(normalizePunctuationOutput('你今天有时间吗？。')).toBe('你今天有时间吗？')
    expect(normalizePunctuationOutput('测试完成！！')).toBe('测试完成！')
  })

  it('preserves a legitimate ellipsis when the model appends a full stop', () => {
    expect(normalizePunctuationOutput('这个问题让我想想……。')).toBe('这个问题让我想想……')
  })

  it('accepts punctuation and spacing changes without accepting missing words', () => {
    const source = '昨天是 monday today is 礼拜二'

    expect(hasSameTranscriptContent(source, '昨天是monday，today is礼拜二。')).toBe(true)
    expect(hasSameTranscriptContent(source, '昨天是monday，today is。')).toBe(false)
  })
})
