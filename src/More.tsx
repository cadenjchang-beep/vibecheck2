import { useEffect, useRef, useState } from 'react'
import Account from './Account'
import { BagIcon, DownloadIcon, SparkleIcon, TargetIcon } from './icons'
import { blobToDataUrl, dataUrlToBlob, makeThumb } from './image'
import { getPhoto, photoUsage, putPhoto } from './photoStore'
import { downloadPhoto, referencedPhotoIds } from './photoSync'
import type { Settings } from './settings'
import type { ParsedImport, PhotoBackup } from './storage'
import { exportData, parseImport } from './storage'
import type { Club, Goal, JournalData } from './types'
import type { CloudSync } from './useCloudSync'

interface Props {
  data: JournalData
  sync: CloudSync
  settings: Settings
  onUpdateSettings: (patch: Partial<Settings>) => void
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

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function ScorecardReading({
  settings,
  onUpdateSettings,
  photoCount,
}: {
  settings: Settings
  onUpdateSettings: (patch: Partial<Settings>) => void
  photoCount: number
}) {
  const [keyDraft, setKeyDraft] = useState(settings.anthropicApiKey)
  const [nameDraft, setNameDraft] = useState(settings.playerName)
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [usage, setUsage] = useState<{ count: number; bytes: number } | null>(null)

  useEffect(() => {
    photoUsage().then(setUsage, () => setUsage(null))
  }, [photoCount])

  const dirty = keyDraft.trim() !== settings.anthropicApiKey || nameDraft.trim() !== settings.playerName
  const keyLooksOdd = keyDraft.trim() !== '' && !keyDraft.trim().startsWith('sk-ant-')

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    onUpdateSettings({ anthropicApiKey: keyDraft.trim(), playerName: nameDraft.trim() })
    setSaved(true)
  }

  return (
    <section className="round-form" aria-label="Scorecard reading">
      <h2><SparkleIcon /> Scorecard reading</h2>
      <p className="round-meta">
        Scorecard photos are read by Claude, Anthropic's AI model, using your own Anthropic API
        key. The key is kept only in this browser — it is never synced or put in backups — and is
        sent only to Anthropic. Reading a card typically uses a few cents of API credit. Create a
        key in the{' '}
        <a href="https://platform.claude.com/" target="_blank" rel="noreferrer">
          Claude Console
        </a>
        .
      </p>
      <form onSubmit={save}>
        <div className="form-grid">
          <label className="span-2">
            Anthropic API key
            <span className="key-field">
              <input
                type={showKey ? 'text' : 'password'}
                value={keyDraft}
                onChange={(e) => {
                  setKeyDraft(e.target.value)
                  setSaved(false)
                }}
                placeholder="sk-ant-…"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="button" className="small-btn" onClick={() => setShowKey((v) => !v)}>
                {showKey ? 'Hide' : 'Show'}
              </button>
            </span>
          </label>
          <label className="span-2">
            Your name on scorecards
            <input
              type="text"
              value={nameDraft}
              onChange={(e) => {
                setNameDraft(e.target.value)
                setSaved(false)
              }}
              placeholder="Joe, JC"
            />
          </label>
        </div>
        <p className="field-hint">
          Used to pick your row when several players are on one card. Separate nicknames or
          initials with commas.
        </p>
        {keyLooksOdd && <p className="import-error">Anthropic API keys usually start with “sk-ant-”.</p>}
        <div className="form-actions">
          <button type="submit" className="primary" disabled={!dirty}>
            Save
          </button>
          {settings.anthropicApiKey && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                onUpdateSettings({ anthropicApiKey: '' })
                setKeyDraft('')
                setSaved(false)
              }}
            >
              Remove key
            </button>
          )}
        </div>
      </form>
      <p className={`sync-status ${settings.anthropicApiKey ? 'sync-synced' : 'sync-syncing'}`}>
        {saved && !dirty
          ? '✓ Saved'
          : settings.anthropicApiKey
            ? '✓ Automatic reading is on'
            : 'Automatic reading is off — photos are still saved with your rounds.'}
      </p>
      {usage && usage.count > 0 && (
        <p className="round-meta">
          {usage.count} scorecard photo{usage.count === 1 ? '' : 's'} stored on this device (
          {formatBytes(usage.bytes)}).
        </p>
      )}
    </section>
  )
}

