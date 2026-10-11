/** One spelling per entry; limits also bound decoder graphs and LLM prompt size. */
export const USER_DICTIONARY_LIMITS = { terms: 200, termLength: 80, totalLength: 8000 } as const

export function normalizeUserDictionary(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > USER_DICTIONARY_LIMITS.terms) {
    throw new Error('Dictionary must contain at most 200 entries')
  }
  const terms: string[] = []
  const seen = new Set<string>()
  let totalLength = 0
  for (const item of value) {
    if (typeof item !== 'string' || /[\p{Cc}\p{Cf}\u2028\u2029]/u.test(item)) {
      throw new Error('Dictionary entries must be single-line text')
    }
    const term = item.normalize('NFC').trim().replace(/\s+/gu, ' ')
    if (!term || seen.has(term)) continue
    if (term.length > USER_DICTIONARY_LIMITS.termLength) {
      throw new Error('Dictionary entries must be at most 80 characters')
    }
    totalLength += term.length
    if (totalLength > USER_DICTIONARY_LIMITS.totalLength) {
      throw new Error('Dictionary must contain at most 8000 characters')
    }
    seen.add(term)
    terms.push(term)
  }
  return terms
}
