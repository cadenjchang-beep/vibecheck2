import type { GolfRound } from './types'
import { formatToPar, toPar } from './types'

interface Props {
  rounds: GolfRound[]
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

export default function Stats({ rounds }: Props) {
  if (rounds.length === 0) return null

  // Score stats only make sense within the same round length, so use the
  // more common of 9- and 18-hole rounds for the score-based tiles.
  const eighteens = rounds.filter((r) => r.holes === 18)
  const nines = rounds.filter((r) => r.holes === 9)
  const scored = eighteens.length >= nines.length ? eighteens : nines

  const avgToPar = avg(scored.map(toPar))
  const best = scored.reduce((a, b) => (toPar(a) <= toPar(b) ? a : b))
  const avgPutts = avg(scored.filter((r) => r.putts !== undefined).map((r) => r.putts!))

  const fairwayRounds = rounds.filter(
    (r) => r.fairwaysHit !== undefined && r.fairwaysTotal !== undefined && r.fairwaysTotal! > 0,
  )
  const fairwayPct =
    fairwayRounds.length > 0
      ? (100 * fairwayRounds.reduce((s, r) => s + r.fairwaysHit!, 0)) /
        fairwayRounds.reduce((s, r) => s + r.fairwaysTotal!, 0)
      : null

  const girRounds = rounds.filter((r) => r.greensInReg !== undefined)
  const girPct =
    girRounds.length > 0
      ? (100 * girRounds.reduce((s, r) => s + r.greensInReg!, 0)) /
        girRounds.reduce((s, r) => s + r.holes, 0)
      : null

  return (
    <section className="stats" aria-label="Summary statistics">
      <div className="stat">
        <span className="stat-value">{rounds.length}</span>
        <span className="stat-label">rounds logged</span>
      </div>
      {avgToPar !== null && (
        <div className="stat">
          <span className="stat-value">
            {avgToPar >= 0 ? '+' : ''}
            {avgToPar.toFixed(1)}
          </span>
          <span className="stat-label">avg to par ({scored[0].holes}h)</span>
        </div>
      )}
      <div className="stat">
        <span className="stat-value">
          {best.score} <small>({formatToPar(toPar(best))})</small>
        </span>
        <span className="stat-label">best round</span>
      </div>
      {avgPutts !== null && (
        <div className="stat">
          <span className="stat-value">{avgPutts.toFixed(1)}</span>
          <span className="stat-label">avg putts</span>
        </div>
      )}
      {fairwayPct !== null && (
        <div className="stat">
          <span className="stat-value">{fairwayPct.toFixed(0)}%</span>
          <span className="stat-label">fairways</span>
        </div>
      )}
      {girPct !== null && (
        <div className="stat">
          <span className="stat-value">{girPct.toFixed(0)}%</span>
          <span className="stat-label">greens in reg.</span>
        </div>
      )}
    </section>
  )
}
