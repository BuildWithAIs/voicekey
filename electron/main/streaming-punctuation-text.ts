export function normalizePunctuationOutput(text: string): string {
  const withoutRedundantFullStop = text
    .trim()
    .replace(/([！？!?])。+$/u, '$1')
    .replace(/(…{2,})。+$/u, '$1')

  return withoutRedundantFullStop.replace(/([。！？!?])\1+$/u, '$1')
}

export function hasSameTranscriptContent(source: string, candidate: string): boolean {
  return comparableTranscriptContent(source) === comparableTranscriptContent(candidate)
}

function comparableTranscriptContent(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\s]/gu, '')
}
