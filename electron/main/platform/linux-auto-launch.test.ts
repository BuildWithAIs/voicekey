import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { buildLinuxAutostartEntry, resolveLinuxAutoLaunchExecutable } from './linux-auto-launch'

describe('Linux XDG autostart entry', () => {
  it('launches the packaged executable in hidden-startup mode', () => {
    const entry = buildLinuxAutostartEntry('/home/user/Voice Key/voice-key')

    expect(entry).toContain('Exec="/home/user/Voice Key/voice-key" --startup-hidden')
    expect(entry).toContain('StartupWMClass=voice-key')
    expect(entry.endsWith('\n')).toBe(true)
  })

  it('escapes desktop entry field codes and quotes', () => {
    const entry = buildLinuxAutostartEntry('/tmp/100%/voice"key')
    expect(entry).toContain('Exec="/tmp/100%%/voice\\"key" --startup-hidden')
  })

  it('uses the stable AppImage path instead of its temporary mount executable', () => {
    const appImagePath = path.resolve('downloads', 'Voice-Key.AppImage')
    expect(
      resolveLinuxAutoLaunchExecutable('/tmp/.mount_voice/voice-key', {
        APPIMAGE: appImagePath,
      }),
    ).toBe(appImagePath)
    expect(resolveLinuxAutoLaunchExecutable('/opt/Voice Key/voice-key', {})).toBe(
      '/opt/Voice Key/voice-key',
    )
  })
})
