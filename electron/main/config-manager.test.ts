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

function deletePath(object: Record<string, unknown>, path: string): void {
  const keys = path.split('.')
  const parent = keys.slice(0, -1).reduce<unknown>((value, key) => {
    return isRecord(value) ? value[key] : undefined
  }, object)
  if (isRecord(parent)) {
    delete parent[keys[keys.length - 1]]
  }
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

    delete(key: string): void {
      deletePath(this.data, key)
    }

    clear(): void {
      this.data = {}
      mocks.lastStoreData = this.data
    }
  },
}))

import { STORED_SECRET_PLACEHOLDER } from '../shared/constants'
import { ConfigManager } from './config-manager'

const encrypted = (value: string): string => `enc:${Buffer.from(value, 'utf8').toString('base64')}`

function createManager(initialData: Record<string, unknown>): ConfigManager {
  mocks.initialData = initialData
  return new ConfigManager()
}

describe('ConfigManager API key storage without system Keychain', () => {
  beforeEach(() => {
    mocks.initialData = {}
    mocks.lastStoreData = {}
  })

  it('uses plaintext keys in the main process while masking them from the renderer', () => {
    const manager = createManager({
      asr: {
        provider: 'glm',
        region: 'cn',
        apiKeys: { cn: 'asr-key', intl: '' },
      },
      llmRefine: {
        enabled: true,
        provider: 'deepseek',
        deepseek: { apiKey: 'llm-key', model: 'deepseek-v4-flash' },
      },
    })

    const rendererConfig = manager.getConfig()

    expect(rendererConfig.asr.apiKeys.cn).toBe(STORED_SECRET_PLACEHOLDER)
    expect('apiKey' in rendererConfig.asr).toBe(false)
    expect(rendererConfig.llmRefine.deepseek.apiKey).toBe(STORED_SECRET_PLACEHOLDER)
    expect(manager.getASRConfig().apiKeys.cn).toBe('asr-key')
    expect(manager.getLLMRefineConfig().deepseek.apiKey).toBe('llm-key')
  })

  it('never treats legacy safeStorage ciphertext as an API key', () => {
    const asrCipherText = encrypted('asr-key')
    const llmCipherText = encrypted('llm-key')
    const manager = createManager({
      asr: {
        provider: 'glm',
        region: 'cn',
        apiKeys: { cn: asrCipherText, intl: '' },
      },
      llmRefine: {
        enabled: true,
        provider: 'deepseek',
        deepseek: { apiKey: llmCipherText, model: 'deepseek-v4-flash' },
      },
    })

    const rendererConfig = manager.getConfig()

    expect(rendererConfig.asr.apiKeys.cn).toBe(STORED_SECRET_PLACEHOLDER)
    expect(rendererConfig.llmRefine.deepseek.apiKey).toBe(STORED_SECRET_PLACEHOLDER)
    expect(rendererConfig.secretStorage?.legacyEncryptedKeys).toBe(true)
    expect(manager.getASRConfig().apiKeys.cn).toBe('')
    expect(manager.getLLMRefineConfig().deepseek.apiKey).toBe('')
    expect(manager.resolveASRConfig(rendererConfig.asr).apiKeys.cn).toBe('')
    expect(manager.resolveLLMRefineConfig(rendererConfig.llmRefine).deepseek.apiKey).toBe('')
    expect(getPath(mocks.lastStoreData, 'asr.apiKeys.cn')).toBe(asrCipherText)
    expect(getPath(mocks.lastStoreData, 'llmRefine.deepseek.apiKey')).toBe(llmCipherText)
  })

  it('preserves legacy ciphertext during unrelated ASR and LLM autosaves', () => {
    const asrCipherText = encrypted('asr-key')
    const llmCipherText = encrypted('llm-key')
    const manager = createManager({
      asr: {
        provider: 'glm',
        region: 'cn',
        apiKeys: { cn: asrCipherText, intl: encrypted('intl-asr-key') },
        lowVolumeMode: true,
      },
      llmRefine: {
        enabled: true,
        provider: 'deepseek',
        translateOutput: false,
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

    manager.setASRConfig({ ...rendererConfig.asr, lowVolumeMode: false })
    manager.setLLMRefineConfig({ ...rendererConfig.llmRefine, translateOutput: true })

    expect(getPath(mocks.lastStoreData, 'asr.apiKeys.cn')).toBe(asrCipherText)
    expect(getPath(mocks.lastStoreData, 'asr.apiKeys.intl')).toBe(encrypted('intl-asr-key'))
    expect(getPath(mocks.lastStoreData, 'llmRefine.deepseek.apiKey')).toBe(llmCipherText)
    expect(getPath(mocks.lastStoreData, 'llmRefine.openrouter.apiKey')).toBe(
      encrypted('openrouter-key'),
    )
    expect(getPath(mocks.lastStoreData, 'llmRefine.custom.apiKey')).toBe(encrypted('custom-key'))
  })

  it('preserves plaintext keys when renderer autosave echoes the masked placeholder', () => {
    const manager = createManager({
      asr: {
        provider: 'glm',
        region: 'cn',
        apiKeys: { cn: 'asr-key', intl: '' },
        lowVolumeMode: true,
      },
      llmRefine: {
        enabled: true,
        provider: 'deepseek',
        translateOutput: false,
        deepseek: { apiKey: 'llm-key', model: 'deepseek-v4-flash' },
      },
    })
    const rendererConfig = manager.getConfig()

    manager.setASRConfig({ ...rendererConfig.asr, lowVolumeMode: false })
    manager.setLLMRefineConfig({ ...rendererConfig.llmRefine, translateOutput: true })

    expect(getPath(mocks.lastStoreData, 'asr.apiKeys.cn')).toBe('asr-key')
    expect(getPath(mocks.lastStoreData, 'llmRefine.deepseek.apiKey')).toBe('llm-key')
  })

  it('replaces legacy ciphertext with a newly entered plaintext key', () => {
    const manager = createManager({
      asr: {
        provider: 'glm',
        region: 'cn',
        apiKeys: { cn: encrypted('old-asr-key'), intl: '' },
      },
      llmRefine: {
        enabled: true,
        provider: 'deepseek',
        deepseek: { apiKey: encrypted('old-llm-key'), model: 'deepseek-v4-flash' },
      },
    })

    manager.setASRConfig({ apiKeys: { cn: 'new-asr-key', intl: '' } })
    manager.setLLMRefineConfig({
      deepseek: { apiKey: 'new-llm-key', model: 'deepseek-v4-flash' },
    })

    expect(getPath(mocks.lastStoreData, 'asr.apiKeys.cn')).toBe('new-asr-key')
    expect(getPath(mocks.lastStoreData, 'llmRefine.deepseek.apiKey')).toBe('new-llm-key')
    expect(manager.getConfig().secretStorage?.legacyEncryptedKeys).toBe(false)
  })

  it('recovers a legacy plaintext ASR backup instead of keeping unreadable ciphertext', () => {
    const manager = createManager({
      asr: {
        provider: 'glm',
        region: 'cn',
        apiKey: 'recoverable-asr-key',
        apiKeys: { cn: encrypted('unreadable-asr-key'), intl: '' },
      },
    })

    expect(manager.getASRConfig().apiKeys.cn).toBe('recoverable-asr-key')
    expect(manager.getConfig().asr.apiKeys.cn).toBe(STORED_SECRET_PLACEHOLDER)
    expect(getPath(mocks.lastStoreData, 'asr.apiKey')).toBeUndefined()
    expect(getPath(mocks.lastStoreData, 'asr.apiKeys.cn')).toBe('recoverable-asr-key')

    manager.setASRConfig({ apiKeys: { cn: '', intl: '' } })
    const persistedAfterClear = clone(mocks.lastStoreData)
    const restartedManager = createManager(persistedAfterClear)
    expect(restartedManager.getASRConfig().apiKeys.cn).toBe('')
  })

  it('recovers a legacy plaintext LLM alias instead of keeping unreadable provider ciphertext', () => {
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
      asr: {
        provider: 'glm',
        region: 'cn',
        apiKeys: { cn: 'asr-key', intl: '' },
      },
      llmRefine: {
        enabled: true,
        provider: 'deepseek',
        deepseek: { apiKey: 'llm-key', model: 'deepseek-v4-flash' },
      },
    })
    const rendererConfig = manager.getConfig()

    expect(manager.resolveASRConfig(rendererConfig.asr).apiKeys.cn).toBe('asr-key')
    expect(manager.resolveLLMRefineConfig(rendererConfig.llmRefine).deepseek.apiKey).toBe('llm-key')
  })

  it('allows plaintext ASR and LLM keys to be explicitly cleared', () => {
    const manager = createManager({
      asr: {
        provider: 'glm',
        region: 'cn',
        apiKeys: { cn: 'asr-key', intl: '' },
      },
      llmRefine: {
        enabled: true,
        provider: 'deepseek',
        deepseek: { apiKey: 'llm-key', model: 'deepseek-v4-flash' },
      },
    })

    manager.setASRConfig({ apiKeys: { cn: '', intl: '' } })
    manager.setLLMRefineConfig({
      deepseek: { apiKey: '', model: 'deepseek-v4-flash' },
    })

    expect(getPath(mocks.lastStoreData, 'asr.apiKeys.cn')).toBe('')
    expect(getPath(mocks.lastStoreData, 'llmRefine.deepseek.apiKey')).toBe('')
  })
})
