import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'

export function MicrophoneTest({ deviceId }: { deviceId?: string }) {
  const { t } = useTranslation()
  const [testing, setTesting] = useState(false)
  const [level, setLevel] = useState(0)
  const [message, setMessage] = useState('')
  const cleanup = useRef<() => void>(() => undefined)
  const generation = useRef(0)
  const stop = () => {
    generation.current++
    cleanup.current()
    cleanup.current = () => undefined
    setTesting(false)
    setLevel(0)
  }
  useEffect(() => {
    generation.current++
    cleanup.current()
    setTesting(false)
    setLevel(0)
    return () => {
      generation.current++
      cleanup.current()
    }
  }, [deviceId])
  const start = async () => {
    stop()
    const token = generation.current
    setTesting(true)
    setMessage('')
    try {
      if ((await window.electronAPI.getSessionStatus()) !== 'idle')
        throw new Error(t('errors.asrBusy'))
      if (token !== generation.current) return
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      })
      if (token !== generation.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      const context = new AudioContext()
      // Install cleanup before connecting the graph, including failure paths.
      cleanup.current = () => {
        stream.getTracks().forEach((track) => track.stop())
        void context.close()
      }
      const source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      const samples = new Float32Array(analyser.fftSize)
      setMessage(stream.getAudioTracks()[0]?.label || t('settings.microphone.systemDefault'))
      const interval = setInterval(() => {
        analyser.getFloatTimeDomainData(samples)
        setLevel(
          Math.min(
            1,
            Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length) * 5,
          ),
        )
      }, 50)
      const poll = setInterval(() => {
        void window.electronAPI
          .getSessionStatus()
          .then((status) => {
            if (token === generation.current && status !== 'idle') stop()
          })
          .catch(() => {
            if (token === generation.current) stop()
          })
      }, 250)
      const timeout = setTimeout(stop, 10_000)
      const release = cleanup.current
      cleanup.current = () => {
        clearInterval(interval)
        clearInterval(poll)
        clearTimeout(timeout)
        release()
      }
      await context.resume()
    } catch (error) {
      if (token !== generation.current) return
      stop()
      setMessage(error instanceof Error ? error.message : t('common.unknownError'))
    }
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <Button size="sm" variant="outline" onClick={() => (testing ? stop() : void start())}>
        {t(testing ? 'settings.microphone.stopTest' : 'settings.microphone.test')}
      </Button>
      {testing ? (
        <meter
          min={0}
          max={1}
          value={level}
          aria-label={t('settings.microphone.level')}
          className="h-3 w-28"
        />
      ) : null}
      <span className="text-xs text-muted-foreground" role="status">
        {message || t('settings.microphone.testHelp')}
      </span>
    </div>
  )
}
