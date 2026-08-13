import { useMemo, useState } from 'react'
import { useSwingLog } from '../store'
import { drillsForFaults, faultIdsForDrill } from '../selectors'
import { faultName } from '../taxonomy'
import { CheckIcon, SearchIcon } from '../icons'

interface DrillPickerProps {
  /** Faults diagnosed on this lesson — drives what gets suggested first. */
  faultIds: string[]
  selected: string[]
  onChange: (next: string[]) => void
}

export function DrillPicker({ faultIds, selected, onChange }: DrillPickerProps) {
  const { data } = useSwingLog()
  const [query, setQuery] = useState('')
  const [browseAll, setBrowseAll] = useState(faultIds.length === 0)

  const suggested = useMemo(() => drillsForFaults(data, faultIds), [data, faultIds])
  const suggestedIds = useMemo(() => new Set(suggested.map((d) => d.id)), [suggested])

  const listed = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = browseAll || faultIds.length === 0 ? data.drills : suggested
    const filtered = q
      ? pool.filter(
          (d) => d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q),
        )
      : pool
    if (browseAll) {
      // Keep the relevant ones on top even while browsing the whole library.
      return [...filtered].sort((a, b) => {
        const aRel = suggestedIds.has(a.id) ? 0 : 1
        const bRel = suggestedIds.has(b.id) ? 0 : 1
        return aRel - bRel || a.name.localeCompare(b.name)
      })
    }
    return filtered
  }, [browseAll, data.drills, faultIds.length, query, suggested, suggestedIds])

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  return (
    <div>
      {faultIds.length > 0 && (
        <p className="tiny muted" style={{ marginTop: 0 }}>
          {browseAll
            ? 'Showing the whole library, with drills for today’s diagnosis first.'
            : `Filtered to drills that address ${faultIds.map(faultName).join(', ')}.`}
        </p>
      )}

      <div className="searchbox">
        <SearchIcon width={18} height={18} />
        <input
          type="text"
          value={query}
          placeholder="Search drills…"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search drills"
        />
      </div>

      {listed.length === 0 ? (
        <p className="muted tiny">
          {query ? `No drill matches “${query}”.` : 'No drill in the library covers those faults yet.'}
        </p>
      ) : (
        <div className="card flush">
          {listed.map((drill) => {
            const on = selected.includes(drill.id)
            const covers = faultIdsForDrill(data, drill.id)
            return (
              <button
                key={drill.id}
                type="button"
                className="list-row"
                onClick={() => toggle(drill.id)}
                aria-pressed={on}
              >
                <span className={`check${on ? ' on' : ''}`}>
                  <CheckIcon width={15} height={15} />
                </span>
                <span className="grow">
                  <span style={{ display: 'block', fontWeight: 600, fontSize: '0.92rem' }}>
                    {drill.name}
                  </span>
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {drill.description}
                  </span>
                  {covers.length > 0 && (
                    <span className="tiny faint" style={{ display: 'block', marginTop: 4 }}>
                      {covers.map(faultName).join(' · ')}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {faultIds.length > 0 && (
        <button
          type="button"
          className="btn btn-block btn-sm"
          style={{ marginTop: 10 }}
          onClick={() => setBrowseAll((v) => !v)}
        >
          {browseAll ? 'Show only matching drills' : 'Browse the whole library'}
        </button>
      )}
    </div>
  )
}
