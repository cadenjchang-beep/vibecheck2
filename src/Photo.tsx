import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { CameraIcon } from './icons'
import { getPhoto, onPhotoChange } from './photoStore'
import { downloadPhoto, onPhotoSyncUserChange } from './photoSync'

type Variant = 'thumb' | 'full'

type PhotoState =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'missing' }

/**
 * Object URL for a stored photo. Photos missing on this device are fetched
 * from cloud storage when signed in.
 */
export function usePhotoUrl(id: string, variant: Variant): PhotoState {
  const [state, setState] = useState<{ key: string; value: PhotoState }>({
    key: '',
    value: { status: 'loading' },
  })
  const key = `${id}:${variant}`

  useEffect(() => {
    let cancelled = false
    let url: string | null = null

    const load = async (allowDownload: boolean) => {
      let photo = await getPhoto(id).catch(() => undefined)
      if (!photo && allowDownload && (await downloadPhoto(id))) {
        photo = await getPhoto(id).catch(() => undefined)
      }
      if (cancelled) return
      if (url) URL.revokeObjectURL(url)
      url = photo ? URL.createObjectURL(photo[variant]) : null
      setState({ key, value: url ? { status: 'ready', url } : { status: 'missing' } })
    }

    void load(true)
    const offPhoto = onPhotoChange((changed) => {
      if (changed === id) void load(false)
    })
    const offUser = onPhotoSyncUserChange(() => {
      if (!url) void load(true)
    })
    return () => {
      cancelled = true
      offPhoto()
      offUser()
      if (url) URL.revokeObjectURL(url)
    }
  }, [id, variant, key])

  return state.key === key ? state.value : { status: 'loading' }
}

interface PhotoImageProps {
  id: string
  variant?: Variant
  alt: string
  className?: string
}

export function PhotoImage({ id, variant = 'thumb', alt, className }: PhotoImageProps) {
  const photo = usePhotoUrl(id, variant)
  if (photo.status === 'ready') {
    return <img src={photo.url} alt={alt} className={className} draggable={false} />
  }
  return (
    <span
      className={`photo-placeholder ${className ?? ''}`}
      role="img"
      aria-label={photo.status === 'missing' ? 'Photo not available on this device' : 'Loading photo'}
    >
      {photo.status === 'missing' ? <CameraIcon size={20} /> : null}
    </span>
  )
}

interface LightboxProps {
  photoIds: string[]
  startIndex?: number
  title: string
  onClose: () => void
  /** Extra content under the photo, e.g. the round's scorecard. */
  children?: ReactNode
}

export function Lightbox({ photoIds, startIndex = 0, title, onClose, children }: LightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [index, setIndex] = useState(Math.min(startIndex, photoIds.length - 1))
  const [zoomed, setZoomed] = useState(false)
  const count = photoIds.length

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    document.body.classList.add('modal-open')
    return () => document.body.classList.remove('modal-open')
  }, [])

  const go = (delta: number) => {
    setZoomed(false)
    setIndex((i) => (i + delta + count) % count)
  }

  return (
    <dialog
      ref={dialogRef}
      className="lightbox"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
      onKeyDown={(e) => {
        if (count > 1 && e.key === 'ArrowRight') go(1)
        if (count > 1 && e.key === 'ArrowLeft') go(-1)
      }}
    >
      <div className="lightbox-bar">
        <span className="lightbox-title">{title}</span>
        {count > 1 && (
          <span className="lightbox-count">
            {index + 1} / {count}
          </span>
        )}
        <button type="button" className="lightbox-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className={zoomed ? 'lightbox-stage zoomed' : 'lightbox-stage'}>
        <button
          type="button"
          className="lightbox-photo"
          onClick={() => setZoomed((z) => !z)}
          aria-label={zoomed ? 'Fit photo to screen' : 'Zoom in'}
        >
          <PhotoImage id={photoIds[index]} variant="full" alt={`${title} — photo ${index + 1}`} />
        </button>
        {count > 1 && (
          <>
            <button type="button" className="lightbox-nav prev" onClick={() => go(-1)} aria-label="Previous photo">
              ‹
            </button>
            <button type="button" className="lightbox-nav next" onClick={() => go(1)} aria-label="Next photo">
              ›
            </button>
          </>
        )}
      </div>
      <p className="lightbox-hint">{zoomed ? 'Tap the photo to fit it to the screen' : 'Tap the photo to zoom in'}</p>
      {children && <div className="lightbox-body">{children}</div>}
    </dialog>
  )
}
