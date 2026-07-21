import type { ChartPoint } from './LineChart'
import LineChart from './LineChart'
import Stats from './Stats'
import type { GolfRound } from './types'
import { formatToPar, handicapIndex, holeBreakdown, toPar } from './types'

interface Props {
  rounds: GolfRound[]
}

function chartLabel(date: string): string {
  const [, m, d] = date.split('-')
  return `${Number(m)}/${Number(d)}`
}

export default function Trends({ rounds }: Props) {
  if (rounds.length === 0) {
    return <p className="empty">Log some rounds and your trends will show up here. 📈</p>
  }

  const chrono = [...rounds].sort((a, b) =>
    a.date === b.date ? a.createdAt - b.createdAt : a.date.localeCompare(b.date),
  )
  const eighteens = chrono.filter((r) => r.holes === 18)
  const hcp = handicapIndex(rounds)
  const ratedCount = eighteens.filter(
    (r) => r.courseRating !== undefined && r.slope !== undefined,
  ).length

  const scorePoints: ChartPoint[] = eighteens
    .slice(-20)
    .map((r) => ({ label: chartLabel(r.date), value: toPar(r) }))
  const puttPoints: ChartPoint[] = eighteens
    .filter((r) => r.putts !== undefined)
    .slice(-20)
    .map((r) => ({ label: chartLabel(r.date), value: r.putts! }))

  // Records
  const best18 = eighteens.length > 0 ? eighteens.reduce((a, b) => (toPar(a) <= toPar(b) ? a : b)) : null
  const nines = chrono.filter((r) => r.holes === 9)
  const best9 = nines.length > 0 ? nines.reduce((a, b) => (toPar(a) <= toPar(b) ? a : b)) : null
  const withCards = chrono.filter((r) => r.holesData)
  const totals = withCards.map((r) => holeBreakdown(r.holesData!))
  const totalBirdies = totals.reduce((s, b) => s + b.birdies, 0)
  const totalEagles = totals.reduce((s, b) => s + b.eagles, 0)
  const mostBirdies = withCards.length > 0
    ? withCards.reduce((a, b) =>
        holeBreakdown(a.holesData!).birdies >= holeBreakdown(b.holesData!).birdies ? a : b,
      )
    : null

  // Scoring average by hole par (needs scorecards)
  const parAvgs: { par: number; avg: number; count: number }[] = [3, 4, 5]
    .map((par) => {
      const holes = withCards.flatMap((r) => r.holesData!.filter((h) => h.par === par))
      return {
        par,
        count: holes.length,
        avg: holes.length > 0 ? holes.reduce((s, h) => s + h.strokes, 0) / holes.length : 0,
      }
    })
    .filter((p) => p.count > 0)

  return (
    <>
      <section className="hcp-card" aria-label="Handicap estimate">
        <div>
          <span className="hcp-value">{hcp !== null ? hcp.toFixed(1) : '—'}</span>
          <span className="hcp-label">Handicap index (estimate)</span>
        </div>
        <p className="hcp-note">
          {hcp !== null
            ? `Based on your last ${Math.min(ratedCount, 20)} rated 18-hole rounds (simplified WHS — not an official index).`
            : ratedCount > 0
              ? `Log ${3 - ratedCount} more 18-hole round${3 - ratedCount === 1 ? '' : 's'} with course rating & slope to estimate your index.`
              : 'Add course rating & slope to your rounds (in “Stats, conditions & journal”) to estimate your handicap index.'}
        </p>
      </section>

      <Stats rounds={rounds} />

      <LineChart
        title="Score to par (last 20 × 18-hole rounds)"
        points={scorePoints}
        zeroLine
        formatValue={(v) => formatToPar(Math.round(v))}
      />
      <LineChart title="Putts per round" points={puttPoints} />

      <section className="records" aria-label="Personal records">
        <h3>Records & milestones</h3>
        <ul>
          {best18 && (
            <li>
              Best 18: <strong>{best18.score} ({formatToPar(toPar(best18))})</strong> at {best18.course}
            </li>
          )}
          {best9 && (
            <li>
              Best 9: <strong>{best9.score} ({formatToPar(toPar(best9))})</strong> at {best9.course}
            </li>
          )}
          {totalEagles > 0 && <li>Career eagles: <strong>{totalEagles}</strong></li>}
          {totalBirdies > 0 && <li>Career birdies: <strong>{totalBirdies}</strong></li>}
          {mostBirdies && holeBreakdown(mostBirdies.holesData!).birdies > 0 && (
            <li>
              Most birdies in a round: <strong>{holeBreakdown(mostBirdies.holesData!).birdies}</strong> at {mostBirdies.course}
            </li>
          )}
          {parAvgs.map((p) => (
            <li key={p.par}>
              Par-{p.par} scoring average: <strong>{p.avg.toFixed(2)}</strong>
              <span className="record-sub"> ({p.count} holes)</span>
            </li>
          ))}
          {withCards.length === 0 && (
            <li className="record-sub">
              Use the hole-by-hole scorecard to unlock birdie counts and par-3/4/5 averages.
            </li>
          )}
        </ul>
      </section>
    </>
  )
}
