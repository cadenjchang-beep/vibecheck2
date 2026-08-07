import { useMemo, useState } from 'react'
import { EventRow } from './EventRow'
import { CalendarIcon, ClockIcon, CloseIcon, SearchIcon } from './icons'
import { addMonths, dayKey, startOfDay } from '../lib/dates'
import { agendaDateLabel, capOccurrences, filterOccurrences, groupByDay } from '../lib/agenda'
import { expandEvents } from '../lib/eventStore'
import type { ExpandedEvent } from '../lib/eventStore'
import type { Member, TendEvent } from '../types'

interface Props {
  events: TendEvent[]
  members: Member[]
  onOpen(occurrence: ExpandedEvent): void
  onCreate(): void
}

const FORWARD_MONTHS = 12
const BACK_MONTHS = 6

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Cozi's "List View", built to Tend's own rules: everything the household has
 * on, in one scroll, searchable and filterable by who it's for. Day/Week/Month
 * answer "what's on this day" — Agenda answers "what's coming, across
 * everything", which is the question people actually open Cozi for.
 */
export default function Agenda({ events, members, onOpen, onCreate }: Props) {
  const [search, setSearch] = useState('')
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [includePast, setIncludePast] = useState(false)

  const today = useMemo(() => new Date(), [])
  const todayKey = useMemo(() => dayKey(today), [today])

  const occurrences = useMemo(() => {
    const from = includePast ? addMonths(startOfDay(today), -BACK_MONTHS) : startOfDay(today)
    const to = addMonths(startOfDay(today), FORWARD_MONTHS)
    return expandEvents(events, from, to)
  }, [events, today, includePast])

  const filtered = useMemo(
    () => filterOccurrences(occurrences, { search, memberIds }),
    [occurrences, search, memberIds],
  )
  const { shown, truncated } = useMemo(() => capOccurrences(filtered), [filtered])
  const groups = useMemo(() => groupByDay(shown), [shown])

  const hasFilter = search.trim() !== '' || memberIds.length > 0
  const clearFilters = () => {
    setSearch('')
    setMemberIds([])
  }

  const jumpVisible = includePast && groups.length > 0 && groups[0].key < todayKey
  const scrollToToday = () => {
    const target = groups.find((g) => g.key >= todayKey) ?? groups[groups.length - 1]
    if (!target) return
    document
      .getElementById(`agenda-day-${target.key}`)
      ?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <>
      <div className="agenda-toolbar">
        <div className="search-field">
          <SearchIcon size={18} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events and places"
            aria-label="Search events"
          />
          {search !== '' && (
            <button className="search-clear" onClick={() => setSearch('')} aria-label="Clear search">
              <CloseIcon size={14} />
            </button>
          )}
        </div>

        {members.length > 1 && (
          <div className="member-filter" role="group" aria-label="Filter by person">
            <button
              className="member-chip is-on"
              style={
                memberIds.length === 0
                  ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--on-accent)' }
                  : { background: 'var(--surface)', color: 'var(--ink-soft)' }
              }
              aria-pressed={memberIds.length === 0}
              onClick={() => setMemberIds([])}
            >
              Everyone
            </button>
            {members.map((member) => {
              const active = memberIds.includes(member.id)
              return (
                <button
                  key={member.id}
                  className="member-chip"
                  style={active ? { background: member.colorHex, borderColor: member.colorHex, color: '#fff' } : undefined}
                  aria-pressed={active}
                  onClick={() =>
                    setMemberIds((current) =>
                      current.includes(member.id)
                        ? current.filter((id) => id !== member.id)
                        : [...current, member.id],
                    )
                  }
                >
                  <span
                    className="avatar"
                    style={{ background: active ? 'rgba(255, 255, 255, 0.35)' : member.colorHex }}
                  >
                    {member.name.slice(0, 1).toUpperCase()}
                  </span>
                  {member.name}
                </button>
              )
            })}
          </div>
        )}

        <button className="btn btn-quiet small" onClick={() => setIncludePast((v) => !v)}>
          {includePast ? 'Hide past events' : 'Show past events'}
        </button>
      </div>

      {jumpVisible && (
        <button className="jump-today" onClick={scrollToToday}>
          <ClockIcon size={14} /> Jump to today
        </button>
      )}

      {occurrences.length === 0 ? (
        <div className="empty">
          <CalendarIcon size={40} />
          <h2>Nothing here</h2>
          <p>Events you add will show up here in order, as far ahead as a year.</p>
          <button className="btn btn-primary" onClick={onCreate}>
            Add an event
          </button>
        </div>
      ) : groups.length === 0 ? (
        <div className="empty">
          <SearchIcon size={40} />
          <h2>No matching events</h2>
          <p>Nothing {hasFilter ? 'matches that search or filter' : 'matches'} right now.</p>
          {hasFilter && (
            <button className="btn btn-primary" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          {groups.map((group) => (
            <div key={group.key} id={`agenda-day-${group.key}`} className="date-group">
              <div className={`date-group-head ${group.key === todayKey ? 'is-today' : ''}`}>
                <span>{agendaDateLabel(group.date, today)}</span>
                {group.occurrences.length > 2 && (
                  <span className="date-count">· {group.occurrences.length}</span>
                )}
              </div>
              <ul className="event-list">
                {group.occurrences.map((occurrence) => (
                  <li key={`${occurrence.event.id}-${occurrence.start.toISOString()}`}>
                    <EventRow occurrence={occurrence} members={members} onOpen={() => onOpen(occurrence)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {truncated > 0 && (
            <p className="agenda-hint">+{truncated} more beyond here — narrow your search to see them.</p>
          )}
        </>
      )}
    </>
  )
}
