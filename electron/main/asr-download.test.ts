import fs from 'node:fs'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ get: vi.fn() }))
beforeEach(() => {
  vi.spyOn(https, 'get').mockImplementation(mocks.get)
})
import { downloadASRAsset } from './asr-download'
const dirs: string[] = []
const bytes = Buffer.from('a verified model')
const file = {
  name: 'model.onnx',
  sizeBytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  urls: ['https://models.example/model'],
}
const target = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicekey-download-test-'))
  dirs.push(dir)
  return path.join(dir, file.name)
}
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
  vi.clearAllMocks()
})
describe('recoverable model files', () => {
  it('reuses a verified completed file without a network request', async () => {
    const output = target()
    fs.writeFileSync(output, bytes)
    expect(await downloadASRAsset(file, output, new AbortController().signal, vi.fn())).toBe(
      bytes.length,
    )
    expect(mocks.get).not.toHaveBeenCalled()
  })
  it('repairs a missing manifest using a verified installed asset', async () => {
    const output = target()
    const installed = path.join(path.dirname(output), 'installed.onnx')
    fs.writeFileSync(installed, bytes)
    await downloadASRAsset(file, output, new AbortController().signal, vi.fn(), vi.fn(), installed)
    expect(fs.readFileSync(output)).toEqual(bytes)
    expect(mocks.get).not.toHaveBeenCalled()
  })
  it('downloads a corrupt cache again and installs only verified bytes', async () => {
    const output = target()
    fs.writeFileSync(output, Buffer.alloc(bytes.length))
    mocks.get.mockImplementation((_url, _options, callback) => {
      const request = new EventEmitter()
      queueMicrotask(() => {
        const response = Readable.from([bytes])
        Object.assign(response, { statusCode: 200, headers: {} })
        callback(response)
      })
      return request
    })
    await downloadASRAsset(file, output, new AbortController().signal, vi.fn())
    expect(fs.readFileSync(output)).toEqual(bytes)
    expect(fs.existsSync(`${output}.part`)).toBe(false)
  })
  it('aborts a stalled transfer, preserving completed sibling assets', async () => {
    const output = target()
    const sibling = path.join(path.dirname(output), 'tokens.txt')
    fs.writeFileSync(sibling, 'tokens')
    const controller = new AbortController()
    mocks.get.mockImplementation((_url, _options, callback) => {
      const request = new EventEmitter()
      queueMicrotask(() => {
        const response = new Readable({ read() {} })
        Object.assign(response, { statusCode: 200, headers: {} })
        callback(response)
        setTimeout(() => controller.abort(), 10)
      })
      return request
    })
    await expect(downloadASRAsset(file, output, controller.signal, vi.fn())).rejects.toThrow()
    expect(fs.readFileSync(sibling, 'utf8')).toBe('tokens')
    expect(fs.existsSync(output)).toBe(false)
    expect(fs.existsSync(`${output}.part`)).toBe(false)
  })
})
