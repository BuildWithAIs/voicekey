/* global AudioWorkletProcessor, sampleRate, registerProcessor */

class VoiceKeyPcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.frameSize = Math.max(128, Math.round(sampleRate * 0.1))
    this.frame = new Float32Array(this.frameSize)
    this.offset = 0
    this.port.onmessage = (event) => {
      if (event.data?.type !== 'flush') return
      this.flush()
      this.port.postMessage({ type: 'flushed' })
    }
  }

  emitFrame(length = this.offset) {
    if (length <= 0) return
    const output = length === this.frame.length ? this.frame : this.frame.slice(0, length)
    this.port.postMessage({ type: 'audio', sampleRate, buffer: output.buffer }, [output.buffer])
    this.frame = new Float32Array(this.frameSize)
    this.offset = 0
  }

  flush() {
    this.emitFrame()
  }

  process(inputs) {
    const channel = inputs[0]?.[0]
    if (!channel || channel.length === 0) return true

    let sourceOffset = 0
    while (sourceOffset < channel.length) {
      const copyLength = Math.min(channel.length - sourceOffset, this.frame.length - this.offset)
      this.frame.set(channel.subarray(sourceOffset, sourceOffset + copyLength), this.offset)
      this.offset += copyLength
      sourceOffset += copyLength
      if (this.offset === this.frame.length) this.emitFrame()
    }

    return true
  }
}

registerProcessor('voice-key-pcm-capture', VoiceKeyPcmCaptureProcessor)
