import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  classifyLinuxSession,
  isHyprlandSession,
  resolveHyprlandSocketPath,
} from './linux-environment'

describe('Linux desktop session detection', () => {
  it('detects Hyprland and Omarchy without treating generic Wayland as supported', () => {
    const env = {
      XDG_SESSION_TYPE: 'wayland',
      HYPRLAND_INSTANCE_SIGNATURE: 'instance_123',
    }
    expect(isHyprlandSession(env, 'linux')).toBe(true)
    expect(classifyLinuxSession({ platform: 'linux', env, omarchyDetected: true })).toBe('omarchy')
    expect(
      classifyLinuxSession({
        platform: 'linux',
        env: { XDG_SESSION_TYPE: 'wayland' },
      }),
    ).toBe('wayland')
  })

  it('rejects unsafe Hyprland instance signatures', () => {
    const runtimeDir = path.resolve('test-data', 'runtime')
    expect(
      resolveHyprlandSocketPath({
        XDG_RUNTIME_DIR: runtimeDir,
        HYPRLAND_INSTANCE_SIGNATURE: '../escape',
      }),
    ).toBeNull()
    expect(
      resolveHyprlandSocketPath({
        XDG_RUNTIME_DIR: runtimeDir,
        HYPRLAND_INSTANCE_SIGNATURE: 'safe-instance',
      }),
    ).toBe(path.join(runtimeDir, 'hypr', 'safe-instance', '.socket2.sock'))
  })
})
