import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  CaptureAngle,
  Coach,
  Session,
  Shape,
  Student,
  SubscriptionStatus,
  SwingLogData,
  Video,
} from './types'
import {
  FREE_TIER_MAX_LESSONS,
  FREE_TIER_MAX_STUDENTS,
  newId,
  newInviteCode,
} from './types'
import { deleteManyMedia, putMedia, requestPersistence } from './db'
import { emptyData, loadData, loadSession, saveData, saveSession } from './storage'
import { cloudUserId, isCloudConfigured, uploadOne } from './upload'

export interface DraftAnnotation {
  timestampSeconds: number
  shapes: Shape[]
  label: string
}

export interface DraftVideo {
  blob: Blob
  thumb: Blob | null
  angle: CaptureAngle
  durationSeconds: number
  mimeType: string
}

export interface LessonDraft {
  studentId: string
  lessonDate: string
  note: string
  faultTagIds: string[]
  drillIds: string[]
  video: DraftVideo | null
  annotations: DraftAnnotation[]
}

export interface TierStatus {
  paid: boolean
  studentCount: number
  lessonCount: number
  maxStudents: number | null
  maxLessons: number | null
  canAddStudent: boolean
  canAddLesson: boolean
}

interface SwingLogContextValue {
  data: SwingLogData
  session: Session | null
  ready: boolean
  tier: TierStatus

  signUpCoach: (name: string, email: string) => void
  signInStudent: (inviteCode: string) => { ok: true } | { ok: false; error: string }
  signOut: () => void
  previewStudent: (studentId: string) => void
  exitPreview: () => void

  addStudent: (input: { name: string; email: string }) => { ok: true; student: Student } | { ok: false; error: string }
  updateStudent: (id: string, patch: Partial<Pick<Student, 'name' | 'email'>>) => void
  deleteStudent: (id: string) => void

  saveLesson: (draft: LessonDraft) => Promise<{ ok: true; lessonId: string } | { ok: false; error: string }>
  updateLessonNote: (lessonId: string, note: string) => void
  setLessonFaults: (lessonId: string, faultTagIds: string[]) => void
  setLessonDrills: (lessonId: string, drillIds: string[]) => void
  toggleDrillComplete: (lessonId: string, drillId: string) => void
  deleteLesson: (lessonId: string) => void

  addAnnotation: (
    videoId: string,
    annotation: { timestampSeconds: number; shapes: Shape[]; label: string },
  ) => void
  deleteAnnotation: (annotationId: string) => void

  addCustomDrill: (input: { name: string; description: string; faultTagIds: string[] }) => void
  deleteCustomDrill: (drillId: string) => void
  togglePinnedFault: (faultId: string) => void

  setSubscriptionStatus: (status: SubscriptionStatus) => void
  replaceData: (next: SwingLogData) => void
  resetEverything: () => void

  flushUploads: () => Promise<void>
  uploading: boolean
}

const SwingLogContext = createContext<SwingLogContextValue | null>(null)

