import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSetFfmpegPath = vi.fn()
const mockApp = { isPackaged: false }

let shouldFail = false
let lastCommand: {
  chain: {
    toFormat: ReturnType<typeof vi.fn>
    audioCodec: ReturnType<typeof vi.fn>
    audioBitrate: ReturnType<typeof vi.fn>
    on: ReturnType<typeof vi.fn>
    save: ReturnType<typeof vi.fn>
  }
  handlers: Record<string, (err?: Error) => void>
} | null = null

const createCommand = () => {
  const handlers: Record<string, (err?: Error) => void> = {}
  const chain = {
    toFormat: vi.fn(() => chain),
    audioCodec: vi.fn(() => chain),
    audioBitrate: vi.fn(() => chain),
    on: vi.fn((event: string, handler: (err?: Error) => void) => {
      handlers[event] = handler
      return chain
    }),
    save: vi.fn(() => {
      if (shouldFail) {
        handlers.error?.(new Error('convert fail'))
      } else {
        handlers.end?.()
      }
    }),
  }
  lastCommand = { chain, handlers }
  return chain
}

const ffmpegMock = Object.assign((_input: string) => createCommand(), {
  setFfmpegPath: mockSetFfmpegPath,
})

const ffmpegModule = Object.assign(ffmpegMock, { default: ffmpegMock })

const mockRequire = (id: string) => {
  if (id === 'fluent-ffmpeg') return ffmpegModule
  if (id === '@ffmpeg-installer/ffmpeg') return { path: '/mock/app.asar/node_modules/ffmpeg' }
  throw new Error(`Unexpected require: ${id}`)
}

vi.mock('node:module', () => {
  const mocked = { createRequire: () => mockRequire }
  return {
    __esModule: true,
    ...mocked,
    default: mocked,
  }
})

vi.mock('electron', () => ({
  app: mockApp,
}))

const loadConverter = async () => {
  const module = await import('../converter')
  return module
}

describe('audio converter', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    shouldFail = false
    mockApp.isPackaged = false
    lastCommand = null
  })

  it('initializes ffmpeg with dev path', async () => {
    const { initializeFfmpeg, isFfmpegInitialized } = await loadConverter()
    initializeFfmpeg()

    expect(mockSetFfmpegPath).toHaveBeenCalledWith('/mock/app.asar/node_modules/ffmpeg')
    expect(isFfmpegInitialized()).toBe(true)
  })

  it('replaces app.asar path when packaged', async () => {
    mockApp.isPackaged = true
    const { initializeFfmpeg } = await loadConverter()
    initializeFfmpeg()

    expect(mockSetFfmpegPath).toHaveBeenCalledWith('/mock/app.asar.unpacked/node_modules/ffmpeg')
  })

  it('converts to mp3 successfully', async () => {
    const { convertToMP3 } = await loadConverter()

    await expect(convertToMP3('/input.webm', '/output.mp3')).resolves.toBeUndefined()
    expect(lastCommand?.chain.save).toHaveBeenCalledWith('/output.mp3')
  })

  it('rejects when ffmpeg conversion fails', async () => {
    shouldFail = true
    const { convertToMP3 } = await loadConverter()

    await expect(convertToMP3('/input.webm', '/output.mp3')).rejects.toThrow('convert fail')
  })
})
