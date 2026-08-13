import { useEffect, useState } from 'react'
import { getMedia } from './db'

export interface VideoMetadata {
  durationSeconds: number
  width: number
  height: number
}

function createProbeElement(url: string): HTMLVideoElement {
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.muted = true
  video.playsInline = true
  video.src = url
  return video
}

/**
 * Read duration and frame size out of a clip.
 *
 * MediaRecorder's WebM output reports `duration: Infinity` until the file is
 * seeked, which is why this bothers seeking past the end before giving up —
 * without it every in-app recording would show a blank length.
 */
export function loadVideoMetadata(blob: Blob): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const video = createProbeElement(url)

    const cleanup = () => {
      video.onloadedmetadata = null
      video.onerror = null
      video.ontimeupdate = null
      video.onseeked = null
      URL.revokeObjectURL(url)
    }

    const finish = (durationSeconds: number) => {
      const result = {
        durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
        width: video.videoWidth,
        height: video.videoHeight,
      }
      cleanup()
      resolve(result)
    }

    video.onerror = () => {
      cleanup()
      reject(new Error('That file could not be read as a video.'))
    }

    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) {
        finish(video.duration)
        return
      }
      const settle = () => {
        video.ontimeupdate = null
        video.onseeked = null
        finish(video.duration)
      }
      video.ontimeupdate = settle
      video.onseeked = settle
      video.currentTime = 1e6
    }
  })
}

/**
 * Grab a poster frame. Defaults to the middle of the clip, which for a swing is
 * around the top of the backswing — a far more recognisable thumbnail than the
 * first frame, where the student is still standing at address.
 */
export function captureThumbnail(blob: Blob, atSeconds?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const video = createProbeElement(url)
    let settled = false

    const cleanup = () => {
      video.onloadedmetadata = null
      video.onerror = null
      video.onseeked = null
      URL.revokeObjectURL(url)
    }
    const give = (result: Blob | null) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }

    // A thumbnail is a nicety; never let it hold up a save.
    const timer = setTimeout(() => give(null), 8000)

    video.onerror = () => {
      clearTimeout(timer)
      give(null)
    }

    video.onseeked = () => {
      clearTimeout(timer)
      try {
        const canvas = document.createElement('canvas')
        const scale = Math.min(1, 480 / Math.max(video.videoWidth, 1))
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          give(null)
          return
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((out) => give(out), 'image/jpeg', 0.72)
      } catch {
        give(null)
      }
    }

    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0
      const target = atSeconds ?? (duration > 0 ? duration / 2 : 0)
      video.currentTime = Math.max(0, Math.min(target, Math.max(0, duration - 0.05)))
    }
  })
}

/** Object URL for a blob held in the local media store, revoked on unmount. */
export function useMediaUrl(key: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!key) {
      setUrl(null)
      return
    }
    let objectUrl: string | null = null
    let cancelled = false

    getMedia(key)
      .then((blob) => {
        if (cancelled || !blob) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      setUrl(null)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [key])

  return url
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const whole = Math.floor(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
