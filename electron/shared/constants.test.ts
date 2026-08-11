import { describe, expect, it } from 'vitest'
import { RECORDING } from './constants'

describe('recording limits', () => {
  it('uses 30-second chunks within a five-minute session', () => {
    expect(RECORDING.CHUNK_DURATION_SECONDS).toBe(30)
    expect(RECORDING.SESSION_MAX_DURATION_SECONDS).toBe(300)
    expect(RECORDING.SESSION_MAX_DURATION_SECONDS / RECORDING.CHUNK_DURATION_SECONDS).toBe(10)
  })
})
