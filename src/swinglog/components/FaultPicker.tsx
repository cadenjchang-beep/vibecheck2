import { useMemo, useState } from 'react'
import { FAULT_CATEGORIES, FAULT_TAGS, getFault } from '../taxonomy'
import { CheckIcon, SearchIcon, XIcon } from '../icons'

interface FaultPickerProps {
  selected: string[]
  onChange: (next: string[]) => void
  /** Faults shown as one-tap chips before the coach has to search. */
  pinned: string[]
}

/**
 * The tagging step has to be mostly tapping, not typing — a coach who has to
 * spell out "over the top" between lessons stops logging by week two. Pinned
 * presets cover the handful of faults any one coach diagnoses most.
 */
export function FaultPicker({ selected, onChange, pinned }: FaultPickerProps) {
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    return FAULT_TAGS.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q),
    )
  }, [query])

  const pinnedFaults = pinned.map((id) => getFault(id)).filter((f) => f !== undefined)

  return (
    <div>
      {selected.length > 0 && (
        <div className="chips" style={{ marginBottom: 14 }}>
          {selected.map((id) => (
            <button key={id} type="button" className="chip selected" onClick={() => toggle(id)}>
              {getFault(id)?.name ?? id}
              <XIcon width={14} height={14} />
            </button>
          ))}
        </div>
      )}

      {pinnedFaults.length > 0 && !query && (
        <>
          <h2 className="section">Most common</h2>
          <div className="chips">
            {pinnedFaults.map((fault) => (
              <button
                key={fault.id}
                type="button"
                className={`chip${selected.includes(fault.id) ? ' selected' : ''}`}
                onClick={() => toggle(fault.id)}
                aria-pressed={selected.includes(fault.id)}
              >
                {fault.name}
              </button>
            ))}
          </div>
        </>
      )}

      <h2 className="section">Full taxonomy</h2>
      <div className="searchbox">
        <SearchIcon width={18} height={18} />
        <input
          type="text"
          value={query}
          placeholder="Search faults…"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search the fault taxonomy"
        />
      </div>

      {matches ? (
        matches.length === 0 ? (
          <p className="muted tiny">No fault matches “{query}”.</p>
        ) : (
          <div className="card flush">
            {matches.map((fault) => (
              <FaultRow
                key={fault.id}
                id={fault.id}
                name={fault.name}
                meta={fault.category}
                on={selected.includes(fault.id)}
                onToggle={toggle}
              />
            ))}
          </div>
        )
      ) : (
        <>
          {(showAll ? FAULT_CATEGORIES : FAULT_CATEGORIES.slice(0, 3)).map((category) => (
            <div key={category} style={{ marginBottom: 12 }}>
              <p className="tiny faint" style={{ margin: '0 0 6px 2px', fontWeight: 700 }}>
                {category.toUpperCase()}
              </p>
              <div className="card flush">
                {FAULT_TAGS.filter((f) => f.category === category).map((fault) => (
                  <FaultRow
                    key={fault.id}
                    id={fault.id}
                    name={fault.name}
                    meta={fault.description}
                    on={selected.includes(fault.id)}
                    onToggle={toggle}
                  />
                ))}
              </div>
            </div>
          ))}
          {!showAll && (
            <button type="button" className="btn btn-block btn-sm" onClick={() => setShowAll(true)}>
              Show all {FAULT_CATEGORIES.length} categories
            </button>
          )}
        </>
      )}
    </div>
  )
}

function FaultRow({
  id,
  name,
  meta,
  on,
  onToggle,
}: {
  id: string
  name: string
  meta: string
  on: boolean
  onToggle: (id: string) => void
}) {
  return (
    <button type="button" className="list-row" onClick={() => onToggle(id)} aria-pressed={on}>
      <span className={`check${on ? ' on' : ''}`}>
        <CheckIcon width={15} height={15} />
      </span>
      <span className="grow">
        <span style={{ display: 'block', fontWeight: 600, fontSize: '0.92rem' }}>{name}</span>
        <span className="tiny muted truncate" style={{ display: 'block' }}>
          {meta}
        </span>
      </span>
    </button>
  )
}
