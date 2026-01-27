import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GLM_ASR } from '../../shared/constants'
import type { ASRConfig } from '../../shared/types'

const mockPost = vi.fn()
const mockIsAxiosError = vi.fn()
const mockFormDataAppend = vi.fn()
const mockFormDataGetHeaders = vi.fn(() => ({}))

const mockAxios = {
  post: mockPost,
  isAxiosError: mockIsAxiosError,
}

class MockFormData {
  append = mockFormDataAppend
  getHeaders = mockFormDataGetHeaders
}

const mockExistsSync = vi.fn()
const mockCreateReadStream = vi.fn()

vi.mock('axios', () => ({
  default: mockAxios,
}))

vi.mock('form-data', () => ({
  default: MockFormData,
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  const fsMock = {
    ...actual,
    existsSync: mockExistsSync,
    createReadStream: mockCreateReadStream,
  }
  return {
    ...fsMock,
    default: fsMock,
  }
})

const createProvider = async (overrides: Partial<ASRConfig> = {}) => {
  const module = await import('../asr-provider')
  return new module.ASRProvider({
    provider: 'glm',
    region: 'cn',
    apiKeys: { cn: 'key-cn', intl: 'key-intl' },
    endpoint: '',
    language: 'auto',
    ...overrides,
  })
}

describe('ASRProvider', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockExistsSync.mockReturnValue(true)
    mockCreateReadStream.mockReturnValue({})
    mockPost.mockResolvedValue({
      data: { text: 'hello', id: '1', created: 123, model: 'glm' },
    })
    mockIsAxiosError.mockReturnValue(false)
  })

  it('throws when api key is missing for region', async () => {
    const provider = await createProvider({
      region: 'cn',
      apiKeys: { cn: '', intl: '' },
    })
    await expect(provider.transcribe('/tmp/audio.mp3')).rejects.toThrow(
      'API Key not configured for region: cn',
    )
  })

  it('throws when audio file is missing', async () => {
    mockExistsSync.mockReturnValue(false)
    const provider = await createProvider()
    await expect(provider.transcribe('/tmp/audio.mp3')).rejects.toThrow('Audio file not found')
  })

  it('uses cn endpoint by default', async () => {
    const provider = await createProvider({ region: 'cn', endpoint: '' })
    const result = await provider.transcribe('/tmp/audio.mp3')
    expect(result.text).toBe('hello')
    expect(mockPost).toHaveBeenCalledWith(
      GLM_ASR.ENDPOINT,
      expect.any(MockFormData),
      expect.any(Object),
    )
  })

  it('uses intl endpoint by default', async () => {
    const provider = await createProvider({ region: 'intl', endpoint: '' })
    await provider.transcribe('/tmp/audio.mp3')
    expect(mockPost).toHaveBeenCalledWith(
      GLM_ASR.ENDPOINT_INTL,
      expect.any(MockFormData),
      expect.any(Object),
    )
  })

  it('uses custom endpoint when provided', async () => {
    const provider = await createProvider({ endpoint: 'https://custom.endpoint' })
    await provider.transcribe('/tmp/audio.mp3')
    expect(mockPost).toHaveBeenCalledWith(
      'https://custom.endpoint',
      expect.any(MockFormData),
      expect.any(Object),
    )
  })

  it('adds language when configured', async () => {
    const provider = await createProvider({ language: 'en' })
    await provider.transcribe('/tmp/audio.mp3')
    expect(mockFormDataAppend).toHaveBeenCalledWith('language', 'en')
  })

  it('throws on invalid response payload', async () => {
    mockPost.mockResolvedValueOnce({ data: {} })
    const provider = await createProvider()
    await expect(provider.transcribe('/tmp/audio.mp3')).rejects.toThrow(
      'Invalid response from ASR service',
    )
  })

  it('maps axios error with response payload', async () => {
    const error = { response: { data: { error: { message: 'bad' } } } }
    mockIsAxiosError.mockReturnValue(true)
    mockPost.mockRejectedValueOnce(error)
    const provider = await createProvider()
    await expect(provider.transcribe('/tmp/audio.mp3')).rejects.toThrow('ASR Error: bad')
  })

  it('maps axios network error without response', async () => {
    const error = { message: 'timeout' }
    mockIsAxiosError.mockReturnValue(true)
    mockPost.mockRejectedValueOnce(error)
    const provider = await createProvider()
    await expect(provider.transcribe('/tmp/audio.mp3')).rejects.toThrow('Network Error: timeout')
  })

  it('testConnection returns false when api key is missing', async () => {
    const provider = await createProvider({ apiKeys: { cn: '', intl: '' } })
    const result = await provider.testConnection()
    expect(result).toBe(false)
  })

  it('testConnection returns true on 400 response', async () => {
    const error = { response: { status: 400 }, message: 'Bad Request' }
    mockIsAxiosError.mockReturnValue(true)
    mockPost.mockRejectedValueOnce(error)
    const provider = await createProvider()
    const result = await provider.testConnection()
    expect(result).toBe(true)
  })

  it('testConnection returns false on 401 response', async () => {
    const error = { response: { status: 401 }, message: 'Unauthorized' }
    mockIsAxiosError.mockReturnValue(true)
    mockPost.mockRejectedValueOnce(error)
    const provider = await createProvider()
    const result = await provider.testConnection()
    expect(result).toBe(false)
  })
})