export function SwingLogProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<SwingLogData>(emptyData)
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [uploading, setUploading] = useState(false)
  // Uploads read the newest records without re-subscribing the effect below.
  const dataRef = useRef(data)
  dataRef.current = data

  useEffect(() => {
    setData(loadData())
    setSession(loadSession())
    setReady(true)
  }, [])

  useEffect(() => {
    if (ready) saveData(data)
  }, [data, ready])

  useEffect(() => {
    if (ready) saveSession(session)
  }, [session, ready])

  const tier = useMemo<TierStatus>(() => {
    const paid = data.coach?.subscriptionStatus === 'active'
    const studentCount = data.students.length
    const lessonCount = data.lessons.length
    return {
      paid,
      studentCount,
      lessonCount,
      maxStudents: paid ? null : FREE_TIER_MAX_STUDENTS,
      maxLessons: paid ? null : FREE_TIER_MAX_LESSONS,
      canAddStudent: paid || studentCount < FREE_TIER_MAX_STUDENTS,
      canAddLesson: paid || lessonCount < FREE_TIER_MAX_LESSONS,
    }
  }, [data.coach?.subscriptionStatus, data.students.length, data.lessons.length])

  // ---- auth ---------------------------------------------------------------

  const signUpCoach = useCallback((name: string, email: string) => {
    const coach: Coach = {
      id: newId(),
      name: name.trim(),
      email: email.trim(),
      subscriptionStatus: 'free',
      createdAt: new Date().toISOString(),
    }
    setData((prev) => ({ ...prev, coach }))
    setSession({ role: 'coach', coachId: coach.id, studentId: null, preview: false })
    // Clips are the one thing here that cannot be re-created; ask the browser
    // not to evict them under storage pressure.
    void requestPersistence()
  }, [])

  const signInStudent = useCallback((inviteCode: string) => {
    const code = inviteCode.trim().toUpperCase()
    const student = dataRef.current.students.find((s) => s.inviteCode === code)
    if (!student) return { ok: false as const, error: 'No student matches that code.' }
    setData((prev) => ({
      ...prev,
      students: prev.students.map((s) =>
        s.id === student.id ? { ...s, linkedUserId: s.linkedUserId ?? newId() } : s,
      ),
    }))
    setSession({ role: 'student', coachId: null, studentId: student.id, preview: false })
    return { ok: true as const }
  }, [])

  const signOut = useCallback(() => setSession(null), [])

  const previewStudent = useCallback((studentId: string) => {
    setSession((prev) =>
      prev ? { ...prev, role: 'student', studentId, preview: true } : prev,
    )
  }, [])

  const exitPreview = useCallback(() => {
    setSession((prev) =>
      prev?.preview ? { ...prev, role: 'coach', studentId: null, preview: false } : prev,
    )
  }, [])

  // ---- students -----------------------------------------------------------

  const addStudent = useCallback(
    ({ name, email }: { name: string; email: string }) => {
      const trimmed = name.trim()
      if (!trimmed) return { ok: false as const, error: 'A name is required.' }
      const current = dataRef.current
      const paid = current.coach?.subscriptionStatus === 'active'
      if (!paid && current.students.length >= FREE_TIER_MAX_STUDENTS) {
        return {
          ok: false as const,
          error: `The free plan covers ${FREE_TIER_MAX_STUDENTS} students. Upgrade to add more.`,
        }
      }
      const existingCodes = new Set(current.students.map((s) => s.inviteCode))
      let inviteCode = newInviteCode()
      while (existingCodes.has(inviteCode)) inviteCode = newInviteCode()

      const student: Student = {
        id: newId(),
        coachId: current.coach?.id ?? '',
        linkedUserId: null,
        name: trimmed,
        email: email.trim() || null,
        inviteCode,
        createdAt: new Date().toISOString(),
      }
      setData((prev) => ({ ...prev, students: [...prev.students, student] }))
      return { ok: true as const, student }
    },
    [],
  )

  const updateStudent = useCallback((id: string, patch: Partial<Pick<Student, 'name' | 'email'>>) => {
    setData((prev) => ({
      ...prev,
      students: prev.students.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }))
  }, [])

  const deleteStudent = useCallback((id: string) => {
    setData((prev) => {
      const lessonIds = new Set(prev.lessons.filter((l) => l.studentId === id).map((l) => l.id))
      const videos = prev.videos.filter((v) => lessonIds.has(v.lessonId))
      const videoIds = new Set(videos.map((v) => v.id))
      void deleteManyMedia(videos.flatMap((v) => [v.mediaKey, v.thumbKey]))
      return {
        ...prev,
        students: prev.students.filter((s) => s.id !== id),
        lessons: prev.lessons.filter((l) => !lessonIds.has(l.id)),
        videos: prev.videos.filter((v) => !lessonIds.has(v.lessonId)),
        annotations: prev.annotations.filter((a) => !videoIds.has(a.videoId)),
        lessonFaultTags: prev.lessonFaultTags.filter((j) => !lessonIds.has(j.lessonId)),
        lessonDrills: prev.lessonDrills.filter((j) => !lessonIds.has(j.lessonId)),
      }
    })
  }, [])

  // ---- lessons ------------------------------------------------------------

  /**
   * One commit: clip to IndexedDB first, then every record in a single state
   * update. A half-saved lesson — a video row with no lesson, tags pointing at
   * nothing — is worse than a failed save, so nothing is written until the
   * bytes are safely on the device.
   */
  const saveLesson = useCallback(async (draft: LessonDraft) => {
    const current = dataRef.current
    const paid = current.coach?.subscriptionStatus === 'active'
    if (!paid && current.lessons.length >= FREE_TIER_MAX_LESSONS) {
      return {
        ok: false as const,
        error: `The free plan covers ${FREE_TIER_MAX_LESSONS} lessons. Upgrade to keep logging.`,
      }
    }
    const student = current.students.find((s) => s.id === draft.studentId)
    if (!student) return { ok: false as const, error: 'That student no longer exists.' }

    const now = new Date().toISOString()
    const lessonId = newId()
    const videoId = newId()
    let video: Video | null = null

    if (draft.video) {
      const mediaKey = `video:${videoId}`
      const thumbKey = draft.video.thumb ? `thumb:${videoId}` : null
      try {
        await putMedia(mediaKey, draft.video.blob)
        if (draft.video.thumb && thumbKey) await putMedia(thumbKey, draft.video.thumb)
      } catch {
        return {
          ok: false as const,
          error: 'Could not save the clip to this device. Free up some space and try again.',
        }
      }
      video = {
        id: videoId,
        lessonId,
        storageUrl: null,
        mediaKey,
        thumbKey,
        angle: draft.video.angle,
        durationSeconds: draft.video.durationSeconds,
        sizeBytes: draft.video.blob.size,
        mimeType: draft.video.mimeType,
        uploadState: 'local',
        uploadError: null,
        createdAt: now,
      }
    }

    setData((prev) => ({
      ...prev,
      lessons: [
        ...prev.lessons,
        {
          id: lessonId,
          studentId: draft.studentId,
          coachId: prev.coach?.id ?? '',
          note: draft.note.trim(),
          lessonDate: draft.lessonDate,
          createdAt: now,
        },
      ],
      videos: video ? [...prev.videos, video] : prev.videos,
      lessonFaultTags: [
        ...prev.lessonFaultTags,
        ...draft.faultTagIds.map((faultTagId) => ({ lessonId, faultTagId })),
      ],
      lessonDrills: [
        ...prev.lessonDrills,
        ...draft.drillIds.map((drillId) => ({
          lessonId,
          drillId,
          assignedAt: now,
          completedAt: null,
        })),
      ],
      annotations: video
        ? [
            ...prev.annotations,
            ...draft.annotations.map((a) => ({
              id: newId(),
              videoId,
              timestampSeconds: a.timestampSeconds,
              drawingData: { shapes: a.shapes },
              label: a.label,
              createdAt: now,
            })),
          ]
        : prev.annotations,
    }))

    return { ok: true as const, lessonId }
  }, [])

  const updateLessonNote = useCallback((lessonId: string, note: string) => {
    setData((prev) => ({
      ...prev,
      lessons: prev.lessons.map((l) => (l.id === lessonId ? { ...l, note } : l)),
    }))
  }, [])

  const setLessonFaults = useCallback((lessonId: string, faultTagIds: string[]) => {
    setData((prev) => ({
      ...prev,
      lessonFaultTags: [
        ...prev.lessonFaultTags.filter((j) => j.lessonId !== lessonId),
        ...faultTagIds.map((faultTagId) => ({ lessonId, faultTagId })),
      ],
    }))
  }, [])

  const setLessonDrills = useCallback((lessonId: string, drillIds: string[]) => {
    setData((prev) => {
      const keep = prev.lessonDrills.filter(
        (j) => j.lessonId === lessonId && drillIds.includes(j.drillId),
      )
      const keptIds = new Set(keep.map((j) => j.drillId))
      const now = new Date().toISOString()
      return {
        ...prev,
        lessonDrills: [
          ...prev.lessonDrills.filter((j) => j.lessonId !== lessonId),
          // Re-assigning a drill must not wipe the student's completion.
          ...keep,
          ...drillIds
            .filter((drillId) => !keptIds.has(drillId))
            .map((drillId) => ({ lessonId, drillId, assignedAt: now, completedAt: null })),
        ],
      }
    })
  }, [])

  const toggleDrillComplete = useCallback((lessonId: string, drillId: string) => {
    setData((prev) => ({
      ...prev,
      lessonDrills: prev.lessonDrills.map((j) =>
        j.lessonId === lessonId && j.drillId === drillId
          ? { ...j, completedAt: j.completedAt ? null : new Date().toISOString() }
          : j,
      ),
    }))
  }, [])

  const deleteLesson = useCallback((lessonId: string) => {
    setData((prev) => {
      const videos = prev.videos.filter((v) => v.lessonId === lessonId)
      const videoIds = new Set(videos.map((v) => v.id))
      void deleteManyMedia(videos.flatMap((v) => [v.mediaKey, v.thumbKey]))
      return {
        ...prev,
        lessons: prev.lessons.filter((l) => l.id !== lessonId),
        videos: prev.videos.filter((v) => v.lessonId !== lessonId),
        annotations: prev.annotations.filter((a) => !videoIds.has(a.videoId)),
        lessonFaultTags: prev.lessonFaultTags.filter((j) => j.lessonId !== lessonId),
        lessonDrills: prev.lessonDrills.filter((j) => j.lessonId !== lessonId),
      }
    })
  }, [])

  const addAnnotation = useCallback(
    (
      videoId: string,
      annotation: { timestampSeconds: number; shapes: Shape[]; label: string },
    ) => {
      setData((prev) => ({
        ...prev,
        annotations: [
          ...prev.annotations,
          {
            id: newId(),
            videoId,
            timestampSeconds: annotation.timestampSeconds,
            drawingData: { shapes: annotation.shapes },
            label: annotation.label,
            createdAt: new Date().toISOString(),
          },
        ],
      }))
    },
    [],
  )

  const deleteAnnotation = useCallback((annotationId: string) => {
    setData((prev) => ({
      ...prev,
      annotations: prev.annotations.filter((a) => a.id !== annotationId),
    }))
  }, [])

  // ---- library & settings -------------------------------------------------

  const addCustomDrill = useCallback(
    ({ name, description, faultTagIds }: { name: string; description: string; faultTagIds: string[] }) => {
      const drillId = newId()
      setData((prev) => ({
        ...prev,
        drills: [
          ...prev.drills,
          {
            id: drillId,
            name: name.trim(),
            description: description.trim(),
            instructionalVideoUrl: null,
            custom: true,
            createdAt: new Date().toISOString(),
          },
        ],
        drillFaultTags: [
          ...prev.drillFaultTags,
          ...faultTagIds.map((faultTagId) => ({ drillId, faultTagId })),
        ],
      }))
    },
    [],
  )

  const deleteCustomDrill = useCallback((drillId: string) => {
    setData((prev) => ({
      ...prev,
      drills: prev.drills.filter((d) => d.id !== drillId),
      drillFaultTags: prev.drillFaultTags.filter((j) => j.drillId !== drillId),
      lessonDrills: prev.lessonDrills.filter((j) => j.drillId !== drillId),
    }))
  }, [])

  const togglePinnedFault = useCallback((faultId: string) => {
    setData((prev) => ({
      ...prev,
      pinnedFaultIds: prev.pinnedFaultIds.includes(faultId)
        ? prev.pinnedFaultIds.filter((id) => id !== faultId)
        : [...prev.pinnedFaultIds, faultId],
    }))
  }, [])

  const setSubscriptionStatus = useCallback((status: SubscriptionStatus) => {
    setData((prev) =>
      prev.coach ? { ...prev, coach: { ...prev.coach, subscriptionStatus: status } } : prev,
    )
  }, [])

  const replaceData = useCallback((next: SwingLogData) => setData(next), [])

  const resetEverything = useCallback(() => {
    const current = dataRef.current
    void deleteManyMedia(current.videos.flatMap((v) => [v.mediaKey, v.thumbKey]))
    setData(emptyData())
    setSession(null)
  }, [])

  // ---- upload queue -------------------------------------------------------

  const flushUploads = useCallback(async () => {
    if (!isCloudConfigured()) return
    const ownerId = await cloudUserId()
    if (!ownerId) return

    const current = dataRef.current
    const pending = current.videos.filter((v) => v.uploadState !== 'uploaded')
    if (pending.length === 0) return

    setUploading(true)
    try {
      for (const video of pending) {
        const lesson = current.lessons.find((l) => l.id === video.lessonId)
        if (!lesson) continue
        setData((prev) => ({
          ...prev,
          videos: prev.videos.map((v) =>
            v.id === video.id ? { ...v, uploadState: 'uploading', uploadError: null } : v,
          ),
        }))
        const outcome = await uploadOne({
          ownerId,
          studentId: lesson.studentId,
          lessonId: lesson.id,
          video,
        })
        setData((prev) => ({
          ...prev,
          videos: prev.videos.map((v) =>
            v.id === video.id
              ? outcome.ok
                ? {
                    ...v,
                    uploadState: 'uploaded',
                    storageUrl: outcome.storageUrl ?? null,
                    uploadError: null,
                  }
                : { ...v, uploadState: 'failed', uploadError: outcome.error ?? 'Upload failed' }
              : v,
          ),
        }))
      }
    } finally {
      setUploading(false)
    }
  }, [])

  // Try again whenever the device gets its signal back — the whole point of
  // queueing is that the coach never has to think about this.
  useEffect(() => {
    if (!ready || !isCloudConfigured()) return
    void flushUploads()
    const onOnline = () => void flushUploads()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [ready, flushUploads])

  const value = useMemo<SwingLogContextValue>(
    () => ({
      data,
      session,
      ready,
      tier,
      signUpCoach,
      signInStudent,
      signOut,
      previewStudent,
      exitPreview,
      addStudent,
      updateStudent,
      deleteStudent,
      saveLesson,
      updateLessonNote,
      setLessonFaults,
      setLessonDrills,
      toggleDrillComplete,
      deleteLesson,
      addAnnotation,
      deleteAnnotation,
      addCustomDrill,
      deleteCustomDrill,
      togglePinnedFault,
      setSubscriptionStatus,
      replaceData,
      resetEverything,
      flushUploads,
      uploading,
    }),
    [
      data,
      session,
      ready,
      tier,
      signUpCoach,
      signInStudent,
      signOut,
      previewStudent,
      exitPreview,
      addStudent,
      updateStudent,
      deleteStudent,
      saveLesson,
      updateLessonNote,
      setLessonFaults,
      setLessonDrills,
      toggleDrillComplete,
      deleteLesson,
      addAnnotation,
      deleteAnnotation,
      addCustomDrill,
      deleteCustomDrill,
      togglePinnedFault,
      setSubscriptionStatus,
      replaceData,
      resetEverything,
      flushUploads,
      uploading,
    ],
  )

  return <SwingLogContext.Provider value={value}>{children}</SwingLogContext.Provider>
}

export function useSwingLog(): SwingLogContextValue {
  const value = useContext(SwingLogContext)
  if (!value) throw new Error('useSwingLog must be used inside a SwingLogProvider')
  return value
}
