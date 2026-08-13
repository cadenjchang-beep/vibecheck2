import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertIcon } from '../icons'

/** Safari only produces MP4; everything else prefers VP9 WebM. */
const PREFERRED_TYPES = [
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
]

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const type of PREFERRED_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

interface RecorderProps {
  onCaptured: (blob: Blob, mimeType: string) => void
  onCancel: () => void
}

export function Recorder({ onCaptured, onCancel }: RecorderProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    let cancelled = false

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser cannot open the camera. Upload a clip from your camera roll instead.')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1080 },
            height: { ideal: 1920 },
            frameRate: { ideal: 60 },
          },
          audio: true,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          void videoRef.current.play().catch(() => undefined)
        }
      } catch {
        if (!cancelled) {
          setError(
            'Camera access was blocked. Allow it in your browser settings, or upload a clip you already shot.',
          )
        }
      }
    }

    void start()
    return () => {
      cancelled = true
      stopStream()
    }
  }, [stopStream])

  useEffect(() => {
    if (!recording) return
    const startedAt = Date.now()
    const timer = window.setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 100)
    return () => window.clearInterval(timer)
  }, [recording])

  const startRecording = () => {
    const stream = streamRef.current
    if (!stream) return
    if (typeof MediaRecorder === 'undefined') {
      setError('This browser cannot record video. Upload a clip from your camera roll instead.')
      return
    }
    const mimeType = pickMimeType()
    chunksRef.current = []
    try {
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || 'video/webm'
        const blob = new Blob(chunksRef.current, { type })
        chunksRef.current = []
        stopStream()
        if (blob.size > 0) onCaptured(blob, type)
        else setError('That recording came back empty. Try again.')
      }
      recorderRef.current = recorder
      recorder.start()
      setElapsed(0)
      setRecording(true)
    } catch {
      setError('Recording failed to start. Upload a clip from your camera roll instead.')
    }
  }

  const stopRecording = () => {
    setRecording(false)
    recorderRef.current?.stop()
    recorderRef.current = null
  }

  if (error) {
    return (
      <div className="card">
        <div className="banner warn">
          <AlertIcon width={18} height={18} />
          <span>{error}</span>
        </div>
        <button type="button" className="btn btn-block" onClick={onCancel}>
          Back
        </button>
      </div>
    )
  }

  return (
    <div className="stage">
      <div className="stage-frame">
        <div className="stage-media" style={{ aspectRatio: '9 / 16' }}>
          <video ref={videoRef} playsInline muted autoPlay />
        </div>
      </div>
      <div className="stage-controls">
        <div className="stage-row">
          {recording && <span className="rec-dot" />}
          <span className="stage-time mono-num">
            {recording ? `${elapsed.toFixed(1)}s` : 'Ready'}
          </span>
        </div>
        <div className="stage-row">
          <button type="button" className="stage-btn" onClick={onCancel}>
            Cancel
          </button>
          {recording ? (
            <button type="button" className="stage-btn active grow" onClick={stopRecording}>
              Stop recording
            </button>
          ) : (
            <button type="button" className="stage-btn active grow" onClick={startRecording}>
              Start recording
            </button>
          )}
        </div>
        <p className="stage-hint">
          Down the line: stand behind the student on the target line, phone at hand height.
        </p>
      </div>
    </div>
  )
}
