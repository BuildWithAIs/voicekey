import { app } from 'electron'
import log from 'electron-log'
import fs from 'fs'
import path from 'path'
import {
  LOG_DATA_MAX_LENGTH,
  LOG_FILE_MAX_SIZE_BYTES,
  LOG_MESSAGE_MAX_LENGTH,
  LOG_RETENTION_DAYS,
  LOG_STACK_HEAD_LINES,
  LOG_STACK_TAIL_LINES,
} from '../shared/constants'
import type { LogEntryPayload } from '../shared/types'

const LOG_FILE_NAME = 'voice-key.log'
const LOG_FILE_PREFIX = 'voice-key'
const MAX_DATA_LENGTH = LOG_DATA_MAX_LENGTH
const MAX_MESSAGE_LENGTH = LOG_MESSAGE_MAX_LENGTH

let initialized = false

const getLogDir = () => app.getPath('logs')
const getLogFilePath = () => path.join(getLogDir(), LOG_FILE_NAME)

const clampText = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value
  const lines = value.split('\n')
  if (lines.length > LOG_STACK_HEAD_LINES + LOG_STACK_TAIL_LINES) {
    const head = lines.slice(0, LOG_STACK_HEAD_LINES).join('\n')
    const tail = lines.slice(-LOG_STACK_TAIL_LINES).join('\n')
    const omitted = lines.length - (LOG_STACK_HEAD_LINES + LOG_STACK_TAIL_LINES)
    return `${head}\n... (${omitted} lines omitted) ...\n${tail}`
  }
  return `${value.slice(0, maxLength)}...`
}

const sanitize = (value: string) => value.replace(/\r/g, '\\r').replace(/\n/g, '\\n')

const safeStringify = (data: unknown): string => {
  if (data === undefined) return ''
  if (typeof data === 'string') return sanitize(data)
  if (data instanceof Error) {
    const stack = data.stack ? `\n${data.stack}` : ''
    return sanitize(`${data.name}: ${data.message}${stack}`)
  }
  try {
    return sanitize(JSON.stringify(data))
  } catch {
    return '[unserializable]'
  }
}

const formatArgs = (args: unknown[]) => {
  const text = args.map((arg) => safeStringify(arg)).join(' ')
  return clampText(text, MAX_MESSAGE_LENGTH)
}

const ensureLogDir = () => {
  const dir = getLogDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

const cleanupOldLogs = async () => {
  const dir = getLogDir()
  if (!fs.existsSync(dir)) return
  const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
  const currentLogFile = getLogFilePath()

  for (const entry of fs.readdirSync(dir)) {
    if (!entry.startsWith(LOG_FILE_PREFIX)) continue
    const filePath = path.join(dir, entry)
    if (filePath === currentLogFile) continue
    try {
      const stats = await fs.promises.stat(filePath)
      if (!stats.isFile()) continue
      if (stats.mtimeMs < cutoff) {
        await fs.promises.unlink(filePath).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'EBUSY') throw error
        })
      }
    } catch (error) {
      log.scope('main').warn('[Logger] Failed to cleanup log file', {
        filePath,
        error: safeStringify(error),
      })
    }
  }
}

const configureTransports = () => {
  log.transports.file.resolvePath = getLogFilePath
  log.transports.file.maxSize = LOG_FILE_MAX_SIZE_BYTES
  log.transports.file.level = process.env.VITE_DEV_SERVER_URL ? 'debug' : 'info'
  log.transports.file.format = '{y}-{m}-{d} {h}:{i}:{s}.{ms} [{level}] [{scope}] {text}'
  log.transports.console.level = false

  log.transports.file.archiveLog = (filePath) => {
    const dir = path.dirname(filePath)
    const ext = path.extname(filePath)
    const base = path.basename(filePath, ext)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const archivedPath = path.join(dir, `${base}-${timestamp}${ext}`)
    fs.renameSync(filePath, archivedPath)
  }
}

const attachConsole = (scopedLog: ReturnType<typeof log.scope>) => {
  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  }

  console.log = (...args: unknown[]) => {
    scopedLog.info(formatArgs(args))
    original.log(...args)
  }
  console.info = (...args: unknown[]) => {
    scopedLog.info(formatArgs(args))
    original.info(...args)
  }
  console.warn = (...args: unknown[]) => {
    scopedLog.warn(formatArgs(args))
    original.warn(...args)
  }
  console.error = (...args: unknown[]) => {
    scopedLog.error(formatArgs(args))
    original.error(...args)
  }
  console.debug = (...args: unknown[]) => {
    scopedLog.debug(formatArgs(args))
    original.debug(...args)
  }
}

export const initializeLogger = () => {
  if (initialized) return log
  ensureLogDir()
  configureTransports()
  let errorCount = 0
  log.catchErrors({
    showDialog: false,
    onError: () => {
      errorCount += 1
      return errorCount <= 10
    },
  })
  void cleanupOldLogs()

  const scoped = log.scope('main')
  attachConsole(scoped)
  scoped.info('[Logger] Initialized', {
    logFile: getLogFilePath(),
    retentionDays: LOG_RETENTION_DAYS,
    maxFileSizeBytes: LOG_FILE_MAX_SIZE_BYTES,
  })

  initialized = true
  return log
}

export const writeLog = ({ level, message, scope, data }: LogEntryPayload) => {
  const target = log.scope(scope ?? 'main')
  const extra = data === undefined ? '' : clampText(safeStringify(data), MAX_DATA_LENGTH)
  const text = extra ? `${message} ${extra}` : message

  switch (level) {
    case 'debug':
      target.debug(text)
      break
    case 'warn':
      target.warn(text)
      break
    case 'error':
      target.error(text)
      break
    default:
      target.info(text)
      break
  }
}

export const readLogTail = (maxBytes: number) => {
  const filePath = getLogFilePath()
  try {
    if (!fs.existsSync(filePath)) return ''
    const stats = fs.statSync(filePath)
    const size = stats.size
    if (size === 0) return ''
    const readSize = Math.min(size, maxBytes)
    const buffer = Buffer.alloc(readSize)
    const fd = fs.openSync(filePath, 'r')
    try {
      fs.readSync(fd, buffer, 0, readSize, size - readSize)
    } finally {
      fs.closeSync(fd)
    }
    const text = buffer.toString('utf8')
    return text.includes('\uFFFD') ? text.replace(/\uFFFD/g, '?') : text
  } catch (error) {
    log.scope('main').error('[Logger] Failed to read log tail', safeStringify(error))
    return ''
  }
}

export const getLogDirectory = () => getLogDir()
