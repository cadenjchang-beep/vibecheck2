import { useState } from 'react'
import { LeafIcon } from './icons'
import { MEMBER_COLORS, type HouseholdData, type Member } from '../types'

interface Props {
  data: HouseholdData
  onComplete(data: HouseholdData, householdId: string, memberId: string): void
}

/**
 * Three screens, ending in a household with a member this browser *is*.
 *
 * That last part isn't ceremony: every completion is attributed to the current
 * member, and Load View is only honest if the attribution is right from the
 * first check-off.
 */
export default function Onboarding({ data, onComplete }: Props) {
  const [page, setPage] = useState(0)
  const [householdName, setHouseholdName] = useState(data.householdName)
  const [names, setNames] = useState<string[]>(['', ''])

  const canContinue = householdName.trim() !== '' && names[0].trim() !== ''

  const finish = () => {
    const members: Member[] = names
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name, index) => ({
        id: crypto.randomUUID(),
        name,
        colorHex: MEMBER_COLORS[index % MEMBER_COLORS.length],
        isChild: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }))

    onComplete(
      { ...data, householdName: householdName.trim(), members },
      crypto.randomUUID(),
      // The first name entered is whoever is holding this device.
      members[0].id,
    )
  }

  if (page === 0) {
    return (
      <div className="onboarding">
        <div className="onboarding-art" aria-hidden="true">
          <LeafIcon size={56} />
        </div>
        <h1>Tend</h1>
        <p className="lede">The app that carries what you're carrying in your head.</p>
        <button className="btn btn-primary" onClick={() => setPage(1)}>
          Show me
        </button>
      </div>
    )
  }

  if (page === 1) {
    return (
      <div className="onboarding">
        <h1>The invisible part</h1>
        <p className="lede">
          Every household runs on a list nobody wrote down — who needs what, when, and who's
          remembering it.
        </p>
        <p className="lede">
          Tend's job is to hold that list where everyone can see it, and make it easy to hand a
          piece of it to someone else.
        </p>
        <button className="btn btn-primary" onClick={() => setPage(2)}>
          Set up our household
        </button>
      </div>
    )
  }

  return (
    <div className="onboarding onboarding-form">
      <h1>Who's in it?</h1>
      <p className="muted">You can change all of this later.</p>

      <label className="field">
        <span>Household name</span>
        <input
          value={householdName}
          onChange={(e) => setHouseholdName(e.target.value)}
          placeholder="The Nguyen–Rileys"
          autoFocus
        />
      </label>

      <div className="member-fields">
        {names.map((name, index) => (
          <label className="field field-inline" key={index}>
            <span
              className="swatch"
              style={{ background: MEMBER_COLORS[index % MEMBER_COLORS.length] }}
              aria-hidden="true"
            />
            <input
              value={name}
              onChange={(e) =>
                setNames((current) => current.map((n, i) => (i === index ? e.target.value : n)))
              }
              placeholder={index === 0 ? 'Your name' : 'Someone else'}
            />
          </label>
        ))}
      </div>

      <button className="btn btn-quiet" onClick={() => setNames((c) => [...c, ''])}>
        Add another
      </button>

      <button className="btn btn-primary" onClick={finish} disabled={!canContinue}>
        Continue
      </button>

      <p className="footnote">
        Everything stays in this browser until you turn on sync in Settings. Nothing is uploaded
        anywhere by default.
      </p>
    </div>
  )
}
