import { useRef, useState } from 'react'
import Account from './Account'
import { BagIcon, DownloadIcon, TargetIcon } from './icons'
import { exportData, parseImport } from './storage'
import type { Club, Goal, JournalData } from './types'
import type { CloudSync } from './useCloudSync'

interface Props {
  data: JournalData
  sync: CloudSync
  onReplaceData: (data: JournalData) => void
  onUpdateClubs: (clubs: Club[]) => void
  onUpdateGoals: (goals: Goal[]) => void
}

function optionalNum(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : undefined
}

export default function More({ data, sync, onReplaceData, onUpdateClubs, onUpdateGoals }: Props) {
  const [goalText, setGoalText] = useState('')
  const [goalDate, setGoalDate] = useState('')
  const [clubName, setClubName] = useState('')
  const [clubCarry, setClubCarry] = useState('')
  const [clubTotal, setClubTotal] = useState('')
  const [importError, setImportError] = useState('')
  const [pendingImport, setPendingImport] = useState<JournalData | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const addGoal = (e: React.FormEvent) => {
    e.preventDefault()
    if (!goalText.trim()) return
    onUpdateGoals([
      ...data.goals,
      {
        id: crypto.randomUUID(),
        text: goalText.trim(),
        targetDate: goalDate || undefined,
        achieved: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ])
    setGoalText('')
    setGoalDate('')
  }

  const addClub = (e: React.FormEvent) => {
    e.preventDefault()
    if (!clubName.trim()) return
    onUpdateClubs([
      ...data.clubs,
      {
        id: crypto.randomUUID(),
        name: clubName.trim(),
        carry: optionalNum(clubCarry),
        total: optionalNum(clubTotal),
        updatedAt: Date.now(),
      },
    ])
    setClubName('')
    setClubCarry('')
    setClubTotal('')
  }

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError('')
    file.text().then((text) => {
      const parsed = parseImport(text)
      if (parsed) {
        setPendingImport(parsed)
      } else {
        setImportError('That file is not a valid golf journal export.')
      }
    })
    e.target.value = ''
  }

  const sortedClubs = [...data.clubs].sort((a, b) => (b.carry ?? 0) - (a.carry ?? 0))
  const activeGoals = data.goals.filter((g) => !g.achieved)
  const doneGoals = data.goals.filter((g) => g.achieved)

  return (
    <>
      <Account sync={sync} />

      <section className="round-form" aria-label="Goals">
        <h2><TargetIcon /> Goals</h2>
        <form onSubmit={addGoal} className="inline-form">
          <input
            type="text"
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
            placeholder="Break 80 · Get index below 10 · Practice 3× a week"
          />
          <input
            type="date"
            value={goalDate}
            onChange={(e) => setGoalDate(e.target.value)}
            aria-label="Target date"
          />
          <button type="submit" className="primary" disabled={!goalText.trim()}>Add</button>
        </form>
        {data.goals.length === 0 && <p className="round-meta">No goals set yet.</p>}
        <ul className="goal-list">
          {[...activeGoals, ...doneGoals].map((g) => (
            <li key={g.id} className={g.achieved ? 'achieved' : ''}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={g.achieved}
                  onChange={(e) =>
                    onUpdateGoals(
                      data.goals.map((x) =>
                        x.id === g.id
                          ? { ...x, achieved: e.target.checked, updatedAt: Date.now() }
                          : x,
                      ),
                    )
                  }
                />
                <span>
                  {g.text}
                  {g.targetDate && <span className="record-sub"> · by {g.targetDate}</span>}
                </span>
              </label>
              <button
                type="button"
                className="danger small"
                onClick={() => onUpdateGoals(data.goals.filter((x) => x.id !== g.id))}
                aria-label={`Delete goal: ${g.text}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="round-form" aria-label="My bag">
        <h2><BagIcon /> My bag — club distances</h2>
        <form onSubmit={addClub} className="inline-form">
          <input
            type="text"
            value={clubName}
            onChange={(e) => setClubName(e.target.value)}
            placeholder="7 iron"
          />
          <input
            type="number"
            min="0"
            value={clubCarry}
            onChange={(e) => setClubCarry(e.target.value)}
            placeholder="Carry"
            aria-label="Carry distance"
          />
          <input
            type="number"
            min="0"
            value={clubTotal}
            onChange={(e) => setClubTotal(e.target.value)}
            placeholder="Total"
            aria-label="Total distance"
          />
          <button type="submit" className="primary" disabled={!clubName.trim()}>Add</button>
        </form>
        {sortedClubs.length > 0 && (
          <table className="club-table">
            <thead>
              <tr>
                <th>Club</th>
                <th className="num">Carry</th>
                <th className="num">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedClubs.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="num">{c.carry ?? '—'}</td>
                  <td className="num">{c.total ?? '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="danger small"
                      onClick={() => onUpdateClubs(data.clubs.filter((x) => x.id !== c.id))}
                      aria-label={`Delete ${c.name}`}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="round-form" aria-label="Backup and restore">
        <h2><DownloadIcon /> Backup & restore</h2>
        <p className="round-meta">
          Your journal lives in this browser. Export a backup file regularly, or move your data to
          another device by importing it there.
        </p>
        <div className="form-actions">
          <button type="button" className="primary" onClick={() => exportData(data)}>
            Export data
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}>
            Import data…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
            hidden
          />
        </div>
        {importError && <p className="import-error">{importError}</p>}
        {pendingImport && (
          <div className="import-confirm">
            <p>
              Import <strong>{pendingImport.rounds.length}</strong> rounds,{' '}
              <strong>{pendingImport.practice.length}</strong> practice sessions and{' '}
              <strong>{pendingImport.tournaments.length}</strong> tournaments? This replaces
              everything currently in the app.
            </p>
            <div className="form-actions">
              <button
                type="button"
                className="danger"
                onClick={() => {
                  onReplaceData(pendingImport)
                  setPendingImport(null)
                }}
              >
                Replace my data
              </button>
              <button type="button" onClick={() => setPendingImport(null)}>Cancel</button>
            </div>
          </div>
        )}
      </section>
    </>
  )
}
