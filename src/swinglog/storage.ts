import type { Session, SwingLogData } from './types'
import { DRILL_LIBRARY, DEFAULT_PINNED_FAULT_IDS } from './taxonomy'

const DATA_KEY = 'swinglog-data'
const SESSION_KEY = 'swinglog-session'

export const DATA_VERSION = 1

export function seededDrills() {
  const createdAt = new Date(0).toISOString()
  return DRILL_LIBRARY.map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    instructionalVideoUrl: d.instructionalVideoUrl,
    custom: false,
    createdAt,
  }))
}

export function seededDrillFaultTags() {
  return DRILL_LIBRARY.flatMap((d) =>
    d.faultTagIds.map((faultTagId) => ({ drillId: d.id, faultTagId })),
  )
}

export function emptyData(): SwingLogData {
  return {
    version: DATA_VERSION,
    coach: null,
    students: [],
    lessons: [],
    videos: [],
    drills: seededDrills(),
    annotations: [],
    lessonFaultTags: [],
    drillFaultTags: seededDrillFaultTags(),
    lessonDrills: [],
    pinnedFaultIds: [...DEFAULT_PINNED_FAULT_IDS],
  }
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

/**
 * Merge a stored document onto a fresh one. Library drills are re-seeded on
 * every load so taxonomy updates ship with the app, while custom drills the
 * coach wrote are preserved.
 */
export function normalizeData(raw: unknown): SwingLogData {
  const base = emptyData()
  if (!raw || typeof raw !== 'object') return base
  const parsed = raw as Partial<SwingLogData>

  const customDrills = asArray<SwingLogData['drills'][number]>(parsed.drills).filter((d) => d.custom)
  const customDrillIds = new Set(customDrills.map((d) => d.id))

  return {
    version: DATA_VERSION,
    coach: parsed.coach ?? null,
    students: asArray(parsed.students),
    lessons: asArray(parsed.lessons),
    videos: asArray(parsed.videos),
    drills: [...base.drills, ...customDrills],
    annotations: asArray(parsed.annotations),
    lessonFaultTags: asArray(parsed.lessonFaultTags),
    drillFaultTags: [
      ...base.drillFaultTags,
      ...asArray<SwingLogData['drillFaultTags'][number]>(parsed.drillFaultTags).filter((j) =>
        customDrillIds.has(j.drillId),
      ),
    ],
    lessonDrills: asArray(parsed.lessonDrills),
    pinnedFaultIds:
      Array.isArray(parsed.pinnedFaultIds) && parsed.pinnedFaultIds.length
        ? parsed.pinnedFaultIds
        : base.pinnedFaultIds,
  }
}

export function loadData(): SwingLogData {
  try {
    const raw = localStorage.getItem(DATA_KEY)
    if (raw) return normalizeData(JSON.parse(raw))
  } catch {
    // Corrupt or unreadable storage falls back to a clean document rather than
    // taking the whole app down on boot.
  }
  return emptyData()
}

export function saveData(data: SwingLogData): void {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data))
  } catch {
    // Quota exceeded: the clips themselves are in IndexedDB, so this only
    // happens with an enormous roster. Nothing useful to do inline.
  }
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && (parsed.role === 'coach' || parsed.role === 'student')) {
      return {
        role: parsed.role,
        coachId: parsed.coachId ?? null,
        studentId: parsed.studentId ?? null,
        preview: Boolean(parsed.preview),
      }
    }
  } catch {
    // fall through
  }
  return null
}

export function saveSession(session: Session | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
}

/**
 * Records only — clips stay on the device. Enough to move a roster to another
 * browser or hand the data model to the next stage of the build.
 */
export function exportData(data: SwingLogData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `swinglog-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function parseImport(text: string): SwingLogData | null {
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.students)) {
      return normalizeData(parsed)
    }
  } catch {
    // invalid JSON
  }
  return null
}
