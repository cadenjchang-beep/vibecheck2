import { useMemo, useState } from 'react'
import { ScorecardIcon } from './icons'
import { Lightbox, PhotoImage } from './Photo'
import { MiniScorecard, formatDate } from './RoundCard'
import { ScanButtons } from './Scan'
import type { GolfRound } from './types'
import { formatToPar, toPar } from './types'

interface Props {
  rounds: GolfRound[]
  onScanFiles: (files: File[]) => void
  onEdit: (round: GolfRound) => void
}

function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Every scorecard photo in the journal, newest round first. */
export default function Scorecards({ rounds, onScanFiles, onEdit }: Props) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<GolfRound | null>(null)

  const withPhotos = useMemo(
    () =>
      rounds
        .filter((r) => (r.photoIds?.length ?? 0) > 0)
        .sort((a, b) =>
          a.date === b.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date),
        ),
    [rounds],
  )

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return withPhotos
    return withPhotos.filter(
      (r) => r.course.toLowerCase().includes(q) || r.date.includes(q) || (r.playedWith ?? '').toLowerCase().includes(q),
    )
  }, [withPhotos, search])

  const without = rounds.length - withPhotos.length

  return (
    <>
      <section className="round-form library-head" aria-label="Scorecard library">
        <h2>
          <ScorecardIcon /> Scorecard library
        </h2>
        <p className="round-meta library-sub">
          {withPhotos.length === 0
            ? 'Every card you photograph is kept here with its round.'
            : `${withPhotos.length} scorecard${withPhotos.length === 1 ? '' : 's'} saved`}
          {without > 0 && withPhotos.length > 0 && ` · ${without} round${without === 1 ? '' : 's'} logged without a photo`}
        </p>
        <ScanButtons onFiles={onScanFiles} compact />
      </section>

      {withPhotos.length === 0 ? (
        <p className="empty">
          No scorecard photos yet. Take a photo of a card (or upload old ones) and it will be read,
          logged as a round and filed here.
        </p>
      ) : (
        <>
          {withPhotos.length > 6 && (
            <input
              type="search"
              className="search"
              placeholder="Search by course, date or playing partner…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
          {visible.length === 0 ? (
            <p className="empty">No scorecards match your search.</p>
          ) : (
            <ul className="card-grid">
              {visible.map((round) => {
                const diff = toPar(round)
                const count = round.photoIds!.length
                return (
                  <li key={round.id}>
                    <button type="button" className="card-tile" onClick={() => setOpen(round)}>
                      <PhotoImage id={round.photoIds![0]} alt={`Scorecard from ${round.course}`} className="card-tile-img" />
                      {count > 1 && <span className="card-tile-count">{count} photos</span>}
                      <span className="card-tile-info">
                        <span className="card-tile-course">{round.course}</span>
                        <span className="card-tile-meta">
                          {shortDate(round.date)} · {round.holes}h
                        </span>
                      </span>
                      <span className="card-tile-score">
                        {round.score}
                        <small className={diff < 0 ? 'under' : undefined}>{formatToPar(diff)}</small>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      {open && (
        <Lightbox
          photoIds={open.photoIds ?? []}
          title={`${open.course} · ${formatDate(open.date)}`}
          onClose={() => setOpen(null)}
        >
          <div className="lightbox-summary">
            <span>
              <strong>{open.score}</strong> ({formatToPar(toPar(open))}) · {open.holes} holes
              {open.tee ? ` · ${open.tee} tees` : ''}
              {open.playedWith ? ` · with ${open.playedWith}` : ''}
            </span>
            <button
              type="button"
              onClick={() => {
                setOpen(null)
                onEdit(open)
              }}
            >
              Edit round
            </button>
          </div>
          {open.holesData && <MiniScorecard round={open} />}
        </Lightbox>
      )}
    </>
  )
}
