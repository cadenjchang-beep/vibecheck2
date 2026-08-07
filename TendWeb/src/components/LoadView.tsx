import { useMemo, useState } from 'react'
import {
  CATEGORY_LABELS,
  LOAD_CATEGORIES,
  fractionOf,
  monthWindow,
  summarizeLoad,
  weekWindow,
} from '../lib/load'
import { ChartIcon } from './icons'
import type { HouseholdData } from '../types'

interface Props {
  data: HouseholdData
  onClose(): void
}

/**
 * Load View.
 *
 * The design brief is the hard part here, not the code: make imbalance visible
 * **without** becoming a scoreboard. Concretely, in this file:
 *
 * - Bars render in household order. `summarizeLoad` already refuses to sort by
 *   volume, and this view doesn't re-sort.
 * - Per-person totals are hidden behind a toggle. A number invites comparison
 *   in a way a shape doesn't.
 * - No rank, no target, no streak, no week-over-week delta.
 * - The caveat stays on screen. It's part of the claim the chart makes, not a
 *   disclaimer to dismiss.
 */
export default function LoadView({ data, onClose }: Props) {
  const [isWeekly, setWeekly] = useState(true)
  const [showCounts, setShowCounts] = useState(false)

  const summary = useMemo(
    () => summarizeLoad(data, isWeekly ? weekWindow() : monthWindow()),
    [data, isWeekly],
  )

  return (
    <div className="screen">
      <header className="screen-head with-back">
        <button className="btn btn-quiet" onClick={onClose}>
          Back
        </button>
        <h1>The shape of the week</h1>
      </header>

      <div className="segmented" role="tablist" aria-label="Window">
        <button role="tab" aria-selected={isWeekly} onClick={() => setWeekly(true)}>
          Week
        </button>
        <button role="tab" aria-selected={!isWeekly} onClick={() => setWeekly(false)}>
          Month
        </button>
      </div>

      {summary.householdTotal === 0 ? (
        <div className="empty">
          <ChartIcon size={40} />
          <h2>Nothing to show yet</h2>
          <p>
            As things get checked off, this fills in with the shape of who's been carrying what.
          </p>
        </div>
      ) : (
        <>
          <ul className="load-bars">
            {summary.shares.map((share) => (
              <li key={share.memberId}>
                <div className="load-bar-head">
                  <span>{share.name}</span>
                  {showCounts && <span className="tabular muted">{share.total}</span>}
                </div>
                <div
                  className="load-track"
                  role="img"
                  aria-label={`${share.name}: ${
                    share.total === 0
                      ? `nothing logged this ${isWeekly ? 'week' : 'month'}`
                      : `${share.total} ${share.total === 1 ? 'thing' : 'things'} logged`
                  }`}
                >
                  <span
                    className="load-fill"
                    style={{
                      background: share.colorHex,
                      width:
                        share.total === 0
                          ? '0'
                          : `max(12px, ${fractionOf(share, summary.householdTotal) * 100}%)`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={showCounts}
              onChange={(e) => setShowCounts(e.target.checked)}
            />
            <span>Show counts</span>
          </label>

          {summary.observation && <p className="observation">{summary.observation}</p>}

          <details className="breakdown">
            <summary>What's counted</summary>
            <ul>
              {LOAD_CATEGORIES.map((category) => (
                <li key={category}>
                  <span>{CATEGORY_LABELS[category]}</span>
                  <span className="tabular muted">
                    {summary.shares.reduce((sum, s) => sum + s.counts[category], 0)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}

      <p className="caveat">{summary.caveat}</p>
    </div>
  )
}
