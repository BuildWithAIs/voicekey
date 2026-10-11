/**
 * X-ASR ships tokens.txt without the training tokenizer. Build a vocabulary for
 * sherpa's simple-sentencepiece encoder using coverage-first scores
 * (fewest pieces among fully covered paths). This is a valid biasing path, not the original training BPE.
 * Chinese characters need individual word boundaries (e.g. ▁语 ▁音).
 */
export function buildStreamingHotwords(tokensText: string, terms: readonly string[]) {
  const tokens = tokensText
    .split(/\r?\n/u)
    .map((line) => /^(\S+)\s+\d+$/u.exec(line)?.[1])
    .filter((token): token is string => token !== undefined && !token.startsWith('<'))
  const tokenSet = new Set(tokens)
  const maxTokenLength = Math.max(0, ...tokens.map((token) => token.length))

  // Reject whole phrases that cannot be represented, rather than accidentally
  // biasing a partial phrase or allowing sherpa's :score syntax in user input.
  function canEncode(word: string): boolean {
    if (word.startsWith(':')) return false
    const text = `▁${word}`
    const reachable = new Set([0])
    for (let start = 0; start < text.length; start += 1) {
      if (!reachable.has(start)) continue
      for (let end = start + 1; end <= Math.min(text.length, start + maxTokenLength); end += 1) {
        if (tokenSet.has(text.slice(start, end))) reachable.add(end)
      }
    }
    return reachable.has(text.length)
  }

  const phrases = new Set<string>()
  for (const term of terms) {
    for (const variant of new Set([term, term.toLowerCase()])) {
      const words = variant
        .replace(/(\p{Script=Han})/gu, ' $1 ')
        .trim()
        .split(/\s+/u)
      if (words.length && words.every(canEncode)) phrases.add(words.join(' '))
    }
  }
  return {
    vocabulary: `${tokens.map((token) => `${token}\t${Buffer.byteLength(token, 'utf8') * 1000 - 1}`).join('\n')}\n`,
    hotwords: [...phrases].join('\n'),
  }
}
