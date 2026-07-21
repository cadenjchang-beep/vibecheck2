import { useEffect, useMemo, useRef, useState } from 'react'
import More from './More'
import Practice from './Practice'
import RoundCard from './RoundCard'
import RoundForm from './RoundForm'
import Stats from './Stats'
import Tournaments from './Tournaments'
import Trends from './Trends'
import { loadData, saveData } from './storage'
import type {
  Club,
  Goal,
  GolfRound,
  JournalData,
  PracticeDraft,
  RoundDraft,
  RoundType,
  TournamentDraft,
} from './types'
import { ROUND_TYPE_LABELS } from './types'

type Tab = 'rounds' | 'practice' | 'tournaments' | 'trends' | 'more'

const TABS: { id: Tab; label: string }[] = [
  { id: 'rounds', label: '⛳ Rounds' },
  { id: 'practice', label: '🏌️ Practice' },
  { id: 'tournaments', label: '🏆 Events' },
  { id: 'trends', label: '📈 Trends' },
  { id: 'more', label: '⚙️ More' },
]

function App() {
  const [data, setData] = useState<JournalData>(loadData)
  const [tab, setTab] = useState<Tab>('rounds')
  const [editing, setEditing] = useState<GolfRound | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | RoundType>('all')
  const formRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    saveData(data)
  }, [data])

  const sorted = useMemo(
    () =>
      [...data.rounds].sort((a, b) =>
        a.date === b.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date),
      ),
    [data.rounds],
  )

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sorted.filter((r) => {
      if (typeFilter !== 'all' && (r.roundType ?? 'casual') !== typeFilter) return false
      if (!q) return true
      return (
        r.course.toLowerCase().includes(q) ||
        (r.notes ?? '').toLowerCase().includes(q) ||
        (r.highlights ?? '').toLowerCase().includes(q) ||
        (r.workOns ?? '').toLowerCase().includes(q)
      )
    })
  }, [sorted, search, typeFilter])

  const handleSaveRound = (draft: RoundDraft) => {
    if (editing) {
      setData((d) => ({
        ...d,
        rounds: d.rounds.map((r) => (r.id === editing.id ? { ...r, ...draft } : r)),
      }))
      setEditing(null)
    } else {
      setData((d) => ({
        ...d,
        rounds: [...d.rounds, { ...draft, id: crypto.randomUUID(), createdAt: Date.now() }],
      }))
    }
  }

  const handleEditRound = (round: GolfRound) => {
    setEditing(round)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleDeleteRound = (id: string) => {
    setData((d) => ({ ...d, rounds: d.rounds.filter((r) => r.id !== id) }))
    if (editing?.id === id) setEditing(null)
  }

  const handleSavePractice = (draft: PracticeDraft, editingId: string | null) => {
    setData((d) => ({
      ...d,
      practice: editingId
        ? d.practice.map((p) => (p.id === editingId ? { ...p, ...draft } : p))
        : [...d.practice, { ...draft, id: crypto.randomUUID(), createdAt: Date.now() }],
    }))
  }

  const handleSaveTournament = (draft: TournamentDraft, editingId: string | null) => {
    setData((d) => ({
      ...d,
      tournaments: editingId
        ? d.tournaments.map((t) => (t.id === editingId ? { ...t, ...draft } : t))
        : [...d.tournaments, { ...draft, id: crypto.randomUUID(), createdAt: Date.now() }],
    }))
  }

  const handleDeleteTournament = (id: string) => {
    setData((d) => ({
      ...d,
      tournaments: d.tournaments.filter((t) => t.id !== id),
      rounds: d.rounds.map((r) =>
        r.tournamentId === id ? { ...r, tournamentId: undefined } : r,
      ),
    }))
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>⛳ Golf Journal</h1>
        <p className="tagline">Rounds · practice · tournaments · trends</p>
      </header>

      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'tab active' : 'tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'rounds' && (
        <>
          <Stats rounds={data.rounds} />
          <div ref={formRef}>
            <RoundForm
              editing={editing}
              tournaments={data.tournaments}
              onSave={handleSaveRound}
              onCancel={() => setEditing(null)}
            />
          </div>
          <section className="rounds" aria-label="Logged rounds">
            {data.rounds.length > 0 && (
              <div className="list-controls">
                <input
                  type="search"
                  className="search"
                  placeholder="Search courses & notes…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as 'all' | RoundType)}
                  aria-label="Filter by round type"
                >
                  <option value="all">All types</option>
                  {(Object.keys(ROUND_TYPE_LABELS) as RoundType[]).map((t) => (
                    <option key={t} value={t}>
                      {ROUND_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {data.rounds.length === 0 ? (
              <p className="empty">No rounds yet — log your first one above. 🏌️</p>
            ) : visible.length === 0 ? (
              <p className="empty">No rounds match your search.</p>
            ) : (
              visible.map((round) => (
                <RoundCard
                  key={round.id}
                  round={round}
                  tournament={data.tournaments.find((t) => t.id === round.tournamentId)}
                  onEdit={handleEditRound}
                  onDelete={handleDeleteRound}
                />
              ))
            )}
          </section>
        </>
      )}

      {tab === 'practice' && (
        <Practice
          sessions={data.practice}
          onSave={handleSavePractice}
          onDelete={(id) =>
            setData((d) => ({ ...d, practice: d.practice.filter((p) => p.id !== id) }))
          }
        />
      )}

      {tab === 'tournaments' && (
        <Tournaments
          tournaments={data.tournaments}
          rounds={data.rounds}
          onSave={handleSaveTournament}
          onDelete={handleDeleteTournament}
        />
      )}

      {tab === 'trends' && <Trends rounds={data.rounds} />}

      {tab === 'more' && (
        <More
          data={data}
          onReplaceData={setData}
          onUpdateClubs={(clubs: Club[]) => setData((d) => ({ ...d, clubs }))}
          onUpdateGoals={(goals: Goal[]) => setData((d) => ({ ...d, goals }))}
        />
      )}

      <footer className="app-footer">
        Data is saved locally in this browser — back it up from the More tab.
      </footer>
    </div>
  )
}

export default App
