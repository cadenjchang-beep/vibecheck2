import { useMemo, useState } from 'react'
import { CheckCircleIcon, CircleIcon, PlusIcon, RepeatIcon, TrashIcon } from './icons'
import { addDays, formatDayMonth, startOfDay } from '../lib/dates'
import { makeRule, formatRule, parseRule } from '../lib/recurrence'
import type { Frequency } from '../lib/recurrence'
import { addTask, deleteTask, setTaskComplete, updateTask } from '../lib/store'
import { PRIORITY_LABELS, type HouseholdData, type Member, type Task } from '../types'

interface Props {
  data: HouseholdData
  setData(next: HouseholdData): void
  me: Member | null
}

type Filter = 'mine' | 'household'

export default function Tasks({ data, setData, me }: Props) {
  const [filter, setFilter] = useState<Filter>('household')
  const [editing, setEditing] = useState<Task | null | undefined>(undefined)

  const visible = useMemo(() => {
    const open = data.tasks.filter((t) => !t.isComplete)
    if (filter === 'household' || !me) return open
    // An unassigned task belongs to everyone, so it shows in "Mine" too — an
    // unassigned task nobody sees is how chores rot.
    return open.filter((t) => t.assignedTo === me.id || !t.assignedTo)
  }, [data.tasks, filter, me])

  const sections = useMemo(() => groupTasks(visible), [visible])
  const done = useMemo(
    () =>
      data.tasks
        .filter((t) => t.isComplete)
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
        .slice(0, 10),
    [data.tasks],
  )

  return (
    <div className="screen">
      <header className="screen-head with-action">
        <h1>Tasks</h1>
        <button className="btn btn-quiet" onClick={() => setEditing(null)}>
          <PlusIcon size={16} /> New
        </button>
      </header>

      <div className="segmented" role="tablist" aria-label="Filter">
        <button role="tab" aria-selected={filter === 'mine'} onClick={() => setFilter('mine')}>
          Mine
        </button>
        <button
          role="tab"
          aria-selected={filter === 'household'}
          onClick={() => setFilter('household')}
        >
          Household
        </button>
      </div>

      {visible.length === 0 && (
        <div className="empty">
          <CheckCircleIcon size={40} />
          <h2>{filter === 'mine' ? 'Nothing on you right now' : 'No open tasks'}</h2>
          <p>Tasks are the things that don't belong on a calendar but still need doing.</p>
          <button className="btn btn-primary" onClick={() => setEditing(null)}>
            Add a task
          </button>
        </div>
      )}

      {sections.map((section) => (
        <section key={section.title} className="aisle">
          <h2>{section.title}</h2>
          <ul className="item-list">
            {section.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                members={data.members}
                onToggle={() => setData(setTaskComplete(data, task.id, true, me?.id))}
                onOpen={() => setEditing(task)}
                onDelete={() => setData(deleteTask(data, task.id))}
              />
            ))}
          </ul>
        </section>
      ))}

      {done.length > 0 && (
        <section className="aisle">
          <h2>Recently done</h2>
          <ul className="item-list">
            {done.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                members={data.members}
                onToggle={() => setData(setTaskComplete(data, task.id, false, me?.id))}
                onOpen={() => setEditing(task)}
                onDelete={() => setData(deleteTask(data, task.id))}
              />
            ))}
          </ul>
        </section>
      )}

      {editing !== undefined && (
        <TaskEditor
          data={data}
          setData={setData}
          me={me}
          task={editing}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  )
}

function groupTasks(tasks: Task[]): { title: string; tasks: Task[] }[] {
  const today = startOfDay(new Date())
  const tomorrow = addDays(today, 1)
  const weekEnd = addDays(today, 7)

  const buckets: Record<string, Task[]> = {
    Overdue: [],
    Today: [],
    'This week': [],
    Later: [],
    'No date': [],
  }

  for (const task of tasks) {
    if (!task.dueDate) {
      buckets['No date'].push(task)
      continue
    }
    const due = new Date(task.dueDate)
    if (due < today) buckets.Overdue.push(task)
    else if (due < tomorrow) buckets.Today.push(task)
    else if (due < weekEnd) buckets['This week'].push(task)
    else buckets.Later.push(task)
  }

  return Object.entries(buckets)
    .filter(([, group]) => group.length > 0)
    .map(([title, group]) => ({
      title,
      tasks: group.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')),
    }))
}

