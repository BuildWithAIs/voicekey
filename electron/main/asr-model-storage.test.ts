import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  removeLegacyStreamingASRInstallDirs,
  resolveManagedASRInstallDir,
} from './asr-model-storage'

vi.mock('electron', () => ({
  app: { getPath: vi.fn() },
  shell: { openPath: vi.fn() },
}))

describe('ASR model storage path guard', () => {
  const storageDir = path.resolve('test-data', 'local-asr')

  it.each(['sensevoice', 'x-asr-480ms'])(
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

  it.each(['streaming-paraformer', 'streaming-punctuation'])(
    'does not treat removed legacy directory %s as an active install',
    (directoryName) => {
      expect(() =>
        resolveManagedASRInstallDir(storageDir, path.join(storageDir, directoryName)),
      ).toThrow()
    },
  )
})

describe('legacy streaming ASR cleanup', () => {
  it('removes only the two retired streaming installs', () => {
    const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicekey-asr-cleanup-'))

    try {
      for (const directoryName of [
        'sensevoice',
        'x-asr-480ms',
        'streaming-paraformer',
        'streaming-punctuation',
      ]) {
        fs.mkdirSync(path.join(storageDir, directoryName), { recursive: true })
      }

      removeLegacyStreamingASRInstallDirs(storageDir)

      expect(fs.existsSync(path.join(storageDir, 'sensevoice'))).toBe(true)
      expect(fs.existsSync(path.join(storageDir, 'x-asr-480ms'))).toBe(true)
      expect(fs.existsSync(path.join(storageDir, 'streaming-paraformer'))).toBe(false)
      expect(fs.existsSync(path.join(storageDir, 'streaming-punctuation'))).toBe(false)
    } finally {
      fs.rmSync(storageDir, { recursive: true, force: true })
    }
  })
})
