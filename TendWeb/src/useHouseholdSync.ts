import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { loadSyncMeta, saveSyncMeta } from './storage'
import { createHousehold, joinHousehold, leaveHousehold, mergeData, pullHousehold, pushHousehold } from './sync'
import type { HouseholdData } from './types'

export type SyncState = 'off' | 'signedOut' | 'idle' | 'syncing' | 'offline' | 'error'

export interface HouseholdSync {
  state: SyncState
  email: string | null
  error: string | null
  lastSyncedAt: string | null
  pendingCount: number
  configured: boolean
  signUp(email: string, password: string): Promise<void>
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  startSharing(householdId: string): Promise<void>
  join(householdId: string): Promise<HouseholdData | null>
  leave(householdId: string): Promise<void>
  syncNow(): Promise<void>
}

const PUSH_DEBOUNCE_MS = 2000

/**
 * Offline-first sync.
 *
 * Local writes land immediately and are pushed on a short debounce. Opening the
 * app pulls. When both sides changed, `mergeData` unions them. The one thing
 * this hook must never do is block a local edit on the network.
 */
export function useHouseholdSync(
  householdId: string | null,
  data: HouseholdData,
  setData: (next: HouseholdData) => void,
): HouseholdSync {
  const [state, setState] = useState<SyncState>(supabase ? 'signedOut' : 'off')
  const [email, setEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState(loadSyncMeta)
  const [online, setOnline] = useState(() => navigator.onLine)

  // Refs, not state: the debounce timer reads the latest data without becoming
  // a dependency that restarts the timer on every keystroke.
  const dataRef = useRef(data)
  const timerRef = useRef<number | null>(null)
  const pulledOnce = useRef(false)
  dataRef.current = data

  const updateMeta = useCallback((next: { lastSyncedAt?: string | null; dirty?: boolean }) => {
    setMeta((current) => {
      const merged = { ...current, ...next }
      saveSyncMeta(merged)
      return merged
    })
  }, [])

  // -- Connectivity -----------------------------------------------------------

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // -- Auth -------------------------------------------------------------------

  useEffect(() => {
    if (!supabase) return
    let cancelled = false

    supabase.auth.getSession().then(({ data: session }) => {
      if (cancelled) return
      setEmail(session.session?.user.email ?? null)
      setState(session.session ? 'idle' : 'signedOut')
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null)
      setState(session ? 'idle' : 'signedOut')
      // A different account must never see the previous one's cached household.
      pulledOnce.current = false
    })

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
  }, [])

  // -- Pull on open -----------------------------------------------------------

  const syncNow = useCallback(async () => {
    if (!supabase || !householdId || state === 'signedOut' || state === 'off') return
    if (!navigator.onLine) {
      setState('offline')
      return
    }

    setState('syncing')
    setError(null)
    try {
      const remote = await pullHousehold(householdId)
      if (remote) {
        const bothChanged = meta.dirty && remote.updatedAt !== meta.lastSyncedAt
        const merged = bothChanged ? mergeData(dataRef.current, remote.data) : remote.data

        if (bothChanged) {
          setData(merged)
          const updatedAt = await pushHousehold(householdId, merged)
          updateMeta({ lastSyncedAt: updatedAt, dirty: false })
        } else if (remote.updatedAt !== meta.lastSyncedAt) {
          setData(remote.data)
          updateMeta({ lastSyncedAt: remote.updatedAt, dirty: false })
        }
      } else {
        const updatedAt = await pushHousehold(householdId, dataRef.current)
        updateMeta({ lastSyncedAt: updatedAt, dirty: false })
      }
      setState('idle')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setState('error')
    }
  }, [householdId, meta.dirty, meta.lastSyncedAt, setData, state, updateMeta])

  useEffect(() => {
    if (pulledOnce.current || state !== 'idle' || !householdId) return
    pulledOnce.current = true
    void syncNow()
  }, [householdId, state, syncNow])

  // -- Push on change ---------------------------------------------------------

  useEffect(() => {
    if (!supabase || !householdId || state === 'signedOut' || state === 'off') return
    if (!pulledOnce.current) return

    updateMeta({ dirty: true })
    if (timerRef.current) window.clearTimeout(timerRef.current)

    timerRef.current = window.setTimeout(async () => {
      if (!navigator.onLine) {
        // Stay dirty. The next successful sync carries it — nothing is dropped
        // because the radio was off.
        setState('offline')
        return
      }
      try {
        const updatedAt = await pushHousehold(householdId, dataRef.current)
        updateMeta({ lastSyncedAt: updatedAt, dirty: false })
        setState('idle')
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught))
        setState('error')
      }
    }, PUSH_DEBOUNCE_MS)

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
    // `data` is the trigger; the rest are stable callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, householdId, state])

  // Coming back online is the moment queued work should go out.
  useEffect(() => {
    if (online && meta.dirty && state === 'offline') void syncNow()
  }, [online, meta.dirty, state, syncNow])

  // -- Actions ----------------------------------------------------------------

  const wrap = useCallback(async (action: () => Promise<void>) => {
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      throw caught
    }
  }, [])

  return {
    state: online ? state : 'offline',
    email,
    error,
    lastSyncedAt: meta.lastSyncedAt,
    pendingCount: meta.dirty ? 1 : 0,
    configured: Boolean(supabase),

    signUp: (address, password) =>
      wrap(async () => {
        if (!supabase) throw new Error('Sync is not configured')
        const { error: caught } = await supabase.auth.signUp({ email: address, password })
        if (caught) throw new Error(caught.message)
      }),

    signIn: (address, password) =>
      wrap(async () => {
        if (!supabase) throw new Error('Sync is not configured')
        const { error: caught } = await supabase.auth.signInWithPassword({ email: address, password })
        if (caught) throw new Error(caught.message)
      }),

    signOut: () =>
      wrap(async () => {
        if (!supabase) return
        await supabase.auth.signOut()
        // The local copy stays. Signing out is not deleting.
        updateMeta({ lastSyncedAt: null, dirty: true })
      }),

    startSharing: (id) =>
      wrap(async () => {
        await createHousehold(id, dataRef.current)
        updateMeta({ lastSyncedAt: new Date().toISOString(), dirty: false })
        pulledOnce.current = true
      }),

    join: async (id) => {
      let joined: HouseholdData | null = null
      await wrap(async () => {
        const remote = await joinHousehold(id)
        joined = remote?.data ?? null
        if (remote) {
          updateMeta({ lastSyncedAt: remote.updatedAt, dirty: false })
          pulledOnce.current = true
        }
      })
      return joined
    },

    leave: (id) =>
      wrap(async () => {
        await leaveHousehold(id)
        updateMeta({ lastSyncedAt: null, dirty: false })
      }),

    syncNow,
  }
}
