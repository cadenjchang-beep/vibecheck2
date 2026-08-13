import { supabase } from '../supabase'
import { getMedia } from './db'
import type { Video } from './types'

/**
 * Clip upload.
 *
 * The rule from the field: a lesson is never blocked on the network. Capture
 * writes to IndexedDB, the lesson saves immediately, and the bytes go up
 * afterwards — on a retry, on the next app open, or when the phone reconnects.
 * A clip that never leaves the device is still a complete lesson record.
 *
 * Bytes go straight from the browser to the storage bucket using the signed-in
 * user's own credentials, so they never round-trip through an API server. The
 * bucket and its per-coach path policies are in supabase/swinglog-schema.sql.
 */

const BUCKET = 'swing-videos'

export function isCloudConfigured(): boolean {
  return supabase !== null
}

export async function cloudUserId(): Promise<string | null> {
  if (!supabase) return null
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.user.id ?? null
  } catch {
    return null
  }
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'mp4'
  if (mimeType.includes('quicktime')) return 'mov'
  if (mimeType.includes('webm')) return 'webm'
  return 'bin'
}

export function objectPath(params: {
  ownerId: string
  studentId: string
  lessonId: string
  video: Video
}): string {
  const { ownerId, studentId, lessonId, video } = params
  return `${ownerId}/${studentId}/${lessonId}/${video.id}.${extensionFor(video.mimeType)}`
}

export interface UploadOutcome {
  videoId: string
  ok: boolean
  storageUrl?: string
  error?: string
}

/** Push one clip. Resolves with the outcome instead of throwing. */
export async function uploadOne(params: {
  ownerId: string
  studentId: string
  lessonId: string
  video: Video
}): Promise<UploadOutcome> {
  const { video } = params
  if (!supabase) return { videoId: video.id, ok: false, error: 'Cloud backup is not configured' }

  let blob: Blob | undefined
  try {
    blob = await getMedia(video.mediaKey)
  } catch {
    return { videoId: video.id, ok: false, error: 'Could not read the clip from this device' }
  }
  if (!blob) return { videoId: video.id, ok: false, error: 'The local copy of this clip is gone' }

  const path = objectPath(params)
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: video.mimeType, upsert: true })

  if (error) return { videoId: video.id, ok: false, error: error.message }
  return { videoId: video.id, ok: true, storageUrl: path }
}

export async function signedUrlFor(storageUrl: string, expiresInSeconds = 3600): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storageUrl, expiresInSeconds)
  if (error) return null
  return data.signedUrl
}

export async function removeRemote(storageUrl: string): Promise<void> {
  if (!supabase) return
  await supabase.storage.from(BUCKET).remove([storageUrl])
}
