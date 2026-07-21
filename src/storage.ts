import type { GolfRound } from './types'

const STORAGE_KEY = 'golf-journal-rounds'

export function loadRounds(): GolfRound[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveRounds(rounds: GolfRound[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rounds))
}
