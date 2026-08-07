import { useMemo, useState } from 'react'
import { CalendarIcon, CartIcon, CheckCircleIcon, PinIcon, RepeatIcon } from './icons'
import { formatDateTime } from '../lib/dates'
import { describeRule } from '../lib/recurrence'
import { formatRule } from '../lib/recurrence'
import { makeEvent } from '../lib/eventStore'
import { parseQuickAdd } from '../lib/quickAdd'
import { addItem, addTask } from '../lib/store'
import { GROCERIES, PRIORITY_LABELS, type HouseholdData, type Member } from '../types'

interface Props {
  initialText: string
  data: HouseholdData
  setData(next: HouseholdData): void
  me: Member | null
  onClose(): void
}

const EXAMPLES = [
  'dentist thursday 9:30am',
  'swim every mon and wed 6pm at the rec centre',
  '2 dozen eggs #groceries',
  'remind me to renew the passport !!',
]

/**
 * The global "+".
 *
 * One field, no form, no type picker. The bet is that a thought which takes ten
 * seconds to log doesn't get logged — so the parse happens live and what it
 * found is shown as a quiet line underneath rather than as fields to confirm.
 */
export default function QuickAdd({ initialText, data, setData, me, onClose }: Props) {
  const [text, setText] = useState(initialText)
  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text) : null), [text])

  const mentioned = useMemo(
    () =>
      parsed
        ? data.members.filter((m) =>
            parsed.mentions.some((name) => m.name.toLowerCase().startsWith(name.toLowerCase())),
          )
        : [],
    [data.members, parsed],
  )

  const save = () => {
    if (!parsed || !parsed.title) return
    const mentionedIds = mentioned.map((m) => m.id)

    if (parsed.kind === 'listItem') {
      setData(addItem(data, parsed.title, parsed.listName ?? GROCERIES, parsed.quantity, me?.id))
    } else if (parsed.kind === 'task') {
      setData(
        addTask(data, {
          title: parsed.title,
          dueDate: parsed.start,
          assignedTo: mentionedIds[0] ?? me?.id,
          priority: parsed.priority,
          recurrenceRule: parsed.rule ? formatRule(parsed.rule) : undefined,
          by: me?.id,
        }),
      )
    } else if (parsed.start) {
      setData({
        ...data,
        events: [
          ...data.events,
          makeEvent({
            title: parsed.title,
            start: parsed.start,
            end: parsed.end ?? new Date(parsed.start.getTime() + 3_600_000),
            isAllDay: parsed.isAllDay,
            location: parsed.location ?? undefined,
            attendeeIds: mentionedIds.length ? mentionedIds : me ? [me.id] : [],
            rule: parsed.rule ? formatRule(parsed.rule) : null,
            by: me?.id,
          }),
        ],
      })
    }
    onClose()
  }

  const destination = () => {
    if (!parsed) return ''
    if (parsed.kind === 'event') return 'the calendar'
    if (parsed.kind === 'task') return 'Tasks'
    return parsed.listName ?? GROCERIES
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="Quick add">
      <div className="sheet">
        <header className="sheet-head">
          <button className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <strong>Add</strong>
          <button
            className="btn btn-quiet strong"
            onClick={save}
            disabled={!parsed || !parsed.title}
          >
            Add
          </button>
        </header>

        <div className="sheet-body">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <input
              className="quickadd-field"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="soccer practice every Tue 5pm at Lincoln Park"
              aria-label="What would you like to add?"
              autoFocus
            />
          </form>

          {parsed && parsed.title && (
            <div className="interpretation">
              <p className="interpretation-title">
                {parsed.kind === 'event' && <CalendarIcon size={16} />}
                {parsed.kind === 'task' && <CheckCircleIcon size={16} />}
                {parsed.kind === 'listItem' && <CartIcon size={16} />}
                <strong>{parsed.title}</strong>
              </p>

              <div className="chip-row">
                {parsed.start && (
                  <span className="chip">{formatDateTime(parsed.start, parsed.isAllDay)}</span>
                )}
                {parsed.rule && (
                  <span className="chip">
                    <RepeatIcon size={12} /> {describeRule(parsed.rule)}
                  </span>
                )}
                {parsed.location && (
                  <span className="chip">
                    <PinIcon size={12} /> {parsed.location}
                  </span>
                )}
                {parsed.listName && <span className="chip">{parsed.listName}</span>}
                {parsed.quantity && <span className="chip">{parsed.quantity}</span>}
                {parsed.priority > 0 && <span className="chip">{PRIORITY_LABELS[parsed.priority]}</span>}
                {mentioned.map((m) => (
                  <span key={m.id} className="chip" style={{ borderColor: m.colorHex }}>
                    {m.name}
                  </span>
                ))}
              </div>

              {/* Below a threshold the parse is offered rather than asserted, so
                  a bad guess never silently becomes an event. */}
              {parsed.confidence < 0.45 && (
                <p className="muted small">
                  Not sure about this one — it'll go to {destination()} unless you edit it.
                </p>
              )}
            </div>
          )}

          <div className="examples">
            <p className="muted small">Try</p>
            {EXAMPLES.map((example) => (
              <button key={example} className="btn btn-quiet small" onClick={() => setText(example)}>
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
