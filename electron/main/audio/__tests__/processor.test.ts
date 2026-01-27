import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Buffer } from 'node:buffer'

const mockUpdateOverlay = vi.fn()
const mockHideOverlay = vi.fn()
const mockHistoryAdd = vi.fn()
const mockInjectText = vi.fn()
const mockConvertToMP3 = vi.fn()
const mockGetCurrentSession = vi.fn()
const mockUpdateSession = vi.fn()
const mockClearSession = vi.fn()

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp'),
  },
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  const fsMock = {
    ...actual,
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    unlinkSync: vi.fn(),
  }
  return {
    ...fsMock,
    default: fsMock,
  }
})

vi.mock('../../window/overlay', () => ({
  updateOverlay: mockUpdateOverlay,
  hideOverlay: mockHideOverlay,
}))

vi.mock('../../i18n', () => ({
  t: (key: string) => key,
}))

vi.mock('../../history-manager', () => ({
  historyManager: {
    add: mockHistoryAdd,
  },
}))

vi.mock('../../text-injector', () => ({
  textInjector: {
    injectText: mockInjectText,
  },
}))

vi.mock('../converter', () => ({
  convertToMP3: mockConvertToMP3,
}))

vi.mock('../session-manager', () => ({
  getCurrentSession: mockGetCurrentSession,
  updateSession: mockUpdateSession,
  clearSession: mockClearSession,
}))

const loadProcessor = async () => {
  const module = await import('../processor')
  return module
}

describe('audio processor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConvertToMP3.mockResolvedValue(undefined)
    mockGetCurrentSession.mockReturnValue(null)
  })

  it('returns early when there is no active session', async () => {
    const { initProcessor, handleAudioData } = await loadProcessor()
    initProcessor({
      getAsrProvider: () => null,
      initializeASRProvider: vi.fn(),
    })

    await handleAudioData(Buffer.from('test'))

    expect(mockConvertToMP3).not.toHaveBeenCalled()
    expect(mockHistoryAdd).not.toHaveBeenCalled()
  })

  it('processes audio data end-to-end', async () => {
    const { initProcessor, handleAudioData } = await loadProcessor()
    const session = {
      id: 'session-1',
      startTime: new Date(),
      status: 'recording',
      duration: 1200,
    }
    mockGetCurrentSession.mockReturnValue(session)

    const transcribe = vi.fn().mockResolvedValue({
      text: 'hello world',
      id: 't-1',
      created: Date.now(),
      model: 'glm',
    })
    const getAsrProvider = vi.fn(() => ({ transcribe }))

    initProcessor({
      getAsrProvider,
      initializeASRProvider: vi.fn(),
    })

    const buffer = Buffer.from('audio')
    vi.useFakeTimers()
    const promise = handleAudioData(buffer)
    await promise
    await vi.runAllTimersAsync()
    vi.useRealTimers()

    expect(mockConvertToMP3).toHaveBeenCalled()
    expect(transcribe).toHaveBeenCalled()
    expect(mockUpdateSession).toHaveBeenCalledWith({
      transcription: 'hello world',
      status: 'completed',
    })
    expect(mockHistoryAdd).toHaveBeenCalledWith({
      text: 'hello world',
      duration: session.duration,
    })
    expect(mockInjectText).toHaveBeenCalledWith('hello world')
    expect(mockUpdateOverlay).toHaveBeenCalledWith({ status: 'success' })
    expect(mockHideOverlay).toHaveBeenCalled()
    expect(mockClearSession).toHaveBeenCalled()
  })

  it('aborts when session is cancelled after conversion', async () => {
    const { initProcessor, handleAudioData } = await loadProcessor()
    const session = {
      id: 'session-1',
      startTime: new Date(),
      status: 'recording',
    }
    mockGetCurrentSession.mockImplementationOnce(() => session).mockImplementation(() => null)

    const transcribe = vi.fn().mockResolvedValue({
      text: 'ignored',
      id: 't-2',
      created: Date.now(),
      model: 'glm',
    })

    initProcessor({
      getAsrProvider: () => ({ transcribe }),
      initializeASRProvider: vi.fn(),
    })

    await handleAudioData(Buffer.from('audio'))

    expect(transcribe).not.toHaveBeenCalled()
    expect(mockHistoryAdd).not.toHaveBeenCalled()
    expect(mockInjectText).not.toHaveBeenCalled()
  })

  it('reports errors and cleans up on failure', async () => {
    const { initProcessor, handleAudioData } = await loadProcessor()
    const session = {
      id: 'session-1',
      startTime: new Date(),
      status: 'recording',
    }
    mockGetCurrentSession.mockReturnValue(session)
    mockConvertToMP3.mockRejectedValue(new Error('convert fail'))

    initProcessor({
      getAsrProvider: () => null,
      initializeASRProvider: vi.fn(),
    })

    vi.useFakeTimers()
    const promise = handleAudioData(Buffer.from('audio'))
    await promise
    await vi.runAllTimersAsync()
    vi.useRealTimers()

    expect(mockUpdateOverlay).toHaveBeenCalledWith({
      status: 'error',
      message: 'convert fail',
    })
    expect(mockHideOverlay).toHaveBeenCalled()
    expect(mockUpdateSession).toHaveBeenCalledWith({ status: 'error' })
  })
})
