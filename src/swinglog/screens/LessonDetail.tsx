import { useMemo, useState } from 'react'
import { useSwingLog } from '../store'
import {
  annotationsForVideo,
  drillsForLesson,
  faultIdsForLesson,
  lessonsForStudent,
  videoForLesson,
} from '../selectors'
import { SwingPlayer } from '../components/SwingPlayer'
import { FaultPicker } from '../components/FaultPicker'
import { DrillPicker } from '../components/DrillPicker'
import { formatBytes, formatDuration, useMediaUrl } from '../media'
import { ANGLE_LABELS, formatDate, formatRelative } from '../format'
import { faultName, getFault } from '../taxonomy'
import { hrefFor, navigate } from '../router'
import {
  AlertIcon,
  CheckIcon,
  CloudIcon,
  FilmIcon,
  PhoneIcon,
  TrashIcon,
} from '../icons'

export function LessonDetail({ lessonId }: { lessonId: string }) {
  const {
    data,
    session,
    updateLessonNote,
    setLessonFaults,
    setLessonDrills,
    toggleDrillComplete,
    deleteLesson,
    addAnnotation,
    deleteAnnotation,
  } = useSwingLog()

  const readOnly = session?.role === 'student'
  const lesson = data.lessons.find((l) => l.id === lessonId)
  const video = lesson ? videoForLesson(data, lesson.id) : undefined
  const videoUrl = useMediaUrl(video?.mediaKey)

  const [editingFaults, setEditingFaults] = useState(false)
  const [editingDrills, setEditingDrills] = useState(false)
  const [noteDraft, setNoteDraft] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const faultIds = useMemo(() => (lesson ? faultIdsForLesson(data, lesson.id) : []), [data, lesson])
  const drills = useMemo(() => (lesson ? drillsForLesson(data, lesson.id) : []), [data, lesson])
  const annotations = useMemo(
    () => (video ? annotationsForVideo(data, video.id) : []),
    [data, video],
  )

  const student = lesson ? data.students.find((s) => s.id === lesson.studentId) : undefined

  /** Earlier lessons that carried any of today's faults — the "then vs now" hook. */
  const priorWithSameFault = useMemo(() => {
    if (!lesson || faultIds.length === 0 || !student) return []
    const wanted = new Set(faultIds)
    return lessonsForStudent(data, student.id)
      .filter((l) => l.id !== lesson.id && l.lessonDate < lesson.lessonDate)
      .map((l) => ({ lesson: l, shared: faultIdsForLesson(data, l.id).filter((f) => wanted.has(f)) }))
      .filter((x) => x.shared.length > 0)
      .slice(0, 3)
  }, [data, faultIds, lesson, student])

  if (!lesson || !student) {
    return (
      <div className="empty">
        <span className="glyph">
          <FilmIcon width={26} height={26} />
        </span>
        <h3>Lesson not found</h3>
        <p>It may have been deleted.</p>
        <a className="btn" href={hrefFor({ name: 'dashboard' })}>
          Back
        </a>
      </div>
    )
  }

  return (
    <>
      <div className="row between" style={{ marginBottom: 14 }}>
        <div>
          <h2 className="display" style={{ fontSize: '1.2rem' }}>
            {formatDate(lesson.lessonDate)}
          </h2>
          <p className="tiny muted" style={{ margin: '2px 0 0' }}>
            {student.name} · {formatRelative(lesson.lessonDate)}
          </p>
        </div>
        {!readOnly && (
          <a className="btn btn-sm" href={hrefFor({ name: 'student', studentId: student.id })}>
            Timeline
          </a>
        )}
      </div>

      {video && videoUrl ? (
        <SwingPlayer
          src={videoUrl}
          editable={!readOnly}
          annotations={annotations.map((a) => ({
            id: a.id,
            timestampSeconds: a.timestampSeconds,
            shapes: a.drawingData.shapes,
            label: a.label,
          }))}
          onAddAnnotation={(a) => addAnnotation(video.id, a)}
          onDeleteAnnotation={deleteAnnotation}
        />
      ) : video ? (
        <div className="card">
          <div className="banner warn" style={{ marginBottom: 0 }}>
            <AlertIcon width={18} height={18} />
            <span>
              The clip for this lesson isn’t on this device.{' '}
              {video.uploadState === 'uploaded'
                ? 'It is backed up, so it will come back when this device re-syncs.'
                : 'It was recorded on another device.'}
            </span>
          </div>
        </div>
      ) : (
        <div className="card">
          <p className="tiny muted" style={{ margin: 0 }}>
            No video was attached to this lesson.
          </p>
        </div>
      )}

      {video && (
        <p className="hint">
          {ANGLE_LABELS[video.angle]} · {formatDuration(video.durationSeconds)} ·{' '}
          {formatBytes(video.sizeBytes)} ·{' '}
          {video.uploadState === 'uploaded' ? (
            <>
              <CloudIcon width={12} height={12} style={{ verticalAlign: '-2px' }} /> backed up
            </>
          ) : (
            <>
              <PhoneIcon width={12} height={12} style={{ verticalAlign: '-2px' }} /> on this device
            </>
          )}
          {video.uploadError && ` · last backup attempt failed: ${video.uploadError}`}
        </p>
      )}

      {/* ---- diagnosis ---- */}
      <div className="row between" style={{ marginTop: 22 }}>
        <h2 className="section" style={{ margin: 0 }}>
          Diagnosis
        </h2>
        {!readOnly && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditingFaults((v) => !v)}>
            {editingFaults ? 'Done' : 'Edit'}
          </button>
        )}
      </div>

      {editingFaults ? (
        <FaultPicker
          selected={faultIds}
          onChange={(next) => setLessonFaults(lesson.id, next)}
          pinned={data.pinnedFaultIds}
        />
      ) : faultIds.length === 0 ? (
        <p className="tiny muted">No fault was tagged on this lesson.</p>
      ) : (
        <div className="stack">
          {faultIds.map((id) => {
            const fault = getFault(id)
            return (
              <div className="card" key={id} style={{ padding: 14 }}>
                <strong style={{ fontSize: '0.94rem' }}>{fault?.name ?? id}</strong>
                <p className="tiny muted" style={{ margin: '4px 0 0' }}>
                  {fault?.category}
                  {fault?.description ? ` · ${fault.description}` : ''}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* ---- note ---- */}
      <h2 className="section">Note</h2>
      {readOnly ? (
        <div className="card">
          <p style={{ margin: 0, fontSize: '0.92rem' }} className={lesson.note ? '' : 'muted'}>
            {lesson.note || 'No note on this lesson.'}
          </p>
        </div>
      ) : (
        <textarea
          value={noteDraft ?? lesson.note}
          placeholder="Anything the tags don’t capture…"
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={() => {
            if (noteDraft !== null) {
              updateLessonNote(lesson.id, noteDraft.trim())
              setNoteDraft(null)
            }
          }}
        />
      )}

      {/* ---- drills ---- */}
      <div className="row between" style={{ marginTop: 22 }}>
        <h2 className="section" style={{ margin: 0 }}>
          Drills
        </h2>
        {!readOnly && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditingDrills((v) => !v)}>
            {editingDrills ? 'Done' : 'Edit'}
          </button>
        )}
      </div>

      {editingDrills ? (
        <DrillPicker
          faultIds={faultIds}
          selected={drills.map((d) => d.drill.id)}
          onChange={(next) => setLessonDrills(lesson.id, next)}
        />
      ) : drills.length === 0 ? (
        <p className="tiny muted">No drill was assigned.</p>
      ) : (
        <div className="card flush">
          {drills.map(({ drill, assignment }) => (
            <button
              key={drill.id}
              type="button"
              className="list-row"
              onClick={() => toggleDrillComplete(lesson.id, drill.id)}
              aria-pressed={assignment.completedAt !== null}
            >
              <span className={`check${assignment.completedAt ? ' on' : ''}`}>
                <CheckIcon width={15} height={15} />
              </span>
              <span className="grow">
                <span style={{ display: 'block', fontWeight: 650, fontSize: '0.92rem' }}>
                  {drill.name}
                </span>
                <span className="tiny muted" style={{ display: 'block' }}>
                  {drill.description}
                </span>
                {assignment.completedAt && (
                  <span className="pill done" style={{ marginTop: 6 }}>
                    Practised {formatRelative(assignment.completedAt)}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ---- then vs now ---- */}
      {priorWithSameFault.length > 0 && (
        <>
          <h2 className="section">Seen before</h2>
          <div className="card flush">
            {priorWithSameFault.map(({ lesson: prior, shared }) => (
              <a key={prior.id} className="list-row" href={hrefFor({ name: 'lesson', lessonId: prior.id })}>
                <span className="grow">
                  <span style={{ display: 'block', fontWeight: 650, fontSize: '0.92rem' }}>
                    {formatDate(prior.lessonDate)}
                  </span>
                  <span className="tiny muted">
                    Same {shared.length === 1 ? 'fault' : 'faults'}: {shared.map(faultName).join(', ')}
                  </span>
                </span>
              </a>
            ))}
          </div>
          <p className="hint">Open an earlier lesson to compare it against today’s clip.</p>
        </>
      )}

      {!readOnly && (
        <>
          <hr className="divider" />
          {confirmingDelete ? (
            <div className="card">
              <p style={{ marginTop: 0, fontSize: '0.9rem' }}>
                Delete this lesson and its clip? This cannot be undone.
              </p>
              <div className="row">
                <button type="button" className="btn grow" onClick={() => setConfirmingDelete(false)}>
                  Keep it
                </button>
                <button
                  type="button"
                  className="btn btn-danger grow"
                  onClick={() => {
                    deleteLesson(lesson.id)
                    navigate({ name: 'student', studentId: student.id })
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-danger btn-block btn-sm"
              onClick={() => setConfirmingDelete(true)}
            >
              <TrashIcon width={16} height={16} />
              Delete lesson
            </button>
          )}
        </>
      )}
    </>
  )
}