function TaskRow({
  task,
  members,
  onToggle,
  onOpen,
  onDelete,
}: {
  task: Task
  members: Member[]
  onToggle(): void
  onOpen(): void
  onDelete(): void
}) {
  const assignee = members.find((m) => m.id === task.assignedTo)
  // Amber, not red: overdue is a fact worth noticing, not a failure to feel
  // bad about — the same "visibility, not judgment" instinct Load View runs on.
  const isOverdue = !task.isComplete && Boolean(task.dueDate) && new Date(task.dueDate!) < startOfDay(new Date())

  return (
    <li className={`item-row ${isOverdue ? 'is-overdue' : ''}`}>
      <button className="icon-btn" onClick={onToggle} aria-label={task.isComplete ? 'Reopen' : 'Mark done'}>
        {task.isComplete ? <CheckCircleIcon /> : <CircleIcon />}
      </button>
      <button className="item-main" onClick={onOpen}>
        <span className={task.isComplete ? 'struck' : ''}>{task.title}</span>
        <span className="muted small">
          {task.dueDate && (
            <span className={isOverdue ? 'text-warn' : undefined}>
              {isOverdue && <span className="warn-dot" aria-hidden="true" />}
              {formatDayMonth(new Date(task.dueDate))}
            </span>
          )}
          {task.recurrenceRule && <RepeatIcon size={12} />}
          {task.priority > 0 && ` · ${PRIORITY_LABELS[task.priority]}`}
        </span>
      </button>
      {assignee && (
        <span className="avatar" style={{ background: assignee.colorHex }} title={assignee.name}>
          {assignee.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <button className="icon-btn" onClick={onDelete} aria-label={`Delete ${task.title}`}>
        <TrashIcon size={16} />
      </button>
    </li>
  )
}

function TaskEditor({
  data,
  setData,
  me,
  task,
  onClose,
}: {
  data: HouseholdData
  setData(next: HouseholdData): void
  me: Member | null
  task: Task | null
  onClose(): void
}) {
  const existingRule = parseRule(task?.recurrenceRule)
  const [title, setTitle] = useState(task?.title ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [dueDate, setDueDate] = useState(task?.dueDate?.slice(0, 10) ?? '')
  const [assignedTo, setAssignedTo] = useState(task?.assignedTo ?? me?.id ?? '')
  const [priority, setPriority] = useState(task?.priority ?? 0)
  const [repeats, setRepeats] = useState(Boolean(existingRule))
  const [frequency, setFrequency] = useState<Frequency>(existingRule?.frequency ?? 'WEEKLY')

  const save = () => {
    const trimmed = title.trim()
    if (!trimmed) return
    const rule = repeats ? formatRule(makeRule({ frequency })) : undefined

    if (task) {
      setData(
        updateTask(data, task.id, {
          title: trimmed,
          notes: notes.trim() || undefined,
          dueDate: dueDate ? new Date(`${dueDate}T09:00`).toISOString() : undefined,
          assignedTo: assignedTo || undefined,
          priority,
          recurrenceRule: rule,
        }),
      )
    } else {
      setData(
        addTask(data, {
          title: trimmed,
          notes: notes.trim() || undefined,
          dueDate: dueDate ? new Date(`${dueDate}T09:00`) : null,
          assignedTo: assignedTo || undefined,
          priority,
          recurrenceRule: rule,
          by: me?.id,
        }),
      )
    }
    onClose()
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="Task">
      <div className="sheet">
        <header className="sheet-head">
          <button className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <strong>{task ? 'Task' : 'New task'}</strong>
          <button className="btn btn-quiet strong" onClick={save} disabled={!title.trim()}>
            Save
          </button>
        </header>

        <div className="sheet-body">
          <label className="field">
            <span>What needs doing?</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </label>

          <label className="field">
            <span>Due</span>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>

          <label className="field">
            <span>Assigned to</span>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">Anyone</option>
              {data.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Priority</span>
            <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
              {[0, 1, 2, 3].map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </label>

          <label className="toggle-row">
            <input type="checkbox" checked={repeats} onChange={(e) => setRepeats(e.target.checked)} />
            <span>Repeats</span>
          </label>

          {repeats && (
            <label className="field">
              <span>Frequency</span>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
                {(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as Frequency[]).map((f) => (
                  <option key={f} value={f}>
                    {f[0] + f.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field">
            <span>Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </label>
        </div>
      </div>
    </div>
  )
}
