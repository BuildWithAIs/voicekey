import { execFile, spawn } from 'node:child_process'
import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { createConnection, type Socket } from 'node:net'
import { homedir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { HotkeyConfig, LinuxIntegrationStatus } from '../../shared/types'
import {
  acceleratorToHyprland,
  buildHyprlandManagedBlock,
  findHyprlandManagedBlock,
  hasMalformedHyprlandManagedBlock,
  removeHyprlandManagedBlock,
  upsertHyprlandManagedBlock,
} from './hyprland-hotkeys'
import {
  classifyLinuxSession,
  isHyprlandSession,
  resolveHyprlandSocketPath,
} from './linux-environment'

type HyprlandAction = 'ptt-start' | 'ptt-stop' | 'open-settings' | 'translate'

export type HyprlandActionHandlers = Partial<Record<HyprlandAction, () => void>>

type HyprlandBinding = {
  modmask?: number
  key?: string
  description?: string
  dispatcher?: string
  release?: boolean
}

type ExecFileResult = {
  stdout: string
  stderr: string
}

export function getWtypeClipboardShortcutArgs(
  action: 'copy' | 'paste',
  isTerminal: boolean,
): string[] {
  const shortcut =
    action === 'copy'
      ? isTerminal
        ? { modifier: 'ctrl', key: 'Insert' }
        : { modifier: 'ctrl', key: 'c' }
      : isTerminal
        ? { modifier: 'shift', key: 'Insert' }
        : { modifier: 'ctrl', key: 'v' }

  return ['-M', shortcut.modifier, '-k', shortcut.key, '-m', shortcut.modifier]
}

export function getWlCopyTextArgs(): string[] {
  return ['--foreground', '--sensitive', '--type', 'text/plain;charset=utf-8']
}

const execFileAsync = promisify(execFile)
const EVENT_PREFIX = 'custom>>voice-key:'
const MAX_SOCKET_BUFFER_LENGTH = 64 * 1024
const RECONNECT_DELAYS_MS = [250, 500, 1_000, 2_000, 5_000]
const TERMINAL_CLASSES = new Set([
  'alacritty',
  'com.mitchellh.ghostty',
  'foot',
  'footclient',
  'kitty',
  'org.wezfurlong.wezterm',
  'wezterm',
])

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isKnownAction(value: string): value is HyprlandAction {
  return (
    value === 'ptt-start' ||
    value === 'ptt-stop' ||
    value === 'open-settings' ||
    value === 'translate'
  )
}

function normalizeHyprlandKey(value: string): string {
  const aliases: Record<string, string> = {
    ' ': 'SPACE',
    space: 'SPACE',
    comma: 'COMMA',
    ',': 'COMMA',
    period: 'PERIOD',
    '.': 'PERIOD',
    enter: 'RETURN',
    return: 'RETURN',
    esc: 'ESCAPE',
  }
  return aliases[value.toLowerCase()] ?? value.toUpperCase()
}

function modmaskForBinding(binding: string): number {
  const tokens = binding.split(' + ').slice(0, -1)
  return tokens.reduce((mask, token) => {
    if (token === 'SHIFT') return mask | 1
    if (token === 'CTRL') return mask | 4
    if (token === 'ALT') return mask | 8
    if (token === 'SUPER') return mask | 64
    return mask
  }, 0)
}

function bindingConflictsWithAccelerator(binding: HyprlandBinding, accelerator: string): boolean {
  if (binding.release) return false
  const expected = acceleratorToHyprland(accelerator)
  if (!expected || typeof binding.key !== 'string' || typeof binding.modmask !== 'number') {
    return false
  }

  const expectedParts = expected.binding.split(' + ')
  const expectedKey = expectedParts[expectedParts.length - 1]
  return (
    normalizeHyprlandKey(binding.key) === normalizeHyprlandKey(expectedKey) &&
    binding.modmask === modmaskForBinding(expected.binding)
  )
}

function configErrorsPresent(output: string): boolean {
  const normalized = output.trim().toLowerCase()
  return Boolean(normalized && normalized !== 'no errors' && normalized !== 'ok')
}

export class HyprlandIntegration {
  private socket: Socket | null = null
  private socketBuffer = ''
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectAttempt = 0
  private running = false
  private connected = false
  private handlers: HyprlandActionHandlers = {}

  private readonly homeDir: string
  private readonly env: NodeJS.ProcessEnv
  private readonly platform: NodeJS.Platform

  constructor(
    options: {
      homeDir?: string
      env?: NodeJS.ProcessEnv
      platform?: NodeJS.Platform
    } = {},
  ) {
    this.homeDir = options.homeDir ?? homedir()
    this.env = options.env ?? process.env
    this.platform = options.platform ?? process.platform
  }

  isActiveSession(): boolean {
    return isHyprlandSession(this.env, this.platform)
  }

  start(handlers: HyprlandActionHandlers): void {
    this.handlers = handlers
    if (!this.isActiveSession() || this.running) return
    this.running = true
    this.connectSocket()
  }

  updateHandlers(handlers: HyprlandActionHandlers): void {
    this.handlers = handlers
  }

  stop(): void {
    this.running = false
    this.connected = false
    this.handlers = {}
    this.socketBuffer = ''
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.socket?.destroy()
    this.socket = null
  }

  async getStatus(
    hotkeys: HotkeyConfig,
    translationEnabled: boolean,
  ): Promise<LinuxIntegrationStatus> {
    const omarchyDetected = await this.detectOmarchy()
    const session = classifyLinuxSession({
      platform: this.platform,
      env: this.env,
      omarchyDetected,
    })
    const configPath = this.getBindingsPath()
    const backupPath = this.getBackupPath()
    const supported = this.platform === 'linux'
    const available = this.isActiveSession() && Boolean(resolveHyprlandSocketPath(this.env))

    let source = ''
    try {
      source = await readFile(configPath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        return {
          supported,
          available,
          installed: false,
          connected: this.connected,
          needsRepair: false,
          session,
          configPath,
          backupPath,
          conflicts: [],
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }

    const existingBlock = findHyprlandManagedBlock(source)
    let expectedBlock: string | null = null
    let error: string | undefined
    try {
      expectedBlock = buildHyprlandManagedBlock(hotkeys, translationEnabled)
      if (hasMalformedHyprlandManagedBlock(source)) {
        throw new Error('The existing Voice Key managed block is incomplete or duplicated')
      }
    } catch (buildError) {
      error = buildError instanceof Error ? buildError.message : String(buildError)
    }

    let conflicts: string[] = []
    if (available) {
      try {
        conflicts = await this.findConflicts(hotkeys, translationEnabled)
      } catch (conflictError) {
        error ??= conflictError instanceof Error ? conflictError.message : String(conflictError)
      }
    }
    return {
      supported,
      available,
      installed: Boolean(existingBlock),
      connected: this.connected,
      needsRepair: Boolean(existingBlock && expectedBlock && existingBlock !== expectedBlock),
      session,
      configPath,
      backupPath,
      conflicts,
      error,
    }
  }

  async install(
    hotkeys: HotkeyConfig,
    translationEnabled: boolean,
  ): Promise<LinuxIntegrationStatus> {
    if (!this.isActiveSession()) {
      throw new Error('A running Hyprland session is required to install the integration')
    }

    const managedBlock = buildHyprlandManagedBlock(hotkeys, translationEnabled)
    const conflicts = await this.findConflicts(hotkeys, translationEnabled)
    if (conflicts.length > 0) {
      throw new Error(`Hotkey conflicts must be resolved first: ${conflicts.join('; ')}`)
    }

    const configPath = this.getBindingsPath()
    const source = await this.readBindingsFile()
    const nextSource = upsertHyprlandManagedBlock(source, managedBlock)
    await mkdir(path.dirname(configPath), { recursive: true })
    await this.createBackup(source)
    await this.writeBindingsFile(nextSource)

    try {
      await this.reloadAndValidate()
    } catch (error) {
      await this.writeBindingsFile(source)
      await this.reloadHyprland().catch(() => undefined)
      throw error
    }

    return await this.getStatus(hotkeys, translationEnabled)
  }

  async remove(
    hotkeys: HotkeyConfig,
    translationEnabled: boolean,
  ): Promise<LinuxIntegrationStatus> {
    if (!this.isActiveSession()) {
      throw new Error('A running Hyprland session is required to remove the integration')
    }

    const source = await this.readBindingsFile()
    const nextSource = removeHyprlandManagedBlock(source)
    if (nextSource === source) {
      return await this.getStatus(hotkeys, translationEnabled)
    }

    await this.writeBindingsFile(nextSource)
    try {
      await this.reloadAndValidate()
    } catch (error) {
      await this.writeBindingsFile(source)
      await this.reloadHyprland().catch(() => undefined)
      throw error
    }

    return await this.getStatus(hotkeys, translationEnabled)
  }

  async sendClipboardShortcut(action: 'copy' | 'paste'): Promise<void> {
    if (!this.isActiveSession()) {
      throw new Error('Hyprland clipboard shortcut requested outside a Hyprland session')
    }

    const isTerminal = await this.activeWindowIsTerminal()
    await this.runWtype(getWtypeClipboardShortcutArgs(action, isTerminal))
  }

  async pasteClipboardText(text: string): Promise<void> {
    if (!this.isActiveSession()) {
      throw new Error('Wayland clipboard paste requested outside a Hyprland session')
    }

    const provider = spawn('wl-copy', getWlCopyTextArgs(), {
      env: this.env,
      stdio: ['pipe', 'ignore', 'pipe'],
      windowsHide: true,
    })
    let stderr = ''
    provider.stderr.setEncoding('utf8')
    provider.stderr.on('data', (chunk: string) => {
      if (stderr.length < 4_096) stderr += chunk
    })

    const ready = new Promise<void>((resolve, reject) => {
      provider.once('spawn', resolve)
      provider.once('error', reject)
    })
    provider.stdin.end(text, 'utf8')

    try {
      await ready
      await delay(75)
      if (provider.exitCode !== null) {
        throw new Error(stderr.trim() || `wl-copy exited with code ${provider.exitCode}`)
      }
      await this.sendClipboardShortcut('paste')
      await delay(150)
    } finally {
      if (provider.exitCode === null && provider.signalCode === null) {
        provider.kill()
      }
    }
  }

  private connectSocket(): void {
    const socketPath = resolveHyprlandSocketPath(this.env)
    if (!this.running || !socketPath) return

    const socket = createConnection(socketPath)
    this.socket = socket
    socket.setEncoding('utf8')

    socket.on('connect', () => {
      this.connected = true
      this.reconnectAttempt = 0
      console.log('[Platform:Hyprland] Connected to socket2')
    })
    socket.on('data', (chunk: string) => this.handleSocketData(chunk))
    socket.on('error', (error) => {
      console.warn('[Platform:Hyprland] socket2 error:', error.message)
    })
    socket.on('close', () => {
      if (this.socket === socket) this.socket = null
      this.connected = false
      this.scheduleReconnect()
    })
  }

  private handleSocketData(chunk: string): void {
    this.socketBuffer += chunk
    if (this.socketBuffer.length > MAX_SOCKET_BUFFER_LENGTH) {
      console.warn('[Platform:Hyprland] Dropping oversized socket2 buffer')
      this.socketBuffer = ''
      return
    }

    const lines = this.socketBuffer.split('\n')
    this.socketBuffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith(EVENT_PREFIX)) continue
      const action = line.slice(EVENT_PREFIX.length).trim()
      if (isKnownAction(action)) {
        this.handlers[action]?.()
      }
    }
  }

  private scheduleReconnect(): void {
    if (!this.running || this.reconnectTimer) return
    const delayMs =
      RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)]
    this.reconnectAttempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connectSocket()
    }, delayMs)
  }

  private getBindingsPath(): string {
    const configuredHome = this.env.XDG_CONFIG_HOME
    const configHome =
      configuredHome && path.isAbsolute(configuredHome)
        ? configuredHome
        : path.join(this.homeDir, '.config')
    return path.join(configHome, 'hypr', 'bindings.lua')
  }

  private getBackupPath(): string {
    return `${this.getBindingsPath()}.voice-key.bak`
  }

  private async detectOmarchy(): Promise<boolean> {
    if (this.env.OMARCHY_PATH) return true
    try {
      await access(path.join(this.homeDir, '.local', 'share', 'omarchy'))
      return true
    } catch {
      return false
    }
  }

  private async readBindingsFile(): Promise<string> {
    try {
      return await readFile(this.getBindingsPath(), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
      throw error
    }
  }

  private async createBackup(source: string): Promise<void> {
    try {
      await writeFile(this.getBackupPath(), source, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }

  private async writeBindingsFile(source: string): Promise<void> {
    const configPath = this.getBindingsPath()
    const tempPath = `${configPath}.voice-key.${process.pid}.tmp`
    await mkdir(path.dirname(configPath), { recursive: true })
    try {
      await writeFile(tempPath, source, { encoding: 'utf8', mode: 0o600 })
      await rename(tempPath, configPath)
    } finally {
      await unlink(tempPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') {
          console.warn('[Platform:Hyprland] Failed to clean temporary config:', error.message)
        }
      })
    }
  }

  private async runHyprctl(args: string[]): Promise<ExecFileResult> {
    const result = await execFileAsync('hyprctl', args, {
      encoding: 'utf8',
      timeout: 3_000,
      windowsHide: true,
      env: this.env,
    })
    return { stdout: result.stdout, stderr: result.stderr }
  }

  private async reloadHyprland(): Promise<void> {
    await this.runHyprctl(['reload'])
  }

  private async reloadAndValidate(): Promise<void> {
    await this.reloadHyprland()
    const { stdout, stderr } = await this.runHyprctl(['configerrors'])
    const errors = `${stdout}\n${stderr}`.trim()
    if (configErrorsPresent(errors)) {
      throw new Error(`Hyprland rejected the Voice Key integration: ${errors}`)
    }
  }

  private async findConflicts(
    hotkeys: HotkeyConfig,
    translationEnabled: boolean,
  ): Promise<string[]> {
    const { stdout } = await this.runHyprctl(['-j', 'binds']).catch((error: unknown) => {
      throw new Error(
        `Unable to inspect existing Hyprland shortcuts: ${error instanceof Error ? error.message : String(error)}`,
      )
    })
    const parsed: unknown = JSON.parse(stdout)
    if (!Array.isArray(parsed)) {
      throw new Error('Unable to inspect existing Hyprland shortcuts: unexpected response')
    }
    const bindings = parsed.filter(
      (value): value is HyprlandBinding => Boolean(value) && typeof value === 'object',
    )

    const requested = [hotkeys.pttKey, hotkeys.toggleSettings]
    if (translationEnabled && hotkeys.translateKey) requested.push(hotkeys.translateKey)

    const conflicts = new Set<string>()
    for (const accelerator of requested) {
      for (const binding of bindings) {
        if (binding.description?.startsWith('Voice Key')) continue
        if (!bindingConflictsWithAccelerator(binding, accelerator)) continue
        const owner = binding.description || binding.dispatcher || 'existing Hyprland binding'
        conflicts.add(`${accelerator} (${owner})`)
      }
    }
    return [...conflicts]
  }

  private async activeWindowIsTerminal(): Promise<boolean> {
    try {
      const { stdout } = await this.runHyprctl(['-j', 'activewindow'])
      const window: unknown = JSON.parse(stdout)
      if (!window || typeof window !== 'object') return false
      const record = window as Record<string, unknown>
      if (
        Array.isArray(record.tags) &&
        record.tags.some((tag) => typeof tag === 'string' && tag.replace(/\*$/u, '') === 'terminal')
      ) {
        return true
      }

      const className = typeof record.class === 'string' ? record.class.toLowerCase() : ''
      const initialClass =
        typeof record.initialClass === 'string' ? record.initialClass.toLowerCase() : ''
      return TERMINAL_CLASSES.has(className) || TERMINAL_CLASSES.has(initialClass)
    } catch (error) {
      console.warn('[Platform:Hyprland] Could not inspect the active window:', error)
      return false
    }
  }

  private async runWtype(args: string[]): Promise<void> {
    await execFileAsync('wtype', args, {
      encoding: 'utf8',
      timeout: 3_000,
      windowsHide: true,
      env: this.env,
    })
  }
}

export const hyprlandIntegration = new HyprlandIntegration()
