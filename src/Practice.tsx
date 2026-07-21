import { useMemo, useState } from 'react'
import { formatDate } from './RoundCard'
import type { PracticeDraft, PracticeSession, PracticeType } from './types'
import { PRACTICE_TYPE_LABELS } from './types'

interface Props {
  sessions: PracticeSession[]
  onSave: (draft: PracticeDraft, editingId: string | null) => void
  onDelete: (id: string) => void
}

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  type: 'range' as PracticeType,
  durationMin: '',
  ballsHit: '',
  focus: '',
  drills: '',
  rating: '',
  notes: '',
}

type FormState = typeof emptyForm

function optionalNum(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : undefined
}

function Stars({ rating }: { rating: number }) {
  return <span className="stars">{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</span>
}

function SessionCard({
  session,
  onEdit,
  onDelete,
}: {
  session: PracticeSession
  onEdit: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <article className="round-card">
      <button
        type="button"
        className="round-card-header"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <div className="round-card-main">
          <span className="round-course">{PRACTICE_TYPE_LABELS[session.type]}</span>
          <span className="round-date">
            {formatDate(session.date)}
            {session.focus ? ` · ${session.focus}` : ''}
          </span>
        </div>
        <div className="round-card-score practice-side">
          {session.durationMin !== undefined && (
            <span className="practice-duration">{session.durationMin} min</span>
          )}
          {session.rating !== undefined && <Stars rating={session.rating} />}
        </div>
      </button>

      {expanded && (
        <div className="round-card-body">
          {session.ballsHit !== undefined && (
            <p className="round-meta"><strong>{session.ballsHit}</strong> balls hit</p>
          )}
          {session.drills && (
            <p className="round-journal-p"><span className="journal-label good">Drills</span> {session.drills}</p>
          )}
          {session.notes && (
            <p className="round-journal-p"><span className="journal-label">Notes</span> {session.notes}</p>
          )}
          <div className="round-actions">
            <button type="button" onClick={onEdit}>Edit</button>
            {confirmDelete ? (
              <>
                <button type="button" className="danger" onClick={onDelete}>Confirm delete</button>
                <button type="button" onClick={() => setConfirmDelete(false)}>Keep</button>
              </>
            ) : (
              <button type="button" className="danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  )
}

export default function Practice({ sessions, onSave, onDelete }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)

  const set = (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }))

  const sorted = useMemo(
    () =>
      [...sessions].sort((a, b) =>
        a.date === b.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date),
      ),
    [sessions],
  )

  const totalMinutes = sessions.reduce((s, p) => s + (p.durationMin ?? 0), 0)
  const thisMonth = new Date().toISOString().slice(0, 7)
  const monthCount = sessions.filter((p) => p.date.startsWith(thisMonth)).length

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.date) return
    onSave(
      {
        date: form.date,
        type: form.type,
        durationMin: optionalNum(form.durationMin),
        ballsHit: optionalNum(form.ballsHit),
        focus: form.focus.trim() || undefined,
        drills: form.drills.trim() || undefined,
        rating: optionalNum(form.rating),
        notes: form.notes.trim() || undefined,
      },
      editingId,
    )
    setForm(emptyForm)
    setEditingId(null)
  }

  const startEdit = (s: PracticeSession) => {
    setEditingId(s.id)
    setForm({
      date: s.date,
      type: s.type,
      durationMin: s.durationMin?.toString() ?? '',
      ballsHit: s.ballsHit?.toString() ?? '',
      focus: s.focus ?? '',
      drills: s.drills ?? '',
      rating: s.rating?.toString() ?? '',
      notes: s.notes ?? '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      {sessions.length > 0 && (
        <section className="stats" aria-label="Practice statistics">
          <div className="stat">
            <span className="stat-value">{sessions.length}</span>
            <span className="stat-label">sessions</span>
          </div>
          <div className="stat">
            <span className="stat-value">{(totalMinutes / 60).toFixed(1)}h</span>
            <span className="stat-label">total time</span>
          </div>
          <div className="stat">
            <span className="stat-value">{monthCount}</span>
            <span className="stat-label">this month</span>
          </div>
        </section>
      )}

      <form className="round-form" onSubmit={handleSubmit}>
        <h2>{editingId ? 'Edit practice session' : 'Log practice'}</h2>
        <div className="form-grid">
          <label>
            Date
            <input type="date" value={form.date} onChange={set('date')} required />
          </label>
          <label>
            Type
            <select value={form.type} onChange={set('type')}>
              {(Object.keys(PRACTICE_TYPE_LABELS) as PracticeType[]).map((t) => (
                <option key={t} value={t}>
                  {PRACTICE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Minutes
            <input type="number" min="0" value={form.durationMin} onChange={set('durationMin')} placeholder="60" />
          </label>
          <label>
            Balls hit
            <input type="number" min="0" value={form.ballsHit} onChange={set('ballsHit')} />
          </label>
          <label>
            Session quality
            <select value={form.rating} onChange={set('rating')}>
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {'★'.repeat(n)}
                </option>
              ))}
            </select>
          </label>
          <label className="span-2">
            Focus
            <input type="text" value={form.focus} onChange={set('focus')} placeholder="Wedge distance control" />
          </label>
        </div>
        <label className="full">
          Drills
          <textarea rows={2} value={form.drills} onChange={set('drills')} placeholder="Ladder drill 50/75/100y, 3-6-9 ft putting circuit…" />
        </label>
        <label className="full">
          Notes
          <textarea rows={2} value={form.notes} onChange={set('notes')} placeholder="What clicked? What still feels off?" />
        </label>
        <div className="form-actions">
          <button type="submit" className="primary">
            {editingId ? 'Save changes' : 'Add session'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null)
                setForm(emptyForm)
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <section className="rounds" aria-label="Practice sessions">
        {sorted.length === 0 ? (
          <p className="empty">No practice logged yet. Range time counts double if you write it down. 🏌️</p>
        ) : (
          sorted.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              onEdit={() => startEdit(s)}
              onDelete={() => {
                onDelete(s.id)
                if (editingId === s.id) {
                  setEditingId(null)
                  setForm(emptyForm)
                }
              }}
            />
          ))
        )}
      </section>
    </>
  )
}
