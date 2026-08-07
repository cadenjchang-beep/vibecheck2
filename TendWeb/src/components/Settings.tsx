import { useState } from 'react'
import { exportData, parseImport, type Identity } from '../storage'
import type { HouseholdSync } from '../useHouseholdSync'
import { nextMemberColor, type HouseholdData, type Member } from '../types'

interface Props {
  data: HouseholdData
  setData(next: HouseholdData): void
  identity: Identity
  setIdentity(next: Identity): void
  sync: HouseholdSync
  onClose(): void
}

export default function Settings({ data, setData, identity, setIdentity, sync, onClose }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const run = async (action: () => Promise<void>, message?: string) => {
    setBusy(true)
    setNotice(null)
    try {
      await action()
      if (message) setNotice(message)
    } catch {
      // The hook already surfaces the error text.
    } finally {
      setBusy(false)
    }
  }

  const addMember = () => {
    const member: Member = {
      id: crypto.randomUUID(),
      name: 'New member',
      colorHex: nextMemberColor(data.members.map((m) => m.colorHex)),
      isChild: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setData({ ...data, members: [...data.members, member] })
  }

  return (
    <div className="screen">
      <header className="screen-head with-back">
        <button className="btn btn-quiet" onClick={onClose}>
          Back
        </button>
        <h1>Settings</h1>
      </header>

      <section className="panel">
        <h2>This device</h2>
        <label className="field">
          <span>I'm</span>
          <select
            value={identity.memberId ?? ''}
            onChange={(e) => setIdentity({ ...identity, memberId: e.target.value || null })}
          >
            <option value="">Not set</option>
            {data.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <p className="footnote">
          Everything you check off is recorded as yours. That's what makes the shape of the week
          accurate.
        </p>
      </section>

      <section className="panel">
        <h2>Household</h2>
        <label className="field">
          <span>Name</span>
          <input
            value={data.householdName}
            onChange={(e) => setData({ ...data, householdName: e.target.value })}
          />
        </label>

        <ul className="item-list">
          {data.members.map((member) => (
            <li key={member.id} className="item-row">
              <span className="swatch" style={{ background: member.colorHex }} aria-hidden="true" />
              <input
                className="inline-input"
                value={member.name}
                aria-label="Member name"
                onChange={(e) =>
                  setData({
                    ...data,
                    members: data.members.map((m) =>
                      m.id === member.id ? { ...m, name: e.target.value, updatedAt: Date.now() } : m,
                    ),
                  })
                }
              />
              {member.id === identity.memberId && <span className="muted small">You</span>}
            </li>
          ))}
        </ul>
        <button className="btn btn-quiet" onClick={addMember}>
          Add someone
        </button>
      </section>

      <section className="panel">
        <h2>Sharing</h2>

        {!sync.configured ? (
          <p className="footnote">
            Sync isn't configured for this deployment, so Tend is running entirely in this browser.
            Everything works except sharing with other people. See the README to switch it on.
          </p>
        ) : sync.state === 'signedOut' ? (
          <>
            <p className="footnote">
              Sharing needs an account so the household can be reached from more than one device.
            </p>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <div className="row-actions">
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => run(() => sync.signIn(email, password))}
              >
                Sign in
              </button>
              <button
                className="btn btn-quiet"
                disabled={busy}
                onClick={() => run(() => sync.signUp(email, password), 'Check your email to confirm.')}
              >
                Create an account
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted small">Signed in as {sync.email}</p>

            <label className="field">
              <span>Invite code</span>
              <input readOnly value={identity.householdId ?? ''} onFocus={(e) => e.target.select()} />
            </label>
            <p className="footnote">
              Anyone with this code can see and change everything in this household. Send it to a
              person — don't post it anywhere.
            </p>

            <div className="row-actions">
              <button
                className="btn btn-primary"
                disabled={busy || !identity.householdId}
                onClick={() =>
                  run(() => sync.startSharing(identity.householdId!), 'Sharing is on.')
                }
              >
                Start sharing
              </button>
              <button className="btn btn-quiet" disabled={busy} onClick={() => run(() => sync.syncNow())}>
                Sync now
              </button>
            </div>

            <label className="field">
              <span>Join another household</span>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.trim())}
                placeholder="Paste an invite code"
              />
            </label>
            <button
              className="btn btn-quiet"
              disabled={busy || !joinCode}
              onClick={() =>
                run(async () => {
                  const joined = await sync.join(joinCode)
                  if (joined) {
                    setData(joined)
                    // The member picker is deliberately reset: whoever is
                    // holding this device has to say who they are in the new
                    // household before anything gets attributed to them.
                    setIdentity({ householdId: joinCode, memberId: null })
                  }
                }, 'Joined. Pick who you are above.')
              }
            >
              Join
            </button>

            <button
              className="btn btn-danger"
              disabled={busy || !identity.householdId}
              onClick={() =>
                run(
                  () => sync.leave(identity.householdId!),
                  "You've left. Your copy stays on this device.",
                )
              }
            >
              Leave this household
            </button>
            <p className="footnote">
              Leaving stops syncing. Nothing is deleted — your copy stays here and you can still
              export it.
            </p>
          </>
        )}

        {sync.error && <p className="error">{sync.error}</p>}
        {notice && <p className="notice">{notice}</p>}
      </section>

      <section className="panel">
        <h2>Your data</h2>
        <div className="row-actions">
          <button className="btn btn-quiet" onClick={() => exportData(data)}>
            Export JSON
          </button>
          <label className="btn btn-quiet">
            Import
            <input
              type="file"
              accept="application/json"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const parsed = parseImport(await file.text())
                if (parsed) setData(parsed)
                else setNotice("That file didn't look like a Tend export.")
              }}
            />
          </label>
        </div>
        <p className="footnote">
          Whatever happens to this household, its contents can always leave as plain JSON.
        </p>
      </section>
    </div>
  )
}
