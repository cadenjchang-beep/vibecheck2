import { useEffect, useState } from 'react'
import type { GolfRound, HoleScore, RoundDraft, RoundType, Tournament } from './types'
import { ROUND_TYPE_LABELS } from './types'

interface Props {
  editing: GolfRound | null
  tournaments: Tournament[]
  onSave: (draft: RoundDraft) => void
  onCancel: () => void
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

interface HoleForm {
  par: string
  strokes: string
  putts: string
}

const emptyForm = {
  date: today(),
  course: '',
  holes: '18',
  par: '72',
  score: '',
  roundType: 'casual' as RoundType,
  tournamentId: '',
  tee: '',
  courseRating: '',
  slope: '',
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

function emptyHoles(count: number): HoleForm[] {
  return Array.from({ length: count }, () => ({ par: '4', strokes: '', putts: '' }))
}

function fromRound(round: GolfRound): FormState {
  return {
    date: round.date,
    course: round.course,
    holes: String(round.holes),
    par: String(round.par),
    score: String(round.score),
    roundType: round.roundType ?? 'casual',
    tournamentId: round.tournamentId ?? '',
    tee: round.tee ?? '',
    courseRating: round.courseRating?.toString() ?? '',
    slope: round.slope?.toString() ?? '',
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

export default function RoundForm({ editing, tournaments, onSave, onCancel }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [showDetails, setShowDetails] = useState(false)
  const [useScorecard, setUseScorecard] = useState(false)
  const [holes, setHolesState] = useState<HoleForm[]>(emptyHoles(18))

  useEffect(() => {
    if (editing) {
      setForm(fromRound(editing))
      setShowDetails(true)
      if (editing.holesData && editing.holesData.length > 0) {
        setUseScorecard(true)
        setHolesState(
          editing.holesData.map((h) => ({
            par: String(h.par),
            strokes: String(h.strokes),
            putts: h.putts?.toString() ?? '',
          })),
        )
      } else {
        setUseScorecard(false)
        setHolesState(emptyHoles(editing.holes))
      }
    } else {
      setForm(emptyForm)
      setUseScorecard(false)
      setHolesState(emptyHoles(18))
    }
  }, [editing])

  const set = (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }))

  const setHoles = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const holeCount = e.target.value
    setForm((f) => ({ ...f, holes: holeCount, par: holeCount === '9' ? '36' : '72' }))
    setHolesState((hs) => {
      const n = holeCount === '9' ? 9 : 18
      if (hs.length === n) return hs
      return n < hs.length ? hs.slice(0, n) : [...hs, ...emptyHoles(n - hs.length)]
    })
  }

  const setHole = (i: number, field: keyof HoleForm, value: string) => {
    setHolesState((hs) => hs.map((h, j) => (j === i ? { ...h, [field]: value } : h)))
  }

  // Scorecard-derived totals
  const scorecardComplete = useScorecard && holes.every((h) => optionalNum(h.strokes) !== undefined)
  const cardPar = holes.reduce((s, h) => s + (optionalNum(h.par) ?? 0), 0)
  const cardScore = holes.reduce((s, h) => s + (optionalNum(h.strokes) ?? 0), 0)
  const allPutts = holes.every((h) => optionalNum(h.putts) !== undefined)
  const cardPutts = allPutts ? holes.reduce((s, h) => s + (optionalNum(h.putts) ?? 0), 0) : undefined

  const canSave =
    form.course.trim() !== '' &&
    form.date !== '' &&
    (useScorecard ? scorecardComplete : optionalNum(form.score) !== undefined)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return

    let holesData: HoleScore[] | undefined
    if (useScorecard && scorecardComplete) {
      holesData = holes.map((h) => ({
        par: optionalNum(h.par) ?? 4,
        strokes: optionalNum(h.strokes)!,
        putts: optionalNum(h.putts),
      }))
    }

    // With a complete scorecard, GIR can be derived when putts were tracked per hole.
    const derivedGir =
      holesData && allPutts
        ? holesData.filter((h) => h.strokes - (h.putts ?? 0) <= h.par - 2).length
        : undefined

    onSave({
      date: form.date,
      course: form.course.trim(),
      holes: form.holes === '9' ? 9 : 18,
      par: holesData ? cardPar : optionalNum(form.par) ?? (form.holes === '9' ? 36 : 72),
      score: holesData ? cardScore : optionalNum(form.score)!,
      roundType: form.roundType,
      tournamentId: form.roundType === 'tournament' && form.tournamentId ? form.tournamentId : undefined,
      tee: form.tee.trim() || undefined,
      courseRating: optionalNum(form.courseRating),
      slope: optionalNum(form.slope),
      holesData,
      putts: cardPutts ?? optionalNum(form.putts),
      fairwaysHit: optionalNum(form.fairwaysHit),
      fairwaysTotal: optionalNum(form.fairwaysTotal),
      greensInReg: optionalNum(form.greensInReg) ?? derivedGir,
      penalties: optionalNum(form.penalties),
      weather: form.weather.trim() || undefined,
      playedWith: form.playedWith.trim() || undefined,
      highlights: form.highlights.trim() || undefined,
      workOns: form.workOns.trim() || undefined,
      notes: form.notes.trim() || undefined,
    })
    setForm(emptyForm)
    setShowDetails(false)
    setUseScorecard(false)
    setHolesState(emptyHoles(18))
  }

