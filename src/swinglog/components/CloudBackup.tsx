import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { useSwingLog } from '../store'
import { AlertIcon, CloudIcon } from '../icons'

/**
 * Optional off-device backup for the clips themselves.
 *
 * Lesson records stay local either way — this only moves video bytes into the
 * storage bucket so a lost or wiped phone doesn't take a season of swings with
 * it. Signing in here is what gives the upload a JWT to write under the coach's
 * own path prefix.
 */
export function CloudBackup() {
  const { data, flushUploads, uploading } = useSwingLog()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signedInAs, setSignedInAs] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data: result }) => {
      setSignedInAs(result.session?.user.email ?? null)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sessionState) => {
      setSignedInAs(sessionState?.user.email ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const pending = data.videos.filter((v) => v.uploadState !== 'uploaded').length
  const failed = data.videos.filter((v) => v.uploadState === 'failed')

  if (!supabase) {
    return (
      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <CloudIcon width={18} height={18} style={{ color: 'var(--muted)' }} />
          <strong style={{ fontSize: '0.92rem' }}>Cloud backup</strong>
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>
          Not configured. Set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>, then run{' '}
          <code>supabase/swinglog-schema.sql</code> to create the bucket. Until then every clip
          lives on this device only.
        </p>
      </div>
    )
  }

  const submit = async (mode: 'signin' | 'signup') => {
    const client = supabase
    if (!client) return
    setBusy(true)
    setMessage(null)
    const result =
      mode === 'signin'
        ? await client.auth.signInWithPassword({ email, password })
        : await client.auth.signUp({ email, password })
    setBusy(false)
    if (result.error) {
      setMessage(result.error.message)
      return
    }
    if (!result.data.session) {
      setMessage('Check your inbox to confirm the address, then sign in.')
      return
    }
    setPassword('')
    void flushUploads()
  }

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 8 }}>
        <span className="row" style={{ gap: 8 }}>
          <CloudIcon width={18} height={18} style={{ color: 'var(--turf)' }} />
          <strong style={{ fontSize: '0.92rem' }}>Cloud backup</strong>
        </span>
        <span className="pill">{pending === 0 ? 'All backed up' : `${pending} waiting`}</span>
      </div>

      {message && (
        <div className="banner warn">
          <AlertIcon width={18} height={18} />
          <span>{message}</span>
        </div>
      )}

      {signedInAs ? (
        <>
          <p className="tiny muted" style={{ marginTop: 0 }}>
            Signed in as {signedInAs}. Clips upload straight to your storage bucket — they never pass
            through an app server.
          </p>
          {failed.length > 0 && (
            <p className="tiny" style={{ color: 'var(--red)' }}>
              {failed.length} {failed.length === 1 ? 'clip' : 'clips'} failed:{' '}
              {failed[0].uploadError}
            </p>
          )}
          <div className="row">
            <button
              type="button"
              className="btn btn-sm grow"
              onClick={() => void flushUploads()}
              disabled={uploading || pending === 0}
            >
              {uploading ? 'Backing up…' : 'Back up now'}
            </button>
            <button
              type="button"
              className="btn btn-sm grow"
              onClick={() => void supabase?.auth.signOut()}
            >
              Disconnect
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="field">
            <span className="label">Email</span>
            <input
              type="email"
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">Password</span>
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <div className="row">
            <button
              type="button"
              className="btn btn-sm grow"
              disabled={busy || !email || !password}
              onClick={() => void submit('signup')}
            >
              Create account
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm grow"
              disabled={busy || !email || !password}
              onClick={() => void submit('signin')}
            >
              Connect
            </button>
          </div>
        </>
      )}
    </div>
  )
}
