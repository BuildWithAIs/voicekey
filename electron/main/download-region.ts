import https from 'node:https'

const COUNTRY_LOOKUP_URL = 'https://1.1.1.1/cdn-cgi/trace'
const COUNTRY_LOOKUP_TIMEOUT_MS = 4_000
const MAX_TRACE_RESPONSE_BYTES = 4_096

const CHINA_SOURCE_HOSTS = new Set(['modelscope.ai', 'www.modelscope.ai'])
const GLOBAL_SOURCE_HOSTS = new Set(['huggingface.co', 'www.huggingface.co'])

type TraceLoader = () => Promise<string>

export async function detectPublicIpCountryCode(
  loadTrace: TraceLoader = requestCloudflareTrace,
): Promise<string | null> {
  try {
    return parseCloudflareCountryCode(await loadTrace())
  } catch {
    return null
  }
}

export function parseCloudflareCountryCode(trace: string): string | null {
  const countryCode = /^loc=([A-Z]{2})\r?$/mu.exec(trace)?.[1] ?? null
  return countryCode === 'XX' ? null : countryCode
}

export function orderDownloadSourcesForCountry(
  sources: readonly string[],
  countryCode: string | null,
): string[] {
  if (!countryCode) return [...sources]

  const preferChina = countryCode === 'CN'
  return sources
    .map((source, index) => ({ source, index, priority: sourcePriority(source, preferChina) }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index)
    .map(({ source }) => source)
}

function sourcePriority(source: string, preferChina: boolean): number {
  let host: string
  try {
    host = new URL(source).host.toLowerCase()
  } catch {
    return 1
  }

  if (CHINA_SOURCE_HOSTS.has(host)) return preferChina ? 0 : 2
  if (GLOBAL_SOURCE_HOSTS.has(host)) return preferChina ? 2 : 0
  return 1
}

function requestCloudflareTrace(): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false
    let timer: NodeJS.Timeout | null = null

    const finish = (error?: Error, trace?: string) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (error) reject(error)
      else resolve(trace ?? '')
    }

    const request = https.get(
      COUNTRY_LOOKUP_URL,
      {
        headers: {
          Accept: 'text/plain',
          'User-Agent': 'VoiceKey',
        },
      },
      (response) => {
        const statusCode = response.statusCode ?? 0
        if (statusCode < 200 || statusCode >= 300) {
          response.resume()
          finish(new Error(`Country lookup failed with HTTP ${statusCode}`))
          return
        }

        response.setEncoding('utf8')
        let trace = ''
        let receivedBytes = 0
        response.on('data', (chunk: string) => {
          receivedBytes += Buffer.byteLength(chunk)
          if (receivedBytes > MAX_TRACE_RESPONSE_BYTES) {
            response.destroy(new Error('Country lookup response exceeded its size limit'))
            return
          }
          trace += chunk
        })
        response.on('end', () => finish(undefined, trace))
        response.on('error', (error) => finish(error))
      },
    )

    timer = setTimeout(() => {
      request.destroy(new Error('Country lookup timed out'))
    }, COUNTRY_LOOKUP_TIMEOUT_MS)
    request.on('error', (error) => finish(error))
  })
}
