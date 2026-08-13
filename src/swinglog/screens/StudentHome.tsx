import { useMemo } from 'react'
import { useSwingLog } from '../store'
import { faultHistory, lessonsForStudent } from '../selectors'
import { LessonTimeline } from '../components/LessonTimeline'
import { formatDate, formatRelative } from '../format'
import { hrefFor } from '../router'
import { CheckIcon, SparkIcon, UsersIcon } from '../icons'

export function StudentHome({ studentId }: { studentId: string }) {
  const { data, toggleDrillComplete } = useSwingLog()

  const student = data.students.find((s) => s.id === studentId)
  const lessons = useMemo(
    () => (student ? lessonsForStudent(data, student.id) : []),
    [data, student],
  )

  /** Every drill still outstanding, newest assignment first. */
  const openDrills = useMemo(() => {
    const lessonIds = new Set(lessons.map((l) => l.id))
    return data.lessonDrills
      .filter((j) => lessonIds.has(j.lessonId) && j.completedAt === null)
      .map((assignment) => {
        const drill = data.drills.find((d) => d.id === assignment.drillId)
        const lesson = lessons.find((l) => l.id === assignment.lessonId)
        return drill && lesson ? { drill, assignment, lesson } : null
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.assignment.assignedAt.localeCompare(a.assignment.assignedAt))
  }, [data.drills, data.lessonDrills, lessons])

  const working = useMemo(
    () => (student ? faultHistory(data, student.id).filter((f) => f.active).slice(0, 4) : []),
    [data, student],
  )

  if (!student) {
    return (
      <div className="empty">
        <span className="glyph">
          <UsersIcon width={26} height={26} />
        </span>
        <h3>We can’t find your record</h3>
        <p>Ask your coach to re-send your invite code.</p>
      </div>
    )
  }

  const latest = lessons[0]

  return (
    <>
      {latest && (
        <a className="card" href={hrefFor({ name: 'lesson', lessonId: latest.id })}>
          <span className="pill active" style={{ marginBottom: 8 }}>
            <SparkIcon width={12} height={12} />
            Latest lesson
          </span>
          <div className="row between">
            <strong style={{ fontSize: '1rem' }}>{formatDate(latest.lessonDate)}</strong>
            <span className="tiny faint">{formatRelative(latest.lessonDate)}</span>
          </div>
          {latest.note && (
            <p className="tiny muted" style={{ margin: '8px 0 0' }}>
              {latest.note}
            </p>
          )}
        </a>
      )}

      {working.length > 0 && (
        <>
          <h2 className="section">What you’re working on</h2>
          <div className="chips">
            {working.map((fault) => (
              <span key={fault.faultId} className="chip static">
                {fault.name}
                {fault.count > 1 && <span className="count">×{fault.count}</span>}
              </span>
            ))}
          </div>
        </>
      )}

      <h2 className="section">
        Your drills{openDrills.length > 0 ? ` · ${openDrills.length} to do` : ''}
      </h2>
      {openDrills.length === 0 ? (
        <div className="card">
          <p className="tiny muted" style={{ margin: 0 }}>
            Nothing outstanding. Everything your coach assigned is ticked off.
          </p>
        </div>
      ) : (
        <div className="card flush">
          {openDrills.map(({ drill, lesson }) => (
            <button
              key={`${lesson.id}-${drill.id}`}
              type="button"
              className="list-row"
              onClick={() => toggleDrillComplete(lesson.id, drill.id)}
            >
              <span className="check">
                <CheckIcon width={15} height={15} />
              </span>
              <span className="grow">
                <span style={{ display: 'block', fontWeight: 650, fontSize: '0.92rem' }}>
                  {drill.name}
                </span>
                <span className="tiny muted" style={{ display: 'block' }}>
                  {drill.description}
                </span>
                <span className="tiny faint" style={{ display: 'block', marginTop: 4 }}>
                  From your lesson on {formatDate(lesson.lessonDate)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      {openDrills.length > 0 && <p className="hint">Tap a drill once you’ve practised it.</p>}

      <h2 className="section">Your lessons</h2>
      <LessonTimeline lessons={lessons} />
    </>
  )
}
