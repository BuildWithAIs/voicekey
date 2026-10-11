import fs from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

describe('capture worklet gain and flush', () => {
  it('bounds boosted peaks and never sends samples captured after flush', () => {
    const messages: { type: string; buffer?: ArrayBuffer }[] = []
    let Processor: new (options: unknown) => {
      process(inputs: Float32Array[][]): boolean
      port: { onmessage: (event: unknown) => void }
    }
    const context = vm.createContext({
      sampleRate: 16000,
      Float32Array,
      AudioWorkletProcessor: class {
        port = { postMessage: (message: { type: string }) => messages.push(message) }
      },
      registerProcessor: (_name: string, implementation: typeof Processor) => {
        Processor = implementation
      },
    })
    vm.runInContext(fs.readFileSync('public/voice-key-pcm-worklet.js', 'utf8'), context)
    const capture = new Processor!({ processorOptions: { gainDb: 10 } })
    capture.process([[new Float32Array(1600).fill(0.5)]])
    const samples = new Float32Array(messages[0].buffer!)
    expect(Math.max(...samples)).toBeLessThanOrEqual(0.951)
    capture.port.onmessage({ data: { type: 'flush' } })
    const count = messages.length
    capture.process([[new Float32Array(1600).fill(0.5)]])
    expect(messages).toHaveLength(count)
    expect(messages[count - 1].type).toBe('flushed')
  })
})
