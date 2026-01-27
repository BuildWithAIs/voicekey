import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistoryItem } from '../../shared/types'
import { HISTORY_RETENTION_DAYS } from '../../shared/constants'

type StoreData = {
  items: HistoryItem[]
}

const storeState = vi.hoisted(() => ({
  data: { items: [] as HistoryItem[] },
}))

vi.mock('electron-store', () => ({
  default: class MockStore {
    private data: StoreData

    constructor(options?: { defaults?: StoreData }) {
      this.data = storeState.data
      if (options?.defaults?.items && this.data.items.length === 0) {
        this.data.items = structuredClone(options.defaults.items)
      }
    }

    get(key: 'items', defaultValue: HistoryItem[] = []): HistoryItem[] {
      if (key === 'items') {
        return this.data.items ?? defaultValue
      }
      return defaultValue
    }

    set(key: 'items', value: HistoryItem[]): void {
      if (key === 'items') {
        this.data.items = value
      }
    }

    clear(): void {
      this.data.items = []
    }

    delete(key: 'items'): void {
      if (key === 'items') {
        this.data.items = []
      }
    }
  },
}))

const createManager = async () => {
  const module = await import('../history-manager')
  return new module.HistoryManager()
}

describe('HistoryManager', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    storeState.data.items = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('adds item and stores it at the head', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-27T00:00:00Z'))

    const manager = await createManager()
    const item = manager.add({ text: 'hello', duration: 500 })

    expect(item.text).toBe('hello')
    expect(item.duration).toBe(500)
    expect(item.timestamp).toBe(Date.now())
    expect(typeof item.id).toBe('string')
    expect(storeState.data.items[0]?.id).toBe(item.id)
  })

  it('prunes items older than retention window on getAll', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-01-27T00:00:00Z')
    vi.setSystemTime(now)

    const msPerDay = 24 * 60 * 60 * 1000
    const cutoff = now.getTime() - HISTORY_RETENTION_DAYS * msPerDay

    storeState.data.items = [
      { id: 'old', text: 'old', timestamp: cutoff - msPerDay },
      { id: 'new', text: 'new', timestamp: cutoff + msPerDay },
    ]

    const manager = await createManager()
    const items = manager.getAll()

    expect(items).toHaveLength(1)
    expect(items[0]?.id).toBe('new')
    expect(storeState.data.items).toHaveLength(1)
    expect(manager.getCount()).toBe(1)
  })

  it('returns false when deleting a missing id', async () => {
    storeState.data.items = [{ id: 'a', text: 'a', timestamp: Date.now() }]

    const manager = await createManager()
    expect(manager.delete('missing')).toBe(false)
    expect(storeState.data.items).toHaveLength(1)
  })

  it('deletes item by id and persists the result', async () => {
    storeState.data.items = [
      { id: 'a', text: 'a', timestamp: Date.now() },
      { id: 'b', text: 'b', timestamp: Date.now() },
    ]

    const manager = await createManager()
    expect(manager.delete('a')).toBe(true)
    expect(storeState.data.items).toHaveLength(1)
    expect(storeState.data.items[0]?.id).toBe('b')
  })

  it('clears all items', async () => {
    storeState.data.items = [{ id: 'a', text: 'a', timestamp: 1 }]

    const manager = await createManager()
    manager.clear()
    expect(storeState.data.items).toHaveLength(0)
  })
})
