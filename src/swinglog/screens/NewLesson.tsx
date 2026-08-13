import { useEffect, useMemo, useRef, useState } from 'react'
import { useSwingLog, type DraftAnnotation } from '../store'
import { Recorder } from '../components/Recorder'
import { SwingPlayer } from '../components/SwingPlayer'
import { FaultPicker } from '../components/FaultPicker'
import { DrillPicker } from '../components/DrillPicker'
import { captureThumbnail, formatBytes, formatDuration, loadVideoMetadata } from '../media'
import { ANGLE_LABELS, fromDateInputValue, initialsOf, toDateInputValue } from '../format'
import { faultName } from '../taxonomy'
import { navigate } from '../router'
import type { CaptureAngle, Shape } from '../types'
import { newId } from '../types'
import { AlertIcon, CameraIcon, CheckIcon, FilmIcon, PlusIcon } from '../icons'

interface VideoDraft {
  blob: Blob
  url: string
  thumb: Blob | null
  mimeType: string
  durationSeconds: number
}

const STEPS = ['Student', 'Clip', 'Review', 'Diagnose', 'Drills'] as const

export function NewLesson({ studentId: initialStudentId }: { studentId: string | null }) {
  const { data, tier, saveLesson } = useSwingLog()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [step, setStep] = useState(initialStudentId ? 1 : 0)
  const [studentId, setStudentId] = useState(initialStudentId ?? '')
  const [lessonDate, setLessonDate] = useState(() => new Date().toISOString())
  const [recording, setRecording] = useState(false)
  const [video, setVideo] = useState<VideoDraft | null>(null)
  const [angle, setAngle] = useState<CaptureAngle>('down_the_line')
  const [annotations, setAnnotations] = useState<(DraftAnnotation & { id: string })[]>([])
  const [faultIds, setFaultIds] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [drillIds, setDrillIds] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // While the pen is out, the sticky footer would sit on top of the toolbar.
  const [drawing, setDrawing] = useState(false)

  const student = data.students.find((s) => s.id === studentId)

  // The draft clip only exists in memory until the lesson is saved.
  useEffect(() => {
    if (!video) return
    return () => URL.revokeObjectURL(video.url)
  }, [video])

  const acceptClip = async (blob: Blob, mimeType: string) => {
    setRecording(false)
    setError(null)
    setBusy('Reading the clip…')
    try {
      const meta = await loadVideoMetadata(blob)
      const thumb = await captureThumbnail(blob)
      setVideo({
        blob,
        url: URL.createObjectURL(blob),
        thumb,
        mimeType: mimeType || blob.type || 'video/webm',
        durationSeconds: meta.durationSeconds,
      })
      setStep(2)
    } catch {
      setError('That clip could not be read. Try a different file or record it in the app.')
    } finally {
      setBusy(null)
    }
  }

  const onFilePicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void acceptClip(file, file.type)
  }

  const addAnnotation = (a: { timestampSeconds: number; shapes: Shape[]; label: string }) => {
    setAnnotations((prev) => [...prev, { ...a, id: newId() }])
  }

  const canSave = Boolean(student) && !busy
  const suggestedDrillCount = useMemo(() => drillIds.length, [drillIds])

  const save = async () => {
    if (!student) return
    setBusy('Saving…')
    setError(null)
    const result = await saveLesson({
      studentId: student.id,
      lessonDate,
      note,
      faultTagIds: faultIds,
      drillIds,
      video: video
        ? {
            blob: video.blob,
            thumb: video.thumb,
            angle,
            durationSeconds: video.durationSeconds,
            mimeType: video.mimeType,
          }
        : null,
      annotations: annotations.map(({ timestampSeconds, shapes, label }) => ({
        timestampSeconds,
        shapes,
        label,
      })),
    })
    setBusy(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    navigate({ name: 'lesson', lessonId: result.lessonId })
  }

  if (!tier.canAddLesson) {
    return (
      <div className="empty">
        <span className="glyph">
          <AlertIcon width={26} height={26} />
        </span>
        <h3>Free plan limit reached</h3>
        <p>
          You’ve logged {tier.lessonCount} lessons. Upgrade to keep the record going for every
          student.
        </p>
        <a className="btn btn-primary" href="#/settings">
          See plans
        </a>
      </div>
    )
  }

  if (recording) {
    return <Recorder onCaptured={(blob, type) => void acceptClip(blob, type)} onCancel={() => setRecording(false)} />
  }

  return (
    <>
      <div className="steps" aria-hidden="true">
        {STEPS.map((label, i) => (
          <span key={label} className={`step${i < step ? ' done' : i === step ? ' current' : ''}`} />
        ))}
      </div>

      {error && (
        <div className="banner error">
          <AlertIcon width={18} height={18} />
          <span>{error}</span>
        </div>
      )}
      {busy && (
        <div className="banner info">
          <span>{busy}</span>
        </div>
      )}

      {/* ---- step 0: who is this for ---- */}
      {step === 0 && (
        <>
          <h2 className="section">Who is this lesson for?</h2>
          {data.students.length === 0 ? (
            <div className="empty">
              <h3>No students yet</h3>
              <p>Add a student before logging a lesson.</p>
              <a className="btn btn-primary" href="#/students/new">
                <PlusIcon width={18} height={18} />
                Add a student
              </a>
            </div>
          ) : (
            <div className="card flush">
              {data.students.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="list-row"
                  onClick={() => {
                    setStudentId(s.id)
                    setStep(1)
                  }}
                >
                  <span className="avatar">{initialsOf(s.name)}</span>
                  <span className="grow" style={{ fontWeight: 650 }}>
                    {s.name}
                  </span>
                  {studentId === s.id && <CheckIcon width={18} height={18} />}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ---- step 1: get a clip ---- */}
      {step === 1 && (
        <>
          <h2 className="section">Lesson with {student?.name}</h2>
          <div className="card">
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="label">Lesson date</span>
              <input
                type="date"
                value={toDateInputValue(lessonDate)}
                onChange={(e) => setLessonDate(fromDateInputValue(e.target.value))}
              />
            </label>
          </div>

          <h2 className="section">Capture the swing</h2>
          <div className="stack">
            <button type="button" className="btn btn-primary btn-block" onClick={() => setRecording(true)}>
              <CameraIcon width={18} height={18} />
              Record now
            </button>
            <button
              type="button"
              className="btn btn-block"
              onClick={() => fileInputRef.current?.click()}
            >
              <FilmIcon width={18} height={18} />
              Upload a clip
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              hidden
              onChange={onFilePicked}
            />
          </div>
          <p className="hint">
            The clip is saved to this device first, so a patchy range signal never costs you a
            lesson. Backup runs later if you’ve connected it.
          </p>

          <div className="actionbar">
            <button type="button" className="btn grow" onClick={() => setStep(0)}>
              Back
            </button>
            <button type="button" className="btn grow" onClick={() => setStep(3)}>
              Skip video
            </button>
          </div>
        </>
      )}

      {/* ---- step 2: review and annotate ---- */}
      {step === 2 && video && (
        <>
          <SwingPlayer
            src={video.url}
            editable
            annotations={annotations.map((a) => ({
              id: a.id,
              timestampSeconds: a.timestampSeconds,
              shapes: a.shapes,
              label: a.label,
            }))}
            onAddAnnotation={addAnnotation}
            onDeleteAnnotation={(id) => setAnnotations((prev) => prev.filter((a) => a.id !== id))}
            onDrawModeChange={setDrawing}
          />

          <h2 className="section">Camera angle</h2>
          <div className="chips">
            {(Object.keys(ANGLE_LABELS) as CaptureAngle[]).map((value) => (
              <button
                key={value}
                type="button"
                className={`chip${angle === value ? ' selected' : ''}`}
                onClick={() => setAngle(value)}
              >
                {ANGLE_LABELS[value]}
              </button>
            ))}
          </div>

          <p className="hint">
            {formatDuration(video.durationSeconds)} · {formatBytes(video.blob.size)} ·{' '}
            {annotations.length} annotated {annotations.length === 1 ? 'frame' : 'frames'}
          </p>

          {!drawing && (
            <div className="actionbar">
              <button
                type="button"
                className="btn grow"
                onClick={() => {
                  setVideo(null)
                  setAnnotations([])
                  setStep(1)
                }}
              >
                Retake
              </button>
              <button type="button" className="btn btn-primary grow" onClick={() => setStep(3)}>
                Add diagnosis
              </button>
            </div>
          )}
        </>
      )}

      {/* ---- step 3: diagnose ---- */}
      {step === 3 && (
        <>
          <h2 className="section">What did you see?</h2>
          <FaultPicker selected={faultIds} onChange={setFaultIds} pinned={data.pinnedFaultIds} />

          <h2 className="section">Note</h2>
          <textarea
            value={note}
            placeholder="Anything you told them that the tags don’t capture…"
            onChange={(e) => setNote(e.target.value)}
          />

          <div className="actionbar">
            <button type="button" className="btn grow" onClick={() => setStep(video ? 2 : 1)}>
              Back
            </button>
            <button type="button" className="btn btn-primary grow" onClick={() => setStep(4)}>
              {faultIds.length > 0 ? 'Pick a drill' : 'Skip to drills'}
            </button>
          </div>
        </>
      )}

      {/* ---- step 4: assign drills ---- */}
      {step === 4 && (
        <>
          <h2 className="section">Assign a drill</h2>
          <DrillPicker faultIds={faultIds} selected={drillIds} onChange={setDrillIds} />

          <h2 className="section">Ready to save</h2>
          <div className="card">
            <p className="tiny muted" style={{ marginTop: 0 }}>
              <strong style={{ color: 'var(--ink)' }}>{student?.name}</strong> ·{' '}
              {video ? `${formatDuration(video.durationSeconds)} clip` : 'no clip'} ·{' '}
              {faultIds.length} {faultIds.length === 1 ? 'fault' : 'faults'} ·{' '}
              {suggestedDrillCount} {suggestedDrillCount === 1 ? 'drill' : 'drills'}
            </p>
            {faultIds.length > 0 && (
              <div className="chips">
                {faultIds.map((id) => (
                  <span key={id} className="chip static">
                    {faultName(id)}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="actionbar">
            <button type="button" className="btn grow" onClick={() => setStep(3)}>
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary grow"
              onClick={() => void save()}
              disabled={!canSave}
            >
              Save lesson
            </button>
          </div>
        </>
      )}
    </>
  )
}
