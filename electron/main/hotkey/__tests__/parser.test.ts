import { describe, expect, it, vi } from 'vitest'

const uiohookKeyMock = vi.hoisted(() => ({
  Meta: 1,
  Ctrl: 2,
  Alt: 3,
  Shift: 4,
  Space: 5,
}))

vi.mock('uiohook-napi', () => ({ UiohookKey: uiohookKeyMock }))

import { UiohookKey } from 'uiohook-napi'
import { parseAccelerator } from '../parser'

describe('parseAccelerator (modifier aliases)', () => {
  it('maps modifier aliases when used as modifiers', () => {
    const cases = [
      { accelerator: 'Command+Space', modifiers: ['meta'] },
      { accelerator: 'Cmd+Space', modifiers: ['meta'] },
      { accelerator: 'Meta+Space', modifiers: ['meta'] },
      { accelerator: 'Control+Space', modifiers: ['ctrl'] },
      { accelerator: 'Ctrl+Space', modifiers: ['ctrl'] },
      { accelerator: 'Alt+Space', modifiers: ['alt'] },
      { accelerator: 'Option+Space', modifiers: ['alt'] },
      { accelerator: 'Shift+Space', modifiers: ['shift'] },
    ]

    cases.forEach(({ accelerator, modifiers }) => {
      const result = parseAccelerator(accelerator)
      expect(result).toEqual({ modifiers, key: UiohookKey.Space })
    })
  })

  it('maps modifier aliases when used as main key', () => {
    const cases = [
      { accelerator: 'Command', key: UiohookKey.Meta },
      { accelerator: 'Cmd', key: UiohookKey.Meta },
      { accelerator: 'Meta', key: UiohookKey.Meta },
      { accelerator: 'Control', key: UiohookKey.Ctrl },
      { accelerator: 'Ctrl', key: UiohookKey.Ctrl },
      { accelerator: 'Alt', key: UiohookKey.Alt },
      { accelerator: 'Option', key: UiohookKey.Alt },
      { accelerator: 'Shift', key: UiohookKey.Shift },
    ]

    cases.forEach(({ accelerator, key }) => {
      const result = parseAccelerator(accelerator)
      expect(result).toEqual({ modifiers: [], key })
    })
  })
})