  const holeCount = form.holes === '9' ? 9 : 18
  const front = holes.slice(0, Math.min(9, holeCount))
  const back = holeCount === 18 ? holes.slice(9) : []

  const renderNine = (nine: HoleForm[], offset: number, label: string) => (
    <div className="scorecard-scroll" key={label}>
      <table className="scorecard">
        <thead>
          <tr>
            <th>{label}</th>
            {nine.map((_, i) => (
              <th key={i}>{offset + i + 1}</th>
            ))}
            <th>Tot</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>Par</th>
            {nine.map((h, i) => (
              <td key={i}>
                <input
                  type="number"
                  min="3"
                  max="6"
                  value={h.par}
                  onChange={(e) => setHole(offset + i, 'par', e.target.value)}
                  aria-label={`Hole ${offset + i + 1} par`}
                />
              </td>
            ))}
            <td className="scorecard-total">{nine.reduce((s, h) => s + (optionalNum(h.par) ?? 0), 0)}</td>
          </tr>
          <tr>
            <th>Score</th>
            {nine.map((h, i) => (
              <td key={i}>
                <input
                  type="number"
                  min="1"
                  max="15"
                  value={h.strokes}
                  onChange={(e) => setHole(offset + i, 'strokes', e.target.value)}
                  aria-label={`Hole ${offset + i + 1} strokes`}
                />
              </td>
            ))}
            <td className="scorecard-total">{nine.reduce((s, h) => s + (optionalNum(h.strokes) ?? 0), 0) || ''}</td>
          </tr>
          <tr>
            <th>Putts</th>
            {nine.map((h, i) => (
              <td key={i}>
                <input
                  type="number"
                  min="0"
                  max="9"
                  value={h.putts}
                  onChange={(e) => setHole(offset + i, 'putts', e.target.value)}
                  aria-label={`Hole ${offset + i + 1} putts`}
                />
              </td>
            ))}
            <td className="scorecard-total">{cardPutts !== undefined ? nine.reduce((s, h) => s + (optionalNum(h.putts) ?? 0), 0) : ''}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )

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
          Round type
          <select value={form.roundType} onChange={set('roundType')}>
            {(Object.keys(ROUND_TYPE_LABELS) as RoundType[]).map((t) => (
              <option key={t} value={t}>
                {ROUND_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        {form.roundType === 'tournament' && (
          <label className="span-2">
            Tournament
            <select value={form.tournamentId} onChange={set('tournamentId')}>
              <option value="">— not linked —</option>
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Holes
          <select value={form.holes} onChange={setHoles}>
            <option value="18">18</option>
            <option value="9">9</option>
          </select>
        </label>
        {!useScorecard && (
          <>
            <label>
              Par
              <input type="number" min="27" max="80" value={form.par} onChange={set('par')} />
            </label>
            <label>
              Score
              <input type="number" min="1" max="200" value={form.score} onChange={set('score')} required />
            </label>
          </>
        )}
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={useScorecard}
          onChange={(e) => setUseScorecard(e.target.checked)}
        />
        Hole-by-hole scorecard
      </label>

      {useScorecard && (
        <div className="scorecard-wrap">
          {renderNine(front, 0, holeCount === 18 ? 'Out' : 'Holes')}
          {back.length > 0 && renderNine(back, 9, 'In')}
          <p className="scorecard-summary">
            {scorecardComplete ? (
              <>
                Total: <strong>{cardScore}</strong> on par {cardPar}
                {cardPutts !== undefined && <> · {cardPutts} putts</>}
              </>
            ) : (
              'Enter a score for every hole. Putts are optional (fill all of them to auto-track putts and GIR).'
            )}
          </p>
        </div>
      )}

      <button type="button" className="link-btn" onClick={() => setShowDetails((s) => !s)}>
        {showDetails ? '− Hide details' : '+ Stats, conditions & journal'}
      </button>

      {showDetails && (
        <>
          <div className="form-grid">
            <label>
              Tee
              <input type="text" value={form.tee} onChange={set('tee')} placeholder="Blue" />
            </label>
            <label>
              Course rating
              <input type="number" step="0.1" min="50" max="85" value={form.courseRating} onChange={set('courseRating')} placeholder="72.1" />
            </label>
            <label>
              Slope
              <input type="number" min="55" max="155" value={form.slope} onChange={set('slope')} placeholder="128" />
            </label>
            {!(useScorecard && allPutts) && (
              <label>
                Putts
                <input type="number" min="0" value={form.putts} onChange={set('putts')} />
              </label>
            )}
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
