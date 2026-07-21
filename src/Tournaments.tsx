import { useMemo, useState } from 'react'
import { formatDate } from './RoundCard'
import { TrophyIcon } from './icons'
import type { GolfRound, Tournament, TournamentDraft } from './types'
import { formatToPar, toPar } from './types'

interface Props {
  tournaments: Tournament[]
  rounds: GolfRound[]
  onSave: (draft: TournamentDraft, editingId: string | null) => void
  onDelete: (id: string) => void
}

const emptyForm = {
  name: '',
  course: '',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  position: '',
  fieldSize: '',
  notes: '',
}

type FormState = typeof emptyForm

function optionalNum(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : undefined
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

function TournamentCard({
  tournament,
  rounds,
  onEdit,
  onDelete,
}: {
  tournament: Tournament
  rounds: GolfRound[]
  onEdit: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const linked = rounds
    .filter((r) => r.tournamentId === tournament.id)
    .sort((a, b) => a.date.localeCompare(b.date))
  const total = linked.reduce((s, r) => s + r.score, 0)
  const totalToPar = linked.reduce((s, r) => s + toPar(r), 0)

  return (
    <article className="round-card">
      <button
        type="button"
        className="round-card-header"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <div className="round-card-main">
          <span className="round-course">
            <TrophyIcon size={16} />
            {tournament.name}
          </span>
          <span className="round-date">
            {formatDate(tournament.startDate)}
            {tournament.endDate ? ` – ${formatDate(tournament.endDate)}` : ''}
            {tournament.course ? ` · ${tournament.course}` : ''}
          </span>
        </div>
        <div className="round-card-score">
          {tournament.position !== undefined && (
            <span className="tournament-result">
              {ordinal(tournament.position)}
              {tournament.fieldSize ? ` / ${tournament.fieldSize}` : ''}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="round-card-body">
          {linked.length > 0 ? (
            <>
              <table className="tournament-rounds">
                <tbody>
                  {linked.map((r, i) => (
                    <tr key={r.id}>
                      <td>R{i + 1}</td>
                      <td>{formatDate(r.date)}</td>
                      <td className="num">{r.score}</td>
                      <td className="num">{formatToPar(toPar(r))}</td>
                    </tr>
                  ))}
                  {linked.length > 1 && (
                    <tr className="tournament-total">
                      <td colSpan={2}>Total</td>
                      <td className="num">{total}</td>
                      <td className="num">{formatToPar(totalToPar)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          ) : (
            <p className="round-meta">
              No rounds linked yet — log a round with type “Tournament” and pick this event.
            </p>
          )}
          {tournament.notes && (
            <p className="round-journal-p"><span className="journal-label">Notes</span> {tournament.notes}</p>
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

export default function Tournaments({ tournaments, rounds, onSave, onDelete }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)

  const set = (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }))

  const sorted = useMemo(
    () => [...tournaments].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [tournaments],
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.startDate) return
    onSave(
      {
        name: form.name.trim(),
        course: form.course.trim() || undefined,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        position: optionalNum(form.position),
        fieldSize: optionalNum(form.fieldSize),
        notes: form.notes.trim() || undefined,
      },
      editingId,
    )
    setForm(emptyForm)
    setEditingId(null)
  }

  const startEdit = (t: Tournament) => {
    setEditingId(t.id)
    setForm({
      name: t.name,
      course: t.course ?? '',
      startDate: t.startDate,
      endDate: t.endDate ?? '',
      position: t.position?.toString() ?? '',
      fieldSize: t.fieldSize?.toString() ?? '',
      notes: t.notes ?? '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <form className="round-form" onSubmit={handleSubmit}>
        <h2>{editingId ? 'Edit tournament' : 'Add a tournament'}</h2>
        <div className="form-grid">
          <label className="span-2">
            Name
            <input type="text" value={form.name} onChange={set('name')} placeholder="Club Championship" required />
          </label>
          <label>
            Course
            <input type="text" value={form.course} onChange={set('course')} />
          </label>
          <label>
            Start date
            <input type="date" value={form.startDate} onChange={set('startDate')} required />
          </label>
          <label>
            End date
            <input type="date" value={form.endDate} onChange={set('endDate')} />
          </label>
          <label>
            Finish position
            <input type="number" min="1" value={form.position} onChange={set('position')} placeholder="After the event" />
          </label>
          <label>
            Field size
            <input type="number" min="1" value={form.fieldSize} onChange={set('fieldSize')} />
          </label>
        </div>
        <label className="full">
          Notes
          <textarea rows={2} value={form.notes} onChange={set('notes')} placeholder="Format, goals for the event, how it went…" />
        </label>
        <div className="form-actions">
          <button type="submit" className="primary">
            {editingId ? 'Save changes' : 'Add tournament'}
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

      <section className="rounds" aria-label="Tournaments">
        {sorted.length === 0 ? (
          <p className="empty">
            No tournaments yet. Add an event here, then link rounds to it when you log them.
          </p>
        ) : (
          sorted.map((t) => (
            <TournamentCard
              key={t.id}
              tournament={t}
              rounds={rounds}
              onEdit={() => startEdit(t)}
              onDelete={() => {
                onDelete(t.id)
                if (editingId === t.id) {
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
