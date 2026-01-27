import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LOG_FILE_MAX_SIZE_BYTES,
  LOG_MESSAGE_MAX_LENGTH,
  LOG_RETENTION_DAYS,
} from '../../shared/constants'

const scopedLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}))

const mockScope = vi.hoisted(() => vi.fn(() => scopedLogger))
const mockCatchErrors = vi.hoisted(() => vi.fn())

const mockLog = vi.hoisted(() => ({
  transports: {
    file: {
      resolvePath: undefined as undefined | (() => string),
      maxSize: 0,
      level: '',
      format: '',
      archiveLog: undefined as undefined | ((oldLogFile: { path: string }) => void),
    },
    console: {
      level: '',
    },
  },
  scope: mockScope,
  catchErrors: mockCatchErrors,
}))

const mockGetPath = vi.hoisted(() => vi.fn(() => '/tmp/logs'))

const mockExistsSync = vi.hoisted(() => vi.fn())
const mockMkdirSync = vi.hoisted(() => vi.fn())
const mockReaddirSync = vi.hoisted(() => vi.fn(() => []))
const mockStatSync = vi.hoisted(() => vi.fn())
const mockOpenSync = vi.hoisted(() => vi.fn(() => 1))
const mockReadSync = vi.hoisted(() => vi.fn())
const mockCloseSync = vi.hoisted(() => vi.fn())
const mockRenameSync = vi.hoisted(() => vi.fn())
const mockPromStat = vi.hoisted(() => vi.fn())
const mockPromUnlink = vi.hoisted(() => vi.fn())

const fsState = vi.hoisted(() => ({
  content: '',
}))

vi.mock('electron', () => ({
  app: {
    getPath: mockGetPath,
  },
}))

vi.mock('electron-log', () => ({
  default: mockLog,
}))

vi.mock('fs', () => {
  const fsMock = {
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    readdirSync: mockReaddirSync,
    statSync: mockStatSync,
    openSync: mockOpenSync,
    readSync: mockReadSync,
    closeSync: mockCloseSync,
    renameSync: mockRenameSync,
    promises: {
      stat: mockPromStat,
      unlink: mockPromUnlink,
    },
  }
  return {
    ...fsMock,
    default: fsMock,
  }
})

const logFilePath = '/tmp/logs/voice-key.log'

let originalConsole: {
  log: typeof console.log
  info: typeof console.info
  warn: typeof console.warn
  error: typeof console.error
  debug: typeof console.debug
}

describe('logger', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    fsState.content = ''
    mockExistsSync.mockReturnValue(false)
    mockReaddirSync.mockReturnValue([])
    mockPromStat.mockResolvedValue({ isFile: () => true, mtimeMs: Date.now() })
    mockPromUnlink.mockResolvedValue(undefined)
    mockStatSync.mockImplementation(() => ({
      size: Buffer.byteLength(fsState.content),
    }))
    mockReadSync.mockImplementation((fd, buffer, offset, length, position) => {
      const data = Buffer.from(fsState.content, 'utf8')
      data.copy(
        buffer as Buffer,
        offset as number,
        position as number,
        (position as number) + length,
      )
      return length
    })
    originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    }
  })

  afterEach(() => {
    console.log = originalConsole.log
    console.info = originalConsole.info
    console.warn = originalConsole.warn
    console.error = originalConsole.error
    console.debug = originalConsole.debug
  })

  it('initializes once and configures transports', async () => {
    console.log = vi.fn()
    console.info = vi.fn()
    console.warn = vi.fn()
    console.error = vi.fn()
    console.debug = vi.fn()

    const { initializeLogger } = await import('../logger')
    const first = initializeLogger()
    const second = initializeLogger()

    expect(first).toBe(second)
    expect(mockCatchErrors).toHaveBeenCalledTimes(1)
    expect(mockScope).toHaveBeenCalledWith('main')
    expect(scopedLogger.info).toHaveBeenCalledWith('[Logger] Initialized', {
      logFile: logFilePath,
      retentionDays: LOG_RETENTION_DAYS,
      maxFileSizeBytes: LOG_FILE_MAX_SIZE_BYTES,
    })
    expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/logs', { recursive: true })
    expect(mockLog.transports.file.level).toBe('info')
    expect(mockLog.transports.console.level).toBe(false)
    expect(typeof mockLog.transports.file.resolvePath).toBe('function')
    expect(mockLog.transports.file.maxSize).toBe(LOG_FILE_MAX_SIZE_BYTES)
    expect(mockLog.transports.file.format).toContain('[{level}]')
    expect(mockLog.transports.file.format).toContain('{text}')
  })

  it('writes logs to the correct level and appends data', async () => {
    const { writeLog } = await import('../logger')

    writeLog({ level: 'debug', message: 'd', scope: 'main' })
    writeLog({ level: 'warn', message: 'w', scope: 'main' })
    writeLog({ level: 'error', message: 'e', scope: 'main' })
    writeLog({ level: 'info', message: 'i', data: { ok: true }, scope: 'main' })

    expect(scopedLogger.debug).toHaveBeenCalledWith('d')
    expect(scopedLogger.warn).toHaveBeenCalledWith('w')
    expect(scopedLogger.error).toHaveBeenCalledWith('e')
    expect(scopedLogger.info).toHaveBeenCalledWith(expect.stringContaining('i'))
    expect(scopedLogger.info).toHaveBeenCalledWith(expect.stringContaining('"ok":true'))
  })

  it('reads log tail from the end of the file', async () => {
    fsState.content = `hello\nworld`
    mockExistsSync.mockImplementation((path) => path === logFilePath)
    const { readLogTail } = await import('../logger')

    const result = readLogTail(5)
    expect(result).toBe('world')
  })

  it('sanitizes replacement characters from log tail', async () => {
    fsState.content = `ok\uFFFDbad`
    mockExistsSync.mockImplementation((path) => path === logFilePath)
    const { readLogTail } = await import('../logger')

    const result = readLogTail(1024)
    expect(result).toBe('ok?bad')
  })

  it('returns empty string when read fails', async () => {
    mockExistsSync.mockImplementation((path) => path === logFilePath)
    mockStatSync.mockImplementation(() => {
      throw new Error('boom')
    })
    const { readLogTail } = await import('../logger')

    const result = readLogTail(1024)
    expect(result).toBe('')
    expect(scopedLogger.error).toHaveBeenCalledWith(
      '[Logger] Failed to read log tail',
      expect.any(String),
    )
  })

  it('clamps logged messages to max length', async () => {
    const { writeLog } = await import('../logger')
    const longMessage = 'x'.repeat(LOG_MESSAGE_MAX_LENGTH + 10)

    writeLog({ level: 'info', message: longMessage, scope: 'main' })

    const logged = scopedLogger.info.mock.calls.at(-1)?.[0] as string
    expect(logged.length).toBeLessThanOrEqual(LOG_MESSAGE_MAX_LENGTH + 3)
    expect(logged.endsWith('...')).toBe(true)
  })
})
