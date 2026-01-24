import {
  LOG_DATA_MAX_LENGTH,
  LOG_MESSAGE_MAX_LENGTH,
  LOG_STACK_HEAD_LINES,
  LOG_STACK_TAIL_LINES,
} from '@electron/shared/constants'
import type { LogEntryPayload, LogLevel } from '@electron/shared/types'

const MAX_MESSAGE_LENGTH = LOG_MESSAGE_MAX_LENGTH
const MAX_DATA_LENGTH = LOG_DATA_MAX_LENGTH

let initialized = false

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

const safeStringify = (value: unknown) => {
  if (value === undefined) return ''
  if (typeof value === 'string') return sanitize(value)
  if (value instanceof Error) {
    const stack = value.stack ? `\n${value.stack}` : ''
    return sanitize(`${value.name}: ${value.message}${stack}`)
  }
  try {
    return sanitize(JSON.stringify(value))
  } catch {
    return '[unserializable]'
  }
}

const formatArgs = (args: unknown[]) =>
  clampText(args.map((arg) => safeStringify(arg)).join(' '), MAX_MESSAGE_LENGTH)

const sendLog = (payload: LogEntryPayload) => {
  if (!window.electronAPI?.log) return
  window.electronAPI.log(payload)
}

const logWithLevel = (level: LogLevel, args: unknown[]) => {
  const message = formatArgs(args)
  const data = message.length > MAX_DATA_LENGTH ? message.slice(MAX_DATA_LENGTH) : undefined
  sendLog({
    level,
    message: data ? clampText(message, MAX_DATA_LENGTH) : message,
    scope: 'renderer',
    data,
  })
}

export const initRendererLogger = () => {
  if (initialized) return
  if (!window.electronAPI?.log) return

  initialized = true

  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  }

  console.log = (...args: unknown[]) => {
    logWithLevel('info', args)
    original.log(...args)
  }
  console.info = (...args: unknown[]) => {
    logWithLevel('info', args)
    original.info(...args)
  }
  console.warn = (...args: unknown[]) => {
    logWithLevel('warn', args)
    original.warn(...args)
  }
  console.error = (...args: unknown[]) => {
    logWithLevel('error', args)
    original.error(...args)
  }
  console.debug = (...args: unknown[]) => {
    logWithLevel('debug', args)
    original.debug(...args)
  }

  window.addEventListener('error', (event) => {
    logWithLevel('error', ['[Renderer] Uncaught error', event.message, event.error ?? ''])
  })

  window.addEventListener('unhandledrejection', (event) => {
    logWithLevel('error', ['[Renderer] Unhandled promise rejection', event.reason ?? ''])
  })
}
