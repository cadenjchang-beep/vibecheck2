import { PinIcon, RepeatIcon } from './icons'
import { formatDayMonth, formatShortWeekday, formatTime } from '../lib/dates'
import type { ExpandedEvent } from '../lib/eventStore'
import type { Member, TendEvent } from '../types'

/**
 * The one row that renders an event, shared by Day/Week/Month and Agenda so a
 * soccer practice looks like the same soccer practice no matter which view
 * found it.
 */

export function colorFor(event: TendEvent, members: Member[]): string {
  const attendee = members.find((m) => event.attendeeIds.includes(m.id))
  return attendee?.colorHex ?? 'var(--accent)'
}

export function EventRow({
  occurrence,
  members,
  showDate,
  onOpen,
}: {
  occurrence: ExpandedEvent
  members: Member[]
  showDate?: boolean
  onOpen(): void
}) {
  const { event, start } = occurrence
  const attendees = members.filter((m) => event.attendeeIds.includes(m.id))
  const when = event.isAllDay ? 'All day' : formatTime(start)

  return (
    <button className="event-row" onClick={onOpen}>
      <span className="event-stripe" style={{ background: colorFor(event, members) }} />
      <span className="event-body">
        <span className="event-title">{event.title}</span>
        <span className="event-meta muted small">
          {showDate ? `${formatShortWeekday(start)} ${formatDayMonth(start)} · ${when}` : when}
          {event.location ? ` · ${event.location}` : ''}
          {event.recurrenceRule && <RepeatIcon size={12} />}
          {occurrence.isDetached && <PinIcon size={12} />}
        </span>
      </span>
      <span className="avatars">
        {attendees.slice(0, 3).map((m) => (
          <span key={m.id} className="avatar" style={{ background: m.colorHex }} title={m.name}>
            {m.name.slice(0, 1).toUpperCase()}
          </span>
        ))}
      </span>
    </button>
  )
}
