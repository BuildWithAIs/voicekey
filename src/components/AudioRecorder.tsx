import { useEffect } from 'react'
import { LOW_VOLUME_GAIN_DB, RECORDING } from '@electron/shared/constants'
import type { RecordingStartPayload, RecordingStopPayload } from '@electron/shared/types'

// A capture owns every async callback and resource. Old callbacks cannot touch a
// subsequent recording, including permission prompts and AudioWorklet loading.
export function AudioRecorder() {
  useEffect(() => {
    type Capture = {
      payload: RecordingStartPayload
      ending: boolean
      cancelled: boolean
      stream?: MediaStream
      context?: AudioContext
      recorder?: MediaRecorder
      worklet?: AudioWorkletNode
      timer?: ReturnType<typeof setTimeout>
      levelTimer?: ReturnType<typeof setInterval>
      flush?: () => void
      sequence: number
      chunks: Blob[]
      bytes: number
    }
    let active: Capture | null = null
    const isCurrent = (capture: Capture) => active === capture && !capture.cancelled
    const release = (capture: Capture) => {
      clearTimeout(capture.timer)
      clearInterval(capture.levelTimer)
      capture.worklet?.disconnect()
      capture.stream?.getTracks().forEach((track) => {
        track.onended = null
        track.stop()
      })
      if (capture.recorder?.state === 'recording') {
        capture.recorder.onstop = null
        capture.recorder.stop()
      }
      void capture.context?.close().catch(() => undefined)
      capture.chunks = []
      if (active === capture) active = null
      window.electronAPI.recordingStopped(capture.payload.sessionId)
    }
    const fail = (capture: Capture, error: unknown) => {
      if (!isCurrent(capture)) return
      window.electronAPI.sendError(
        error instanceof Error ? error.message : String(error),
        capture.payload.sessionId,
      )
      capture.cancelled = true
      capture.flush?.()
      release(capture)
    }
    const stop = async ({ sessionId, cancel }: RecordingStopPayload) => {
      const capture = active
      if (!capture || capture.payload.sessionId !== sessionId) {
        window.electronAPI.recordingStopped(sessionId)
        return
      }
      if (cancel) {
        capture.cancelled = true
        capture.flush?.()
        release(capture)
        return
      }
      if (capture.ending) return
      capture.ending = true
      clearTimeout(capture.timer)
      try {
        if (capture.payload.asrMode === 'classic') {
          if (capture.recorder) {
            capture.recorder.stop()
          } else {
            release(capture)
            window.electronAPI.sendAudioChunk({
              sessionId,
              chunkIndex: 0,
              isFinal: true,
              mimeType: 'audio/webm',
              buffer: new ArrayBuffer(0),
            })
          }
          return
        }
        if (capture.worklet) {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Audio capture flush timed out')), 2000)
            capture.flush = () => {
              clearTimeout(timer)
              resolve()
            }
            capture.worklet!.port.postMessage({ type: 'flush' })
          })
        }
        if (!isCurrent(capture)) return
        const sequence = capture.sequence
        release(capture)
        window.electronAPI.sendStreamingAudioEnd({ sessionId, sequence })
      } catch (error) {
        fail(capture, error)
      }
    }
    const start = async (payload: RecordingStartPayload) => {
      if (active) return
      const capture: Capture = {
        payload,
        ending: false,
        cancelled: false,
        sequence: 0,
        chunks: [],
        bytes: 0,
      }
      active = capture
      try {
        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: payload.microphoneDeviceId
              ? { deviceId: { exact: payload.microphoneDeviceId } }
              : true,
          })
        } catch (error) {
          if (
            !payload.microphoneDeviceId ||
            !(error instanceof DOMException) ||
            !['NotFoundError', 'OverconstrainedError'].includes(error.name)
          )
            throw error
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          if (isCurrent(capture))
            window.electronAPI.microphoneFallback(
              payload.sessionId,
              stream.getAudioTracks()[0]?.label || '',
            )
        }
        if (!isCurrent(capture) || capture.ending) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        capture.stream = stream
        stream.getAudioTracks().forEach((track) => {
          track.onended = () => {
            if (isCurrent(capture) && !capture.ending) void window.electronAPI.stopSession()
          }
        })
        const context = new AudioContext()
        capture.context = context
        const source = context.createMediaStreamSource(stream)
        const analyser = context.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)
        const levels = new Float32Array(analyser.fftSize)
        capture.levelTimer = setInterval(() => {
          analyser.getFloatTimeDomainData(levels)
          const rms = Math.sqrt(
            levels.reduce((sum, sample) => sum + sample * sample, 0) / levels.length,
          )
          window.electronAPI.sendAudioLevel(Math.min(1, rms * 5))
        }, 50)
        if (payload.asrMode === 'classic') {
          const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm'
          const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 })
          capture.recorder = recorder
          recorder.ondataavailable = ({ data }) => {
            if (!isCurrent(capture) || data.size === 0) return
            capture.bytes += data.size
            if (capture.bytes > RECORDING.MAX_AUDIO_BYTES) {
              fail(capture, new Error('Recording exceeds the audio size limit'))
              return
            }
            capture.chunks.push(data)
          }
          recorder.onerror = () => fail(capture, new Error('Microphone recording failed'))
          recorder.onstop = () => {
            void (async () => {
              if (!isCurrent(capture)) return
              const blob = new Blob(capture.chunks, { type: mimeType })
              const buffer = await blob.arrayBuffer()
              if (!isCurrent(capture)) return
              release(capture)
              window.electronAPI.sendAudioChunk({
                sessionId: payload.sessionId,
                chunkIndex: 0,
                isFinal: true,
                mimeType,
                buffer,
              })
            })().catch((error) => fail(capture, error))
          }
          // Timeslices only bound Blob delivery; the recorder never stops or
          // restarts mid-session, and ASR receives exactly one complete file.
          recorder.start(1000)
        } else {
          await context.audioWorklet.addModule(
            new URL('./voice-key-pcm-worklet.js', window.location.href).toString(),
          )
          if (!isCurrent(capture) || capture.ending) return
          const worklet = new AudioWorkletNode(context, 'voice-key-pcm-capture', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [1],
            processorOptions: { gainDb: payload.lowVolumeMode ? LOW_VOLUME_GAIN_DB : 0 },
          })
          capture.worklet = worklet
          worklet.port.onmessage = ({ data }: MessageEvent<unknown>) => {
            if (!isCurrent(capture) || !data || typeof data !== 'object') return
            const message = data as Record<string, unknown>
            if (message.type === 'flushed') {
              capture.flush?.()
              return
            }
            if (
              message.type === 'audio' &&
              message.buffer instanceof ArrayBuffer &&
              typeof message.sampleRate === 'number'
            ) {
              window.electronAPI.sendStreamingAudioFrame({
                sessionId: payload.sessionId,
                sequence: capture.sequence++,
                sampleRate: message.sampleRate,
                buffer: message.buffer,
              })
            }
          }
          source.connect(worklet)
          const mute = context.createGain()
          mute.gain.value = 0
          worklet.connect(mute)
          mute.connect(context.destination)
          await context.resume()
          if (!isCurrent(capture) || capture.ending) return
        }
        capture.timer = setTimeout(() => {
          if (isCurrent(capture) && !capture.ending) void window.electronAPI.stopSession()
        }, RECORDING.SESSION_MAX_DURATION_SECONDS * 1000)
      } catch (error) {
        fail(capture, error)
      }
    }
    const removeStart = window.electronAPI.onStartRecording((payload) => {
      void start(payload)
    })
    const removeStop = window.electronAPI.onStopRecording((payload) => {
      void stop(payload)
    })
    return () => {
      removeStart()
      removeStop()
      if (active) {
        active.cancelled = true
        active.flush?.()
        release(active)
      }
    }
  }, [])
  return null
}
