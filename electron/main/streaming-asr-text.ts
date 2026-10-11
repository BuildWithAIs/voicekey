const CJK_RANGE = '\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff'
const CJK_PUNCTUATION = '，。！？；：、（）《》〈〉【】「」『』“”‘’'

const BETWEEN_CJK_CHARACTERS = new RegExp(`(?<=[${CJK_RANGE}])\\s+(?=[${CJK_RANGE}])`, 'gu')
const BEFORE_CJK_PUNCTUATION = new RegExp(`(?<=[${CJK_RANGE}])\\s+(?=[${CJK_PUNCTUATION}])`, 'gu')
const AFTER_CJK_PUNCTUATION = new RegExp(`(?<=[${CJK_PUNCTUATION}])\\s+(?=[${CJK_RANGE}])`, 'gu')
const BETWEEN_CJK_PUNCTUATION = new RegExp(
  `(?<=[${CJK_PUNCTUATION}])\\s+(?=[${CJK_PUNCTUATION}])`,
  'gu',
)

export function normalizeStreamingASRText(text: string): string {
  return text
    .trim()
    .replace(BETWEEN_CJK_CHARACTERS, '')
    .replace(BEFORE_CJK_PUNCTUATION, '')
    .replace(AFTER_CJK_PUNCTUATION, '')
    .replace(BETWEEN_CJK_PUNCTUATION, '')
    .replace(/\s+(?=[,.!?;:%)\]}])/gu, '')
}

// Preserve native sentence punctuation across endpoint boundaries, without
// inserting spaces between CJK characters or before closing punctuation.
export function mergeTranscriptSegments(segments: readonly string[]): string {
  let merged = ''
  for (const segment of segments) {
    const right = segment.trim()
    if (!right) continue
    if (!merged) {
      merged = right
      continue
    }
    const left = merged.trimEnd()
    const needsSpace =
      /[\p{Script=Latin}\p{N}][.!?;:,"'”’)]*$/u.test(left) &&
      /^["'“‘(]*[\p{Script=Latin}\p{N}]/u.test(right)
    merged = `${left}${needsSpace ? ' ' : ''}${right}`
  }
  return merged
}
