import { useEffect, useState } from 'react'
import type { GolfRound, RoundDraft } from './types'

interface Props {
  editing: GolfRound | null
  onSave: (draft: RoundDraft) => void
  onCancel: () => void
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

const emptyForm = {
  date: today(),
  course: '',
  holes: '18',
  par: '72',
  score: '',
  putts: '',
  fairwaysHit: '',
  fairwaysTotal: '',
  greensInReg: '',
  penalties: '',
  weather: '',
  playedWith: '',
  highlights: '',
  workOns: '',
  notes: '',
}

type FormState = typeof emptyForm

function fromRound(round: GolfRound): FormState {
  return {
    date: round.date,
    course: round.course,
    holes: String(round.holes),
    par: String(round.par),
    score: String(round.score),
    putts: round.putts?.toString() ?? '',
    fairwaysHit: round.fairwaysHit?.toString() ?? '',
    fairwaysTotal: round.fairwaysTotal?.toString() ?? '',
    greensInReg: round.greensInReg?.toString() ?? '',
    penalties: round.penalties?.toString() ?? '',
    weather: round.weather ?? '',
    playedWith: round.playedWith ?? '',
    highlights: round.highlights ?? '',
    workOns: round.workOns ?? '',
    notes: round.notes ?? '',
  }
}

function optionalNum(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : undefined
}

export default function RoundForm({ editing, onSave, onCancel }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    if (editing) {
      setForm(fromRound(editing))
      setShowDetails(true)
    } else {
      setForm(emptyForm)
    }
  }, [editing])

  const set = (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }))

  const setHoles = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const holes = e.target.value
    setForm((f) => ({ ...f, holes, par: holes === '9' ? '36' : '72' }))
  }

  const canSave = form.course.trim() !== '' && form.date !== '' && optionalNum(form.score) !== undefined

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    onSave({
      date: form.date,
      course: form.course.trim(),
      holes: form.holes === '9' ? 9 : 18,
      par: optionalNum(form.par) ?? (form.holes === '9' ? 36 : 72),
      score: optionalNum(form.score)!,
      putts: optionalNum(form.putts),
      fairwaysHit: optionalNum(form.fairwaysHit),
      fairwaysTotal: optionalNum(form.fairwaysTotal),
      greensInReg: optionalNum(form.greensInReg),
      penalties: optionalNum(form.penalties),
      weather: form.weather.trim() || undefined,
      playedWith: form.playedWith.trim() || undefined,
      highlights: form.highlights.trim() || undefined,
      workOns: form.workOns.trim() || undefined,
      notes: form.notes.trim() || undefined,
    })
    setForm(emptyForm)
    setShowDetails(false)
  }

  return (
    <form className="round-form" onSubmit={handleSubmit}>
      <h2>{editing ? 'Edit round' : 'Log a round'}</h2>

      <div className="form-grid">
        <label>
          Date
          <input type="date" value={form.date} onChange={set('date')} required />
        </label>
        <label className="span-2">
          Course
          <input
            type="text"
            value={form.course}
            onChange={set('course')}
            placeholder="Pebble Creek GC"
            required
          />
        </label>
        <label>
          Holes
          <select value={form.holes} onChange={setHoles}>
            <option value="18">18</option>
            <option value="9">9</option>
          </select>
        </label>
        <label>
          Par
          <input type="number" min="27" max="80" value={form.par} onChange={set('par')} />
        </label>
        <label>
          Score
          <input type="number" min="1" max="200" value={form.score} onChange={set('score')} required />
        </label>
      </div>

      <button
        type="button"
        className="link-btn"
        onClick={() => setShowDetails((s) => !s)}
      >
        {showDetails ? '− Hide details' : '+ Stats, conditions & journal'}
      </button>

      {showDetails && (
        <>
          <div className="form-grid">
            <label>
              Putts
              <input type="number" min="0" value={form.putts} onChange={set('putts')} />
            </label>
            <label>
              Fairways hit
              <input type="number" min="0" value={form.fairwaysHit} onChange={set('fairwaysHit')} />
            </label>
            <label>
              Fairways total
              <input type="number" min="0" value={form.fairwaysTotal} onChange={set('fairwaysTotal')} placeholder="14" />
            </label>
            <label>
              Greens in reg.
              <input type="number" min="0" value={form.greensInReg} onChange={set('greensInReg')} />
            </label>
            <label>
              Penalties
              <input type="number" min="0" value={form.penalties} onChange={set('penalties')} />
            </label>
            <label>
              Weather
              <input type="text" value={form.weather} onChange={set('weather')} placeholder="Sunny, light wind" />
            </label>
            <label className="span-2">
              Played with
              <input type="text" value={form.playedWith} onChange={set('playedWith')} placeholder="Solo / friends" />
            </label>
          </div>

          <label className="full">
            What went well
            <textarea
              rows={2}
              value={form.highlights}
              onChange={set('highlights')}
              placeholder="Driver was straight all day, made two long par saves…"
            />
          </label>
          <label className="full">
            What to work on
            <textarea
              rows={2}
              value={form.workOns}
              onChange={set('workOns')}
              placeholder="Chunked a few wedges — book a short-game session…"
            />
          </label>
          <label className="full">
            Journal notes
            <textarea
              rows={3}
              value={form.notes}
              onChange={set('notes')}
              placeholder="Anything else worth remembering about the round…"
            />
          </label>
        </>
      )}

      <div className="form-actions">
        <button type="submit" className="primary" disabled={!canSave}>
          {editing ? 'Save changes' : 'Add round'}
        </button>
        {editing && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
