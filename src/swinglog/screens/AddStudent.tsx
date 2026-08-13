import { useState } from 'react'
import { useSwingLog } from '../store'
import { navigate } from '../router'
import { AlertIcon } from '../icons'

export function AddStudent() {
  const { addStudent, tier } = useSwingLog()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const result = addStudent({ name, email })
    if (!result.ok) {
      setError(result.error)
      return
    }
    navigate({ name: 'student', studentId: result.student.id })
  }

  return (
    <form onSubmit={submit}>
      {!tier.canAddStudent && (
        <div className="banner warn">
          <AlertIcon width={18} height={18} />
          <span>
            The free plan covers {tier.maxStudents} students. Upgrade in Settings to add more.
          </span>
        </div>
      )}
      {error && (
        <div className="banner error">
          <AlertIcon width={18} height={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="card">
        <label className="field">
          <span className="label">Name</span>
          <input
            type="text"
            value={name}
            autoFocus
            placeholder="Jamie Okafor"
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="label">Email (optional)</span>
          <input
            type="email"
            value={email}
            placeholder="jamie@example.com"
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <p className="hint">
          You’ll get an invite code on the next screen. Students only need it if they want their own
          view of the timeline — you can log lessons either way.
        </p>
      </div>

      <div className="actionbar">
        <button type="button" className="btn grow" onClick={() => navigate({ name: 'dashboard' })}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary grow"
          disabled={!name.trim() || !tier.canAddStudent}
        >
          Add student
        </button>
      </div>
    </form>
  )
}
