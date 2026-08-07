import { useState } from 'react'
import { deleteEvent, editEvent, makeEvent } from '../lib/eventStore'
import { describeRule, formatRule, makeRule, needsScopePrompt, parseRule } from '../lib/recurrence'
import type { Frequency } from '../lib/recurrence'
import { weekdayInitials } from '../lib/dates'
import { EDIT_SCOPE_LABELS, type EditScope, type HouseholdData, type Member, type TendEvent } from '../types'

interface Props {
  data: HouseholdData
  setData(next: HouseholdData): void
  me: Member | null
  event: TendEvent | null
  occurrenceStart: Date
  onClose(): void
}

const FREQUENCIES: Frequency[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']

/** `<input type="datetime-local">` wants local time with no zone and no seconds. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

export default function EventEditor({ data, setData, me, event, occurrenceStart, onClose }: Props) {
  const existingRule = parseRule(event?.recurrenceRule)
  const durationMs = event ? new Date(event.end).getTime() - new Date(event.start).getTime() : 3_600_000

  const [title, setTitle] = useState(event?.title ?? '')
  const [location, setLocation] = useState(event?.location ?? '')
  const [notes, setNotes] = useState(event?.notes ?? '')
  // The editor opens on the occurrence that was tapped, not on the series
  // master. That's the difference between "move Tuesday's practice" and "move
  // every practice".
  const [start, setStart] = useState(occurrenceStart)
  const [end, setEnd] = useState(new Date(occurrenceStart.getTime() + durationMs))
  const [isAllDay, setAllDay] = useState(event?.isAllDay ?? false)
  const [attendees, setAttendees] = useState<string[]>(
    event?.attendeeIds ?? (me ? [me.id] : []),
  )
  const [repeats, setRepeats] = useState(Boolean(existingRule))
  const [frequency, setFrequency] = useState<Frequency>(existingRule?.frequency ?? 'WEEKLY')
  const [interval, setInterval] = useState(existingRule?.interval ?? 1)
  const [weekdays, setWeekdays] = useState<number[]>(existingRule?.weekdays ?? [])
  const [askingScope, setAskingScope] = useState<'save' | 'delete' | null>(null)

  const rule = repeats
    ? makeRule({ frequency, interval, weekdays: frequency === 'WEEKLY' ? weekdays : [] })
    : null

  const lastEditor = data.members.find((m) => m.id === event?.lastModifiedBy)

  const commitSave = (scope: EditScope) => {
    if (!event) {
      setData({
        ...data,
        events: [
          ...data.events,
          makeEvent({
            title: title.trim(),
            start,
            end: isAllDay ? start : end,
            isAllDay,
            location: location.trim() || undefined,
            notes: notes.trim() || undefined,
            attendeeIds: attendees,
            rule: rule ? formatRule(rule) : null,
            by: me?.id,
          }),
        ],
      })
    } else {
      setData({
        ...data,
        events: editEvent(
          data.events,
          event,
          {
            title: title.trim(),
            location: location.trim() || null,
            start,
            end: isAllDay ? start : end,
            isAllDay,
            rule,
            attendeeIds: attendees,
            notes: notes.trim() || null,
          },
          scope,
          occurrenceStart,
          me?.id,
        ),
      })
    }
    onClose()
  }

  const commitDelete = (scope: EditScope) => {
    if (!event) return onClose()
    setData({ ...data, events: deleteEvent(data.events, event, scope, occurrenceStart, me?.id) })
    onClose()
  }

  const attemptSave = () => {
    if (!title.trim()) return
    if (event && needsScopePrompt(event)) setAskingScope('save')
    else commitSave('all')
  }

  const attemptDelete = () => {
    if (event && needsScopePrompt(event)) setAskingScope('delete')
    else commitDelete('all')
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="Event">
      <div className="sheet">
        <header className="sheet-head">
          <button className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <strong>{event ? 'Edit event' : 'New event'}</strong>
          <button className="btn btn-quiet strong" onClick={attemptSave} disabled={!title.trim()}>
            Save
          </button>
        </header>

        <div className="sheet-body">
          <label className="field">
            <span>Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </label>

          <label className="field">
            <span>Where</span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} />
          </label>

          <label className="toggle-row">
            <input type="checkbox" checked={isAllDay} onChange={(e) => setAllDay(e.target.checked)} />
            <span>All day</span>
          </label>

          <label className="field">
            <span>Starts</span>
            <input
              type={isAllDay ? 'date' : 'datetime-local'}
              value={isAllDay ? toLocalInput(start).slice(0, 10) : toLocalInput(start)}
              onChange={(e) => {
                const next = new Date(e.target.value)
                if (!Number.isNaN(next.getTime())) {
                  setStart(next)
                  if (end <= next) setEnd(new Date(next.getTime() + durationMs))
                }
              }}
            />
          </label>

          {!isAllDay && (
            <label className="field">
              <span>Ends</span>
              <input
                type="datetime-local"
                value={toLocalInput(end)}
                onChange={(e) => {
                  const next = new Date(e.target.value)
                  if (!Number.isNaN(next.getTime())) setEnd(next)
                }}
              />
            </label>
          )}

          <label className="toggle-row">
            <input type="checkbox" checked={repeats} onChange={(e) => setRepeats(e.target.checked)} />
            <span>Repeats</span>
          </label>

          {repeats && (
            <>
              <label className="field">
                <span>Frequency</span>
                <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {f[0] + f.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Every</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={interval}
                  onChange={(e) => setInterval(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>

              {frequency === 'WEEKLY' && (
                <div className="weekday-picker" role="group" aria-label="Repeat on">
                  {weekdayInitials().map((initial, day) => (
                    <button
                      key={day}
                      className={weekdays.includes(day) ? 'is-on' : ''}
                      aria-pressed={weekdays.includes(day)}
                      onClick={() =>
                        setWeekdays((current) =>
                          current.includes(day)
                            ? current.filter((d) => d !== day)
                            : [...current, day].sort((a, b) => a - b),
                        )
                      }
                    >
                      {initial}
                    </button>
                  ))}
                </div>
              )}

              {rule && <p className="muted small">{describeRule(rule)}</p>}
            </>
          )}

          <fieldset className="field">
            <legend>Who's involved</legend>
            <div className="chip-row">
              {data.members.map((member) => (
                <button
                  key={member.id}
                  className={`chip ${attendees.includes(member.id) ? 'is-on' : ''}`}
                  aria-pressed={attendees.includes(member.id)}
                  style={
                    attendees.includes(member.id)
                      ? { background: member.colorHex, borderColor: member.colorHex, color: '#fff' }
                      : undefined
                  }
                  onClick={() =>
                    setAttendees((current) =>
                      current.includes(member.id)
                        ? current.filter((id) => id !== member.id)
                        : [...current, member.id],
                    )
                  }
                >
                  {member.name}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="field">
            <span>Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </label>

          {event && (
            <>
              <button className="btn btn-danger" onClick={attemptDelete}>
                Delete
              </button>
              {lastEditor && (
                // Attribution, not a conflict dialog — a surprise change gets a
                // name on it and nothing else.
                <p className="muted small">Last updated by {lastEditor.name}</p>
              )}
            </>
          )}
        </div>

        {askingScope && (
          // The EventKit-style three-way prompt. It appears only when it
          // genuinely applies, and no branch touches the whole series unless
          // the user picks "All events".
          <div className="scope-dialog" role="alertdialog" aria-label="This is a repeating event">
            <p className="scope-title">This is a repeating event</p>
            <p className="muted small">
              What should this {askingScope === 'delete' ? 'deletion' : 'change'} apply to?
            </p>
            {(['single', 'future', 'all'] as EditScope[]).map((scope) => (
              <button
                key={scope}
                className={`btn ${askingScope === 'delete' ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => (askingScope === 'delete' ? commitDelete(scope) : commitSave(scope))}
              >
                {EDIT_SCOPE_LABELS[scope]}
              </button>
            ))}
            <button className="btn btn-quiet" onClick={() => setAskingScope(null)}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
