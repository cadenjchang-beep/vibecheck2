import { useState } from 'react'
import type { GolfRound, Tournament } from './types'
import { ROUND_TYPE_LABELS, formatToPar, holeBreakdown, toPar } from './types'

interface Props {
  round: GolfRound
  tournament?: Tournament
  onEdit: (round: GolfRound) => void
  onDelete: (id: string) => void
}

export function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function scoreClass(strokes: number, par: number): string {
  const d = strokes - par
  if (d <= -2) return 'hole-eagle'
  if (d === -1) return 'hole-birdie'
  if (d === 0) return ''
  if (d === 1) return 'hole-bogey'
  return 'hole-double'
}

function MiniScorecard({ round }: { round: GolfRound }) {
  const holes = round.holesData!
  const nines = round.holes === 18 ? [holes.slice(0, 9), holes.slice(9)] : [holes]
  return (
    <div className="mini-scorecards">
      {nines.map((nine, n) => (
        <div className="scorecard-scroll" key={n}>
          <table className="scorecard readonly">
            <thead>
              <tr>
                <th>{round.holes === 18 ? (n === 0 ? 'Out' : 'In') : 'Hole'}</th>
                {nine.map((_, i) => (
                  <th key={i}>{n * 9 + i + 1}</th>
                ))}
                <th>Tot</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Par</th>
                {nine.map((h, i) => (
                  <td key={i}>{h.par}</td>
                ))}
                <td className="scorecard-total">{nine.reduce((s, h) => s + h.par, 0)}</td>
              </tr>
              <tr>
                <th>Score</th>
                {nine.map((h, i) => (
                  <td key={i} className={scoreClass(h.strokes, h.par)}>
                    {h.strokes}
                  </td>
                ))}
                <td className="scorecard-total">{nine.reduce((s, h) => s + h.strokes, 0)}</td>
              </tr>
              {nine.some((h) => h.putts !== undefined) && (
                <tr>
                  <th>Putts</th>
                  {nine.map((h, i) => (
                    <td key={i}>{h.putts ?? ''}</td>
                  ))}
                  <td className="scorecard-total">
                    {nine.reduce((s, h) => s + (h.putts ?? 0), 0)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

export default function RoundCard({ round, tournament, onEdit, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const diff = toPar(round)
  const hasJournal = round.highlights || round.workOns || round.notes
  const hasStats =
    round.putts !== undefined ||
    round.fairwaysHit !== undefined ||
    round.greensInReg !== undefined ||
    round.penalties !== undefined
  const breakdown = round.holesData ? holeBreakdown(round.holesData) : null

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
            {round.roundType !== 'casual' && (
              <span className={`type-badge type-${round.roundType}`}>
                {ROUND_TYPE_LABELS[round.roundType]}
              </span>
            )}
            {round.course}
          </span>
          <span className="round-date">
            {formatDate(round.date)} · {round.holes} holes
            {round.tee ? ` · ${round.tee} tees` : ''}
            {tournament ? ` · ${tournament.name}` : ''}
          </span>
        </div>
        <div className="round-card-score">
          <span className="round-score">{round.score}</span>
          <span className={`round-topar ${diff < 0 ? 'under' : diff === 0 ? 'even' : 'over'}`}>
            {formatToPar(diff)}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="round-card-body">
          {round.holesData && <MiniScorecard round={round} />}
          {breakdown && (
            <ul className="round-stats breakdown">
              {breakdown.eagles > 0 && <li className="hole-eagle"><strong>{breakdown.eagles}</strong> eagle{breakdown.eagles > 1 ? 's' : ''}</li>}
              {breakdown.birdies > 0 && <li className="hole-birdie"><strong>{breakdown.birdies}</strong> birdie{breakdown.birdies > 1 ? 's' : ''}</li>}
              <li><strong>{breakdown.pars}</strong> pars</li>
              <li><strong>{breakdown.bogeys}</strong> bogeys</li>
              {breakdown.doublesPlus > 0 && <li className="hole-double"><strong>{breakdown.doublesPlus}</strong> double+</li>}
            </ul>
          )}
          {hasStats && (
            <ul className="round-stats">
              {round.putts !== undefined && <li><strong>{round.putts}</strong> putts</li>}
              {round.fairwaysHit !== undefined && (
                <li>
                  <strong>
                    {round.fairwaysHit}
                    {round.fairwaysTotal ? `/${round.fairwaysTotal}` : ''}
                  </strong>{' '}
                  fairways
                </li>
              )}
              {round.greensInReg !== undefined && <li><strong>{round.greensInReg}</strong> GIR</li>}
              {round.penalties !== undefined && <li><strong>{round.penalties}</strong> penalties</li>}
              {round.courseRating !== undefined && round.slope !== undefined && (
                <li>{round.courseRating} / {round.slope}</li>
              )}
            </ul>
          )}
          {(round.weather || round.playedWith) && (
            <p className="round-meta">
              {[round.weather, round.playedWith && `With: ${round.playedWith}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {hasJournal && (
            <div className="round-journal">
              {round.highlights && (
                <p><span className="journal-label good">Went well</span> {round.highlights}</p>
              )}
              {round.workOns && (
                <p><span className="journal-label work">Work on</span> {round.workOns}</p>
              )}
              {round.notes && (
                <p><span className="journal-label">Notes</span> {round.notes}</p>
              )}
            </div>
          )}
          <div className="round-actions">
            <button type="button" onClick={() => onEdit(round)}>Edit</button>
            {confirmDelete ? (
              <>
                <button type="button" className="danger" onClick={() => onDelete(round.id)}>
                  Confirm delete
                </button>
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
