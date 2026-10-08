import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { normalizeLLMRefineConfig } from '../../shared/llm-config'
import { buildTranslationSystemPrompt } from '../../shared/constants'
import { Translator } from './translator'

const mocks = vi.hoisted(() => ({
  clipboardText: '',
  pastedText: '',
}))

vi.mock('electron', () => ({
  clipboard: {
    availableFormats: () => ['text/plain'],
    readText: () => mocks.clipboardText,
    writeText: (text: string) => {
      mocks.clipboardText = text
    },
    write: (data: { text: string }) => {
      mocks.clipboardText = data.text
    },
    clear: () => {
      mocks.clipboardText = ''
    },
  },
}))
vi.mock('../config-manager', () => ({ configManager: {} }))
vi.mock('../window/overlay', () => ({
  showOverlay: vi.fn(),
  updateOverlay: vi.fn(),
  hideOverlay: vi.fn(),
}))
vi.mock('../i18n', () => ({ t: (key: string) => key }))
vi.mock('../platform/hyprland-integration', () => ({
  hyprlandIntegration: { isActiveSession: () => false },
}))
vi.mock('../platform/native-keyboard', () => ({
  sendNativeClipboardShortcut: async (action: 'copy' | 'paste') => {
    if (action === 'copy') mocks.clipboardText = '你好'
    else mocks.pastedText = mocks.clipboardText
  },
}))

describe('Haiku 5.5 selected-text translation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.clipboardText = 'original clipboard'
    mocks.pastedText = ''
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each(['anthropic', 'openrouter'] as const)(
    'translates through %s with reasoning disabled and restores the clipboard',
    async (provider) => {
      const post = vi.spyOn(axios, 'post').mockResolvedValue({
        data:
          provider === 'anthropic'
            ? { content: [{ type: 'text', text: 'Hello' }], stop_reason: 'end_turn' }
            : { choices: [{ message: { content: 'Hello' } }] },
      })
      const config = normalizeLLMRefineConfig({
        provider,
        anthropic: { apiKey: 'anthropic-key', model: 'claude-haiku-5-5' },
        openrouter: { apiKey: 'router-key', model: 'anthropic/claude-haiku-5.5' },
      })
      const translator = new Translator({
        getRefineConfig: () => config,
        getTranslationConfig: () => ({ enabled: true, targetLanguage: 'en' }),
      })

      const translation = translator.translate()
      await vi.runAllTimersAsync()
      await translation

      expect(post).toHaveBeenCalledTimes(1)
      expect(post).toHaveBeenCalledWith(
        provider === 'anthropic'
          ? 'https://api.anthropic.com/v1/messages'
          : 'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining(
          provider === 'anthropic'
            ? {
                model: 'claude-haiku-5-5',
                system: buildTranslationSystemPrompt('en'),
                messages: [{ role: 'user', content: '你好' }],
                thinking: { type: 'disabled' },
              }
            : {
                model: 'anthropic/claude-haiku-5.5',
                reasoning: { enabled: false, exclude: true },
              },
        ),
        expect.any(Object),
      )
      expect(mocks.pastedText).toBe('Hello')
      expect(mocks.clipboardText).toBe('original clipboard')
    },
  )
})
