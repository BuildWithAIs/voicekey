import path from 'node:path'

export type LinuxDesktopSession = 'omarchy' | 'hyprland' | 'wayland' | 'x11' | 'other'
export type PlatformEnvironment = Readonly<Record<string, string | undefined>>

export function isHyprlandSession(
  env: PlatformEnvironment = process.env,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return platform === 'linux' && Boolean(env.HYPRLAND_INSTANCE_SIGNATURE)
}

export function resolveHyprlandSocketPath(env: PlatformEnvironment = process.env): string | null {
  const runtimeDir = env.XDG_RUNTIME_DIR
  const signature = env.HYPRLAND_INSTANCE_SIGNATURE

  if (!runtimeDir || !path.isAbsolute(runtimeDir) || !signature) {
    return null
  }

  if (!/^[A-Za-z0-9_.-]+$/u.test(signature)) {
    return null
  }

  const hyprlandDir = path.resolve(runtimeDir, 'hypr', signature)
  const runtimeRoot = path.resolve(runtimeDir, 'hypr')
  if (path.dirname(hyprlandDir) !== runtimeRoot) {
    return null
  }

  return path.join(hyprlandDir, '.socket2.sock')
}

export function classifyLinuxSession(
  options: {
    platform?: NodeJS.Platform
    env?: PlatformEnvironment
    omarchyDetected?: boolean
  } = {},
): LinuxDesktopSession {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env

  if (platform !== 'linux') return 'other'
  if (isHyprlandSession(env, platform)) {
    return options.omarchyDetected ? 'omarchy' : 'hyprland'
  }
  if (env.XDG_SESSION_TYPE?.toLowerCase() === 'wayland') return 'wayland'
  if (env.XDG_SESSION_TYPE?.toLowerCase() === 'x11' || env.DISPLAY) return 'x11'
  return 'other'
}
