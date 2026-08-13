export type Role = 'coach' | 'student'

export type SubscriptionStatus = 'free' | 'active' | 'canceled'

export type CaptureAngle = 'down_the_line' | 'face_on' | 'other'

/**
 * Where a clip's bytes currently live. Video is always written to the device
 * first (the range has no signal), so `local` is a normal resting state, not an
 * error — `uploaded` only becomes reachable once a backend is configured.
 */
export type UploadState = 'local' | 'queued' | 'uploading' | 'uploaded' | 'failed'

export interface Coach {
  id: string
  email: string
  name: string
  subscriptionStatus: SubscriptionStatus
  createdAt: string
}

export interface Student {
  id: string
  coachId: string
  /** Set once the student claims their invite and gets their own view. */
  linkedUserId: string | null
  name: string
  email: string | null
  inviteCode: string
  createdAt: string
}

export interface Lesson {
  id: string
  studentId: string
  coachId: string
  note: string
  lessonDate: string
  createdAt: string
}

export interface Video {
  id: string
  lessonId: string
  /** Remote object path, once the clip has been uploaded. */
  storageUrl: string | null
  /** IndexedDB key for the local copy of the clip. */
  mediaKey: string
  /** IndexedDB key for the generated poster frame. */
  thumbKey: string | null
  angle: CaptureAngle
  durationSeconds: number
  sizeBytes: number
  mimeType: string
  uploadState: UploadState
  uploadError: string | null
  createdAt: string
}

export interface FaultTag {
  id: string
  name: string
  category: string
  description: string
}

export interface Drill {
  id: string
  name: string
  description: string
  instructionalVideoUrl: string | null
  /** True for drills the coach added themselves rather than seeded library ones. */
  custom: boolean
  createdAt: string
}

export type ShapeKind = 'line' | 'angle' | 'circle' | 'free'

/** Normalised to the video frame: 0..1 on both axes, origin top-left. */
export interface Point {
  x: number
  y: number
}

export interface Shape {
  id: string
  kind: ShapeKind
  points: Point[]
  color: string
}

export interface Annotation {
  id: string
  videoId: string
  timestampSeconds: number
  drawingData: { shapes: Shape[] }
  label: string
  createdAt: string
}

export interface LessonFaultTag {
  lessonId: string
  faultTagId: string
}

export interface DrillFaultTag {
  drillId: string
  faultTagId: string
}

export interface LessonDrill {
  lessonId: string
  drillId: string
  assignedAt: string
  completedAt: string | null
}

export interface Session {
  role: Role
  /** Set when signed in as a coach. */
  coachId: string | null
  /** Set when signed in as a student, or when a coach previews a student view. */
  studentId: string | null
  /** True while a coach is looking at what a student sees. */
  preview: boolean
}

export interface SwingLogData {
  version: number
  coach: Coach | null
  students: Student[]
  lessons: Lesson[]
  videos: Video[]
  drills: Drill[]
  annotations: Annotation[]
  lessonFaultTags: LessonFaultTag[]
  drillFaultTags: DrillFaultTag[]
  lessonDrills: LessonDrill[]
  pinnedFaultIds: string[]
}

export const FREE_TIER_MAX_STUDENTS = 3
export const FREE_TIER_MAX_LESSONS = 10

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function newInviteCode(): string {
  // Ambiguous characters removed — students read these off a phone screen.
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}
