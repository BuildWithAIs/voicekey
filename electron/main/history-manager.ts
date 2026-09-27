import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import Store from 'electron-store'
import { HISTORY_RETENTION_DAYS } from '../shared/constants'
import type {
  HistoryDay,
  HistoryItem,
  HistoryPageRequest,
  HistoryPageResult,
  HistorySummary,
} from '../shared/types'

interface HistorySchema {
  items: HistoryItem[]
}

interface HistoryRow {
  sequence: number
  id: string
  text: string
  timestamp_ms: number
  duration_ms: number | null
}

interface SummaryRow {
  total_characters: number
  total_audio_ms: number
  recent_characters: number
  recent_audio_ms: number
  today_sessions: number
  today_duration: number
  today_characters: number
}

interface DayRow {
  date_key: string
  characters: number
  duration_ms: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const PAGE_SIZE = 50
const LEGACY_FILENAME = 'voice-key-history.json'
const DATABASE_FILENAME = 'voice-key-history.sqlite'

function cutoff(now: number): number {
  return HISTORY_RETENTION_DAYS > 0 ? now - HISTORY_RETENTION_DAYS * MS_PER_DAY : 0
}

function countCharacters(text: string): number {
  return text.replace(/\s+/g, '').length
}

function dateKey(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function toItem(row: HistoryRow): HistoryItem {
  return {
    id: row.id,
    text: row.text,
    timestamp: row.timestamp_ms,
    ...(row.duration_ms === null ? {} : { duration: row.duration_ms }),
  }
}

function validateLegacyItems(raw: unknown): HistoryItem[] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Invalid legacy history structure')
  }
  const value = 'items' in raw ? raw.items : []
  if (!Array.isArray(value)) throw new Error('Invalid legacy history items')

  const ids = new Set<string>()
  return value.map((candidate: unknown) => {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      throw new Error('Invalid legacy history item')
    }
    const item = candidate as Record<string, unknown>
    if (
      typeof item.id !== 'string' ||
      item.id.length === 0 ||
      ids.has(item.id) ||
      typeof item.text !== 'string' ||
      !Number.isSafeInteger(item.timestamp) ||
      !Number.isFinite(new Date(item.timestamp as number).getTime()) ||
      (item.duration !== undefined &&
        (!Number.isSafeInteger(item.duration) || (item.duration as number) < 0))
    ) {
      throw new Error('Invalid legacy history item fields')
    }
    ids.add(item.id)
    return {
      id: item.id,
      text: item.text,
      timestamp: item.timestamp as number,
      ...(item.duration === undefined ? {} : { duration: item.duration as number }),
    }
  })
}

function validateRequest(request: HistoryPageRequest): void {
  if (
    !request ||
    typeof request.query !== 'string' ||
    request.query.length > 200 ||
    (request.sort !== 'newest' && request.sort !== 'oldest') ||
    (request.cursor !== undefined &&
      (!request.cursor ||
        !Number.isSafeInteger(request.cursor.timestamp) ||
        !Number.isSafeInteger(request.cursor.sequence) ||
        request.cursor.sequence <= 0))
  ) {
    throw new Error('Invalid history page request')
  }
}

function errorKind(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError'
}

