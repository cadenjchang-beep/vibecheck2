import { useState } from 'react'
import { useSwingLog } from '../store'
import { AlertIcon, CameraIcon, FlagIcon, TargetIcon } from '../icons'

const TUTORIAL = [
  { Icon: CameraIcon, title: 'Record', body: 'Shoot the swing in the app, or pull a clip off your camera roll.' },
  { Icon: TargetIcon, title: 'Tag', body: 'Pick the fault from a fixed taxonomy so it reads the same every week.' },
  { Icon: FlagIcon, title: 'Assign', body: 'Attach a drill and it lands on the student’s timeline.' },
]

export function Auth() {
  const { data, signUpCoach, signInStudent } = useSwingLog()
  const [mode, setMode] = useState<'coach' | 'student'>('coach')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  const hasCoach = data.coach !== null

  const submitCoach = (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('Enter your name so students know who logged the lesson.')
      return
    }
    signUpCoach(name, email)
  }

  const submitStudent = (event: React.FormEvent) => {
    event.preventDefault()
    const result = signInStudent(code)
    if (!result.ok) setError(result.error)
  }

  return (
    <div className="auth-wrap">
      <div className="brand">
        <span className="mark">
          <FlagIcon width={22} height={22} />
        </span>
        <h1>SwingLog</h1>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        One searchable history per student — video, diagnosis, and the drill you gave them.
      </p>

      <div className="tutorial">
        {TUTORIAL.map(({ Icon, title, body }, i) => (
          <div className="tutorial-step" key={title}>
            <span className="n">{i + 1}</span>
            <span>
              <strong style={{ display: 'block', fontSize: '0.92rem' }}>
                <Icon
                  width={15}
                  height={15}
                  style={{ verticalAlign: '-2px', marginRight: 6, color: 'var(--turf)' }}
                />
                {title}
              </strong>
              <span className="tiny muted">{body}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="seg" role="tablist" aria-label="Sign in as">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'coach'}
          className={mode === 'coach' ? 'active' : ''}
          onClick={() => {
            setMode('coach')
            setError(null)
          }}
        >
          I’m a coach
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'student'}
          className={mode === 'student' ? 'active' : ''}
          onClick={() => {
            setMode('student')
            setError(null)
          }}
        >
          I’m a student
        </button>
      </div>

      {error && (
        <div className="banner error">
          <AlertIcon width={18} height={18} />
          <span>{error}</span>
        </div>
      )}

      {mode === 'coach' ? (
        <form onSubmit={submitCoach}>
          <label className="field">
            <span className="label">Your name</span>
            <input
              type="text"
              value={name}
              autoComplete="name"
              placeholder="Dave Morrison"
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
            />
          </label>
          <label className="field">
            <span className="label">Email</span>
            <input
              type="email"
              value={email}
              autoComplete="email"
              placeholder="dave@example.com"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button type="submit" className="btn btn-primary btn-block">
            {hasCoach ? 'Start over as a new coach' : 'Create my coaching account'}
          </button>
          <p className="hint">
            Everything is stored on this device. Nothing is sent anywhere until you connect cloud
            backup in Settings.
          </p>
        </form>
      ) : (
        <form onSubmit={submitStudent}>
          <label className="field">
            <span className="label">Invite code from your coach</span>
            <input
              type="text"
              value={code}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="e.g. K4M9TQ"
              onChange={(e) => {
                setCode(e.target.value.toUpperCase())
                setError(null)
              }}
            />
          </label>
          <button type="submit" className="btn btn-primary btn-block" disabled={code.trim().length < 4}>
            Open my timeline
          </button>
          <p className="hint">
            Your coach generates this when they add you. It opens a read-only view of your lessons
            and drills.
          </p>
        </form>
      )}
    </div>
  )
}
