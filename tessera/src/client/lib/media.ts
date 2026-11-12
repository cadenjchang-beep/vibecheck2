import type { MediaRef } from '@shared/api';
import { LIMITS } from '@shared/constants';
import { api } from './api';

const MAX_EDGE = 1600;

/**
 * Shrinks large photos in the browser before upload. A phone photo is often
 * 4000px wide; a flashcard never needs more than a fraction of that.
 */
async function shrinkImage(file: File): Promise<Blob> {
  if (file.type === 'image/gif' || file.size < 400_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export async function uploadMedia(file: File, kind: 'image' | 'audio'): Promise<MediaRef> {
  const blob = kind === 'image' ? await shrinkImage(file) : file;
  const form = new FormData();
  form.append('kind', kind);
  form.append('file', blob, file.name);
  return api<MediaRef>('/api/media', { method: 'POST', body: form });
}

export const MEDIA_ACCEPT = {
  image: 'image/png,image/jpeg,image/webp,image/gif',
  audio: 'audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/ogg,audio/webm,.mp3,.m4a,.wav,.ogg,.webm',
} as const;

export const MEDIA_LIMIT = { image: LIMITS.imageBytes, audio: LIMITS.audioBytes } as const;
