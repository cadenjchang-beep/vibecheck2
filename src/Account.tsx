import { useState } from 'react'
import { CloudIcon } from './icons'
import type { CloudSync } from './useCloudSync'

interface Props {
  sync: CloudSync
}

export default function Account({ sync }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  if (sync.status === 'disabled') {
    return (
      <section className="round-form" aria-label="Cloud sync">
        <h2><CloudIcon /> Cloud sync</h2>
        <p className="round-meta">
          Cloud sync is not configured for this deployment. To enable it, create a free Supabase
          project, run <code>supabase/schema.sql</code> in its SQL editor, and set{' '}
          <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> when building the
          app (see the README). Until then, everything is stored in this browser — use Backup
          &amp; restore below to move data between devices.
        </p>
      </section>
    )
  }

  if (sync.email) {
    return (
      <section className="round-form" aria-label="Cloud sync">
        <h2><CloudIcon /> Cloud sync</h2>
        <p className="round-meta">
          Signed in as <strong>{sync.email}</strong> — your journal syncs across every device
          where you sign in.
        </p>
        <p className={`sync-status sync-${sync.status}`}>
          {sync.status === 'syncing' && 'Syncing…'}
          {sync.status === 'synced' && '✓ Up to date'}
          {sync.status === 'error' && `Sync problem: ${sync.error}`}
        </p>
        <div className="form-actions">
          <button type="button" onClick={sync.syncNow} disabled={sync.status === 'syncing'}>
            Sync now
          </button>
          <button type="button" onClick={() => void sync.signOut()}>
            Sign out
          </button>
        </div>
      </section>
    )
  }

  const submit = async (action: 'in' | 'up') => {
    setBusy(true)
    try {
      if (action === 'in') await sync.signIn(email.trim(), password)
      else await sync.signUp(email.trim(), password)
    } finally {
      setBusy(false)
    }
  }

  const valid = email.trim().includes('@') && password.length >= 6

  return (
    <section className="round-form" aria-label="Cloud sync">
      <h2>☁️ Cloud sync</h2>
      <p className="round-meta">
        Sign in and your rounds, practice, tournaments, goals and bag follow you across devices.
        Your data stays available offline and syncs automatically when you're back online.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit('in')
        }}
      >
        <div className="form-grid">
          <label className="span-2">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="span-2">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              minLength={6}
              placeholder="At least 6 characters"
              required
            />
          </label>
        </div>
        <div className="form-actions">
          <button type="submit" className="primary" disabled={!valid || busy}>
            Sign in
          </button>
          <button type="button" disabled={!valid || busy} onClick={() => void submit('up')}>
            Create account
          </button>
        </div>
      </form>
      {sync.error && <p className="import-error">{sync.error}</p>}
      {sync.info && <p className="sync-info">{sync.info}</p>}
    </section>
  )
}
