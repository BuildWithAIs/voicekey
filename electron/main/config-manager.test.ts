import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  initialData: {} as Record<string, unknown>,
  lastStoreData: {} as Record<string, unknown>,
}))

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function getPath(object: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    return isRecord(value) ? value[key] : undefined
  }, object)
}

function setPath(object: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.')
  let target = object
  for (const key of keys.slice(0, -1)) {
    if (!isRecord(target[key])) {
      target[key] = {}
    }
    target = target[key] as Record<string, unknown>
  }
  target[keys[keys.length - 1]] = clone(value)
}

vi.mock('electron-store', () => ({
  default: class MockStore {
    private data: Record<string, unknown>

    constructor(options?: { defaults?: Record<string, unknown> }) {
      this.data = {
        ...clone(options?.defaults ?? {}),
        ...clone(mocks.initialData),
      }
      mocks.lastStoreData = this.data
    }

    get(key: string, defaultValue?: unknown): unknown {
      const value = getPath(this.data, key)
      return value === undefined ? clone(defaultValue) : clone(value)
    }

    set(key: string, value: unknown): void {
      setPath(this.data, key, value)
    }

    clear(): void {
      this.data = {}
      mocks.lastStoreData = this.data
    }
  },
}))

import { LLM_PROVIDERS, STORED_SECRET_PLACEHOLDER } from '../shared/constants'
import type { ASRConfig } from '../shared/types'
import { ConfigManager } from './config-manager'

const encrypted = (value: string): string => `enc:${Buffer.from(value, 'utf8').toString('base64')}`

function createManager(initialData: Record<string, unknown>): ConfigManager {
  mocks.initialData = initialData
  return new ConfigManager()
}

describe('ConfigManager local ASR migration', () => {
  beforeEach(() => {
    mocks.initialData = {}
    mocks.lastStoreData = {}
  })

  it('removes obsolete GLM fields while preserving local audio settings', () => {
    const manager = createManager({
      asr: {
        provider: 'glm',
        region: 'intl',
        apiKey: 'legacy-key',
        apiKeys: { cn: 'cn-key', intl: 'intl-key' },
        endpoint: 'https://example.com/audio/transcriptions',
        language: 'auto',
        lowVolumeMode: false,
        microphoneDeviceId: ' microphone-id ',
        microphoneDeviceLabel: ' Desk microphone ',
      },
    })

    expect(manager.getASRConfig()).toEqual({
      lowVolumeMode: false,
      microphoneDeviceId: 'microphone-id',
      microphoneDeviceLabel: 'Desk microphone',
    })
    expect(getPath(mocks.lastStoreData, 'asr')).toEqual(manager.getASRConfig())
  })

  it('keeps the legacy no-gain behavior when an old config has no gain toggle', () => {
    const manager = createManager({
      asr: {
        provider: 'glm',
        region: 'cn',
        apiKeys: { cn: 'old-key', intl: '' },
      },
    })

    expect(manager.getASRConfig().lowVolumeMode).toBe(false)
  })

  it('uses local ASR defaults for a fresh configuration', () => {
    const manager = createManager({})

    expect(manager.getASRConfig()).toEqual({
      lowVolumeMode: true,
      microphoneDeviceId: '',
      microphoneDeviceLabel: '',
    })
  })

  it('persists only supported local audio settings', () => {
    const manager = createManager({})

    manager.setASRConfig({
      provider: 'glm',
      apiKeys: { cn: 'injected-key', intl: '' },
      lowVolumeMode: false,
      microphoneDeviceId: 'device-1',
      microphoneDeviceLabel: 'USB microphone',
    } as unknown as Partial<ASRConfig>)

    expect(getPath(mocks.lastStoreData, 'asr')).toEqual({
      lowVolumeMode: false,
      microphoneDeviceId: 'device-1',
      microphoneDeviceLabel: 'USB microphone',
    })
  })
})

