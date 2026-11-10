import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  writeText: vi.fn(),
  write: vi.fn(),
  readText: vi.fn(() => 'previous clipboard text'),
  readHTML: vi.fn(() => ''),
  readRTF: vi.fn(() => ''),
  readImage: vi.fn(() => ({ isEmpty: () => true })),
  availableFormats: vi.fn(() => ['text/plain']),
  type: vi.fn(async () => {}),
  pasteShortcut: vi.fn(async () => {}),
  isActiveSession: vi.fn(() => false),
  pasteClipboardText: vi.fn(async () => {}),
}))

vi.mock('electron', () => ({
  clipboard: {
    writeText: mocks.writeText,
    write: mocks.write,
    readText: mocks.readText,
    readHTML: mocks.readHTML,
    readRTF: mocks.readRTF,
    readImage: mocks.readImage,
    availableFormats: mocks.availableFormats,
  },
}))

vi.mock('./platform/native-keyboard', () => ({
  typeWithNativeKeyboard: mocks.type,
  pressNativeKey: vi.fn(),
  sendNativeClipboardShortcut: mocks.pasteShortcut,
  probeNativeKeyboard: vi.fn(),
}))

vi.mock('./platform/hyprland-integration', () => ({
  hyprlandIntegration: {
    isActiveSession: mocks.isActiveSession,
    pasteClipboardText: mocks.pasteClipboardText,
  },
}))

const originalPlatform = process.platform

function stubPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}

function lastWrittenText(): string | undefined {
  const calls = mocks.writeText.mock.calls
  return calls.length > 0 ? (calls[calls.length - 1][0] as string) : undefined
}

describe('TextInjector clipboard handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isActiveSession.mockReturnValue(false)
    mocks.availableFormats.mockReturnValue(['text/plain'])
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  })

  it('restores the previous clipboard on the paste path by default', async () => {
    stubPlatform('win32')
    const { textInjector } = await import('./text-injector')

    const outcome = await textInjector.injectText('hello world')

    expect(outcome).toEqual({ method: 'pasted', clipboard: 'untouched' })
    expect(mocks.pasteShortcut).toHaveBeenCalledWith('paste')
    expect(mocks.write).toHaveBeenCalledTimes(1)
    expect(lastWrittenText()).toBe('hello world')
  })

  it('leaves the transcript on the clipboard after restoring when asked to keep it', async () => {
    stubPlatform('win32')
    const { textInjector } = await import('./text-injector')

    const outcome = await textInjector.injectText('hello world', { keepInClipboard: true })

    expect(outcome).toEqual({ method: 'pasted', clipboard: 'kept' })
    expect(lastWrittenText()).toBe('hello world')
    // The restore still runs first so the paste itself is unaffected.
    const restoreOrder = mocks.write.mock.invocationCallOrder[0]
    const keepOrders = mocks.writeText.mock.invocationCallOrder
    expect(keepOrders[keepOrders.length - 1]).toBeGreaterThan(restoreOrder)
  })

  it('writes the transcript when typing into the focused application', async () => {
    stubPlatform('linux')
    const { textInjector } = await import('./text-injector')

    const outcome = await textInjector.injectText('hello world', { keepInClipboard: true })

    expect(outcome).toEqual({ method: 'typed', clipboard: 'kept' })
    expect(mocks.type).toHaveBeenCalledWith('hello world')
    expect(lastWrittenText()).toBe('hello world')
  })

  it('does not touch the clipboard when typing without the option', async () => {
    stubPlatform('linux')
    const { textInjector } = await import('./text-injector')

    const outcome = await textInjector.injectText('hello world')

    expect(outcome).toEqual({ method: 'typed', clipboard: 'untouched' })
    expect(mocks.writeText).not.toHaveBeenCalled()
    expect(mocks.write).not.toHaveBeenCalled()
  })

  it('keeps the transcript on the Hyprland paste path', async () => {
    stubPlatform('linux')
    mocks.isActiveSession.mockReturnValue(true)
    const { textInjector } = await import('./text-injector')

    const outcome = await textInjector.injectText('hello world', { keepInClipboard: true })

    expect(outcome).toEqual({ method: 'pasted', clipboard: 'kept' })
    expect(mocks.pasteClipboardText).toHaveBeenCalledWith('hello world')
    expect(lastWrittenText()).toBe('hello world')
  })

  it('reports a failed restore as a kept clipboard instead of an injection failure', async () => {
    stubPlatform('win32')
    mocks.write.mockImplementationOnce(() => {
      throw new Error('clipboard busy')
    })
    const { textInjector } = await import('./text-injector')

    const outcome = await textInjector.injectText('hello world', { keepInClipboard: true })

    expect(outcome).toEqual({ method: 'pasted', clipboard: 'kept' })
    expect(lastWrittenText()).toBe('hello world')
  })

  it('ignores empty transcripts', async () => {
    const { textInjector } = await import('./text-injector')

    const outcome = await textInjector.injectText('   ', { keepInClipboard: true })

    expect(outcome).toEqual({ method: 'typed', clipboard: 'untouched' })
    expect(mocks.writeText).not.toHaveBeenCalled()
    expect(mocks.type).not.toHaveBeenCalled()
  })
})
