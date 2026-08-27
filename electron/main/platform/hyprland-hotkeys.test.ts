import { describe, expect, it } from 'vitest'
import type { HotkeyConfig } from '../../shared/types'
import {
  acceleratorToHyprland,
  buildHyprlandManagedBlock,
  findHyprlandManagedBlock,
  hasMalformedHyprlandManagedBlock,
  removeHyprlandManagedBlock,
  upsertHyprlandManagedBlock,
  VOICE_KEY_MANAGED_BLOCK_END,
  VOICE_KEY_MANAGED_BLOCK_START,
} from './hyprland-hotkeys'
import { getWlCopyTextArgs, getWtypeClipboardShortcutArgs } from './hyprland-integration'

const hotkeys: HotkeyConfig = {
  pttKey: 'Control+Shift+Space',
  toggleSettings: 'Control+Shift+,',
  translateKey: 'Control+Shift+T',
}

describe('Hyprland accelerator conversion', () => {
  it('maps Electron accelerators to Hyprland key syntax', () => {
    expect(acceleratorToHyprland('Control+Shift+Space')).toEqual({
      binding: 'CTRL + SHIFT + SPACE',
      releaseBinding: 'SPACE',
    })
    expect(acceleratorToHyprland('CommandOrControl+,')?.binding).toBe('CTRL + comma')
    expect(acceleratorToHyprland('Alt')).toEqual({
      binding: 'ALT_L',
      releaseBinding: 'ALT_L',
    })
  })

  it('rejects unsupported tokens instead of emitting Lua', () => {
    expect(acceleratorToHyprland('Control+$(touch /tmp/nope)')).toBeNull()
  })
})

describe('managed Hyprland config block', () => {
  it('uses a modifier-independent release binding for push-to-talk', () => {
    const block = buildHyprlandManagedBlock(hotkeys, true)

    expect(block).toContain('hl.dsp.event("voice-key:ptt-start")')
    expect(block).toContain('hl.bind("SPACE", hl.dsp.event("voice-key:ptt-stop")')
    expect(block).toContain('release = true')
    expect(block).toContain('ignore_mods = true')
    expect(block).toContain('hl.dsp.event("voice-key:translate")')
    expect(block).toContain('name = "voice-key-overlay"')
  })

  it('omits the translation binding when translation is disabled', () => {
    expect(buildHyprlandManagedBlock(hotkeys, false)).not.toContain('voice-key:translate')
  })

  it('replaces only the marked block and preserves user bindings', () => {
    const oldBlock = `${VOICE_KEY_MANAGED_BLOCK_START}\nold\n${VOICE_KEY_MANAGED_BLOCK_END}\n`
    const source = `o.bind("SUPER + B", "Browser", "chromium")\n\n${oldBlock}`
    const nextBlock = buildHyprlandManagedBlock(hotkeys, true)
    const updated = upsertHyprlandManagedBlock(source, nextBlock)

    expect(updated).toContain('o.bind("SUPER + B", "Browser", "chromium")')
    expect(updated).not.toContain('\nold\n')
    expect(findHyprlandManagedBlock(updated)).toBe(nextBlock)
    expect(removeHyprlandManagedBlock(updated)).toBe('o.bind("SUPER + B", "Browser", "chromium")\n')
  })

  it('refuses to overwrite an incomplete or duplicated managed block', () => {
    const incomplete = `${VOICE_KEY_MANAGED_BLOCK_START}\nold\n`
    expect(hasMalformedHyprlandManagedBlock(incomplete)).toBe(true)
    expect(() =>
      upsertHyprlandManagedBlock(incomplete, buildHyprlandManagedBlock(hotkeys, true)),
    ).toThrow('incomplete or duplicated')
  })
})

describe('Hyprland clipboard shortcuts', () => {
  it('uses standard application copy and paste chords', () => {
    expect(getWtypeClipboardShortcutArgs('copy', false)).toEqual([
      '-M',
      'ctrl',
      '-k',
      'c',
      '-m',
      'ctrl',
    ])
    expect(getWtypeClipboardShortcutArgs('paste', false)).toEqual([
      '-M',
      'ctrl',
      '-k',
      'v',
      '-m',
      'ctrl',
    ])
  })

  it('uses terminal-safe copy and paste chords', () => {
    expect(getWtypeClipboardShortcutArgs('copy', true)).toEqual([
      '-M',
      'ctrl',
      '-k',
      'Insert',
      '-m',
      'ctrl',
    ])
    expect(getWtypeClipboardShortcutArgs('paste', true)).toEqual([
      '-M',
      'shift',
      '-k',
      'Insert',
      '-m',
      'shift',
    ])
  })

  it('offers sensitive UTF-8 text only while the Wayland paste is in progress', () => {
    expect(getWlCopyTextArgs()).toEqual([
      '--foreground',
      '--sensitive',
      '--type',
      'text/plain;charset=utf-8',
    ])
  })
})
