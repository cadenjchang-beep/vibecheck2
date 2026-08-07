import { useEffect, useMemo, useRef, useState } from 'react'
import { CartIcon, CheckCircleIcon, CircleIcon, TrashIcon } from './icons'
import { parseQuickAdd } from '../lib/quickAdd'
import {
  addItem,
  checkedItems,
  clearChecked,
  deleteItem,
  groupByAisle,
  listNames,
  openItems,
  setItemChecked,
} from '../lib/store'
import type { HouseholdData, ListItem, Member } from '../types'

interface Props {
  data: HouseholdData
  setData(next: HouseholdData): void
  me: Member | null
  defaults: string[]
  focusList?: string
}

export default function Lists({ data, setData, me, defaults, focusList }: Props) {
  const names = useMemo(() => listNames(data, defaults), [data, defaults])
  const [active, setActive] = useState(focusList ?? names[0])
  const [draft, setDraft] = useState('')
  const [undoBuffer, setUndoBuffer] = useState<ListItem[]>([])
  const fieldRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (focusList) setActive(focusList)
  }, [focusList])

  const open = openItems(data, active)
  const done = checkedItems(data, active)
  const groups = groupByAisle(open)

  const add = () => {
    const text = draft.trim()
    if (!text) return
    // Even a plain list entry goes through the parser, so "2 dozen eggs" and
    // "milk #household" behave the same here as they do in quick add.
    const parsed = parseQuickAdd(text)
    setData(
      addItem(
        data,
        parsed.kind === 'listItem' ? parsed.title : text,
        parsed.listName ?? active,
        parsed.quantity,
        me?.id,
      ),
    )
    setDraft('')
    // Keeping focus is the highest-leverage detail in the whole feature: it
    // turns "add six things" from six round trips into one.
    fieldRef.current?.focus()
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Lists</h1>
      </header>

      <div className="segmented scroll-x" role="tablist" aria-label="Lists">
        {names.map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={active === name}
            onClick={() => setActive(name)}
          >
            {name}
            <span className="count">{data.items.filter((i) => i.listName === name && !i.isChecked).length}</span>
          </button>
        ))}
      </div>

      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input
          ref={fieldRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Add to ${active}`}
          aria-label={`Add to ${active}`}
        />
        <button className="btn btn-primary" type="submit" disabled={!draft.trim()}>
          Add
        </button>
      </form>

      {open.length === 0 && done.length === 0 && (
        <div className="empty">
          <CartIcon size={40} />
          <h2>{active} is clear</h2>
          <p>Type above to add something. It saves here first, and syncs when it can.</p>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.aisle} className="aisle">
          <h2>{group.aisle}</h2>
          <ul className="item-list">
            {group.items.map((item) => (
              <Row
                key={item.id}
                item={item}
                members={data.members}
                onToggle={() => setData(setItemChecked(data, item.id, true, me?.id))}
                onDelete={() => setData(deleteItem(data, item.id))}
              />
            ))}
          </ul>
        </section>
      ))}

      {done.length > 0 && (
        <section className="aisle">
          <h2>Done</h2>
          <ul className="item-list">
            {done.map((item) => (
              <Row
                key={item.id}
                item={item}
                members={data.members}
                onToggle={() => setData(setItemChecked(data, item.id, false, me?.id))}
                onDelete={() => setData(deleteItem(data, item.id))}
              />
            ))}
          </ul>
          <div className="row-actions">
            <button
              className="btn btn-quiet"
              onClick={() => {
                setUndoBuffer(done)
                setData(clearChecked(data, active))
              }}
            >
              Clear {done.length} checked
            </button>
            {undoBuffer.length > 0 && (
              // Reversible, so no confirmation dialog — a dialog here would cost
              // more than the mistake it prevents.
              <button
                className="btn btn-quiet"
                onClick={() => {
                  let next = data
                  for (const item of undoBuffer) {
                    next = addItem(next, item.text, active, item.quantity ?? null, item.addedBy)
                  }
                  setData(next)
                  setUndoBuffer([])
                }}
              >
                Undo
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

function Row({
  item,
  members,
  onToggle,
  onDelete,
}: {
  item: ListItem
  members: Member[]
  onToggle(): void
  onDelete(): void
}) {
  const completer = members.find((m) => m.id === item.completedBy)
  return (
    <li className="item-row">
      <button
        className="item-main"
        onClick={onToggle}
        aria-pressed={item.isChecked}
        aria-label={`${item.text}. ${item.isChecked ? 'Checked off' : 'Still needed'}`}
      >
        {item.isChecked ? <CheckCircleIcon /> : <CircleIcon />}
        <span className={item.isChecked ? 'struck' : ''}>{item.text}</span>
        {item.quantity && <span className="muted small">{item.quantity}</span>}
      </button>
      {completer && item.isChecked && (
        <span className="avatar" style={{ background: completer.colorHex }} title={completer.name}>
          {completer.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <button className="icon-btn" onClick={onDelete} aria-label={`Delete ${item.text}`}>
        <TrashIcon size={16} />
      </button>
    </li>
  )
}
