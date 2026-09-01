import { describe, expect, it, vi } from 'vitest'
import {
  detectPublicIpCountryCode,
  orderDownloadSourcesForCountry,
  parseCloudflareCountryCode,
} from './download-region'

const CHINA_SOURCE = 'https://www.modelscope.ai/models/example/model.bin'
const GLOBAL_SOURCE = 'https://huggingface.co/example/model.bin'

describe('download region detection', () => {
  it('reads only a valid country code from Cloudflare trace output', () => {
    const trace = 'fl=example\nip=203.0.113.1\nloc=US\ntls=TLSv1.3\n'

    expect(parseCloudflareCountryCode(trace)).toBe('US')
    expect(parseCloudflareCountryCode('loc=CN\r\n')).toBe('CN')
    expect(parseCloudflareCountryCode('loc=XX\n')).toBeNull()
    expect(parseCloudflareCountryCode('loc=USA\n')).toBeNull()
  })

  it('returns null without surfacing lookup failures', async () => {
    const loadTrace = vi.fn<() => Promise<string>>().mockRejectedValue(new Error('offline'))

    await expect(detectPublicIpCountryCode(loadTrace)).resolves.toBeNull()
  })

  it('returns the parsed country without retaining the public IP', async () => {
    const loadTrace = vi.fn<() => Promise<string>>().mockResolvedValue('ip=203.0.113.1\nloc=CN\n')

    await expect(detectPublicIpCountryCode(loadTrace)).resolves.toBe('CN')
  })
})

describe('regional model source ordering', () => {
  it('prefers ModelScope for a mainland China public IP', () => {
    expect(orderDownloadSourcesForCountry([GLOBAL_SOURCE, CHINA_SOURCE], 'CN')).toEqual([
      CHINA_SOURCE,
      GLOBAL_SOURCE,
    ])
  })

  it('prefers Hugging Face for US and other non-China public IPs', () => {
    expect(orderDownloadSourcesForCountry([CHINA_SOURCE, GLOBAL_SOURCE], 'US')).toEqual([
      GLOBAL_SOURCE,
      CHINA_SOURCE,
    ])
    expect(orderDownloadSourcesForCountry([CHINA_SOURCE, GLOBAL_SOURCE], 'DE')).toEqual([
      GLOBAL_SOURCE,
      CHINA_SOURCE,
    ])
  })

  it('preserves the configured fallback order when lookup is unavailable', () => {
    const sources = [CHINA_SOURCE, 'https://downloads.example.com/model.bin', GLOBAL_SOURCE]

    expect(orderDownloadSourcesForCountry(sources, null)).toEqual(sources)
  })
})
