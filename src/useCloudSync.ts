import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadSyncMeta, saveSyncMeta } from './storage'
import { supabase } from './supabase'
import { mergeData, pullJournal, pushJournal } from './sync'
import type { JournalData } from './types'

export type SyncStatus = 'disabled' | 'signedOut' | 'syncing' | 'synced' | 'error'

export interface CloudSync {
  status: SyncStatus
  email: string | null
  error: string
  info: string
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  syncNow: () => void
}

const PUSH_DEBOUNCE_MS = 2000

/**
 * Offline-first sync: localStorage stays the source of truth on the device,
 * and the whole journal document is mirrored to a per-user Supabase row.
 * On sign-in/app open we pull; local edits are pushed debounced. If both
 * sides changed since the last sync, lists are union-merged (newer edit
 * wins per entry).
 */
export function useCloudSync(
  data: JournalData,
  adoptData: (data: JournalData) => void,
): CloudSync {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<SyncStatus>(supabase ? 'signedOut' : 'disabled')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const dataRef = useRef(data)
  dataRef.current = data
  const sessionRef = useRef(session)
  sessionRef.current = session
  const applyingRemote = useRef(false)
  const firstRender = useRef(true)
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncing = useRef(false)

  const doPush = useCallback(async () => {
    const s = sessionRef.current
    if (!supabase || !s) return
    setStatus('syncing')
    try {
      const updatedAt = await pushJournal(s.user.id, dataRef.current)
      saveSyncMeta({ lastSyncedAt: updatedAt, dirty: false })
      setStatus('synced')
      setError('')
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : 'Could not reach the sync server.')
    }
  }, [])

  const fullSync = useCallback(async () => {
    const s = sessionRef.current
    if (!supabase || !s || syncing.current) return
    syncing.current = true
    setStatus('syncing')
    setError('')
    try {
      const meta = loadSyncMeta()
      const remote = await pullJournal()
      if (!remote) {
        // First device to sync: seed the cloud with local data.
        await doPush()
      } else if (!meta.dirty) {
        // No unsynced local edits — adopt the cloud copy (deletions included).
        applyingRemote.current = true
        adoptData(remote.data)
        saveSyncMeta({ lastSyncedAt: remote.updatedAt, dirty: false })
        setStatus('synced')
      } else if (remote.updatedAt === meta.lastSyncedAt) {
        // Cloud unchanged since our last sync — safe to overwrite with local.
        await doPush()
      } else {
        // Both sides changed: merge, adopt, push.
        const merged = mergeData(dataRef.current, remote.data)
        applyingRemote.current = true
        adoptData(merged)
        dataRef.current = merged
        await doPush()
      }
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : 'Sync failed.')
    } finally {
      syncing.current = false
    }
  }, [adoptData, doPush])

  // Track auth state.
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  // Initial sync whenever a session appears.
  const userId = session?.user.id ?? null
  useEffect(() => {
    if (userId) {
      void fullSync()
    } else if (supabase) {
      setStatus('signedOut')
    }
  }, [userId, fullSync])

  // Debounced push on local edits.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    if (applyingRemote.current) {
      applyingRemote.current = false
      return
    }
    saveSyncMeta({ ...loadSyncMeta(), dirty: true })
    if (!sessionRef.current) return
    if (pushTimer.current) clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(() => void doPush(), PUSH_DEBOUNCE_MS)
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current)
    }
  }, [data, doPush])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return
    setError('')
    setInfo('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return
    setError('')
    setInfo('')
    const { data: result, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setError(error.message)
    } else if (!result.session) {
      setInfo('Account created — check your email to confirm it, then sign in here.')
    }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    if (pushTimer.current) clearTimeout(pushTimer.current)
    await supabase.auth.signOut()
    saveSyncMeta({ lastSyncedAt: null, dirty: false })
    setStatus('signedOut')
    setInfo('')
    setError('')
  }, [])

  return {
    status,
    email: session?.user.email ?? null,
    error,
    info,
    signIn,
    signUp,
    signOut,
    syncNow: () => void fullSync(),
  }
}
