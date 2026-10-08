/**
 * Scorecard photos live in IndexedDB — they are far too large for the
 * localStorage journal document, which only stores their ids.
 */

export interface StoredPhoto {
  id: string
  full: Blob
  thumb: Blob
  createdAt: number
  /** User id of the cloud account this photo has been uploaded to. */
  uploadedTo?: string
}

const DB_NAME = 'golf-journal-photos'
const STORE = 'photos'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('This browser cannot store photos (IndexedDB is unavailable).'))
        return
      }
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('Could not open photo storage.'))
    })
    dbPromise.catch(() => {
      dbPromise = null
    })
  }
  return dbPromise
}

async function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(req ? req.result : (undefined as T))
    tx.onerror = () => reject(tx.error ?? new Error('Photo storage error.'))
    tx.onabort = () => reject(tx.error ?? new Error('Photo storage is full or unavailable.'))
  })
}

type Listener = (id: string) => void
const listeners = new Set<Listener>()

/** Subscribe to photos being added or removed (by id). */
export function onPhotoChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit(id: string) {
  for (const fn of listeners) fn(id)
}

let askedPersist = false

export async function putPhoto(photo: StoredPhoto): Promise<void> {
  await run('readwrite', (s) => s.put(photo))
  emit(photo.id)
  if (!askedPersist) {
    askedPersist = true
    // Ask the browser not to evict photos under storage pressure.
    void navigator.storage?.persist?.().catch(() => false)
  }
}

export function getPhoto(id: string): Promise<StoredPhoto | undefined> {
  return run<StoredPhoto | undefined>('readonly', (s) => s.get(id))
}

export async function deletePhotos(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await run('readwrite', (s) => {
    for (const id of ids) s.delete(id)
  })
  ids.forEach(emit)
}

export async function markUploaded(id: string, userId: string): Promise<void> {
  const photo = await getPhoto(id)
  if (photo) await run('readwrite', (s) => s.put({ ...photo, uploadedTo: userId }))
}

export async function getPhotos(ids: string[]): Promise<StoredPhoto[]> {
  const found = await Promise.all(ids.map(getPhoto))
  return found.filter((p): p is StoredPhoto => p !== undefined)
}

export async function photoUsage(): Promise<{ count: number; bytes: number }> {
  const all = await run<StoredPhoto[]>('readonly', (s) => s.getAll())
  return {
    count: all.length,
    bytes: all.reduce((sum, p) => sum + p.full.size + p.thumb.size, 0),
  }
}

/**
 * Deletes photos stored before `before` that no saved round references —
 * leftovers from scans that were abandoned when the page closed.
 */
export async function removeOrphanPhotos(referenced: Set<string>, before: number): Promise<void> {
  const all = await run<StoredPhoto[]>('readonly', (s) => s.getAll())
  await deletePhotos(
    all.filter((p) => p.createdAt < before && !referenced.has(p.id)).map((p) => p.id),
  )
}