describe('ConfigManager LLM API key storage without system Keychain', () => {
  beforeEach(() => {
    mocks.initialData = {}
    mocks.lastStoreData = {}
  })

  it('uses plaintext keys in the main process while masking them from the renderer', () => {
    const manager = createManager({
      llmRefine: {
        enabled: true,
        provider: 'deepseek',
        openai: { apiKey: 'openai-key', model: LLM_PROVIDERS.DEFAULT_OPENAI_MODEL },
        deepseek: { apiKey: 'llm-key', model: 'deepseek-v4-flash' },
        openrouter: { apiKey: 'openrouter-key', model: LLM_PROVIDERS.DEFAULT_OPENROUTER_MODEL },
        custom: {
          endpoint: 'https://example.com/v1',
          apiKey: 'custom-key',
          model: 'example-model',
        },
      },
    })

    const rendererConfig = manager.getConfig()

    expect(rendererConfig.llmRefine.openai.apiKey).toBe(STORED_SECRET_PLACEHOLDER)
    expect(rendererConfig.llmRefine.deepseek.apiKey).toBe(STORED_SECRET_PLACEHOLDER)
    expect(manager.getLLMRefineConfig().deepseek.apiKey).toBe('llm-key')
    expect(manager.getConfigSecret({ scope: 'llm-refine', provider: 'openai' })).toBe('openai-key')
    expect(manager.getConfigSecret({ scope: 'llm-refine', provider: 'deepseek' })).toBe('llm-key')
    expect(manager.getConfigSecret({ scope: 'llm-refine', provider: 'openrouter' })).toBe(
      'openrouter-key',
    )
    expect(manager.getConfigSecret({ scope: 'llm-refine', provider: 'custom-compatible' })).toBe(
      'custom-key',
    )
  })

  it('never treats legacy safeStorage ciphertext as an API key', () => {
    const llmCipherText = encrypted('llm-key')
    const manager = createManager({
      llmRefine: {
        enabled: true,
        provider: 'deepseek',
        deepseek: { apiKey: llmCipherText, model: 'deepseek-v4-flash' },
      },
    })

    const rendererConfig = manager.getConfig()

    expect(rendererConfig.llmRefine.deepseek.apiKey).toBe('')
    expect(manager.getLLMRefineConfig().deepseek.apiKey).toBe('')
    expect(manager.getConfigSecret({ scope: 'llm-refine', provider: 'deepseek' })).toBe('')
    expect(manager.resolveLLMRefineConfig(rendererConfig.llmRefine).deepseek.apiKey).toBe('')
    expect(getPath(mocks.lastStoreData, 'llmRefine.deepseek.apiKey')).toBe(llmCipherText)
  })

  it('preserves legacy ciphertext during unrelated autosaves', () => {
    const llmCipherText = encrypted('llm-key')
    const manager = createManager({
      llmRefine: {
        enabled: true,
        provider: 'deepseek',
        translateOutput: false,
        openai: {
          apiKey: encrypted('openai-key'),
          model: LLM_PROVIDERS.DEFAULT_OPENAI_MODEL,
        },
        deepseek: { apiKey: llmCipherText, model: 'deepseek-v4-flash' },
        openrouter: { apiKey: encrypted('openrouter-key'), model: 'openai/gpt-4o-mini' },
        custom: {
          endpoint: 'https://example.com/v1',
          apiKey: encrypted('custom-key'),
          model: 'example-model',
        },
      },
    })
    const rendererConfig = manager.getConfig()

    manager.setLLMRefineConfig({ ...rendererConfig.llmRefine, translateOutput: true })

    expect(getPath(mocks.lastStoreData, 'llmRefine.deepseek.apiKey')).toBe(llmCipherText)
    expect(getPath(mocks.lastStoreData, 'llmRefine.openai.apiKey')).toBe(encrypted('openai-key'))
    expect(getPath(mocks.lastStoreData, 'llmRefine.openrouter.apiKey')).toBe(
      encrypted('openrouter-key'),
    )
    expect(rendererConfig.llmRefine.openrouter.model).toBe(LLM_PROVIDERS.DEFAULT_OPENROUTER_MODEL)
    expect(getPath(mocks.lastStoreData, 'llmRefine.custom.apiKey')).toBe(encrypted('custom-key'))
  })

  it('preserves plaintext keys when renderer autosave echoes the masked placeholder', () => {
    const manager = createManager({
      llmRefine: {
        enabled: true,
        provider: 'deepseek',
        translateOutput: false,
        deepseek: { apiKey: 'llm-key', model: 'deepseek-v4-flash' },
      },
    })
    const rendererConfig = manager.getConfig()

    manager.setLLMRefineConfig({ ...rendererConfig.llmRefine, translateOutput: true })

    expect(getPath(mocks.lastStoreData, 'llmRefine.deepseek.apiKey')).toBe('llm-key')
  })

  it('replaces legacy ciphertext with a newly entered plaintext key', () => {
    const manager = createManager({
      llmRefine: {
        enabled: true,
        provider: 'deepseek',
        deepseek: { apiKey: encrypted('old-llm-key'), model: 'deepseek-v4-flash' },
      },
    })

    manager.setLLMRefineConfig({
      deepseek: { apiKey: 'new-llm-key', model: 'deepseek-v4-flash' },
    })

    expect(getPath(mocks.lastStoreData, 'llmRefine.deepseek.apiKey')).toBe('new-llm-key')
  })

  it('recovers a legacy plaintext LLM alias instead of unreadable provider ciphertext', () => {
    const manager = createManager({
      llmRefine: {
        enabled: true,
        provider: 'deepseek',
        apiKey: 'recoverable-llm-key',
        deepseek: {
          apiKey: encrypted('unreadable-llm-key'),
          model: 'deepseek-v4-flash',
        },
      },
    })

    expect(manager.getLLMRefineConfig().deepseek.apiKey).toBe('recoverable-llm-key')
    expect(manager.getConfig().llmRefine.deepseek.apiKey).toBe(STORED_SECRET_PLACEHOLDER)
    expect(getPath(mocks.lastStoreData, 'llmRefine.deepseek.apiKey')).toBe('recoverable-llm-key')
  })

  it('resolves renderer placeholders only inside the main process for connection tests', () => {
    const manager = createManager({
      llmRefine: {
        enabled: true,
        provider: 'deepseek',
        deepseek: { apiKey: 'llm-key', model: 'deepseek-v4-flash' },
      },
    })
    const rendererConfig = manager.getConfig()

    expect(manager.resolveLLMRefineConfig(rendererConfig.llmRefine).deepseek.apiKey).toBe('llm-key')
  })

  it('allows a plaintext key to be explicitly cleared', () => {
    const manager = createManager({
      llmRefine: {
        enabled: true,
        provider: 'deepseek',
        deepseek: { apiKey: 'llm-key', model: 'deepseek-v4-flash' },
      },
    })

    manager.setLLMRefineConfig({
      deepseek: { apiKey: '', model: 'deepseek-v4-flash' },
    })

    expect(getPath(mocks.lastStoreData, 'llmRefine.deepseek.apiKey')).toBe('')
  })
})
