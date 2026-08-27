import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { PlatformEnvironment } from './linux-environment'

export const LINUX_AUTOSTART_FILENAME = 'com.buildwithais.voice-key.desktop'

function quoteDesktopExecArgument(value: string): string {
  const escaped = value.replace(/%/gu, '%%').replace(/([\\"`$])/gu, '\\$1')
  return `"${escaped}"`
}

export function buildLinuxAutostartEntry(executablePath: string): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    'Name=Voice Key',
    'Comment=Push-to-talk voice input',
    `Exec=${quoteDesktopExecArgument(executablePath)} --startup-hidden`,
    'Terminal=false',
    'StartupNotify=false',
    'StartupWMClass=voice-key',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n')
}

export function resolveLinuxAutoLaunchExecutable(
  executablePath: string,
  env: PlatformEnvironment = process.env,
): string {
  const appImagePath = env.APPIMAGE
  if (appImagePath && path.isAbsolute(appImagePath)) {
    return appImagePath
  }
  return executablePath
}

export async function updateLinuxAutoLaunch(options: {
  enable: boolean
  homeDir: string
  executablePath: string
  configHome?: string
}): Promise<void> {
  const configHome =
    options.configHome && path.isAbsolute(options.configHome)
      ? options.configHome
      : path.join(options.homeDir, '.config')
  const autostartDir = path.join(configHome, 'autostart')
  const entryPath = path.join(autostartDir, LINUX_AUTOSTART_FILENAME)

  if (!options.enable) {
    await unlink(entryPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
    return
  }

  await mkdir(autostartDir, { recursive: true })
  await writeFile(entryPath, buildLinuxAutostartEntry(options.executablePath), {
    encoding: 'utf8',
    mode: 0o600,
  })
}
