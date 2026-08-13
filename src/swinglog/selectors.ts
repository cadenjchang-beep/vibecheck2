import type { Annotation, Drill, Lesson, LessonDrill, SwingLogData, Video } from './types'
import { getFault } from './taxonomy'

export function lessonsForStudent(data: SwingLogData, studentId: string): Lesson[] {
  return data.lessons
    .filter((l) => l.studentId === studentId)
    .sort((a, b) => b.lessonDate.localeCompare(a.lessonDate))
}

export function videoForLesson(data: SwingLogData, lessonId: string): Video | undefined {
  return data.videos.find((v) => v.lessonId === lessonId)
}

export function faultIdsForLesson(data: SwingLogData, lessonId: string): string[] {
  return data.lessonFaultTags.filter((j) => j.lessonId === lessonId).map((j) => j.faultTagId)
}

export function annotationsForVideo(data: SwingLogData, videoId: string): Annotation[] {
  return data.annotations
    .filter((a) => a.videoId === videoId)
    .sort((a, b) => a.timestampSeconds - b.timestampSeconds)
}

export interface AssignedDrill {
  drill: Drill
  assignment: LessonDrill
}

export function drillsForLesson(data: SwingLogData, lessonId: string): AssignedDrill[] {
  return data.lessonDrills
    .filter((j) => j.lessonId === lessonId)
    .map((assignment) => {
      const drill = data.drills.find((d) => d.id === assignment.drillId)
      return drill ? { drill, assignment } : null
    })
    .filter((x): x is AssignedDrill => x !== null)
}

/**
 * Drills that address the diagnosed faults, most relevant first. A drill that
 * covers two of today's three faults outranks one that covers a single fault.
 */
export function drillsForFaults(data: SwingLogData, faultIds: string[]): Drill[] {
  if (faultIds.length === 0) return [...data.drills].sort((a, b) => a.name.localeCompare(b.name))
  const wanted = new Set(faultIds)
  return data.drills
    .map((drill) => {
      const matches = data.drillFaultTags.filter(
        (j) => j.drillId === drill.id && wanted.has(j.faultTagId),
      ).length
      return { drill, matches }
    })
    .filter((x) => x.matches > 0)
    .sort((a, b) => b.matches - a.matches || a.drill.name.localeCompare(b.drill.name))
    .map((x) => x.drill)
}

export function faultIdsForDrill(data: SwingLogData, drillId: string): string[] {
  return data.drillFaultTags.filter((j) => j.drillId === drillId).map((j) => j.faultTagId)
}

export interface FaultHistoryEntry {
  faultId: string
  name: string
  category: string
  /** How many of this student's lessons carry the fault. */
  count: number
  firstSeen: string
  lastSeen: string
  /** True when it appears in the most recent lesson that has any diagnosis. */
  active: boolean
  /** Lesson ids carrying the fault, newest first — drives then-vs-now. */
  lessonIds: string[]
}

/**
 * The question the whole app exists to answer: what keeps coming back for this
 * student, and is it still there?
 */
export function faultHistory(data: SwingLogData, studentId: string): FaultHistoryEntry[] {
  const lessons = lessonsForStudent(data, studentId)
  const diagnosed = lessons.filter((l) => faultIdsForLesson(data, l.id).length > 0)
  const mostRecentDiagnosed = diagnosed[0]
  const recentFaults = new Set(
    mostRecentDiagnosed ? faultIdsForLesson(data, mostRecentDiagnosed.id) : [],
  )

  const byFault = new Map<string, { dates: string[]; lessonIds: string[] }>()
  for (const lesson of lessons) {
    for (const faultId of faultIdsForLesson(data, lesson.id)) {
      const entry = byFault.get(faultId) ?? { dates: [], lessonIds: [] }
      entry.dates.push(lesson.lessonDate)
      entry.lessonIds.push(lesson.id)
      byFault.set(faultId, entry)
    }
  }

  return [...byFault.entries()]
    .map(([faultId, { dates, lessonIds }]) => {
      const sorted = [...dates].sort()
      const fault = getFault(faultId)
      return {
        faultId,
        name: fault?.name ?? faultId,
        category: fault?.category ?? 'Other',
        count: dates.length,
        firstSeen: sorted[0],
        lastSeen: sorted[sorted.length - 1],
        active: recentFaults.has(faultId),
        lessonIds,
      }
    })
    .sort((a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen))
}

export interface StudentSummary {
  lessonCount: number
  lastLessonDate: string | null
  recurringFaults: FaultHistoryEntry[]
  openDrillCount: number
}

export function studentSummary(data: SwingLogData, studentId: string): StudentSummary {
  const lessons = lessonsForStudent(data, studentId)
  const lessonIds = new Set(lessons.map((l) => l.id))
  const openDrillCount = data.lessonDrills.filter(
    (j) => lessonIds.has(j.lessonId) && j.completedAt === null,
  ).length
  return {
    lessonCount: lessons.length,
    lastLessonDate: lessons[0]?.lessonDate ?? null,
    recurringFaults: faultHistory(data, studentId).filter((f) => f.count > 1),
    openDrillCount,
  }
}

/** Faults the coach has diagnosed most across the whole roster. */
export function rosterTopFaults(data: SwingLogData, limit = 6): { faultId: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const { faultTagId } of data.lessonFaultTags) {
    counts.set(faultTagId, (counts.get(faultTagId) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([faultId, count]) => ({ faultId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}
