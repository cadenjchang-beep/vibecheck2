import { useMemo, useState } from 'react'
import { useSwingLog } from '../store'
import { faultIdsForDrill } from '../selectors'
import { FaultPicker } from '../components/FaultPicker'
import { faultName } from '../taxonomy'
import { PlusIcon, SearchIcon, TrashIcon } from '../icons'

export function DrillLibrary() {
  const { data, addCustomDrill, deleteCustomDrill } = useSwingLog()
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [faultIds, setFaultIds] = useState<string[]>([])

  const drills = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? data.drills.filter(
          (d) => d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q),
        )
      : data.drills
    return [...list].sort(
      (a, b) => Number(b.custom) - Number(a.custom) || a.name.localeCompare(b.name),
    )
  }, [data.drills, query])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    addCustomDrill({ name, description, faultTagIds: faultIds })
    setName('')
    setDescription('')
    setFaultIds([])
    setAdding(false)
  }

  if (adding) {
    return (
      <form onSubmit={submit}>
        <h2 className="section">New drill</h2>
        <div className="card">
          <label className="field">
            <span className="label">Name</span>
            <input
              type="text"
              value={name}
              autoFocus
              placeholder="Split-hand release drill"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span className="label">How to do it</span>
            <textarea
              value={description}
              placeholder="What the student should actually do, in a sentence or two."
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        </div>

        <h2 className="section">Which faults does it fix?</h2>
        <FaultPicker selected={faultIds} onChange={setFaultIds} pinned={data.pinnedFaultIds} />

        <div className="actionbar">
          <button type="button" className="btn grow" onClick={() => setAdding(false)}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary grow" disabled={!name.trim()}>
            Save drill
          </button>
        </div>
      </form>
    )
  }

  return (
    <>
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

      <button type="button" className="btn btn-block" onClick={() => setAdding(true)}>
        <PlusIcon width={18} height={18} />
        Add your own drill
      </button>

      <h2 className="section">
        {drills.length} {drills.length === 1 ? 'drill' : 'drills'}
      </h2>

      {drills.length === 0 ? (
        <p className="muted tiny">No drill matches “{query}”.</p>
      ) : (
        <div className="stack">
          {drills.map((drill) => {
            const covers = faultIdsForDrill(data, drill.id)
            return (
              <div className="card" key={drill.id}>
                <div className="row between">
                  <strong style={{ fontSize: '0.96rem' }}>{drill.name}</strong>
                  {drill.custom && (
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={() => deleteCustomDrill(drill.id)}
                      aria-label={`Delete ${drill.name}`}
                    >
                      <TrashIcon width={17} height={17} />
                    </button>
                  )}
                </div>
                <p className="tiny muted" style={{ margin: '6px 0 0' }}>
                  {drill.description}
                </p>
                {covers.length > 0 && (
                  <div className="chips" style={{ marginTop: 10 }}>
                    {covers.map((id) => (
                      <span key={id} className="chip static">
                        {faultName(id)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
