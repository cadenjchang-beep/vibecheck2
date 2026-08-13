import { useMemo, useState } from 'react'
import { useSwingLog } from '../store'
import { rosterTopFaults, studentSummary } from '../selectors'
import { faultName } from '../taxonomy'
import { formatRelative, initialsOf } from '../format'
import { hrefFor } from '../router'
import { AlertIcon, ChevronRightIcon, PlusIcon, SearchIcon, UsersIcon } from '../icons'

export function CoachDashboard() {
  const { data, tier } = useSwingLog()
  const [query, setQuery] = useState('')

  const students = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? data.students.filter((s) => s.name.toLowerCase().includes(q))
      : [...data.students]
    // Whoever you saw least recently floats up — that is the one you are most
    // likely to be looking for before a lesson.
    return list
      .map((student) => ({ student, summary: studentSummary(data, student.id) }))
      .sort((a, b) => {
        const aDate = a.summary.lastLessonDate ?? ''
        const bDate = b.summary.lastLessonDate ?? ''
        return bDate.localeCompare(aDate) || a.student.name.localeCompare(b.student.name)
      })
  }, [data, query])

  const topFaults = useMemo(() => rosterTopFaults(data, 5), [data])

  if (data.students.length === 0) {
    return (
      <>
        <div className="empty">
          <span className="glyph">
            <UsersIcon width={26} height={26} />
          </span>
          <h3>No students yet</h3>
          <p>Add your first student, then log a lesson against them. Takes about a minute.</p>
          <a className="btn btn-primary" href={hrefFor({ name: 'addStudent' })}>
            <PlusIcon width={18} height={18} />
            Add a student
          </a>
        </div>
      </>
    )
  }

  return (
    <>
      {!tier.paid && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="row between" style={{ marginBottom: 8 }}>
            <strong style={{ fontSize: '0.86rem' }}>Free plan</strong>
            <span className="tiny muted mono-num">
              {tier.studentCount}/{tier.maxStudents} students · {tier.lessonCount}/{tier.maxLessons}{' '}
              lessons
            </span>
          </div>
          <div className={`meter${tier.canAddLesson ? '' : ' warn'}`}>
            <span
              style={{
                width: `${Math.min(100, ((tier.lessonCount / (tier.maxLessons ?? 1)) * 100) || 0)}%`,
              }}
            />
          </div>
          {(!tier.canAddLesson || !tier.canAddStudent) && (
            <p className="tiny muted" style={{ marginBottom: 0, marginTop: 8 }}>
              You’ve hit a free-plan limit.{' '}
              <a href={hrefFor({ name: 'settings' })}>Upgrade in Settings</a> to keep logging.
            </p>
          )}
        </div>
      )}

      {data.students.length > 4 && (
        <div className="searchbox">
          <SearchIcon width={18} height={18} />
          <input
            type="text"
            value={query}
            placeholder="Find a student…"
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Find a student"
          />
        </div>
      )}

      <h2 className="section">
        Roster · {data.students.length} {data.students.length === 1 ? 'student' : 'students'}
      </h2>

      {students.length === 0 ? (
        <p className="muted tiny">No student matches “{query}”.</p>
      ) : (
        <div className="card flush">
          {students.map(({ student, summary }) => {
            const recurring = summary.recurringFaults[0]
            return (
              <a key={student.id} className="list-row" href={hrefFor({ name: 'student', studentId: student.id })}>
                <span className="avatar">{initialsOf(student.name)}</span>
                <span className="grow">
                  <span style={{ display: 'block', fontWeight: 650 }}>{student.name}</span>
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {summary.lessonCount === 0
                      ? 'No lessons logged'
                      : `${summary.lessonCount} ${summary.lessonCount === 1 ? 'lesson' : 'lessons'} · ${formatRelative(summary.lastLessonDate ?? '')}`}
                  </span>
                  {(recurring || summary.openDrillCount > 0) && (
                    <span className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                      {recurring && (
                        <span className="pill active">
                          <AlertIcon width={12} height={12} />
                          {faultName(recurring.faultId)} ×{recurring.count}
                        </span>
                      )}
                      {summary.openDrillCount > 0 && (
                        <span className="pill">{summary.openDrillCount} drill open</span>
                      )}
                    </span>
                  )}
                </span>
                <ChevronRightIcon width={18} height={18} style={{ color: 'var(--faint)' }} />
              </a>
            )
          })}
        </div>
      )}

      <a
        className="btn btn-block"
        style={{ marginTop: 12 }}
        href={hrefFor({ name: 'addStudent' })}
      >
        <PlusIcon width={18} height={18} />
        Add a student
      </a>

      {topFaults.length > 0 && (
        <>
          <h2 className="section">What you’re seeing most</h2>
          <div className="chips">
            {topFaults.map(({ faultId, count }) => (
              <span key={faultId} className="chip static">
                {faultName(faultId)}
                <span className="count">{count}</span>
              </span>
            ))}
          </div>
        </>
      )}

      <a className="fab" href={hrefFor({ name: 'newLesson', studentId: null })}>
        <PlusIcon width={20} height={20} />
        New lesson
      </a>
    </>
  )
}
