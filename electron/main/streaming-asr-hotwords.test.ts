import { describe, expect, it } from 'vitest'
import { buildStreamingHotwords } from './streaming-asr-hotwords'

const tokens = [
  '<blk>',
  '<sos/eos>',
  '▁张',
  '▁小',
  '▁明',
  '▁Voice',
  '▁Key',
  '▁voice',
  '▁key',
  '▁C',
  '+',
  '#',
  '▁:99',
]
  .map((token, index) => `${token} ${index}`)
  .join('\n')

describe('X-ASR dictionary encoding', () => {
  it('uses word boundaries for Chinese and preserves English phrase boundaries and casing', () => {
    expect(
      buildStreamingHotwords(tokens, ['张小明', 'Voice Key', '张小明Voice Key']).hotwords,
    ).toBe('张 小 明\nVoice Key\nvoice key\n张 小 明 Voice Key\n张 小 明 voice key')
  })

  it('keeps supported punctuation and rejects score injection and whole out-of-vocabulary phrases', () => {
    expect(
      buildStreamingHotwords(tokens, ['C++', 'C#', '张罕见字', 'Voice :99', '🙂']).hotwords,
    ).toBe('C++\nC#')
  })

  it('does not enable biasing with no usable terms', () => {
    expect(buildStreamingHotwords(tokens, []).hotwords).toBe('')
    expect(buildStreamingHotwords(tokens, ['🙂']).hotwords).toBe('')
  })

  it('excludes special tokens from the derived vocabulary', () => {
    const result = buildStreamingHotwords(tokens, ['张小明'])
    expect(result.vocabulary).not.toContain('<blk>')
    expect(result.vocabulary).toContain('▁张\t5999')
  })
})
