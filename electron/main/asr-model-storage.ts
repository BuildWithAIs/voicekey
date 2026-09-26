import { app, shell } from 'electron'
import fs from 'fs'
import path from 'node:path'
import type { ASRMode } from '../shared/types'

const ASR_INSTALL_DIR_NAMES: Record<ASRMode, string> = {
  classic: 'sensevoice',
  streaming: 'x-asr-480ms',
}
const MANAGED_INSTALL_DIR_NAMES = new Set(Object.values(ASR_INSTALL_DIR_NAMES))
const LEGACY_STREAMING_INSTALL_DIR_NAMES = ['streaming-paraformer', 'streaming-punctuation']

export function getASRModelStorageDir(): string {
  return path.join(app.getPath('userData'), 'local-asr')
}

export function removeLegacyStreamingASRInstallDirs(storageDir = getASRModelStorageDir()): void {
  for (const directoryName of LEGACY_STREAMING_INSTALL_DIR_NAMES) {
    fs.rmSync(path.join(storageDir, directoryName), { recursive: true, force: true })
  }
}

export function getASRModelInstallDir(mode: ASRMode): string {
  return path.join(getASRModelStorageDir(), ASR_INSTALL_DIR_NAMES[mode])
}

export async function openASRModelInstallDir(mode: ASRMode): Promise<void> {
  const installDir = getASRModelInstallDir(mode)
  fs.mkdirSync(installDir, { recursive: true })
  const errorMessage = await shell.openPath(installDir)
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
