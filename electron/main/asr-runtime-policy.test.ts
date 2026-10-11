import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import { syncBuiltinESMExports } from 'node:module'
const power = vi.hoisted(() => ({ battery: false }))
vi.mock('electron', () => ({ powerMonitor: { isOnBatteryPower: () => power.battery } }))
import {
  getASRThreadCount,
  getASRIdleTimeout,
  watchASRMemory,
  manageASRModels,
  isManagingASRModels,
} from './asr-runtime-policy'
beforeEach(() => {
  vi.useFakeTimers()
  power.battery = false
  vi.spyOn(os, 'availableParallelism').mockReturnValue(8)
  vi.spyOn(os, 'totalmem').mockReturnValue(16 * 1024 ** 3)
  vi.spyOn(os, 'freemem').mockReturnValue(8 * 1024 ** 3)
  syncBuiltinESMExports()
})
afterEach(() => {
  vi.restoreAllMocks()
  syncBuiltinESMExports()
  vi.useRealTimers()
})
describe('ASR resource budgets', () => {
  it('reduces threads and idle residency on battery', () => {
    expect(getASRThreadCount()).toBe(2)
    expect(getASRIdleTimeout()).toBe(300_000)
    power.battery = true
    expect(getASRThreadCount()).toBe(1)
    expect(getASRIdleTimeout()).toBe(60_000)
  })
  it('terminates memory monitoring after the first over-budget sample', async () => {
    vi.spyOn(process.memoryUsage, 'rss').mockReturnValue(3 * 1024 ** 3)
    const limit = vi.fn()
    const stop = watchASRMemory(limit)
    await vi.advanceTimersByTimeAsync(1000)
    expect(limit).toHaveBeenCalledOnce()
    stop()
  })
  it('serializes model management and releases its lock after failure', async () => {
    let reject!: (error: Error) => void
    const pending = manageASRModels(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail
        }),
    )
    const result = expect(pending).rejects.toThrow('download interrupted')
    expect(isManagingASRModels()).toBe(true)
    await expect(manageASRModels(async () => {})).rejects.toThrow('in progress')
    reject(new Error('download interrupted'))
    await result
    expect(isManagingASRModels()).toBe(false)
  })
})
