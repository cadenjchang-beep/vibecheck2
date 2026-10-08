import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import More from './More'
import { deletePhotos, removeOrphanPhotos } from './photoStore'
import { deleteRemotePhotos, referencedPhotoIds } from './photoSync'
import Practice from './Practice'
import RoundCard from './RoundCard'
import RoundForm from './RoundForm'
import ScanPanel from './Scan'
import Scorecards from './Scorecards'
import Stats from './Stats'
import Tournaments from './Tournaments'
import Trends from './Trends'
import {
  BallIcon,
  ChartIcon,
  FlagIcon,
  GearIcon,
  LogoMark,
  ScorecardIcon,
  TrophyIcon,
} from './icons'
import { useSettings } from './settings'
import { loadData, saveData } from './storage'
import { useCloudSync } from './useCloudSync'
import { useScanQueue } from './useScanQueue'
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

type Tab = 'rounds' | 'cards' | 'practice' | 'tournaments' | 'trends' | 'more'

const TABS: { id: Tab; label: string; Icon: typeof FlagIcon }[] = [
  { id: 'rounds', label: 'Rounds', Icon: FlagIcon },
  { id: 'cards', label: 'Cards', Icon: ScorecardIcon },
  { id: 'practice', label: 'Practice', Icon: BallIcon },
  { id: 'tournaments', label: 'Events', Icon: TrophyIcon },
  { id: 'trends', label: 'Trends', Icon: ChartIcon },
  { id: 'more', label: 'More', Icon: GearIcon },
]

function App() {
  const [data, setData] = useState<JournalData>(loadData)
  const [tab, setTab] = useState<Tab>('rounds')
  const [editing, setEditing] = useState<GolfRound | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | RoundType>('all')
  const [notice, setNotice] = useState('')
  const formRef = useRef<HTMLDivElement>(null)
  const [settings, updateSettings] = useSettings()
  const queue = useScanQueue(settings)
  const currentScan = queue.items[0] ?? null

  useEffect(() => {
    saveData(data)
  }, [data])

  const sync = useCloudSync(data, setData)

  // Clear out photos from scans abandoned in an earlier visit (a day's grace
  // keeps a scan in progress in another tab safe).
  const initialData = useRef(data)
  useEffect(() => {
    void removeOrphanPhotos(
      new Set(referencedPhotoIds(initialData.current)),
      Date.now() - 24 * 60 * 60 * 1000,
    ).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 4000)
    return () => clearTimeout(t)
  }, [notice])

  // Bring the review form into view when a new batch of photos arrives.
  const hasScan = currentScan !== null
  useEffect(() => {
    if (hasScan && !editing) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hasScan, editing])

  const removePhotos = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    void deletePhotos(ids).catch(() => undefined)
    void deleteRemotePhotos(ids)
  }, [])

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
      const kept = new Set(draft.photoIds ?? [])
      removePhotos((editing.photoIds ?? []).filter((id) => !kept.has(id)))
      setData((d) => ({
        ...d,
        rounds: d.rounds.map((r) =>
          r.id === editing.id ? { ...r, ...draft, updatedAt: Date.now() } : r,
        ),
      }))
      setEditing(null)
    } else {
      setData((d) => ({
        ...d,
        rounds: [
          ...d.rounds,
          { ...draft, id: crypto.randomUUID(), createdAt: Date.now(), updatedAt: Date.now() },
        ],
      }))
      if (currentScan) {
        queue.remove(currentScan.id)
        const left = queue.items.length - 1
        setNotice(
          left > 0
            ? `Round saved — ${left} more card${left === 1 ? '' : 's'} to review.`
            : 'Round saved.',
        )
      }
    }
  }

  const handleEditRound = (round: GolfRound) => {
    setTab('rounds')
    setEditing(round)
    requestAnimationFrame(() =>
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }

  const handleDeleteRound = (id: string) => {
    removePhotos(data.rounds.find((r) => r.id === id)?.photoIds ?? [])
    setData((d) => ({ ...d, rounds: d.rounds.filter((r) => r.id !== id) }))
    if (editing?.id === id) setEditing(null)
  }

  const handleScanFiles = (files: File[]) => {
    setTab('rounds')
    void queue.addFiles(files)
  }

  const handleSavePractice = (draft: PracticeDraft, editingId: string | null) => {
    setData((d) => ({
      ...d,
      practice: editingId
        ? d.practice.map((p) =>
            p.id === editingId ? { ...p, ...draft, updatedAt: Date.now() } : p,
          )
        : [
            ...d.practice,
            { ...draft, id: crypto.randomUUID(), createdAt: Date.now(), updatedAt: Date.now() },
          ],
    }))
  }

  const handleSaveTournament = (draft: TournamentDraft, editingId: string | null) => {
    setData((d) => ({
      ...d,
      tournaments: editingId
        ? d.tournaments.map((t) =>
            t.id === editingId ? { ...t, ...draft, updatedAt: Date.now() } : t,
          )
        : [
            ...d.tournaments,
            { ...draft, id: crypto.randomUUID(), createdAt: Date.now(), updatedAt: Date.now() },
          ],
    }))
  }

  const handleDeleteTournament = (id: string) => {
    setData((d) => ({
      ...d,
      tournaments: d.tournaments.filter((t) => t.id !== id),
      rounds: d.rounds.map((r) =>
        r.tournamentId === id ? { ...r, tournamentId: undefined, updatedAt: Date.now() } : r,
      ),
    }))
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="wordmark">
          <LogoMark size={38} className="logo" />
          <span className="wordmark-text">Golf Journal</span>
        </div>
        <p className="tagline">Scorecards · Practice · Analytics</p>
      </header>

      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'tab active' : 'tab'}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            <t.Icon size={17} />
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'rounds' && (
        <>
          <ScanPanel queue={queue} canRead={settings.anthropicApiKey !== ''} notice={notice} />
          <Stats rounds={data.rounds} />
          <div ref={formRef} className="form-anchor">
            <RoundForm
              editing={editing}
              scan={currentScan}
              scanCount={queue.items.length}
              tournaments={data.tournaments}
              settings={settings}
              onSave={handleSaveRound}
              onCancel={() => setEditing(null)}
              onSkipScan={() => currentScan && queue.remove(currentScan.id)}
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
              <p className="empty">No rounds yet — log your first one above.</p>
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

      {tab === 'cards' && (
        <Scorecards rounds={data.rounds} onScanFiles={handleScanFiles} onEdit={handleEditRound} />
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
          sync={sync}
          settings={settings}
          onUpdateSettings={updateSettings}
          onReplaceData={setData}
          onUpdateClubs={(clubs: Club[]) => setData((d) => ({ ...d, clubs }))}
          onUpdateGoals={(goals: Goal[]) => setData((d) => ({ ...d, goals }))}
        />
      )}

      <footer className="app-footer">
        {sync.email
          ? `Syncing to the cloud as ${sync.email}.`
          : 'Data is saved locally in this browser — sync or back it up from the More tab.'}
      </footer>
    </div>
  )
}

export default App
