/**
 * Local media store.
 *
 * Swing clips are tens of megabytes, so they never go near localStorage — they
 * live in IndexedDB as blobs and the record in `videos` only keeps the key.
 * This is also what makes capture work with no signal: the recording is durable
 * on the device the moment it stops, and uploading is a separate, retryable
 * concern.
 */

const DB_NAME = 'swinglog-media'
const DB_VERSION = 1
const STORE = 'media'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this browser'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open the media store'))
  })
  // A failed open should not poison every later call.
  dbPromise.catch(() => {
    dbPromise = null
  })
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const request = fn(tx.objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('Media store request failed'))
      }),
  )
}

export function putMedia(key: string, blob: Blob): Promise<void> {
  return run('readwrite', (store) => store.put(blob, key)).then(() => undefined)
}

export function getMedia(key: string): Promise<Blob | undefined> {
  return run<Blob | undefined>('readonly', (store) => store.get(key))
}

export function deleteMedia(key: string): Promise<void> {
  return run('readwrite', (store) => store.delete(key)).then(() => undefined)
}

export async function deleteManyMedia(keys: (string | null)[]): Promise<void> {
  await Promise.all(keys.filter((k): k is string => Boolean(k)).map((k) => deleteMedia(k).catch(() => undefined)))
}

export interface StorageEstimate {
  usedBytes: number
  quotaBytes: number | null
}

export async function estimateStorage(): Promise<StorageEstimate | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null
  try {
    const { usage, quota } = await navigator.storage.estimate()
    return { usedBytes: usage ?? 0, quotaBytes: quota ?? null }
  } catch {
    return null
  }
}

/**
 * Ask the browser to keep this origin's data through storage pressure. Without
 * it a phone low on space can silently evict clips that were never uploaded.
 */
export async function requestPersistence(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted?.()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
