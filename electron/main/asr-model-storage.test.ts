import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { resolveManagedASRInstallDir } from './asr-model-storage'

vi.mock('electron', () => ({
  app: { getPath: vi.fn() },
  shell: { openPath: vi.fn() },
}))

describe('ASR model storage path guard', () => {
  const storageDir = path.resolve('test-data', 'local-asr')

  it.each(['sensevoice', 'streaming-paraformer', 'streaming-punctuation'])(
    'allows the managed %s install directory',
    (directoryName) => {
      const installDir = path.join(storageDir, directoryName)
      expect(resolveManagedASRInstallDir(storageDir, installDir)).toBe(installDir)
    },
  )

  it('rejects the storage root, nested paths, and sibling paths', () => {
    expect(() => resolveManagedASRInstallDir(storageDir, storageDir)).toThrow()
    expect(() =>
      resolveManagedASRInstallDir(storageDir, path.join(storageDir, 'sensevoice', 'models')),
    ).toThrow()
    expect(() =>
      resolveManagedASRInstallDir(storageDir, path.join(path.dirname(storageDir), 'sensevoice')),
    ).toThrow()
  })
})
