import { powerMonitor } from 'electron'
import { availableParallelism, freemem, totalmem } from 'node:os'

// These are conservative budgets, not a hardware speed prediction. Actual
// overload is detected from acknowledged audio consumption in the manager.
export function getASRThreadCount(): number {
  const budget = powerMonitor.isOnBatteryPower() ? 1 : 2
  return Math.max(1, Math.min(budget, Math.floor(availableParallelism() / 2)))
}

export function getASRIdleTimeout(): number {
  const pressured = freemem() < Math.min(2 * 1024 ** 3, totalmem() * 0.15)
  return powerMonitor.isOnBatteryPower() || pressured ? 60_000 : 5 * 60_000
}

let managingModels = false
export function isManagingASRModels(): boolean {
  return managingModels
}
export async function manageASRModels<T>(operation: () => Promise<T>): Promise<T> {
  if (managingModels) throw new Error('Another model operation is in progress')
  managingModels = true
  try {
    return await operation()
  } finally {
    managingModels = false
  }
}

// Workers share main's address space. Check process RSS (not JS heap size),
// including WASM allocations, and stop work rather than allowing continued growth.
export function watchASRMemory(onLimit: () => void): () => void {
  const budget = Math.min(2 * 1024 ** 3, Math.max(1.5 * 1024 ** 3, totalmem() / 8))
  const timer = setInterval(() => {
    if (process.memoryUsage.rss() > budget) {
      clearInterval(timer)
      onLimit()
    }
  }, 250)
  timer.unref()
  return () => clearInterval(timer)
}