/** Collects the journal's photos as data URLs, fetching cloud-only ones first. */
async function collectPhotos(ids: string[]): Promise<{ photos: PhotoBackup; missing: number }> {
  const photos: PhotoBackup = {}
  let missing = 0
  for (const id of ids) {
    let photo = await getPhoto(id)
    if (!photo && (await downloadPhoto(id))) photo = await getPhoto(id)
    if (photo) photos[id] = await blobToDataUrl(photo.full)
    else missing++
  }
  return { photos, missing }
}

async function restorePhotos(photos: PhotoBackup): Promise<void> {
  for (const [id, dataUrl] of Object.entries(photos)) {
    const full = await dataUrlToBlob(dataUrl)
    await putPhoto({ id, full, thumb: await makeThumb(full), createdAt: Date.now() })
  }
}

export default function More({
  data,
  sync,
  settings,
  onUpdateSettings,
  onReplaceData,
  onUpdateClubs,
  onUpdateGoals,
}: Props) {
  const [goalText, setGoalText] = useState('')
  const [goalDate, setGoalDate] = useState('')
  const [clubName, setClubName] = useState('')
  const [clubCarry, setClubCarry] = useState('')
  const [clubTotal, setClubTotal] = useState('')
  const [importError, setImportError] = useState('')
  const [pendingImport, setPendingImport] = useState<ParsedImport | null>(null)
  const [includePhotos, setIncludePhotos] = useState(true)
  const [busy, setBusy] = useState('')
  const [backupNote, setBackupNote] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const photoIds = referencedPhotoIds(data)

  const handleExport = async () => {
    setBackupNote('')
    if (!includePhotos || photoIds.length === 0) {
      exportData(data)
      return
    }
    setBusy('Preparing backup…')
    try {
      const { photos, missing } = await collectPhotos(photoIds)
      exportData(data, photos)
      if (missing > 0) {
        setBackupNote(
          `${missing} photo${missing === 1 ? ' was' : 's were'} not available on this device and ${missing === 1 ? 'is' : 'are'} not in the backup.`,
        )
      }
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Could not prepare the backup.')
    } finally {
      setBusy('')
    }
  }

  const confirmImport = async (pending: ParsedImport) => {
    setBusy('Restoring…')
    try {
      await restorePhotos(pending.photos)
      onReplaceData(pending.data)
      setPendingImport(null)
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Could not restore the photos in that backup.')
    } finally {
      setBusy('')
    }
  }

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
      <ScorecardReading
        settings={settings}
        onUpdateSettings={onUpdateSettings}
        photoCount={photoIds.length}
      />

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
        {photoIds.length > 0 && (
          <label className="check">
            <input
              type="checkbox"
              checked={includePhotos}
              onChange={(e) => setIncludePhotos(e.target.checked)}
            />
            Include scorecard photos ({photoIds.length})
          </label>
        )}
        <div className="form-actions">
          <button type="button" className="primary" onClick={() => void handleExport()} disabled={busy !== ''}>
            {busy === 'Preparing backup…' ? busy : 'Export data'}
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy !== ''}>
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
        {backupNote && <p className="round-meta">{backupNote}</p>}
        {importError && <p className="import-error">{importError}</p>}
        {pendingImport && (
          <div className="import-confirm">
            <p>
              Import <strong>{pendingImport.data.rounds.length}</strong> rounds,{' '}
              <strong>{pendingImport.data.practice.length}</strong> practice sessions,{' '}
              <strong>{pendingImport.data.tournaments.length}</strong> tournaments
              {Object.keys(pendingImport.photos).length > 0 && (
                <>
                  {' '}and <strong>{Object.keys(pendingImport.photos).length}</strong> scorecard photos
                </>
              )}
              ? This replaces everything currently in the app.
            </p>
            <div className="form-actions">
              <button
                type="button"
                className="danger"
                disabled={busy !== ''}
                onClick={() => void confirmImport(pendingImport)}
              >
                {busy === 'Restoring…' ? busy : 'Replace my data'}
              </button>
              <button type="button" onClick={() => setPendingImport(null)}>Cancel</button>
            </div>
          </div>
        )}
      </section>
    </>
  )
}
