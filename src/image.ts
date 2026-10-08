/** Long edge of stored scorecard photos — also the most Claude reads at full detail. */
const FULL_MAX_EDGE = 2560
const FULL_QUALITY = 0.82
const THUMB_MAX_EDGE = 480
const THUMB_QUALITY = 0.75

export interface ProcessedPhoto {
  full: Blob
  thumb: Blob
  /** yyyy-mm-dd the photo was taken (camera metadata), when known. */
  takenOn: string | null
}

function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

async function decode(blob: Blob): Promise<{ img: HTMLImageElement; release: () => void }> {
  const url = URL.createObjectURL(blob)
  const img = new Image()
  img.src = url
  try {
    await img.decode()
  } catch {
    URL.revokeObjectURL(url)
    throw new Error(
      "Couldn't open that image. If it's an HEIC photo, export it as JPEG first (or pick it from your phone's photo library).",
    )
  }
  return { img, release: () => URL.revokeObjectURL(url) }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the photo.'))),
      'image/jpeg',
      quality,
    )
  })
}

/** Draws the source scaled down to fit maxEdge, on white (JPEG has no alpha). */
function scaled(source: CanvasImageSource, width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process the photo.')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

/**
 * Normalises a camera photo for storage: applies EXIF rotation (browsers do
 * this when decoding), downsizes to a sensible resolution, re-encodes as JPEG
 * and produces a small thumbnail for lists.
 */
export async function processPhoto(file: Blob): Promise<ProcessedPhoto> {
  const takenOn =
    (await exifDate(file)) ?? (file instanceof File && file.lastModified ? localDate(new Date(file.lastModified)) : null)
  const { img, release } = await decode(file)
  try {
    const fullCanvas = scaled(img, img.naturalWidth, img.naturalHeight, FULL_MAX_EDGE)
    const full = await toBlob(fullCanvas, FULL_QUALITY)
    const thumb = await toBlob(
      scaled(fullCanvas, fullCanvas.width, fullCanvas.height, THUMB_MAX_EDGE),
      THUMB_QUALITY,
    )
    return { full, thumb, takenOn }
  } finally {
    release()
  }
}

/** Thumbnail for a stored full-size photo (e.g. one downloaded from the cloud). */
export async function makeThumb(full: Blob): Promise<Blob> {
  const { img, release } = await decode(full)
  try {
    return await toBlob(scaled(img, img.naturalWidth, img.naturalHeight, THUMB_MAX_EDGE), THUMB_QUALITY)
  } finally {
    release()
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return blobToDataUrl(blob).then((url) => url.slice(url.indexOf(',') + 1))
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the photo.'))
    reader.readAsDataURL(blob)
  })
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

/** Reads DateTimeOriginal (or DateTime) from a JPEG's EXIF block. */
async function exifDate(file: Blob): Promise<string | null> {
  try {
    const view = new DataView(await file.slice(0, 256 * 1024).arrayBuffer())
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null
    let offset = 2
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset)
      const size = view.getUint16(offset + 2)
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null
      if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966 /* "Exif" */) {
        return readTiffDate(view, offset + 10)
      }
      offset += 2 + size
    }
  } catch {
    // unreadable metadata is not an error — fall back to other dates
  }
  return null
}

function readTiffDate(view: DataView, tiff: number): string | null {
  const little = view.getUint16(tiff) === 0x4949
  const u16 = (o: number) => view.getUint16(tiff + o, little)
  const u32 = (o: number) => view.getUint32(tiff + o, little)

  const findTag = (ifd: number, tag: number): number | null => {
    const count = u16(ifd)
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12
      if (u16(entry) === tag) return u32(entry + 8)
    }
    return null
  }
  const readDate = (strOffset: number | null): string | null => {
    if (strOffset === null) return null
    let s = ''
    for (let i = 0; i < 10; i++) s += String.fromCharCode(view.getUint8(tiff + strOffset + i))
    const m = /^(\d{4}):(\d{2}):(\d{2})$/.exec(s)
    return m && m[1] !== '0000' ? `${m[1]}-${m[2]}-${m[3]}` : null
  }

  const ifd0 = u32(4)
  const exifIfd = findTag(ifd0, 0x8769)
  return (
    (exifIfd !== null ? readDate(findTag(exifIfd, 0x9003)) : null) ?? readDate(findTag(ifd0, 0x0132))
  )
}
