import { useEffect, useRef, useState } from 'react'
import { CameraIcon, SparkleIcon } from './icons'
import { processPhoto } from './image'
import { Lightbox, PhotoImage } from './Photo'
import { deletePhotos, putPhoto } from './photoStore'
import type { ScorecardReading } from './scorecardReader'
import type { Settings } from './settings'
import type { GolfRound, HoleScore, RoundDraft, RoundType, Tournament } from './types'
import { ROUND_TYPE_LABELS } from './types'
import type { ScanItem } from './useScanQueue'
import { readStoredPhotos } from './useScanQueue'

interface Props {
  editing: GolfRound | null
  /** Scorecard photo being reviewed (ignored while editing a saved round). */
  scan: ScanItem | null
  scanCount: number
  tournaments: Tournament[]
  settings: Settings
  onSave: (draft: RoundDraft) => void
  onCancel: () => void
  onSkipScan: () => void
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

type ReadState =
  | { status: 'idle' }
  | { status: 'reading' }
  | { status: 'failed'; error: string }
  | { status: 'read'; reading: ScorecardReading; player: number }

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

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Index of the player row that matches the golfer's name hint (first row otherwise). */
function pickPlayer(reading: ScorecardReading, playerName: string): number {
  const aliases = playerName.split(/[,/;]/).map(normalizeName).filter(Boolean)
  if (aliases.length === 0) return 0
  const names = reading.players.map((p) => normalizeName(p.name))
  const exact = names.findIndex((n) => aliases.includes(n))
  if (exact >= 0) return exact
  const partial = names.findIndex(
    (n) => n.length >= 2 && aliases.some((a) => a.length >= 2 && (n.startsWith(a) || a.startsWith(n))),
  )
  return partial >= 0 ? partial : 0
}

function otherPlayers(reading: ScorecardReading, player: number): string {
  return reading.players
    .filter((_, i) => i !== player)
    .map((p) => p.name)
    .join(', ')
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.'
}

export default function RoundForm({
  editing,
  scan,
  scanCount,
  tournaments,
  settings,
  onSave,
  onCancel,
  onSkipScan,
}: Props) {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [showDetails, setShowDetails] = useState(false)
  const [useScorecard, setUseScorecard] = useState(false)
  const [holes, setHolesState] = useState<HoleForm[]>(emptyHoles(18))
  const [photoIds, setPhotoIds] = useState<string[]>([])
  const [addingPhotos, setAddingPhotos] = useState(0)
  const [photoError, setPhotoError] = useState('')
  const [viewer, setViewer] = useState<number | null>(null)
  const [readState, setReadState] = useState<ReadState>({ status: 'idle' })
  const [flagged, setFlagged] = useState<Set<number>>(new Set())
  const photoInputRef = useRef<HTMLInputElement>(null)
  const photoIdsRef = useRef(photoIds)
  photoIdsRef.current = photoIds

  // Photos added since this form was opened — deleted again if abandoned.
  const newPhotos = useRef(new Set<string>())
  // Bumped whenever the form switches rounds so stale readings are dropped.
  const readToken = useRef(0)
  const loadedKey = useRef<string | null>(null)
  const seenScanStatus = useRef<string | null>(null)
  const autoPlayedWith = useRef('')

  const activeScan = editing ? null : scan
  const mode = editing ? 'edit' : activeScan ? 'scan' : 'new'
  const sourceKey = editing ? `edit:${editing.id}` : activeScan ? `scan:${activeScan.id}` : 'new'

  const applyPlayer = (reading: ScorecardReading, player: number) => {
    const p = reading.players[player]
    setHolesState(
      Array.from({ length: reading.holeCount }, (_, i) => ({
        par: String(reading.par[i] ?? 4),
        strokes: p.strokes[i]?.toString() ?? '',
        putts: p.putts?.[i]?.toString() ?? '',
      })),
    )
    const unsure = new Set(p.uncertainHoles.map((h) => h - 1))
    p.strokes.forEach((s, i) => s === null && unsure.add(i))
    reading.par.forEach((par, i) => par === null && unsure.add(i))
    setFlagged(unsure)
    const others = otherPlayers(reading, player)
    const previous = autoPlayedWith.current
    setForm((f) =>
      f.playedWith === '' || f.playedWith === previous ? { ...f, playedWith: others } : f,
    )
    autoPlayedWith.current = others
    setReadState({ status: 'read', reading, player })
  }

  const applyReading = (reading: ScorecardReading) => {
    setForm((f) => ({
      ...f,
      course: reading.course ?? f.course,
      date: reading.date ?? f.date,
      holes: String(reading.holeCount),
      tee: reading.tee ?? f.tee,
      courseRating: reading.courseRating?.toString() ?? f.courseRating,
      slope: reading.slope?.toString() ?? f.slope,
    }))
    if (reading.tee || reading.courseRating !== null || reading.slope !== null) setShowDetails(true)
    setUseScorecard(true)
    applyPlayer(reading, pickPlayer(reading, settings.playerName))
  }

  // Load the round being edited, the scan being reviewed, or a blank form.
  useEffect(() => {
    if (loadedKey.current !== sourceKey) {
      loadedKey.current = sourceKey
      seenScanStatus.current = null
      readToken.current++
      newPhotos.current = new Set()
      autoPlayedWith.current = ''
      setFlagged(new Set())
      setReadState({ status: 'idle' })
      setPhotoError('')
      setViewer(null)
      if (editing) {
        setForm(fromRound(editing))
        setShowDetails(true)
        setPhotoIds(editing.photoIds ?? [])
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
      } else if (activeScan) {
        setForm({ ...emptyForm, date: activeScan.takenOn ?? today() })
        setShowDetails(false)
        setUseScorecard(true)
        setHolesState(emptyHoles(18))
        setPhotoIds(activeScan.photoIds)
        newPhotos.current = new Set(activeScan.photoIds)
      } else {
        setForm(emptyForm)
        setShowDetails(false)
        setUseScorecard(false)
        setHolesState(emptyHoles(18))
        setPhotoIds([])
      }
    }

    // Follow the background reading of the scan under review.
    if (activeScan) {
      const statusKey = `${activeScan.id}:${activeScan.status}`
      if (seenScanStatus.current !== statusKey && seenScanStatus.current !== 'local') {
        seenScanStatus.current = statusKey
        if (activeScan.status === 'read' && activeScan.reading) applyReading(activeScan.reading)
        else if (activeScan.status === 'failed')
          setReadState({ status: 'failed', error: activeScan.error ?? 'Could not read this card.' })
        else if (activeScan.status === 'queued' || activeScan.status === 'reading')
          setReadState({ status: 'reading' })
      }
    }
  }, [sourceKey, editing, activeScan])

  const runRead = async (ids: string[]) => {
    if (!settings.anthropicApiKey || ids.length === 0) return
    const token = ++readToken.current
    seenScanStatus.current = 'local'
    setReadState({ status: 'reading' })
    try {
      const reading = await readStoredPhotos(settings, ids)
      if (token === readToken.current) applyReading(reading)
    } catch (e) {
      if (token === readToken.current) setReadState({ status: 'failed', error: errorMessage(e) })
    }
  }

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

  const unflag = (i: number) => {
    if (!flagged.has(i)) return
    setFlagged((f) => {
      const next = new Set(f)
      next.delete(i)
      return next
    })
  }

  const setHole = (i: number, field: keyof HoleForm, value: string) => {
    setHolesState((hs) => hs.map((h, j) => (j === i ? { ...h, [field]: value } : h)))
    if (field === 'strokes') unflag(i)
  }

  // Scorecard-derived totals
  const scorecardComplete = useScorecard && holes.every((h) => optionalNum(h.strokes) !== undefined)
  const cardPar = holes.reduce((s, h) => s + (optionalNum(h.par) ?? 0), 0)
  const cardScore = holes.reduce((s, h) => s + (optionalNum(h.strokes) ?? 0), 0)
  const allPutts = holes.every((h) => optionalNum(h.putts) !== undefined)
  const cardPutts = allPutts ? holes.reduce((s, h) => s + (optionalNum(h.putts) ?? 0), 0) : undefined
  const hasScores = holes.some((h) => h.strokes.trim() !== '') || form.score.trim() !== ''

  const canSave =
    form.course.trim() !== '' &&
    form.date !== '' &&
    (useScorecard ? scorecardComplete : optionalNum(form.score) !== undefined)

  const addPhotos = async (files: File[]) => {
    const key = sourceKey
    setPhotoError('')
    setAddingPhotos((n) => n + files.length)
    const added: string[] = []
    for (const file of files) {
      try {
        const photo = await processPhoto(file)
        const id = crypto.randomUUID()
        await putPhoto({ id, full: photo.full, thumb: photo.thumb, createdAt: Date.now() })
        newPhotos.current.add(id)
        added.push(id)
        if (mode === 'new' && photo.takenOn && !hasScores) {
          setForm((f) => (f.date === emptyForm.date ? { ...f, date: photo.takenOn! } : f))
        }
      } catch (e) {
        setPhotoError(errorMessage(e))
      } finally {
        setAddingPhotos((n) => n - 1)
      }
    }
    if (added.length === 0) return
    if (loadedKey.current !== key) {
      // The form moved on to another round while the photos were being prepared.
      void deletePhotos(added)
      return
    }
    const ids = [...photoIdsRef.current, ...added]
    setPhotoIds(ids)
    // Fill a blank form straight away; never overwrite numbers already entered.
    if (!hasScores && settings.anthropicApiKey && readState.status !== 'reading') void runRead(ids)
  }

  const removePhoto = (id: string) => {
    setPhotoIds((ids) => ids.filter((x) => x !== id))
    if (newPhotos.current.has(id)) {
      newPhotos.current.delete(id)
      void deletePhotos([id])
    }
  }

  const discardNewPhotos = () => {
    void deletePhotos([...newPhotos.current])
    newPhotos.current = new Set()
  }

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
      photoIds: photoIds.length > 0 ? photoIds : undefined,
    })
    // The photos now belong to a saved round.
    newPhotos.current = new Set()
    if (mode === 'new') {
      readToken.current++
      setForm(emptyForm)
      setShowDetails(false)
      setUseScorecard(false)
      setHolesState(emptyHoles(18))
      setPhotoIds([])
      setFlagged(new Set())
      setReadState({ status: 'idle' })
    }
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
                  className={flagged.has(offset + i) ? 'flagged' : undefined}
                  onChange={(e) => setHole(offset + i, 'strokes', e.target.value)}
                  onBlur={() => unflag(offset + i)}
                  aria-label={`Hole ${offset + i + 1} strokes${flagged.has(offset + i) ? ' (check this one)' : ''}`}
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

  const renderReadStatus = () => {
    if (photoIds.length === 0) return null
    switch (readState.status) {
      case 'reading':
        return (
          <div className="read-banner reading" role="status">
            <span className="spinner" aria-hidden /> Reading the scorecard — this usually takes 10–30 seconds.
          </div>
        )
      case 'failed':
        return (
          <div className="read-banner failed" role="alert">
            <span>Couldn't read this card: {readState.error}</span>
            {settings.anthropicApiKey && (
              <button type="button" onClick={() => void runRead(photoIds)}>
                Try again
              </button>
            )}
          </div>
        )
      case 'read': {
        const { reading, player } = readState
        return (
          <div className="read-banner read" role="status">
            <p>
              <SparkleIcon size={16} /> <strong>Filled in from the photo.</strong> Check each hole
              against the card before saving
              {flagged.size > 0 && (
                <>
                  {' '}
                  — <span className="flag-note">{flagged.size} highlighted</span>{' '}
                  {flagged.size === 1 ? 'hole was' : 'holes were'} hard to read
                </>
              )}
              .
            </p>
            {reading.notes && <p className="read-notes">{reading.notes}</p>}
            {reading.players.length > 1 && (
              <div className="player-pick" role="group" aria-label="Whose scores are these?">
                <span>Whose card?</span>
                {reading.players.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    className={i === player ? 'chip active' : 'chip'}
                    aria-pressed={i === player}
                    onClick={() => applyPlayer(reading, i)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      }
      default:
        return settings.anthropicApiKey ? (
          <div className="read-banner">
            <button type="button" onClick={() => void runRead(photoIds)}>
              <SparkleIcon size={16} /> Read scores from {photoIds.length > 1 ? 'photos' : 'photo'}
            </button>
            {hasScores && <span className="record-sub">Replaces the hole scores entered below.</span>}
          </div>
        ) : (
          <div className="read-banner muted">
            Type the scores in from the photo, or add an Anthropic API key under More → Scorecard
            reading to fill them in automatically.
          </div>
        )
    }
  }

  const title =
    mode === 'edit' ? 'Edit round' : mode === 'scan' ? 'Review scorecard' : 'Log a round'

  return (
    <form className="round-form" onSubmit={handleSubmit}>
      <h2>
        {title}
        {mode === 'scan' && scanCount > 1 && <span className="form-count">1 of {scanCount}</span>}
      </h2>

      <div className={photoIds.length > 0 ? 'form-photos has-photos' : 'form-photos'}>
        {photoIds.length > 0 && (
          <div className="form-photo-main">
            <button type="button" className="photo-open" onClick={() => setViewer(0)} aria-label="View photo full screen">
              <PhotoImage id={photoIds[0]} variant="full" alt="Scorecard photo" />
            </button>
            <button type="button" className="photo-remove" onClick={() => removePhoto(photoIds[0])} aria-label="Remove photo">
              ✕
            </button>
          </div>
        )}
        <div className="form-photo-row">
          {photoIds.slice(1).map((id, i) => (
            <div className="form-photo-thumb" key={id}>
              <button type="button" className="photo-open" onClick={() => setViewer(i + 1)} aria-label={`View photo ${i + 2}`}>
                <PhotoImage id={id} alt={`Scorecard photo ${i + 2}`} />
              </button>
              <button type="button" className="photo-remove" onClick={() => removePhoto(id)} aria-label={`Remove photo ${i + 2}`}>
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="add-photo"
            onClick={() => photoInputRef.current?.click()}
            disabled={addingPhotos > 0}
          >
            <CameraIcon size={17} />
            {addingPhotos > 0
              ? 'Adding…'
              : photoIds.length > 0
                ? 'Add another photo'
                : 'Attach scorecard photo'}
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              e.target.value = ''
              if (files.length > 0) void addPhotos(files)
            }}
          />
        </div>
        {photoError && <p className="import-error">{photoError}</p>}
        {renderReadStatus()}
      </div>

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
          {mode === 'edit' ? 'Save changes' : mode === 'scan' ? 'Save round' : 'Add round'}
        </button>
        {mode === 'edit' && (
          <button
            type="button"
            onClick={() => {
              discardNewPhotos()
              onCancel()
            }}
          >
            Cancel
          </button>
        )}
        {mode === 'scan' && (
          <button
            type="button"
            onClick={() => {
              discardNewPhotos()
              onSkipScan()
            }}
          >
            Skip this card
          </button>
        )}
      </div>

      {viewer !== null && photoIds.length > 0 && (
        <Lightbox
          photoIds={photoIds}
          startIndex={viewer}
          title={form.course.trim() || 'Scorecard photo'}
          onClose={() => setViewer(null)}
        />
      )}
    </form>
  )
}
