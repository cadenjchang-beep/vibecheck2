import { makeThumb } from './image'
import { getPhoto, markUploaded, putPhoto } from './photoStore'
import { supabase } from './supabase'
import type { JournalData } from './types'

/** Supabase Storage bucket holding scorecard photos as `<user id>/<photo id>.jpg`. */
const BUCKET = 'scorecards'

let currentUser: string | null = null
const userListeners = new Set<() => void>()

/** Called by the sync hook whenever the signed-in user changes. */
export function setPhotoSyncUser(userId: string | null): void {
  if (userId === currentUser) return
  currentUser = userId
  for (const fn of userListeners) fn()
}

/** Lets photo views retry a cloud download once someone signs in. */
export function onPhotoSyncUserChange(fn: () => void): () => void {
  userListeners.add(fn)
  return () => userListeners.delete(fn)
}

function objectPath(userId: string, id: string): string {
  return `${userId}/${id}.jpg`
}

export function referencedPhotoIds(data: JournalData): string[] {
  return data.rounds.flatMap((r) => r.photoIds ?? [])
}

const downloads = new Map<string, Promise<boolean>>()

/**
 * Fetches a photo that is missing on this device from the signed-in user's
 * cloud storage. Resolves true once it is stored locally.
 */
export function downloadPhoto(id: string): Promise<boolean> {
  const userId = currentUser
  if (!supabase || !userId) return Promise.resolve(false)
  const client = supabase
  let pending = downloads.get(id)
  if (!pending) {
    pending = (async () => {
      const { data, error } = await client.storage.from(BUCKET).download(objectPath(userId, id))
      if (error || !data) return false
      const full = data.type ? data : new Blob([data], { type: 'image/jpeg' })
      const thumb = await makeThumb(full)
      await putPhoto({ id, full, thumb, createdAt: Date.now(), uploadedTo: userId })
      return true
    })()
      .catch(() => false)
      .finally(() => downloads.delete(id))
    downloads.set(id, pending)
  }
  return pending
}

async function uploadPass(userId: string, ids: string[]): Promise<void> {
  if (!supabase) return
  for (const id of ids) {
    const photo = await getPhoto(id)
    if (!photo || photo.uploadedTo === userId) continue
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(objectPath(userId, id), photo.full, { contentType: 'image/jpeg', upsert: true })
    if (error) throw new Error(`Photo upload failed: ${error.message}`)
    await markUploaded(id, userId)
  }
}

let active: Promise<void> | null = null
let queued: { userId: string; ids: string[] } | null = null

/**
 * Uploads any of the given photos that this device has not yet pushed to the
 * user's cloud storage. Overlapping calls are coalesced into one more pass.
 */
export function uploadPhotos(userId: string, ids: string[]): Promise<void> {
  queued = { userId, ids }
  if (!active) {
    active = (async () => {
      while (queued) {
        const job = queued
        queued = null
        await uploadPass(job.userId, job.ids)
      }
    })().finally(() => {
      active = null
    })
  }
  return active
}

/** Best-effort removal of deleted photos from cloud storage. */
export async function deleteRemotePhotos(ids: string[]): Promise<void> {
  const userId = currentUser
  if (!supabase || !userId || ids.length === 0) return
  await supabase.storage
    .from(BUCKET)
    .remove(ids.map((id) => objectPath(userId, id)))
    .catch(() => undefined)
}
