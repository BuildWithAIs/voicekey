import { app, shell } from 'electron'
import fs from 'fs'
import path from 'node:path'

const MANAGED_INSTALL_DIR_NAMES = new Set(['sensevoice', 'x-asr-480ms'])
const LEGACY_STREAMING_INSTALL_DIR_NAMES = ['streaming-paraformer', 'streaming-punctuation']

export function getASRModelStorageDir(): string {
  return path.join(app.getPath('userData'), 'local-asr')
}

export function removeLegacyStreamingASRInstallDirs(storageDir = getASRModelStorageDir()): void {
  for (const directoryName of LEGACY_STREAMING_INSTALL_DIR_NAMES) {
    fs.rmSync(path.join(storageDir, directoryName), { recursive: true, force: true })
  }
}

export async function openASRModelStorageDir(): Promise<void> {
  const storageDir = getASRModelStorageDir()
  fs.mkdirSync(storageDir, { recursive: true })
  const errorMessage = await shell.openPath(storageDir)
  if (errorMessage) {
    throw new Error(errorMessage)
  }
}

export function removeManagedASRInstallDir(installDir: string): void {
  const targetDir = resolveManagedASRInstallDir(getASRModelStorageDir(), installDir)
  fs.rmSync(targetDir, { recursive: true, force: true })
}

export function resolveManagedASRInstallDir(storageDir: string, installDir: string): string {
  const resolvedStorageDir = path.resolve(storageDir)
  const targetDir = path.resolve(installDir)
  const relativeTarget = path.relative(resolvedStorageDir, targetDir)

  if (
    !MANAGED_INSTALL_DIR_NAMES.has(relativeTarget) ||
    path.dirname(targetDir) !== resolvedStorageDir
  ) {
    throw new Error('Refusing to delete a directory outside managed ASR storage')
  }

  return targetDir
}
