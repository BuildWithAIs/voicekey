import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGet = vi.fn()
const mockGetVersion = vi.fn()
const mockOpenExternal = vi.fn()

vi.mock('axios', () => ({
  default: { get: mockGet },
}))

vi.mock('electron', () => ({
  app: {
    getVersion: mockGetVersion,
  },
  shell: {
    openExternal: mockOpenExternal,
  },
}))

const createManager = async () => {
  const module = await import('../updater-manager')
  return module.UpdaterManager
}

const makeRelease = (overrides: Record<string, unknown> = {}) => ({
  tag_name: 'v0.2.0',
  html_url: 'https://github.com/BuildWithAIs/voicekey/releases/tag/v0.2.0',
  body: 'notes',
  ...overrides,
})

describe('UpdaterManager', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockGetVersion.mockReturnValue('0.1.0')
    mockGet.mockResolvedValue({ data: makeRelease() })
  })

  it('returns hasUpdate true when latest tag is newer', async () => {
    const UpdaterManager = await createManager()
    const result = await UpdaterManager.checkForUpdates()

    expect(result.hasUpdate).toBe(true)
    expect(result.latestVersion).toBe('0.2.0')
    expect(result.releaseNotes).toBe('notes')
    expect(result.releaseUrl).toContain('/BuildWithAIs/voicekey/releases')
  })

  it('returns hasUpdate false when latest tag is not newer', async () => {
    mockGetVersion.mockReturnValue('0.2.0')
    const UpdaterManager = await createManager()
    const result = await UpdaterManager.checkForUpdates()

    expect(result.hasUpdate).toBe(false)
    expect(result.latestVersion).toBe('0.2.0')
  })

  it('returns error when version tag or app version is invalid', async () => {
    mockGetVersion.mockReturnValue('not-a-version')
    const UpdaterManager = await createManager()
    const result = await UpdaterManager.checkForUpdates()

    expect(result.hasUpdate).toBe(false)
    expect(result.error).toBe('Invalid version tag from release or app version')
  })

  it('sanitizes release url for invalid host', async () => {
    mockGet.mockResolvedValueOnce({
      data: makeRelease({ html_url: 'https://example.com/releases/tag/v0.2.0' }),
    })
    const UpdaterManager = await createManager()
    const result = await UpdaterManager.checkForUpdates()

    expect(result.releaseUrl).toBe('https://github.com/BuildWithAIs/voicekey/releases')
  })

  it('returns default info on request failure', async () => {
    mockGet.mockRejectedValueOnce(new Error('boom'))
    const UpdaterManager = await createManager()
    const result = await UpdaterManager.checkForUpdates()

    expect(result.hasUpdate).toBe(false)
    expect(result.latestVersion).toBe('')
    expect(result.releaseUrl).toBe('https://github.com/BuildWithAIs/voicekey/releases')
    expect(result.error).toBe('boom')
  })

  it('opens sanitized release page', async () => {
    const UpdaterManager = await createManager()
    UpdaterManager.openReleasePage('http://malicious.com')
    expect(mockOpenExternal).toHaveBeenCalledWith(
      'https://github.com/BuildWithAIs/voicekey/releases',
    )
  })
})
