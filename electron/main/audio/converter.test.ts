import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../window/overlay', () => ({ updateOverlay: vi.fn(), hideOverlay: vi.fn() }))
vi.mock('../i18n', () => ({ t: (key: string) => key }))
import { convertToWAV } from './converter'
const dirs: string[] = []
function recording() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'voicekey-convert-test-'))
  dirs.push(directory)
  const input = path.join(directory, 'input.wav')
  const output = path.join(directory, 'output.wav')
  const samples = 16000
  const wav = Buffer.alloc(44 + samples * 2)
  wav.write('RIFF')
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(16000, 24)
  wav.writeUInt32LE(32000, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++)
    wav.writeInt16LE(Math.round(Math.sin((i * Math.PI) / 20) * 20000), 44 + i * 2)
  fs.writeFileSync(input, wav)
  return { input, output }
}
afterEach(() => {
  for (const directory of dirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})
describe('classic audio conversion', () => {
  it('protects peaks when low-volume gain is enabled', async () => {
    const { input, output } = recording()
    await convertToWAV(input, output, { gainDb: 10 })
    const wav = fs.readFileSync(output)
    const offset = wav.indexOf('data') + 8
    let peak = 0
    for (let index = offset; index + 1 < wav.length; index += 2)
      peak = Math.max(peak, Math.abs(wav.readInt16LE(index)))
    expect(peak).toBeLessThan(32767)
    expect(peak).toBeGreaterThan(20000)
  })
  it('cancels even before FFmpeg has spawned', async () => {
    const { input, output } = recording()
    const controller = new AbortController()
    const converted = convertToWAV(input, output, { signal: controller.signal })
    controller.abort()
    await expect(converted).rejects.toThrow()
  })
})
