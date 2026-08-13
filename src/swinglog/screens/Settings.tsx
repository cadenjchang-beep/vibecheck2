import { useEffect, useRef, useState } from 'react'
import { useSwingLog } from '../store'
import { CloudBackup } from '../components/CloudBackup'
import { estimateStorage, requestPersistence } from '../db'
import { exportData, parseImport } from '../storage'
import { formatBytes } from '../media'
import { FAULT_TAGS } from '../taxonomy'
import { AlertIcon, CheckIcon } from '../icons'

export function Settings() {
  const {
    data,
    session,
    tier,
    togglePinnedFault,
    setSubscriptionStatus,
    replaceData,
    resetEverything,
    signOut,
  } = useSwingLog()

  const fileRef = useRef<HTMLInputElement | null>(null)
  const [usage, setUsage] = useState<{ usedBytes: number; quotaBytes: number | null } | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmingReset, setConfirmingReset] = useState(false)

  useEffect(() => {
    void estimateStorage().then(setUsage)
  }, [data.videos.length])

  const onImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const parsed = parseImport(await file.text())
    if (!parsed) {
      setMessage('That file isn’t a SwingLog export.')
      return
    }
    replaceData(parsed)
    setMessage('Records imported. Video clips stay on the device that recorded them.')
  }

  return (
    <>
      {message && (
        <div className="banner info">
          <span>{message}</span>
        </div>
      )}

      <h2 className="section">Account</h2>
      <div className="card">
        <strong style={{ fontSize: '0.96rem' }}>{data.coach?.name ?? 'Coach'}</strong>
        <p className="tiny muted" style={{ margin: '2px 0 0' }}>
          {data.coach?.email || 'No email on file'}
          {session?.role === 'student' && ' · viewing as a student'}
        </p>
      </div>

      <h2 className="section">Plan</h2>
      <div className="card">
        <div className="row between">
          <div>
            <strong style={{ fontSize: '0.96rem' }}>{tier.paid ? 'Unlimited' : 'Free'}</strong>
            <p className="tiny muted" style={{ margin: '2px 0 0' }}>
              {tier.paid
                ? 'Unlimited students and lessons.'
                : `${tier.studentCount}/${tier.maxStudents} students · ${tier.lessonCount}/${tier.maxLessons} lessons`}
            </p>
          </div>
          <span className="pill">{tier.paid ? '$24/mo' : '$0'}</span>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          {tier.paid ? (
            <button
              type="button"
              className="btn btn-sm grow"
              onClick={() => setSubscriptionStatus('canceled')}
            >
              Cancel subscription
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm grow"
              onClick={() => setSubscriptionStatus('active')}
            >
              Upgrade — $24/month
            </button>
          )}
        </div>
        <p className="hint">
          Billing isn’t wired up yet: this switch flips the plan locally so the caps can be tested.
          Card payments land with the Stripe integration.
        </p>
      </div>

      <h2 className="section">Pinned faults</h2>
      <p className="tiny muted" style={{ marginTop: 0 }}>
        These show as one-tap chips when you diagnose a lesson. Pin the handful you actually see most.
      </p>
      <div className="chips">
        {FAULT_TAGS.map((fault) => {
          const on = data.pinnedFaultIds.includes(fault.id)
          return (
            <button
              key={fault.id}
              type="button"
              className={`chip${on ? ' selected' : ' ghost'}`}
              onClick={() => togglePinnedFault(fault.id)}
              aria-pressed={on}
            >
              {on && <CheckIcon width={13} height={13} />}
              {fault.name}
            </button>
          )
        })}
      </div>

      <h2 className="section">Video</h2>
      <CloudBackup />

      <div className="card">
        <div className="row between">
          <strong style={{ fontSize: '0.92rem' }}>On this device</strong>
          <span className="tiny muted mono-num">
            {usage ? formatBytes(usage.usedBytes) : '—'}
            {usage?.quotaBytes ? ` of ${formatBytes(usage.quotaBytes)}` : ''}
          </span>
        </div>
        {usage?.quotaBytes && (
          <div className="meter" style={{ marginTop: 8 }}>
            <span style={{ width: `${Math.min(100, (usage.usedBytes / usage.quotaBytes) * 100)}%` }} />
          </div>
        )}
        <p className="hint">
          {data.videos.length} {data.videos.length === 1 ? 'clip' : 'clips'} stored locally.
        </p>
        <button
          type="button"
          className="btn btn-sm btn-block"
          onClick={() => void requestPersistence().then(setPersisted)}
        >
          {persisted === true
            ? 'Storage is protected from eviction'
            : persisted === false
              ? 'Browser declined — try again'
              : 'Protect clips from browser cleanup'}
        </button>
      </div>

      <h2 className="section">Backup &amp; transfer</h2>
      <div className="card">
        <p className="tiny muted" style={{ marginTop: 0 }}>
          Exports every record — students, lessons, diagnoses, annotations and drill assignments — as
          JSON. Clips are not included; they stay in this browser’s storage.
        </p>
        <div className="row">
          <button type="button" className="btn btn-sm grow" onClick={() => exportData(data)}>
            Export records
          </button>
          <button type="button" className="btn btn-sm grow" onClick={() => fileRef.current?.click()}>
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => void onImport(e)}
          />
        </div>
      </div>

      <h2 className="section">Session</h2>
      <button type="button" className="btn btn-block btn-sm" onClick={signOut}>
        Sign out
      </button>

      <hr className="divider" />

      {confirmingReset ? (
        <div className="card">
          <div className="banner error">
            <AlertIcon width={18} height={18} />
            <span>
              This erases every student, lesson and clip on this device. Export first if you want a
              copy.
            </span>
          </div>
          <div className="row">
            <button type="button" className="btn grow" onClick={() => setConfirmingReset(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger grow" onClick={resetEverything}>
              Erase everything
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-danger btn-block btn-sm"
          onClick={() => setConfirmingReset(true)}
        >
          Erase all data on this device
        </button>
      )}
    </>
  )
}
