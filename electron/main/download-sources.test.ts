import { describe, expect, it, vi } from 'vitest'
import { downloadFromSources } from './download-sources'

const PRIMARY_SOURCE = 'https://huggingface.co/model.bin'
const FALLBACK_SOURCE = 'https://hf-mirror.com/model.bin'

describe('downloadFromSources', () => {
  it('stops after the primary source succeeds', async () => {
    const attempt = vi.fn().mockResolvedValue('downloaded')
    const onFallback = vi.fn()

    await expect(
      downloadFromSources([PRIMARY_SOURCE, FALLBACK_SOURCE], attempt, onFallback),
    ).resolves.toBe('downloaded')
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(attempt).toHaveBeenCalledWith(PRIMARY_SOURCE)
    expect(onFallback).not.toHaveBeenCalled()
  })

  it('automatically tries the fallback source after the primary source fails', async () => {
    const primaryError = new Error('primary unavailable')
    const attempt = vi
      .fn<(source: string) => Promise<string>>()
      .mockRejectedValueOnce(primaryError)
      .mockResolvedValueOnce('downloaded from fallback')
    const onFallback = vi.fn()

    await expect(
      downloadFromSources([PRIMARY_SOURCE, FALLBACK_SOURCE], attempt, onFallback),
    ).resolves.toBe('downloaded from fallback')
    expect(attempt.mock.calls).toEqual([[PRIMARY_SOURCE], [FALLBACK_SOURCE]])
    expect(onFallback).toHaveBeenCalledWith({
      source: PRIMARY_SOURCE,
      nextSource: FALLBACK_SOURCE,
      error: primaryError,
    })
  })

  it('fails only after every configured source fails', async () => {
    const attempt = vi
      .fn<(source: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error('primary unavailable'))
      .mockRejectedValueOnce(new Error('fallback unavailable'))

    await expect(downloadFromSources([PRIMARY_SOURCE, FALLBACK_SOURCE], attempt)).rejects.toThrow(
      'All download sources failed (huggingface.co: primary unavailable; hf-mirror.com: fallback unavailable)',
    )
    expect(attempt.mock.calls).toEqual([[PRIMARY_SOURCE], [FALLBACK_SOURCE]])
  })
})
