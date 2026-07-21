import type { GolfRound, JournalData } from './types'
import { emptyData } from './types'

// Rounds from v1 exports/storage may predate the roundType field.
type LegacyRound = Omit<GolfRound, 'roundType'> & Partial<Pick<GolfRound, 'roundType'>>

function upgradeRound(r: LegacyRound): GolfRound {
  return { ...r, roundType: r.roundType ?? 'casual' }
}

const STORAGE_KEY = 'golf-journal-data'
const LEGACY_KEY = 'golf-journal-rounds'

export function loadData(): JournalData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.rounds)) {
        return { ...emptyData(), ...parsed, version: 2 }
      }
    }
    // Migrate v1 data (a bare array of rounds without roundType).
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const rounds = JSON.parse(legacy)
      if (Array.isArray(rounds)) {
        return { ...emptyData(), rounds: rounds.map(upgradeRound) }
      }
    }
  } catch {
    // fall through to empty data
  }
  return emptyData()
}

export function saveData(data: JournalData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function exportData(data: JournalData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `golf-journal-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function parseImport(text: string): JournalData | null {
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.rounds)) {
      return { ...emptyData(), ...parsed, version: 2 }
    }
    if (Array.isArray(parsed)) {
      return { ...emptyData(), rounds: parsed.map(upgradeRound) }
    }
  } catch {
    // invalid JSON
  }
  return null
}
