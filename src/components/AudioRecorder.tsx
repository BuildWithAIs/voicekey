import { useEffect, useRef } from 'react'

export function AudioRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const isRecordingRef = useRef(false) // 录音状态守卫

  // 统一的资源释放函数
  const releaseResources = () => {
    // 新增：防止重复调用
    if (!isRecordingRef.current && !streamRef.current && !audioContextRef.current) {
      return // 资源已释放，跳过
    }
    // 立即标记为非录音状态，防止并发调用
    isRecordingRef.current = false
    // 停止动画帧
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    // 关闭 AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    // 释放麦克风流
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        console.log(`[Renderer] Releasing track: ${track.kind}, readyState: ${track.readyState}`)
        track.stop()
        console.log(`[Renderer] Track released, new readyState: ${track.readyState}`)
      })
      streamRef.current = null
    }

    analyserRef.current = null
    mediaRecorderRef.current = null
    chunksRef.current = [] // 新增：防止内存泄漏和数据污染
    isRecordingRef.current = false
  }

  useEffect(() => {
    window.electronAPI.onStartRecording(async () => {
      // 录音状态守卫：防止重复录音
      if (isRecordingRef.current) {
        console.warn('[Renderer] Already recording, ignoring start request')
        return
      }

      try {
        // 确保之前的录音已清理
        releaseResources()

        isRecordingRef.current = true

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = stream // 保存引用

        const audioContext = new AudioContext()
        audioContextRef.current = audioContext // 保存引用

        const source = audioContext.createMediaStreamSource(stream)
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.3
        source.connect(analyser)
        analyserRef.current = analyser

        const dataArray = new Uint8Array(analyser.frequencyBinCount)

        const sendAudioLevel = () => {
          if (!analyserRef.current) return
          analyserRef.current.getByteFrequencyData(dataArray)
          const sum = dataArray.reduce((a, b) => a + b, 0)
          const average = sum / dataArray.length
          const normalized = Math.min(average / 128, 1)
          window.electronAPI.sendAudioLevel(normalized)
          animationFrameRef.current = requestAnimationFrame(sendAudioLevel)
        }
        sendAudioLevel()

        let mimeType = 'audio/wav'
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/webm'
        }

        const mediaRecorder = new MediaRecorder(stream, { mimeType })
        mediaRecorderRef.current = mediaRecorder
        chunksRef.current = []

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data)
          }
        }

        mediaRecorder.onstop = async () => {
          // 处理音频数据
          const blob = new Blob(chunksRef.current, { type: mimeType })
          const buffer = await blob.arrayBuffer()
          window.electronAPI.sendAudioData(buffer)

          // 释放所有资源
          releaseResources()
          console.log('[Renderer] Recording stopped, resources released')
        }

        mediaRecorder.onerror = (e) => {
          console.error('[Renderer] MediaRecorder error:', e)
          window.electronAPI.sendError(`MediaRecorder error: ${e}`)
          // 错误时也释放资源
          releaseResources()
        }

        console.log('[Renderer] Recording started')
        mediaRecorder.start()
      } catch (err) {
        console.error('[Renderer] Failed to start recording:', err)
        window.electronAPI.sendError(`Failed to access microphone: ${err}`)
        // 启动失败也要释放
        releaseResources()
      }
    })

    window.electronAPI.onStopRecording(() => {
      console.log('[Renderer] onStopRecording triggered')
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop()
      } else {
        // 如果没有活跃的录音，也尝试释放资源（兜底）
        releaseResources()
      }
    })

    // 组件卸载时清理
    return () => {
      releaseResources()
      console.log('[Renderer] Component unmounted, resources released')
    }
  }, [])

  return null
}
