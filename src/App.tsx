import { useEffect, useMemo, useRef, useState } from 'react'
import RoundCard from './RoundCard'
import RoundForm from './RoundForm'
import Stats from './Stats'
import { loadRounds, saveRounds } from './storage'
import type { GolfRound, RoundDraft } from './types'

function App() {
  const [rounds, setRounds] = useState<GolfRound[]>(loadRounds)
  const [editing, setEditing] = useState<GolfRound | null>(null)
  const [search, setSearch] = useState('')
  const formRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    saveRounds(rounds)
  }, [rounds])

  const sorted = useMemo(
    () =>
      [...rounds].sort((a, b) =>
        a.date === b.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date),
      ),
    [rounds],
  )

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter(
      (r) =>
        r.course.toLowerCase().includes(q) ||
        (r.notes ?? '').toLowerCase().includes(q) ||
        (r.highlights ?? '').toLowerCase().includes(q) ||
        (r.workOns ?? '').toLowerCase().includes(q),
    )
  }, [sorted, search])

  const handleSave = (draft: RoundDraft) => {
    if (editing) {
      setRounds((rs) =>
        rs.map((r) => (r.id === editing.id ? { ...r, ...draft } : r)),
      )
      setEditing(null)
    } else {
      setRounds((rs) => [
        ...rs,
        { ...draft, id: crypto.randomUUID(), createdAt: Date.now() },
      ])
    }
  }

  const handleEdit = (round: GolfRound) => {
    setEditing(round)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleDelete = (id: string) => {
    setRounds((rs) => rs.filter((r) => r.id !== id))
    if (editing?.id === id) setEditing(null)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>⛳ Golf Journal</h1>
        <p className="tagline">Log your rounds. Remember what mattered.</p>
      </header>

      <Stats rounds={rounds} />

      <div ref={formRef}>
        <RoundForm editing={editing} onSave={handleSave} onCancel={() => setEditing(null)} />
      </div>

      <section className="rounds" aria-label="Logged rounds">
        {rounds.length > 0 && (
          <input
            type="search"
            className="search"
            placeholder="Search courses & notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
        {rounds.length === 0 ? (
          <p className="empty">No rounds yet — log your first one above. 🏌️</p>
        ) : visible.length === 0 ? (
          <p className="empty">No rounds match “{search}”.</p>
        ) : (
          visible.map((round) => (
            <RoundCard
              key={round.id}
              round={round}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))
        )}
      </section>

      <footer className="app-footer">
        Data is saved locally in this browser.
      </footer>
    </div>
  )
}

export default App
