import { useMemo, useState } from 'react'
import EventEditor from './EventEditor'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, PinIcon, PlusIcon, RepeatIcon } from './icons'
import {
  addDays,
  addMonths,
  formatDayMonth,
  formatMonthYear,
  formatShortWeekday,
  formatTime,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  weekdayInitials,
} from '../lib/dates'
import { expandEvents, type ExpandedEvent } from '../lib/eventStore'
import type { HouseholdData, Member, TendEvent } from '../types'

type Mode = 'day' | 'week' | 'month' | 'list'

const MODES: Mode[] = ['day', 'week', 'month', 'list']

interface Props {
  data: HouseholdData
  setData(next: HouseholdData): void
  me: Member | null
  focusId?: string
}

export default function CalendarView({ data, setData, me, focusId }: Props) {
  const [mode, setMode] = useState<Mode>('week')
  const [anchor, setAnchor] = useState(() => new Date())
  const [editing, setEditing] = useState<
    { event: TendEvent | null; occurrenceStart: Date } | null
  >(null)

  // A Pulse line pointing at an event opens straight into it.
  const focused = useMemo(
    () => (focusId ? data.events.find((e) => e.id === focusId) : undefined),
    [data.events, focusId],
  )

  const dayOccurrences = (day: Date) =>
    expandEvents(data.events, startOfDay(day), addDays(startOfDay(day), 1))

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i)),
    [anchor],
  )

  const monthGrid = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(anchor))
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  }, [anchor])

  const upcoming = useMemo(
    () => expandEvents(data.events, startOfDay(new Date()), addMonths(new Date(), 3)),
    [data.events],
  )

  const step = (amount: number) => {
    if (mode === 'month') setAnchor(addMonths(anchor, amount))
    else if (mode === 'week') setAnchor(addDays(anchor, amount * 7))
    else setAnchor(addDays(anchor, amount))
  }

  const title = mode === 'list' ? 'Upcoming' : formatMonthYear(anchor)

  return (
    <div className="screen">
      <header className="screen-head with-action">
        <h1>Calendar</h1>
        <button
          className="btn btn-quiet"
          onClick={() => setEditing({ event: null, occurrenceStart: defaultStart(anchor) })}
        >
          <PlusIcon size={16} /> New
        </button>
      </header>

      <div className="segmented" role="tablist" aria-label="Calendar view">
        {MODES.map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>
            {m[0].toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {mode !== 'list' && (
        <div className="stepper">
          <button onClick={() => step(-1)} aria-label="Previous">
            <ChevronLeftIcon size={18} />
          </button>
          <button className="stepper-title" onClick={() => setAnchor(new Date())}>
            {title}
          </button>
          <button onClick={() => step(1)} aria-label="Next">
            <ChevronRightIcon size={18} />
          </button>
        </div>
      )}

      {mode === 'day' && (
        <DayList
          occurrences={dayOccurrences(anchor)}
          members={data.members}
          onOpen={(o) => setEditing({ event: o.event, occurrenceStart: o.occurrenceStart })}
          onCreate={() => setEditing({ event: null, occurrenceStart: defaultStart(anchor) })}
        />
      )}

      {mode === 'week' && (
        <div className="week">
          {weekDays.map((day) => {
            const occurrences = dayOccurrences(day)
            return (
              <section key={day.toISOString()} className="week-day">
                <h2>
                  {formatShortWeekday(day)} <span className="muted">{formatDayMonth(day)}</span>
                  {isToday(day) && <span className="pill">Today</span>}
                </h2>
                {occurrences.length === 0 ? (
                  <p className="dash">—</p>
                ) : (
                  occurrences.map((o) => (
                    <EventRow
                      key={`${o.event.id}-${o.start.toISOString()}`}
                      occurrence={o}
                      members={data.members}
                      onOpen={() => setEditing({ event: o.event, occurrenceStart: o.occurrenceStart })}
                    />
                  ))
                )}
              </section>
            )
          })}
        </div>
      )}

      {mode === 'month' && (
        <>
          <div className="month-grid">
            {weekdayInitials().map((initial, i) => (
              <span key={i} className="month-head">
                {initial}
              </span>
            ))}
            {monthGrid.map((day) => {
              const colors = dayOccurrences(day)
                .map((o) => colorFor(o.event, data.members))
                .slice(0, 4)
              return (
                <button
                  key={day.toISOString()}
                  className={`month-cell ${
                    day.getMonth() === anchor.getMonth() ? '' : 'is-outside'
                  } ${isToday(day) ? 'is-today' : ''}`}
                  onClick={() => {
                    setAnchor(day)
                    setMode('day')
                  }}
                  aria-label={`${day.toDateString()}, ${colors.length} events`}
                >
                  <span>{day.getDate()}</span>
                  <span className="dots">
                    {colors.map((color, i) => (
                      <span key={i} className="dot" style={{ background: color }} />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>
          <DayList
            occurrences={dayOccurrences(anchor)}
            members={data.members}
            onOpen={(o) => setEditing({ event: o.event, occurrenceStart: o.occurrenceStart })}
            onCreate={() => setEditing({ event: null, occurrenceStart: defaultStart(anchor) })}
          />
        </>
      )}

      {mode === 'list' && (
        <DayList
          occurrences={upcoming}
          members={data.members}
          showDates
          onOpen={(o) => setEditing({ event: o.event, occurrenceStart: o.occurrenceStart })}
          onCreate={() => setEditing({ event: null, occurrenceStart: defaultStart(anchor) })}
        />
      )}

      {(editing || focused) && (
        <EventEditor
          data={data}
          setData={setData}
          me={me}
          event={editing ? editing.event : (focused ?? null)}
          occurrenceStart={
            editing ? editing.occurrenceStart : new Date(focused?.start ?? Date.now())
          }
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function defaultStart(anchor: Date): Date {
  const base = isToday(anchor) ? new Date() : anchor
  const next = new Date(base)
  next.setHours(Math.min(next.getHours() + 1, 22), 0, 0, 0)
  return next
}

function colorFor(event: TendEvent, members: Member[]): string {
  const attendee = members.find((m) => event.attendeeIds.includes(m.id))
  return attendee?.colorHex ?? 'var(--accent)'
}

function DayList({
  occurrences,
  members,
  showDates,
  onOpen,
  onCreate,
}: {
  occurrences: ExpandedEvent[]
  members: Member[]
  showDates?: boolean
  onOpen(o: ExpandedEvent): void
  onCreate(): void
}) {
  if (occurrences.length === 0) {
    return (
      <div className="empty">
        <CalendarIcon size={40} />
        <h2>Nothing on</h2>
        <p>A clear stretch. Add something if it belongs here.</p>
        <button className="btn btn-primary" onClick={onCreate}>
          Add an event
        </button>
      </div>
    )
  }
  return (
    <ul className="event-list">
      {occurrences.map((o) => (
        <li key={`${o.event.id}-${o.start.toISOString()}`}>
          <EventRow occurrence={o} members={members} showDate={showDates} onOpen={() => onOpen(o)} />
        </li>
      ))}
    </ul>
  )
}

function EventRow({
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
