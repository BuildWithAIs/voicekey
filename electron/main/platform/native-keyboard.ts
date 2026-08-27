import type { Key } from '@nut-tree-fork/nut-js'

type NutKeyboardModule = typeof import('@nut-tree-fork/nut-js')

let modulePromise: Promise<NutKeyboardModule> | null = null

async function loadKeyboard(): Promise<NutKeyboardModule> {
  modulePromise ??= import('@nut-tree-fork/nut-js').then((module) => {
    module.keyboard.config.autoDelayMs = 0
    return module
  })
  return await modulePromise
}

export async function typeWithNativeKeyboard(text: string): Promise<void> {
  const { keyboard } = await loadKeyboard()
  await keyboard.type(text)
}

export async function pressNativeKey(key: Key): Promise<void> {
  const { keyboard } = await loadKeyboard()
  await keyboard.pressKey(key)
  await keyboard.releaseKey(key)
}

export async function sendNativeClipboardShortcut(action: 'copy' | 'paste'): Promise<void> {
  const { keyboard, Key: NativeKey } = await loadKeyboard()
  const modifier = process.platform === 'darwin' ? NativeKey.LeftCmd : NativeKey.LeftControl
  const key = action === 'copy' ? NativeKey.C : NativeKey.V
  await keyboard.pressKey(modifier, key)
  await keyboard.releaseKey(modifier, key)
}

export async function probeNativeKeyboard(): Promise<void> {
  const { keyboard } = await loadKeyboard()
  await keyboard.type('')
}
