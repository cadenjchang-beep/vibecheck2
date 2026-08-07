/**
 * Household sync — the web's answer to CKShare.
 *
 * The iOS build shares a CloudKit zone across Apple IDs. On the web there's no
 * equivalent, so a household is a row that several signed-in users are members
 * of, with row-level security enforcing who can read it. Joining is an invite
 * code rather than a share sheet.
 *
 * The merge below is the important part. Two people editing while offline is
 * normal, not exceptional, and the resolution has to be predictable:
 *
 * - Entities merge **per id**, so two people checking off two different items
 *   never collide. This is the same guarantee the iOS build gets from having
 *   one CloudKit record per item.
 * - Where the *same* entity was edited twice, the newer `updatedAt` wins, and
 *   the UI attributes it ("updated by Sam") rather than prompting.
 * - Deletions lose to edits. Resurrecting an item someone deleted is a mild
 *   annoyance; losing an item someone added is the thing that makes a household
 *   app untrustworthy.
 */

import { supabase } from './supabase'
import { emptyData, type HouseholdData } from './types'

export interface RemoteHousehold {
  data: HouseholdData
  updatedAt: string
}

interface Stamped {
  id: string
  createdAt: number
  updatedAt?: number
}

function stamp(entity: Stamped): number {
  return entity.updatedAt ?? entity.createdAt
}

function mergeList<T extends Stamped>(local: T[], remote: T[]): T[] {
  const remoteById = new Map(remote.map((item) => [item.id, item]))
  const merged: T[] = []
  const seen = new Set<string>()

  for (const item of local) {
    const other = remoteById.get(item.id)
    merged.push(other && stamp(other) > stamp(item) ? other : item)
    seen.add(item.id)
  }
  for (const item of remote) {
    if (!seen.has(item.id)) merged.push(item)
  }
  return merged
}

/** Union merge, newer edit wins per id. Used when both sides changed since the last sync. */
export function mergeData(local: HouseholdData, remote: HouseholdData): HouseholdData {
  return {
    ...emptyData(),
    // The name is a single scalar with no per-field timestamp, so the non-empty
    // one wins and local breaks the tie. It changes about once per household.
    householdName: local.householdName || remote.householdName,
    members: mergeList(local.members, remote.members),
    events: mergeList(local.events, remote.events),
    items: mergeList(local.items, remote.items),
    tasks: mergeList(local.tasks, remote.tasks),
    recipes: mergeList(local.recipes, remote.recipes),
    meals: mergeList(local.meals, remote.meals),
  }
}

export async function pullHousehold(householdId: string): Promise<RemoteHousehold | null> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: row, error } = await supabase
    .from('households')
    .select('data, updated_at')
    .eq('id', householdId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!row) return null
  return {
    data: { ...emptyData(), ...(row.data as HouseholdData) },
    updatedAt: row.updated_at as string,
  }
}

export async function pushHousehold(householdId: string, data: HouseholdData): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured')
  const updatedAt = new Date().toISOString()
  const { error } = await supabase
    .from('households')
    .upsert({ id: householdId, data, updated_at: updatedAt })
  if (error) throw new Error(error.message)
  return updatedAt
}

/**
 * Creates the household row and puts the creator in it.
 *
 * Membership is a separate table so row-level security can answer "may this
 * user read this household" without trusting anything the client sends.
 */
export async function createHousehold(householdId: string, data: HouseholdData): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) throw new Error('Sign in first')

  const { error: memberError } = await supabase
    .from('household_members')
    .upsert({ household_id: householdId, user_id: userId })
  if (memberError) throw new Error(memberError.message)

  await pushHousehold(householdId, data)
}

/**
 * Joins an existing household by its invite code.
 *
 * The code *is* the household id. That is a deliberate simplification with a
 * real consequence worth stating plainly: anyone holding the code can join. It
 * is the web equivalent of a CKShare link, and like a share link it should be
 * sent to a person, not posted somewhere.
 */
export async function joinHousehold(householdId: string): Promise<RemoteHousehold | null> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) throw new Error('Sign in first')

  const { error } = await supabase
    .from('household_members')
    .upsert({ household_id: householdId, user_id: userId })
  if (error) throw new Error(error.message)

  return pullHousehold(householdId)
}

/**
 * Leaves a household.
 *
 * The local copy is deliberately kept. Leaving must never look like data
 * loss — the same rule as the iOS build's read-only archive.
 */
export async function leaveHousehold(householdId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) return

  const { error } = await supabase
    .from('household_members')
    .delete()
    .eq('household_id', householdId)
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}

export async function householdMemberCount(householdId: string): Promise<number> {
  if (!supabase) return 0
  const { count, error } = await supabase
    .from('household_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('household_id', householdId)
  if (error) return 0
  return count ?? 0
}
