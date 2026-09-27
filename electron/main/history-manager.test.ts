import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { HistoryManager } from './history-manager'
import type { HistoryItem } from '../shared/types'

const NOW = new Date('2026-09-27T12:00:00+08:00').getTime()
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

describe('HistoryManager migration and paging', () => {
  let directory: string
  const managers: HistoryManager[] = []

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    directory = mkdtempSync(path.join(tmpdir(), 'voice-key-history-test-'))
  })

  afterEach(() => {
    for (const manager of managers) manager.close()
    managers.length = 0
    rmSync(directory, { recursive: true, force: true })
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function openManager(): HistoryManager {
    const manager = new HistoryManager()
    managers.push(manager)
    manager.initialize(directory)
    return manager
  }

  function writeLegacy(items: HistoryItem[]): string {
    const file = path.join(directory, 'voice-key-history.json')
    writeFileSync(file, JSON.stringify({ items }), 'utf8')
    return file
  }

  it('imports valid records once, keeps order across pages, and preserves search and summary', () => {
    const items: HistoryItem[] = Array.from({ length: 120 }, (_, index) => ({
      id: `old-${index}`,
      text: index === 0 ? 'Hello 你好' : index === 1 ? 'HELLO 世界' : `entry ${index}`,
      timestamp: NOW - Math.floor(index / 2) * HOUR,
      ...(index === 0 ? { duration: 2500 } : {}),
    }))
    items.push({ id: 'expired', text: 'Expired', timestamp: NOW - 91 * DAY })
    const legacy = writeLegacy(items)

    const manager = openManager()
    expect(manager.isAvailable()).toBe(true)
    expect(existsSync(legacy)).toBe(true)

    const first = manager.getPage({ query: '', sort: 'newest' })
    expect(first.items).toHaveLength(50)
    expect(first.total).toBe(120)
    expect(first.totalAll).toBe(120)
    expect(first.items[0].id).toBe('old-0')
    expect(first.items[1].id).toBe('old-1')

    const second = manager.getPage({ query: '', sort: 'newest', cursor: first.nextCursor })
    const third = manager.getPage({ query: '', sort: 'newest', cursor: second.nextCursor })
    expect([...first.items, ...second.items, ...third.items].map((item) => item.id)).toEqual(
      items.slice(0, 120).map((item) => item.id),
    )
    expect(third.nextCursor).toBeUndefined()

    const search = manager.getPage({ query: 'hello', sort: 'oldest' })
    expect(search.items.map((item) => item.id)).toEqual(['old-1', 'old-0'])
    const summary = manager.getSummary()
    expect(summary.totalCharacters).toBe(
      items.slice(0, 120).reduce((total, item) => total + item.text.replace(/\s+/g, '').length, 0),
    )
    expect(summary.totalAudioMs).toBe(2500)
    expect(summary.todaySessions).toBe(26)
    expect(summary.days[0].dateKey).toBe('2026-09-27')

    manager.close()
    const restarted = openManager()
    expect(restarted.getPage({ query: '', sort: 'newest' }).total).toBe(120)
    expect(existsSync(legacy)).toBe(false)
    const db = new DatabaseSync(path.join(directory, 'voice-key-history.sqlite'))
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(
      1,
    )
    db.close()
  })

  it('removes the temporary JSON copy when a record is deleted or history is cleared', () => {
    const legacy = writeLegacy([{ id: 'one', text: 'private text', timestamp: NOW }])
    const manager = openManager()
    expect(manager.delete('one')).toBe(true)
    expect(existsSync(legacy)).toBe(false)
    expect(manager.getPage({ query: '', sort: 'newest' }).total).toBe(0)

    manager.add({ text: 'new text' })
    expect(manager.getPage({ query: '', sort: 'newest' }).total).toBe(1)
    manager.clear()
    expect(manager.getPage({ query: '', sort: 'newest' }).total).toBe(0)
  })

  it('imports records written by an older version before and after JSON cleanup', () => {
    const old = { id: 'old', text: 'original', timestamp: NOW - HOUR }
    const legacy = writeLegacy([old])
    const first = openManager()
    first.close()

    writeLegacy([{ id: 'new-before-cleanup', text: 'downgrade one', timestamp: NOW }, old])
    const second = openManager()
    expect(second.getPage({ query: '', sort: 'newest' }).items.map((item) => item.id)).toEqual([
      'new-before-cleanup',
      'old',
    ])
    expect(existsSync(legacy)).toBe(false)
    second.close()

    writeLegacy([{ id: 'new-after-cleanup', text: 'downgrade two', timestamp: NOW }])
    const third = openManager()
    expect(third.getPage({ query: '', sort: 'newest' }).items.map((item) => item.id)).toEqual([
      'new-after-cleanup',
      'new-before-cleanup',
      'old',
    ])
    expect(existsSync(legacy)).toBe(false)
  })

  it('reconciles a rewritten JSON before deleting a record and prevents clear from restoring it', () => {
    const legacy = writeLegacy([{ id: 'old', text: 'original', timestamp: NOW - HOUR }])
    const manager = openManager()
    writeLegacy([
      { id: 'new', text: 'written by older version', timestamp: NOW },
      { id: 'old', text: 'original', timestamp: NOW - HOUR },
    ])

    expect(manager.delete('old')).toBe(true)
    expect(manager.getPage({ query: '', sort: 'newest' }).items.map((item) => item.id)).toEqual([
      'new',
    ])
    expect(existsSync(legacy)).toBe(false)

    writeLegacy([{ id: 'another', text: 'written by older version', timestamp: NOW }])
    manager.clear()
    expect(existsSync(legacy)).toBe(false)
    manager.close()
    expect(openManager().getPage({ query: '', sort: 'newest' }).total).toBe(0)
  })

  it('does not mark malformed legacy JSON as migrated or remove it', () => {
    const file = path.join(directory, 'voice-key-history.json')
    writeFileSync(file, '{"items":[{"id":"broken"}]}', 'utf8')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const manager = openManager()
    expect(manager.isAvailable()).toBe(false)
    expect(readFileSync(file, 'utf8')).toContain('broken')
    const db = new DatabaseSync(path.join(directory, 'voice-key-history.sqlite'))
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(
      0,
    )
    db.close()
  })

  it('keeps the legacy store usable when an incomplete SQLite schema blocks migration', () => {
    writeLegacy([{ id: 'one', text: 'fallback text', timestamp: NOW }])
    const db = new DatabaseSync(path.join(directory, 'voice-key-history.sqlite'))
    db.exec('CREATE TABLE history_items (id TEXT)')
    db.close()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const manager = openManager()
    expect(manager.storageMode()).toBe('legacy')
    expect(manager.getPage({ query: 'FALLBACK', sort: 'newest' }).items[0].id).toBe('one')
    manager.add({ text: 'new fallback' })
    expect(manager.getPage({ query: '', sort: 'newest' }).total).toBe(2)
  })
})
