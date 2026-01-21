import Store from 'electron-store'
import { HistoryItem } from '../shared/types'

interface HistorySchema {
  items: HistoryItem[]
}

const MAX_HISTORY_ITEMS = 1000

export class HistoryManager {
  private store: Store<HistorySchema>

  constructor() {
    this.store = new Store<HistorySchema>({
      name: 'voice-key-history',
      defaults: {
        items: [],
      },
    })
  }

  getAll(): HistoryItem[] {
    return this.store.get('items', [])
  }

  add(item: Omit<HistoryItem, 'id' | 'timestamp'>): HistoryItem {
    const items = this.getAll()
    const newItem: HistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      ...item,
    }

    items.unshift(newItem)

    if (items.length > MAX_HISTORY_ITEMS) {
      items.pop()
    }

    this.store.set('items', items)
    return newItem
  }

  delete(id: string): boolean {
    const items = this.getAll()
    const filteredItems = items.filter((item) => item.id !== id)

    if (filteredItems.length === items.length) {
      return false
    }

    this.store.set('items', filteredItems)
    return true
  }

  clear(): void {
    this.store.set('items', [])
  }

  getCount(): number {
    return this.getAll().length
  }
}

export const historyManager = new HistoryManager()
