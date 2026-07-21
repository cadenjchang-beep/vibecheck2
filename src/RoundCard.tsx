import { useState } from 'react'
import type { GolfRound } from './types'
import { formatToPar, toPar } from './types'

interface Props {
  round: GolfRound
  onEdit: (round: GolfRound) => void
  onDelete: (id: string) => void
}

function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function RoundCard({ round, onEdit, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const diff = toPar(round)
  const hasJournal = round.highlights || round.workOns || round.notes
  const hasStats =
    round.putts !== undefined ||
    round.fairwaysHit !== undefined ||
    round.greensInReg !== undefined ||
    round.penalties !== undefined

  return (
    <article className="round-card">
      <button
        type="button"
        className="round-card-header"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <div className="round-card-main">
          <span className="round-course">{round.course}</span>
          <span className="round-date">
            {formatDate(round.date)} · {round.holes} holes
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
