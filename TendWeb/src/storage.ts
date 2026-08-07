/**
 * Local persistence.
 *
 * Offline-first, exactly like the iOS build: every write lands in localStorage
 * immediately and syncs opportunistically. "Add milk to the list" must never
 * depend on the network.
 */

import { SCHEMA_VERSION, emptyData, type HouseholdData } from './types'

const DATA_KEY = 'tend-household-data'
const IDENTITY_KEY = 'tend-identity'
const SYNC_KEY = 'tend-sync-meta'

/**
 * Migrations run on load, oldest first.
 *
 * Shipping this before there's anything to migrate is deliberate: retrofitting
 * it once real data exists on real devices means writing the migration *and*
 * proving the unversioned data opens correctly everywhere.
 */
type Migration = (data: Record<string, unknown>) => Record<string, unknown>

const MIGRATIONS: Record<number, Migration> = {
  // 1: (data) => ({ ...data, version: 2, newField: [] }),
}

function migrate(raw: Record<string, unknown>): HouseholdData {
  let data = raw
  let version = typeof data.version === 'number' ? data.version : 1

  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version]
    if (!step) break
    data = step(data)
    version = typeof data.version === 'number' ? data.version : version + 1
  }

  // Spreading over `emptyData()` means a field added in a later version is
  // present-and-empty rather than undefined, which is what stops one missing
  // array crashing a whole screen.
  return { ...emptyData(), ...(data as Partial<HouseholdData>), version: SCHEMA_VERSION }
}

export function loadData(): HouseholdData {
  try {
    const raw = localStorage.getItem(DATA_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return migrate(parsed as Record<string, unknown>)
    }
  } catch {
    // Corrupt JSON shouldn't cost someone their whole household. Fall through
    // to empty and let the cloud copy (if any) restore it.
  }
  return emptyData()
}

export function saveData(data: HouseholdData): void {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data))
  } catch (error) {
    // Quota exceeded, usually from recipe photos. Surfaced rather than silent.
    console.error('Could not save locally', error)
  }
}

// -- Identity -----------------------------------------------------------------

export interface Identity {
  /** Which household this browser is looking at. Also the sharing key. */
  householdId: string | null
  /**
   * Which member this browser is. Every completion is attributed to them, which
   * is the entire basis of Load View — so onboarding asks, and Settings lets
   * you change it.
   */
  memberId: string | null
}

export function loadIdentity(): Identity {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        return { householdId: parsed.householdId ?? null, memberId: parsed.memberId ?? null }
      }
    }
  } catch {
    // fall through
  }
  return { householdId: null, memberId: null }
}

export function saveIdentity(identity: Identity): void {
  // Safari in private mode, and an embedded frame with storage blocked, both
  // throw on `setItem`. Tend still works for the session in that case, so this
  // must never take the app down.
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity))
  } catch (error) {
    console.error('Could not save identity locally', error)
  }
}

// -- Sync bookkeeping ---------------------------------------------------------

export interface SyncMeta {
  /** Remote `updated_at` we last pulled or pushed; null before the first sync. */
  lastSyncedAt: string | null
  /** True when local data changed and hasn't been pushed yet. */
  dirty: boolean
}

export function loadSyncMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(SYNC_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        return { lastSyncedAt: parsed.lastSyncedAt ?? null, dirty: Boolean(parsed.dirty) }
      }
    }
  } catch {
    // fall through
  }
  return { lastSyncedAt: null, dirty: false }
}

export function saveSyncMeta(meta: SyncMeta): void {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(meta))
  } catch {
    // Sync bookkeeping is recoverable on the next pull; never fatal.
  }
}

// -- Export -------------------------------------------------------------------

/**
 * The other half of "never silent data loss": whatever happens to a household —
 * you leave it, the owner deletes it, sync breaks — its contents can always
 * leave the app as plain JSON.
 */
export function exportData(data: HouseholdData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `tend-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function parseImport(text: string): HouseholdData | null {
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.members)) {
      return migrate(parsed as Record<string, unknown>)
    }
  } catch {
    // invalid JSON
  }
  return null
}
