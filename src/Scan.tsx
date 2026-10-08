import { useRef, useState } from 'react'
import { CameraIcon, PhotosIcon } from './icons'
import { PhotoImage } from './Photo'
import type { ScanQueue } from './useScanQueue'

interface ScanButtonsProps {
  onFiles: (files: File[]) => void
  compact?: boolean
}

/** "Take photo" opens the camera on phones; "Upload" accepts a whole stack of photos. */
export function ScanButtons({ onFiles, compact }: ScanButtonsProps) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length > 0) onFiles(files)
  }

  return (
    <div className={compact ? 'scan-buttons compact' : 'scan-buttons'}>
      <button type="button" className="primary" onClick={() => cameraRef.current?.click()}>
        <CameraIcon size={18} /> Take photo
      </button>
      <button type="button" onClick={() => uploadRef.current?.click()}>
        <PhotosIcon size={18} /> Upload photos
      </button>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handle} hidden />
      <input ref={uploadRef} type="file" accept="image/*" multiple onChange={handle} hidden />
    </div>
  )
}

interface ScanPanelProps {
  queue: ScanQueue
  canRead: boolean
  notice: string
}

export default function ScanPanel({ queue, canRead, notice }: ScanPanelProps) {
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const { items, preparing } = queue
  const readCount = items.filter((i) => i.status === 'read').length
  const readingCount = items.filter((i) => i.status === 'reading' || i.status === 'queued').length

  return (
    <section className="scan-panel" aria-label="Log rounds from scorecard photos">
      <div className="scan-intro">
        <span className="scan-badge">
          <CameraIcon size={24} />
        </span>
        <div>
          <h2>Log from a scorecard photo</h2>
          <p>
            Snap your card after the round, or upload a stack of old ones.{' '}
            {canRead
              ? 'Claude reads every hole — you check the numbers and save.'
              : 'Each photo is saved with its round. Add an Anthropic API key under More to have the scores read for you.'}
          </p>
        </div>
      </div>

      <ScanButtons onFiles={(files) => void queue.addFiles(files)} />

      {notice && <p className="scan-notice">{notice}</p>}
      {preparing > 0 && (
        <p className="scan-status">
          Preparing {preparing} photo{preparing === 1 ? '' : 's'}…
        </p>
      )}
      {queue.error && <p className="import-error">{queue.error}</p>}

      {items.length > 0 && (
        <div className="scan-queue">
          <div className="scan-queue-head">
            <span>
              <strong>
                {items.length} card{items.length === 1 ? '' : 's'} to review
              </strong>
              {canRead && items.length > 1 && (
                <span className="record-sub">
                  {' '}
                  · {readCount} read{readingCount > 0 ? `, ${readingCount} in progress` : ''}
                </span>
              )}
            </span>
            {confirmDiscard ? (
              <span className="scan-confirm">
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    queue.discardAll()
                    setConfirmDiscard(false)
                  }}
                >
                  Discard {items.length === 1 ? 'it' : `all ${items.length}`}
                </button>
                <button type="button" onClick={() => setConfirmDiscard(false)}>
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" className="link-btn" onClick={() => setConfirmDiscard(true)}>
                Discard {items.length === 1 ? 'card' : 'all'}
              </button>
            )}
          </div>
          {items.length > 1 && (
            <ol className="scan-strip" aria-label="Scorecards waiting">
              {items.map((item, i) => (
                <li key={item.id} className={i === 0 ? 'current' : undefined}>
                  <PhotoImage id={item.photoIds[0]} alt={`Scorecard ${i + 1}`} />
                  <span className={`scan-dot ${item.status}`} title={item.status} />
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  )
}
