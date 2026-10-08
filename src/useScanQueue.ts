import { useCallback, useEffect, useRef, useState } from 'react'
import { processPhoto } from './image'
import { deletePhotos, getPhotos, putPhoto } from './photoStore'
import type { ScorecardReading } from './scorecardReader'
import type { Settings } from './settings'

export type ScanStatus = 'queued' | 'reading' | 'read' | 'failed' | 'manual'

/** One scorecard waiting to be reviewed and saved as a round. */
export interface ScanItem {
  id: string
  photoIds: string[]
  /** Date the photo was taken, used when the card itself has no date. */
  takenOn: string | null
  status: ScanStatus
  reading?: ScorecardReading
  error?: string
}

export interface ScanQueue {
  items: ScanItem[]
  /** Photos still being prepared (decoded, resized and stored). */
  preparing: number
  error: string
  addFiles: (files: File[]) => Promise<void>
  /** Drops an item from the queue; its photos are left alone. */
  remove: (id: string) => void
  /** Drops every item and deletes their photos. */
  discardAll: () => void
}

/** Cards read in parallel ahead of the one being reviewed. */
const MAX_PARALLEL = 2

function message(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong reading the scorecard.'
}

/** Reads stored photos of one scorecard with Claude (the SDK loads on first use). */
export async function readStoredPhotos(
  settings: Settings,
  photoIds: string[],
): Promise<ScorecardReading> {
  const photos = await getPhotos(photoIds)
  if (photos.length === 0) throw new Error('The photo is no longer stored on this device.')
  const { readScorecard } = await import('./scorecardReader')
  return readScorecard(
    settings.anthropicApiKey,
    photos.map((p) => p.full),
    settings.playerName,
  )
}

/**
 * Photos picked for logging become a queue of scorecards. Each one is stored
 * right away and read by Claude in the background (when an API key is set),
 * so the next card is usually ready by the time the current one is saved.
 */
export function useScanQueue(settings: Settings): ScanQueue {
  const [items, setItems] = useState<ScanItem[]>([])
  const [preparing, setPreparing] = useState(0)
  const [error, setError] = useState('')
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const itemsRef = useRef(items)
  itemsRef.current = items
  const inFlight = useRef(new Set<string>())

  const finish = useCallback((id: string, patch: Partial<ScanItem>) => {
    inFlight.current.delete(id)
    setItems((its) => its.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }, [])

  useEffect(() => {
    const free = MAX_PARALLEL - inFlight.current.size
    if (free <= 0) return
    const next = items.filter((i) => i.status === 'queued').slice(0, free)
    if (next.length === 0) return
    for (const item of next) {
      inFlight.current.add(item.id)
      readStoredPhotos(settingsRef.current, item.photoIds).then(
        (reading) => finish(item.id, { status: 'read', reading, error: undefined }),
        (e) => finish(item.id, { status: 'failed', error: message(e) }),
      )
    }
    const started = new Set(next.map((i) => i.id))
    setItems((its) => its.map((i) => (started.has(i.id) ? { ...i, status: 'reading' } : i)))
  }, [items, finish])

  const addFiles = useCallback(async (files: File[]) => {
    setError('')
    setPreparing((n) => n + files.length)
    // One at a time: full-resolution camera photos are memory-hungry to decode.
    for (const file of files) {
      try {
        const photo = await processPhoto(file)
        const photoId = crypto.randomUUID()
        await putPhoto({ id: photoId, full: photo.full, thumb: photo.thumb, createdAt: Date.now() })
        setItems((its) => [
          ...its,
          {
            id: crypto.randomUUID(),
            photoIds: [photoId],
            takenOn: photo.takenOn,
            status: settingsRef.current.anthropicApiKey ? 'queued' : 'manual',
          },
        ])
      } catch (e) {
        setError(`${file.name}: ${message(e)}`)
      } finally {
        setPreparing((n) => n - 1)
      }
    }
  }, [])

  const remove = useCallback((id: string) => {
    setItems((its) => its.filter((i) => i.id !== id))
  }, [])

  const discardAll = useCallback(() => {
    void deletePhotos(itemsRef.current.flatMap((i) => i.photoIds))
    setItems([])
    setError('')
  }, [])

  return { items, preparing, error, addFiles, remove, discardAll }
}
