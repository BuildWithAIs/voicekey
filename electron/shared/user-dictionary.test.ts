import { describe, expect, it } from 'vitest'
import { normalizeUserDictionary } from './user-dictionary'

describe('user dictionary at the config boundary', () => {
  it('normalizes and deduplicates spellings without losing case or multilingual text', () => {
    expect(
      normalizeUserDictionary([' Voice  Key ', 'Voice Key', '张小明', 'cafe\u0301', 'café', '']),
    ).toEqual(['Voice Key', '张小明', 'café'])
  })

  it.each([
    null,
    {},
    'word',
    [1],
    ['word\n:99'],
    ['word\u0000'],
    ['word\u202e'],
    ['x'.repeat(81)],
    Array(201).fill('a'),
    Array.from({ length: 110 }, (_, i) => `${i}${'x'.repeat(77)}`),
  ])('rejects malformed or unbounded renderer input', (value) => {
    expect(() => normalizeUserDictionary(value)).toThrow()
  })

  it('accepts an empty dictionary to delete all entries', () => {
    expect(normalizeUserDictionary([])).toEqual([])
  })
})
