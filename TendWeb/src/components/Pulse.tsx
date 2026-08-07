import { useMemo } from 'react'
import type { Route } from '../App'
import { formatRelative } from '../lib/dates'
import { fractionOf, summarizeLoad, weekWindow } from '../lib/load'
import { generatePulse, pulseKindFor } from '../lib/pulse'
import { ChevronRightIcon, ICONS, PulseIcon } from './icons'
import type { HouseholdData } from '../types'

interface Props {
  data: HouseholdData
  onNavigate(route: Route): void
  onOpenLoad(): void
}

/**
 * Pulse — the recap, and the app's home screen.
 *
 * It opens onto what the household is carrying rather than onto a calendar
 * grid, because the grid is what every other app opens onto.
 */
export default function Pulse({ data, onNavigate, onOpenLoad }: Props) {
  const now = new Date()
  const snapshot = useMemo(() => generatePulse(data, pulseKindFor(now), now), [data]) // eslint-disable-line react-hooks/exhaustive-deps
  const load = useMemo(() => summarizeLoad(data, weekWindow(now)), [data]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>{snapshot.headline}</h1>
        <p className="muted small">Updated {formatRelative(snapshot.generatedAt)}</p>
      </header>

      {snapshot.lines.length === 0 ? (
        <div className="empty">
          <PulseIcon size={40} />
          <h2>Nothing needs you right now</h2>
          <p>
            When there are events, tasks or lists in flight, this is where the shape of the week
            shows up.
          </p>
        </div>
      ) : (
        <ul className="pulse-lines">
          {snapshot.lines.map((line) => {
            const Icon = ICONS[line.icon] ?? PulseIcon
            return (
              <li key={line.id}>
                <button
                  className="pulse-line"
                  onClick={() =>
                    onNavigate({
                      tab: line.target.tab as Route['tab'],
                      id: line.target.id,
                      listName: line.target.listName,
                    })
                  }
                >
                  <Icon />
                  <span className="pulse-text">{line.text}</span>
                  <ChevronRightIcon size={16} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <button className="load-card" onClick={onOpenLoad}>
        <span className="sparkline" aria-hidden="true">
          {load.householdTotal === 0 ? (
            <span className="spark spark-empty" />
          ) : (
            load.shares.map((share) => (
              <span
                key={share.memberId}
                className="spark"
                style={{
                  background: share.colorHex,
                  width: `${Math.max(6, fractionOf(share, load.householdTotal) * 56)}px`,
                }}
              />
            ))
          )}
        </span>
        <span className="load-card-text">
          <strong>The shape of the week</strong>
          <span className="muted small">
            {load.observation ?? "Who's been carrying what."}
          </span>
        </span>
        <ChevronRightIcon size={16} />
      </button>
    </div>
  )
}