function contentDigest(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export class HistoryManager {
  private db: DatabaseSync | null = null
  private legacyStore: Store<HistorySchema> | null = null
  private legacyPath = ''
  private legacyDigest: string | null = null
  private initialized = false

  initialize(directory: string): void {
    if (this.initialized) return
    this.initialized = true
    this.legacyPath = path.join(directory, LEGACY_FILENAME)
    const databasePath = path.join(directory, DATABASE_FILENAME)
    let db: DatabaseSync | null = null
    let canFallback = !existsSync(databasePath)

    try {
      db = new DatabaseSync(databasePath, { timeout: 5000 })
      db.exec('PRAGMA secure_delete = ON')
      db.function('history_lower', { deterministic: true }, (value) => String(value).toLowerCase())

      const version = (db.prepare('PRAGMA user_version').get() as { user_version: number })
        .user_version
      if (version === 0) {
        canFallback = true
        this.createSchemaAndImport(db)
        canFallback = false
      } else if (version !== 1) {
        throw new Error(`Unsupported history database version: ${version}`)
      }

      const migrated = db
        .prepare("SELECT value FROM history_meta WHERE key = 'legacy_imported'")
        .get() as { value: string } | undefined
      if (migrated?.value !== '1') throw new Error('History migration marker is missing')
      // An older app may have written the JSON again after the first migration.
      if (version === 1 && existsSync(this.legacyPath)) this.importLegacyChanges(db)
      const cleanupPending = db
        .prepare("SELECT value FROM history_meta WHERE key = 'legacy_cleanup_pending'")
        .get() as { value: string } | undefined
      if (version === 0 || cleanupPending?.value === '1') {
        const check = db.prepare('PRAGMA quick_check').get() as { quick_check: string }
        if (check.quick_check !== 'ok') throw new Error('History database integrity check failed')
      }

      this.db = db
      this.prune()
      if (version === 1) this.cleanupLegacyBackup(false)
    } catch (error) {
      db?.close()
      this.db = null
      console.error('[History] SQLite initialization failed:', errorKind(error))
      if (canFallback && existsSync(this.legacyPath)) {
        try {
          this.legacyStore = new Store<HistorySchema>({
            name: 'voice-key-history',
            cwd: directory,
            defaults: { items: [] },
          })
          validateLegacyItems({ items: this.legacyStore.get('items', []) })
          console.warn('[History] Using the legacy JSON store for this run')
        } catch (legacyError) {
          this.legacyStore = null
          console.error('[History] Legacy history is unavailable:', errorKind(legacyError))
        }
      }
    }
  }

  isAvailable(): boolean {
    return this.db !== null || this.legacyStore !== null
  }

  storageMode(): 'sqlite' | 'legacy' | 'unavailable' {
    if (this.db) return 'sqlite'
    return this.legacyStore ? 'legacy' : 'unavailable'
  }

  private createSchemaAndImport(db: DatabaseSync): void {
    const legacyExists = existsSync(this.legacyPath)
    const legacy = legacyExists ? this.readLegacyItems() : null
    const retained = (legacy?.items ?? []).filter((item) => item.timestamp >= cutoff(Date.now()))

    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(`
        CREATE TABLE history_items (
          sequence INTEGER PRIMARY KEY,
          id TEXT NOT NULL UNIQUE,
          text TEXT NOT NULL,
          timestamp_ms INTEGER NOT NULL,
          duration_ms INTEGER,
          character_count INTEGER NOT NULL
        );
        CREATE INDEX history_items_timestamp ON history_items(timestamp_ms, sequence);
        CREATE TABLE history_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      `)
      this.insertLegacyItems(db, retained, false)
      db.prepare("INSERT INTO history_meta (key, value) VALUES ('legacy_imported', '1')").run()
      db.prepare("INSERT INTO history_meta (key, value) VALUES ('legacy_cleanup_pending', ?)").run(
        legacyExists ? '1' : '0',
      )
      const count = (
        db.prepare('SELECT COUNT(*) AS count FROM history_items').get() as { count: number }
      ).count
      if (count !== retained.length) throw new Error('History migration count mismatch')
      db.exec('PRAGMA user_version = 1')
      db.exec('COMMIT')
      this.legacyDigest = legacy?.digest ?? null
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  private importLegacyChanges(db: DatabaseSync): void {
    const { items, digest } = this.readLegacyItems()
    const retained = items.filter((item) => item.timestamp >= cutoff(Date.now()))

    db.exec('BEGIN IMMEDIATE')
    try {
      this.insertLegacyItems(db, retained, true)
      db.prepare("UPDATE history_meta SET value = '1' WHERE key = 'legacy_cleanup_pending'").run()
      db.exec('COMMIT')
      this.legacyDigest = digest
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  private readLegacyItems(): { items: HistoryItem[]; digest: string } {
    const content = readFileSync(this.legacyPath, 'utf8')
    return {
      items: validateLegacyItems(JSON.parse(content) as unknown),
      digest: contentDigest(content),
    }
  }

  private insertLegacyItems(db: DatabaseSync, items: HistoryItem[], ignoreExisting: boolean): void {
    const insert = db.prepare(`
      INSERT INTO history_items (id, text, timestamp_ms, duration_ms, character_count)
      VALUES (?, ?, ?, ?, ?)
      ${ignoreExisting ? 'ON CONFLICT(id) DO NOTHING' : ''}
    `)
    for (const item of items.reverse()) {
      insert.run(
        item.id,
        item.text,
        item.timestamp,
        item.duration ?? null,
        countCharacters(item.text),
      )
    }
  }

  private requireAvailable(): void {
    if (!this.db && !this.legacyStore) throw new Error('History storage is unavailable')
  }

  private requireLegacyStore(): Store<HistorySchema> {
    if (!this.legacyStore) throw new Error('Legacy history is unavailable')
    return this.legacyStore
  }

  private prune(): void {
    if (this.db && HISTORY_RETENTION_DAYS > 0) {
      this.db.prepare('DELETE FROM history_items WHERE timestamp_ms < ?').run(cutoff(Date.now()))
    }
  }

  private legacyItems(): HistoryItem[] {
    const legacyStore = this.requireLegacyStore()
    const items = validateLegacyItems({ items: legacyStore.get('items', []) })
    const retained = items.filter((item) => item.timestamp >= cutoff(Date.now()))
    if (retained.length !== items.length) legacyStore.set('items', retained)
    return retained
  }

  private cleanupLegacyBackup(strict: boolean, discardChanges = false): void {
    if (!this.db) return
    const pending = this.db
      .prepare("SELECT value FROM history_meta WHERE key = 'legacy_cleanup_pending'")
      .get() as { value: string } | undefined
    if (pending?.value !== '1' && !existsSync(this.legacyPath)) return
    try {
      if (existsSync(this.legacyPath)) {
        if (
          !discardChanges &&
          this.legacyDigest !== null &&
          contentDigest(readFileSync(this.legacyPath, 'utf8')) !== this.legacyDigest
        ) {
          throw new Error('Legacy history changed after import')
        }
        unlinkSync(this.legacyPath)
      }
      this.db
        .prepare("UPDATE history_meta SET value = '0' WHERE key = 'legacy_cleanup_pending'")
        .run()
      this.legacyDigest = null
    } catch (error) {
      if (strict) throw error
      console.warn(
        '[History] Could not remove the legacy JSON backup; will retry:',
        errorKind(error),
      )
    }
  }

  getPage(request: HistoryPageRequest): HistoryPageResult {
    validateRequest(request)
    this.requireAvailable()
    if (!this.db) return this.getLegacyPage(request)

    this.prune()
    const query = request.query.trim().toLowerCase()
    const totalAll = (
      this.db.prepare('SELECT COUNT(*) AS count FROM history_items').get() as { count: number }
    ).count
    const total = query
      ? (
          this.db
            .prepare(
              'SELECT COUNT(*) AS count FROM history_items WHERE instr(history_lower(text), ?) > 0',
            )
            .get(query) as { count: number }
        ).count
      : totalAll
    const direction = request.sort === 'newest' ? 'DESC' : 'ASC'
    const comparison = request.sort === 'newest' ? '<' : '>'
    const cursorClause = request.cursor
      ? `AND (timestamp_ms ${comparison} ? OR (timestamp_ms = ? AND sequence ${comparison} ?))`
      : ''
    const searchClause = query ? 'WHERE instr(history_lower(text), ?) > 0' : 'WHERE 1 = 1'
    const statement = this.db.prepare(`
      SELECT sequence, id, text, timestamp_ms, duration_ms
      FROM history_items
      ${searchClause} ${cursorClause}
      ORDER BY timestamp_ms ${direction}, sequence ${direction}
      LIMIT ?
    `)
    const queryBindings = query ? [query] : []
    const bindings = request.cursor
      ? [
          ...queryBindings,
          request.cursor.timestamp,
          request.cursor.timestamp,
          request.cursor.sequence,
          PAGE_SIZE + 1,
        ]
      : [...queryBindings, PAGE_SIZE + 1]
    const rows = statement.all(...bindings) as unknown as HistoryRow[]
    const hasMore = rows.length > PAGE_SIZE
    const page = rows.slice(0, PAGE_SIZE)
    const last = page[page.length - 1]
    return {
      items: page.map(toItem),
      total,
      totalAll,
      ...(hasMore && last
        ? { nextCursor: { timestamp: last.timestamp_ms, sequence: last.sequence } }
        : {}),
    }
  }

  private getLegacyPage(request: HistoryPageRequest): HistoryPageResult {
    const all = this.legacyItems()
    const query = request.query.trim().toLowerCase()
    const matches = all
      .map((item, index) => ({ item, sequence: all.length - index }))
      .filter(({ item }) => item.text.toLowerCase().includes(query))
      .sort((a, b) =>
        request.sort === 'newest'
          ? b.item.timestamp - a.item.timestamp || b.sequence - a.sequence
          : a.item.timestamp - b.item.timestamp || a.sequence - b.sequence,
      )
    const cursor = request.cursor
    const remaining = cursor
      ? matches.filter(({ item, sequence }) =>
          request.sort === 'newest'
            ? item.timestamp < cursor.timestamp ||
              (item.timestamp === cursor.timestamp && sequence < cursor.sequence)
            : item.timestamp > cursor.timestamp ||
              (item.timestamp === cursor.timestamp && sequence > cursor.sequence),
        )
      : matches
    const page = remaining.slice(0, PAGE_SIZE)
    const last = page[page.length - 1]
    return {
      items: page.map(({ item }) => item),
      total: matches.length,
      totalAll: all.length,
      ...(remaining.length > PAGE_SIZE && last
        ? { nextCursor: { timestamp: last.item.timestamp, sequence: last.sequence } }
        : {}),
    }
  }

  getSummary(): HistorySummary {
    this.requireAvailable()
    if (!this.db) return this.getLegacySummary()
    this.prune()

    const now = Date.now()
    const today = new Date(now)
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
    const tomorrowStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + 1,
    ).getTime()
    const row = this.db
      .prepare(
        `
      SELECT
        COALESCE(SUM(character_count), 0) AS total_characters,
        COALESCE(SUM(COALESCE(duration_ms, 0)), 0) AS total_audio_ms,
        COALESCE(SUM(CASE WHEN timestamp_ms >= ? THEN character_count ELSE 0 END), 0) AS recent_characters,
        COALESCE(SUM(CASE WHEN timestamp_ms >= ? THEN COALESCE(duration_ms, 0) ELSE 0 END), 0) AS recent_audio_ms,
        COALESCE(SUM(CASE WHEN timestamp_ms >= ? AND timestamp_ms < ? THEN 1 ELSE 0 END), 0) AS today_sessions,
        COALESCE(SUM(CASE WHEN timestamp_ms >= ? AND timestamp_ms < ? THEN COALESCE(duration_ms, 0) ELSE 0 END), 0) AS today_duration,
        COALESCE(SUM(CASE WHEN timestamp_ms >= ? AND timestamp_ms < ? THEN character_count ELSE 0 END), 0) AS today_characters
      FROM history_items
    `,
      )
      .get(
        now - 7 * MS_PER_DAY,
        now - 7 * MS_PER_DAY,
        todayStart,
        tomorrowStart,
        todayStart,
        tomorrowStart,
        todayStart,
        tomorrowStart,
      ) as unknown as SummaryRow
    const days = this.db
      .prepare(
        `
      SELECT date(timestamp_ms / 1000, 'unixepoch', 'localtime') AS date_key,
             SUM(character_count) AS characters,
             SUM(COALESCE(duration_ms, 0)) AS duration_ms
      FROM history_items
      GROUP BY date_key
      ORDER BY date_key DESC
    `,
      )
      .all() as unknown as DayRow[]
    return this.buildSummary(row, days)
  }

  private getLegacySummary(): HistorySummary {
    const items = this.legacyItems()
    const now = Date.now()
    const today = new Date(now)
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
    const tomorrowStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + 1,
    ).getTime()
    const daily = new Map<string, HistoryDay>()
    const row: SummaryRow = {
      total_characters: 0,
      total_audio_ms: 0,
      recent_characters: 0,
      recent_audio_ms: 0,
      today_sessions: 0,
      today_duration: 0,
      today_characters: 0,
    }
    for (const item of items) {
      const chars = countCharacters(item.text)
      const duration = item.duration ?? 0
      row.total_characters += chars
      row.total_audio_ms += duration
      if (item.timestamp >= now - 7 * MS_PER_DAY) {
        row.recent_characters += chars
        row.recent_audio_ms += duration
      }
      if (item.timestamp >= todayStart && item.timestamp < tomorrowStart) {
        row.today_sessions += 1
        row.today_duration += duration
        row.today_characters += chars
      }
      const key = dateKey(item.timestamp)
      const day = daily.get(key) ?? { dateKey: key, characters: 0, durationMs: 0 }
      day.characters += chars
      day.durationMs += duration
      daily.set(key, day)
    }
    const days = [...daily.values()]
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
      .map((day) => ({
        date_key: day.dateKey,
        characters: day.characters,
        duration_ms: day.durationMs,
      }))
    return this.buildSummary(row, days)
  }

  private buildSummary(row: SummaryRow, days: DayRow[]): HistorySummary {
    const peak = days.reduce<DayRow | null>(
      (best, day) => (day.characters > (best?.characters ?? 0) ? day : best),
      null,
    )
    return {
      totalCharacters: row.total_characters,
      totalAudioMs: row.total_audio_ms,
      recentCharacters: row.recent_characters,
      recentAudioMs: row.recent_audio_ms,
      todaySessions: row.today_sessions,
      todayDuration: row.today_duration,
      todayCharacters: row.today_characters,
      activeDays: days.length,
      peakDayCharacters: peak?.characters ?? 0,
      peakDayKey: peak?.date_key ?? null,
      days: days.map((day) => ({
        dateKey: day.date_key,
        characters: day.characters,
        durationMs: day.duration_ms,
      })),
    }
  }

  add(item: Omit<HistoryItem, 'id' | 'timestamp'>): HistoryItem {
    this.requireAvailable()
    const newItem: HistoryItem = { id: randomUUID(), timestamp: Date.now(), ...item }
    if (this.db) {
      this.db.exec('BEGIN IMMEDIATE')
      try {
        this.db
          .prepare(
            `
          INSERT INTO history_items (id, text, timestamp_ms, duration_ms, character_count)
          VALUES (?, ?, ?, ?, ?)
        `,
          )
          .run(
            newItem.id,
            newItem.text,
            newItem.timestamp,
            newItem.duration ?? null,
            countCharacters(newItem.text),
          )
        this.prune()
        this.db.exec('COMMIT')
      } catch (error) {
        this.db.exec('ROLLBACK')
        throw error
      }
    } else {
      this.requireLegacyStore().set('items', [newItem, ...this.legacyItems()])
    }
    return newItem
  }

  delete(id: string): boolean {
    this.requireAvailable()
    if (this.db) {
      if (existsSync(this.legacyPath)) this.importLegacyChanges(this.db)
      this.cleanupLegacyBackup(true)
      return this.db.prepare('DELETE FROM history_items WHERE id = ?').run(id).changes > 0
    }
    const items = this.legacyItems()
    const filtered = items.filter((item) => item.id !== id)
    if (filtered.length === items.length) return false
    this.requireLegacyStore().set('items', filtered)
    return true
  }

  clear(): void {
    this.requireAvailable()
    if (this.db) {
      this.cleanupLegacyBackup(true, true)
      this.db.exec('DELETE FROM history_items')
    } else {
      this.requireLegacyStore().set('items', [])
    }
  }

  close(): void {
    this.db?.close()
    this.db = null
  }
}

export const historyManager = new HistoryManager()
