import { useEffect, useRef } from 'react'
import { LOW_VOLUME_GAIN_DB, RECORDING } from '@electron/shared/constants'
import type { ASRMode, RecordingStartPayload } from '@electron/shared/types'

type StopMeta = {
  chunkIndex: number
  isFinal: boolean
  rotateAfterStop: boolean
}

export function AudioRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const analyserRef = useRef<AnalyserNode | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionMaxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopMetaRef = useRef<StopMeta | null>(null)
  const currentSessionIdRef = useRef<string | null>(null)
  const currentChunkIndexRef = useRef(0)
  const currentMimeTypeRef = useRef('audio/webm')
  const isRecordingRef = useRef(false)
  const isSessionEndingRef = useRef(false)
  const currentAsrModeRef = useRef<ASRMode>('classic')
  const streamingSequenceRef = useRef(0)
  const streamingFlushResolveRef = useRef<(() => void) | null>(null)
  const streamingStopPromiseRef = useRef<Promise<void> | null>(null)

  const summarizeMediaError = (error: unknown) => {
    if (error instanceof DOMException) {
      return `${error.name}: ${error.message}`
    }
    if (error instanceof Error) {
      return error.message
    }
    return String(error)
  }

  const getAudioStream = async (deviceId?: string) => {
    const normalizedDeviceId = typeof deviceId === 'string' ? deviceId.trim() : ''
    if (!normalizedDeviceId) {
      return await navigator.mediaDevices.getUserMedia({ audio: true })
    }

    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: normalizedDeviceId },
        },
      })
    } catch (error) {
      console.warn(
        `[Renderer] Selected microphone unavailable, falling back to system default: ${summarizeMediaError(error)}`,
      )
      return await navigator.mediaDevices.getUserMedia({ audio: true })
    }
  }

  const hasLiveAudioTrack = () => {
    return streamRef.current?.getAudioTracks().some((track) => track.readyState === 'live') ?? false
  }

  const clearChunkTimer = () => {
    if (chunkTimerRef.current) {
      clearTimeout(chunkTimerRef.current)
      chunkTimerRef.current = null
    }
  }

  const clearSessionMaxTimer = () => {
    if (sessionMaxTimerRef.current) {
      clearTimeout(sessionMaxTimerRef.current)
      sessionMaxTimerRef.current = null
    }
  }

  const releaseResources = () => {
    clearChunkTimer()
    clearSessionMaxTimer()

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close()
      audioContextRef.current = null
    }

    workletNodeRef.current?.disconnect()
    workletNodeRef.current = null

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.onended = null
        track.stop()
      })
      streamRef.current = null
    }

    analyserRef.current = null
    mediaRecorderRef.current = null
    chunksRef.current = []
    stopMetaRef.current = null
    currentSessionIdRef.current = null
    currentChunkIndexRef.current = 0
    currentMimeTypeRef.current = 'audio/webm'
    isRecordingRef.current = false
    isSessionEndingRef.current = false
    currentAsrModeRef.current = 'classic'
    streamingSequenceRef.current = 0
    streamingFlushResolveRef.current = null
    streamingStopPromiseRef.current = null
  }

  const sendAudioLevel = () => {
    const analyser = analyserRef.current
    if (!analyser) return

    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(dataArray)
    const sum = dataArray.reduce((a, b) => a + b, 0)
    const average = sum / dataArray.length
    const normalized = Math.min(average / 128, 1)
    window.electronAPI.sendAudioLevel(normalized)
    animationFrameRef.current = requestAnimationFrame(sendAudioLevel)
  }

  // Empty chunks are still sent: main tracks chunks by index and waits for the
  // final marker, so dropping one would leave the session (and HUD) stuck.
  const sendEmptyChunkMarker = (sessionId: string, chunkIndex: number, isFinal: boolean) => {
    window.electronAPI.sendAudioChunk({
      sessionId,
      chunkIndex,
      isFinal,
      mimeType: currentMimeTypeRef.current,
      buffer: new ArrayBuffer(0),
    })
  }

  const handleRecorderStop = async () => {
    const sessionId = currentSessionIdRef.current
    const mimeType = currentMimeTypeRef.current
    const audioStreamEnded = Boolean(streamRef.current && !hasLiveAudioTrack())
    const stopMeta = stopMetaRef.current ?? {
      chunkIndex: currentChunkIndexRef.current,
      isFinal: isSessionEndingRef.current || audioStreamEnded,
      rotateAfterStop: !isSessionEndingRef.current && !audioStreamEnded,
    }
    stopMetaRef.current = null

    if (audioStreamEnded) {
      stopMeta.isFinal = true
      stopMeta.rotateAfterStop = false
      isSessionEndingRef.current = true
      if (sessionId) {
        await window.electronAPI.stopSession()
      }
    }

    const blob = new Blob(chunksRef.current, { type: mimeType })
    chunksRef.current = []

    if (sessionId) {
      if (blob.size === 0) {
        console.warn('[Renderer] Sending empty audio chunk marker')
      }
      const buffer = await blob.arrayBuffer()
      window.electronAPI.sendAudioChunk({
        sessionId,
        chunkIndex: stopMeta.chunkIndex,
        isFinal: stopMeta.isFinal,
        mimeType,
        buffer,
      })
    } else {
      console.warn('[Renderer] Skipping audio chunk without active session')
    }

    if (stopMeta.isFinal || isSessionEndingRef.current) {
      releaseResources()
      console.log('[Renderer] Final chunk sent, resources released')
      return
    }

    currentChunkIndexRef.current = stopMeta.chunkIndex + 1
    startChunkRecorder()
  }

  const requestRecorderStop = (nextStopMeta: StopMeta) => {
    if (nextStopMeta.isFinal) {
      isSessionEndingRef.current = true
    }

    const existingStopMeta = stopMetaRef.current
    if (existingStopMeta) {
      if (nextStopMeta.isFinal) {
        existingStopMeta.isFinal = true
        existingStopMeta.rotateAfterStop = false
      }
      return
    }

    const recorder = mediaRecorderRef.current
    if (!recorder) {
      if (nextStopMeta.isFinal) {
        const sessionId = currentSessionIdRef.current
        if (sessionId) {
          sendEmptyChunkMarker(sessionId, nextStopMeta.chunkIndex, true)
        }
        releaseResources()
      }
      return
    }

    clearChunkTimer()
    stopMetaRef.current = {
      chunkIndex: nextStopMeta.chunkIndex,
      isFinal: nextStopMeta.isFinal,
      rotateAfterStop: nextStopMeta.rotateAfterStop && !nextStopMeta.isFinal,
    }

    if (recorder.state !== 'inactive') {
      recorder.stop()
    }
  }

  const scheduleChunkRotation = () => {
    clearChunkTimer()
    chunkTimerRef.current = setTimeout(() => {
      if (!isSessionEndingRef.current) {
        requestRecorderStop({
          chunkIndex: currentChunkIndexRef.current,
          isFinal: false,
          rotateAfterStop: true,
        })
      }
    }, RECORDING.CHUNK_DURATION_SECONDS * 1000)
  }

  const startChunkRecorder = () => {
    const stream = streamRef.current
    if (!stream) return
    if (!hasLiveAudioTrack()) {
      const sessionId = currentSessionIdRef.current
      const chunkIndex = currentChunkIndexRef.current
      void (async () => {
        await window.electronAPI.stopSession()
        if (sessionId) {
          sendEmptyChunkMarker(sessionId, chunkIndex, true)
        }
        releaseResources()
      })()
      return
    }

    const mediaRecorder = new MediaRecorder(stream, { mimeType: currentMimeTypeRef.current })
    mediaRecorderRef.current = mediaRecorder
    chunksRef.current = []

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data)
      }
    }

    mediaRecorder.onstop = () => {
      void handleRecorderStop()
    }

    mediaRecorder.onerror = (event) => {
      console.error('[Renderer] MediaRecorder error:', event)
      window.electronAPI.sendError(`MediaRecorder error: ${event}`)
      releaseResources()
    }

    mediaRecorder.start()
    scheduleChunkRotation()
    console.log(`[Renderer] Recording chunk ${currentChunkIndexRef.current} started`)
  }

  const finishStreamingCapture = async () => {
    if (streamingStopPromiseRef.current) return streamingStopPromiseRef.current

    const finish = async () => {
      clearSessionMaxTimer()
      const sessionId = currentSessionIdRef.current
      const worklet = workletNodeRef.current

      if (worklet) {
        await new Promise<void>((resolve) => {
          let completed = false
          const complete = () => {
            if (completed) return
            completed = true
            streamingFlushResolveRef.current = null
            resolve()
          }
          streamingFlushResolveRef.current = complete
          worklet.port.postMessage({ type: 'flush' })
          setTimeout(complete, 1000)
        })
      }

      isSessionEndingRef.current = true
      if (sessionId) {
        window.electronAPI.sendStreamingAudioEnd({
          sessionId,
          sequence: streamingSequenceRef.current,
        })
      }
      releaseResources()
      console.log('[Renderer] Streaming audio final marker sent, resources released')
    }

    streamingStopPromiseRef.current = finish()
    return streamingStopPromiseRef.current
  }

  const startStreamingCapture = async (
    audioContext: AudioContext,
    source: MediaStreamAudioSourceNode,
    lowVolumeMode: boolean,
  ) => {
    const workletUrl = new URL('./voice-key-pcm-worklet.js', window.location.href).toString()
    await audioContext.audioWorklet.addModule(workletUrl)
    const worklet = new AudioWorkletNode(audioContext, 'voice-key-pcm-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    })
    workletNodeRef.current = worklet

    worklet.port.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data
      if (!data || typeof data !== 'object') return
      const message = data as Record<string, unknown>

      if (message.type === 'flushed') {
        streamingFlushResolveRef.current?.()
        return
      }

      if (
        message.type !== 'audio' ||
        !(message.buffer instanceof ArrayBuffer) ||
        typeof message.sampleRate !== 'number'
      ) {
        return
      }

      const sessionId = currentSessionIdRef.current
      if (!sessionId || isSessionEndingRef.current) return
      window.electronAPI.sendStreamingAudioFrame({
        sessionId,
        sequence: streamingSequenceRef.current++,
        sampleRate: message.sampleRate,
        buffer: message.buffer,
      })
    }

    const captureInput: AudioNode = lowVolumeMode
      ? (() => {
          const gain = audioContext.createGain()
          gain.gain.value = 10 ** (LOW_VOLUME_GAIN_DB / 20)
          source.connect(gain)
          return gain
        })()
      : source
    captureInput.connect(worklet)

    // An AudioWorklet needs a live output graph to be processed. Route it to a
    // muted gain node so microphone audio is never played back to the user.
    const mute = audioContext.createGain()
    mute.gain.value = 0
    worklet.connect(mute)
    mute.connect(audioContext.destination)
    await audioContext.resume()
  }

  const startRecordingSession = async (payload: RecordingStartPayload) => {
    if (isRecordingRef.current) {
      console.warn('[Renderer] Already recording, ignoring start request')
      return
    }

    try {
      releaseResources()

      currentSessionIdRef.current = payload.sessionId
      currentAsrModeRef.current = payload.asrMode
      currentChunkIndexRef.current = 0
      isRecordingRef.current = true
      isSessionEndingRef.current = false

      const stream = await getAudioStream(payload.microphoneDeviceId)

      // SESSION_STOP may have arrived while getUserMedia was pending (the final
      // marker was already sent by requestRecorderStop); drop the stream instead
      // of recording into a dead session and leaving the mic on.
      if (currentSessionIdRef.current !== payload.sessionId || isSessionEndingRef.current) {
        console.warn('[Renderer] Session ended while acquiring microphone, discarding stream')
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (isSessionEndingRef.current || currentSessionIdRef.current !== payload.sessionId)
            return
          console.warn('[Renderer] Microphone stream ended during recording')
          void window.electronAPI.stopSession()
        }
      })

      streamRef.current = stream

      const audioContext = new AudioContext()
      audioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.3
      source.connect(analyser)
      analyserRef.current = analyser

      sendAudioLevel()

      let mimeType = 'audio/wav'
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm'
      }
      currentMimeTypeRef.current = mimeType

      if (payload.asrMode === 'streaming') {
        await startStreamingCapture(audioContext, source, payload.lowVolumeMode ?? true)
      } else {
        startChunkRecorder()
      }

      sessionMaxTimerRef.current = setTimeout(() => {
        if (!isSessionEndingRef.current && currentSessionIdRef.current === payload.sessionId) {
          void window.electronAPI.stopSession()
        }
      }, RECORDING.SESSION_MAX_DURATION_SECONDS * 1000)
    } catch (error) {
      console.error('[Renderer] Failed to start recording:', error)
      // Only report/cleanup if this session is still current; a stale failure
      // must not tear down a newer session's resources.
      if (currentSessionIdRef.current === payload.sessionId) {
        window.electronAPI.sendError(`Failed to access microphone: ${error}`)
        releaseResources()
      }
    }
  }

  const stopRecordingSession = () => {
    console.log('[Renderer] onStopRecording triggered')
    if (currentAsrModeRef.current === 'streaming') {
      void finishStreamingCapture()
      return
    }
    requestRecorderStop({
      chunkIndex: currentChunkIndexRef.current,
      isFinal: true,
      rotateAfterStop: false,
    })
  }

  const startRecordingSessionRef = useRef(startRecordingSession)
  const stopRecordingSessionRef = useRef(stopRecordingSession)
  const releaseResourcesRef = useRef(releaseResources)

  useEffect(() => {
    startRecordingSessionRef.current = startRecordingSession
    stopRecordingSessionRef.current = stopRecordingSession
    releaseResourcesRef.current = releaseResources
  })

  useEffect(() => {
    const removeStartRecordingListener = window.electronAPI.onStartRecording((payload) => {
      void startRecordingSessionRef.current(payload)
    })

    const removeStopRecordingListener = window.electronAPI.onStopRecording(() => {
      stopRecordingSessionRef.current()
    })

    return () => {
      removeStartRecordingListener?.()
      removeStopRecordingListener?.()
      releaseResourcesRef.current()
      console.log('[Renderer] Component unmounted, resources released')
    }
  }, [])

  return null
}
