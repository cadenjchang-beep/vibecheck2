import { useMemo, useState } from 'react'
import { useSwingLog } from '../store'
import { faultHistory, lessonsForStudent } from '../selectors'
import { LessonTimeline } from '../components/LessonTimeline'
import { formatDate, initialsOf } from '../format'
import { hrefFor, navigate } from '../router'
import { AlertIcon, PlusIcon, TrashIcon, UsersIcon } from '../icons'

export function StudentProfile({ studentId }: { studentId: string }) {
  const { data, deleteStudent, previewStudent, tier } = useSwingLog()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const student = data.students.find((s) => s.id === studentId)
  const lessons = useMemo(
    () => (student ? lessonsForStudent(data, student.id) : []),
    [data, student],
  )
  const history = useMemo(
    () => (student ? faultHistory(data, student.id) : []),
    [data, student],
  )

  if (!student) {
    return (
      <div className="empty">
        <span className="glyph">
          <UsersIcon width={26} height={26} />
        </span>
        <h3>Student not found</h3>
        <p>They may have been removed from your roster.</p>
        <a className="btn" href={hrefFor({ name: 'dashboard' })}>
          Back to roster
        </a>
      </div>
    )
  }

  const recurring = history.filter((f) => f.count > 1)

  return (
    <>
      <div className="card">
        <div className="row">
          <span className="avatar lg">{initialsOf(student.name)}</span>
          <div className="grow">
            <h2 className="display" style={{ fontSize: '1.24rem' }}>
              {student.name}
            </h2>
            <p className="tiny muted" style={{ margin: '2px 0 0' }}>
              {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'} since{' '}
              {formatDate(student.createdAt)}
            </p>
          </div>
        </div>

        <hr className="divider" />

        <div className="row between">
          <div>
            <p className="tiny muted" style={{ margin: 0 }}>
              Invite code
            </p>
            <p className="code" style={{ margin: '2px 0 0' }}>
              {student.inviteCode}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => previewStudent(student.id)}
          >
            Preview their view
          </button>
        </div>
        <p className="hint">
          {student.linkedUserId
            ? 'This student has opened their timeline.'
            : 'Give them this code to unlock their own read-only timeline and drill list.'}
        </p>
      </div>

      {recurring.length > 0 && (
        <>
          <h2 className="section">Recurring faults</h2>
          <div className="card flush">
            {recurring.map((fault) => (
              <div className="list-row" key={fault.faultId} style={{ cursor: 'default' }}>
                <span className="grow">
                  <span style={{ display: 'block', fontWeight: 650, fontSize: '0.92rem' }}>
                    {fault.name}
                  </span>
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {fault.count} lessons · first seen {formatDate(fault.firstSeen)} · last{' '}
                    {formatDate(fault.lastSeen)}
                  </span>
                </span>
                <span className={`pill${fault.active ? ' active' : ' done'}`}>
                  {fault.active ? (
                    <>
                      <AlertIcon width={12} height={12} />
                      Still there
                    </>
                  ) : (
                    'Not last time'
                  )}
                </span>
              </div>
            ))}
          </div>
          <p className="hint">
            “Still there” means the fault showed up again in the most recent lesson you diagnosed.
          </p>
        </>
      )}

      <h2 className="section">Lesson history</h2>
      <LessonTimeline lessons={lessons} />

      <hr className="divider" />

      {confirmingDelete ? (
        <div className="card">
          <p style={{ marginTop: 0, fontSize: '0.9rem' }}>
            Remove <strong>{student.name}</strong> and all {lessons.length} of their lessons,
            including the video clips on this device? This cannot be undone.
          </p>
          <div className="row">
            <button type="button" className="btn grow" onClick={() => setConfirmingDelete(false)}>
              Keep them
            </button>
            <button
              type="button"
              className="btn btn-danger grow"
              onClick={() => {
                deleteStudent(student.id)
                navigate({ name: 'dashboard' })
              }}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-danger btn-block btn-sm" onClick={() => setConfirmingDelete(true)}>
          <TrashIcon width={16} height={16} />
          Remove student
        </button>
      )}

      {tier.canAddLesson && (
        <a className="fab" href={hrefFor({ name: 'newLesson', studentId: student.id })}>
          <PlusIcon width={20} height={20} />
          New lesson
        </a>
      )}
    </>
  )
}
