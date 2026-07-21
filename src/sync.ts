import { supabase } from './supabase'
import type { JournalData } from './types'
import { emptyData } from './types'

export interface RemoteJournal {
  data: JournalData
  updatedAt: string
}

interface Stamped {
  id: string
  updatedAt?: number
  createdAt?: number
}

function stamp(x: Stamped): number {
  return x.updatedAt ?? x.createdAt ?? 0
}

function mergeList<T extends Stamped>(local: T[], remote: T[]): T[] {
  const byId = new Map<string, T>()
  for (const item of remote) byId.set(item.id, item)
  const merged: T[] = []
  const seen = new Set<string>()
  for (const item of local) {
    const other = byId.get(item.id)
    merged.push(other && stamp(other) > stamp(item) ? other : item)
    seen.add(item.id)
  }
  for (const item of remote) {
    if (!seen.has(item.id)) merged.push(item)
  }
  return merged
}

/**
 * Union merge for the rare case where two devices changed data since the
 * last sync: keeps every entity from both sides, newer edit wins per id.
 */
export function mergeData(local: JournalData, remote: JournalData): JournalData {
  return {
    ...emptyData(),
    rounds: mergeList(local.rounds, remote.rounds),
    practice: mergeList(local.practice, remote.practice),
    tournaments: mergeList(local.tournaments, remote.tournaments),
    clubs: mergeList(local.clubs, remote.clubs),
    goals: mergeList(local.goals, remote.goals),
  }
}

export async function pullJournal(): Promise<RemoteJournal | null> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: row, error } = await supabase
    .from('journals')
    .select('data, updated_at')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!row) return null
  return {
    data: { ...emptyData(), ...(row.data as JournalData), version: 2 },
    updatedAt: row.updated_at as string,
  }
}

export async function pushJournal(userId: string, data: JournalData): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured')
  const updatedAt = new Date().toISOString()
  const { error } = await supabase
    .from('journals')
    .upsert({ user_id: userId, data, updated_at: updatedAt })
  if (error) throw new Error(error.message)
  return updatedAt
}
