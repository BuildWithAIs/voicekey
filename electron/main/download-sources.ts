type DownloadSourceFailure = {
  source: string
  nextSource: string
  error: Error
}

type DownloadSourceFailureCallback = (failure: DownloadSourceFailure) => void

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function getSourceHost(source: string): string {
  try {
    return new URL(source).host
  } catch {
    return source
  }
}

export async function downloadFromSources<T>(
  sources: readonly string[],
  attempt: (source: string) => Promise<T>,
  onFallback?: DownloadSourceFailureCallback,
): Promise<T> {
  if (sources.length === 0) {
    throw new Error('No download sources configured')
  }

  const failures: string[] = []

  for (const [index, source] of sources.entries()) {
    try {
      return await attempt(source)
    } catch (error) {
      const normalizedError = normalizeError(error)
      failures.push(`${getSourceHost(source)}: ${normalizedError.message}`)

      const nextSource = sources[index + 1]
      if (nextSource) {
        onFallback?.({ source, nextSource, error: normalizedError })
      }
    }
  }

  throw new Error(`All download sources failed (${failures.join('; ')})`)
}
