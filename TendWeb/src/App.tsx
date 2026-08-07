import { useEffect, useMemo, useState } from 'react'
import CalendarView from './components/CalendarView'
import Lists from './components/Lists'
import LoadView from './components/LoadView'
import Meals from './components/Meals'
import Onboarding from './components/Onboarding'
import Pulse from './components/Pulse'
import QuickAdd from './components/QuickAdd'
import Settings from './components/Settings'
import Tasks from './components/Tasks'
import { CalendarIcon, CheckCircleIcon, ListIcon, MealIcon, PlusIcon, PulseIcon } from './components/icons'
import { loadData, loadIdentity, saveData, saveIdentity } from './storage'
import { useHouseholdSync } from './useHouseholdSync'
import { DEFAULT_LISTS, type HouseholdData } from './types'

export type Tab = 'pulse' | 'calendar' | 'lists' | 'tasks' | 'meals'

const TABS: { id: Tab; label: string; Icon: typeof PulseIcon }[] = [
  { id: 'pulse', label: 'Pulse', Icon: PulseIcon },
  { id: 'calendar', label: 'Calendar', Icon: CalendarIcon },
  { id: 'lists', label: 'Lists', Icon: ListIcon },
  { id: 'tasks', label: 'Tasks', Icon: CheckCircleIcon },
  { id: 'meals', label: 'Meals', Icon: MealIcon },
]

/** Where a Pulse line or a share-target hand-off wants to land. */
export interface Route {
  tab: Tab
  id?: string
  listName?: string
}

export default function App() {
  const [data, setData] = useState<HouseholdData>(loadData)
  const [identity, setIdentity] = useState(loadIdentity)
  const [tab, setTab] = useState<Tab>('pulse')
  const [route, setRoute] = useState<Route | null>(null)
  const [quickAddText, setQuickAddText] = useState<string | null>(null)
  const [showingLoad, setShowingLoad] = useState(false)
  const [showingSettings, setShowingSettings] = useState(false)

  useEffect(() => {
    saveData(data)
  }, [data])

  useEffect(() => {
    saveIdentity(identity)
  }, [identity])

  const sync = useHouseholdSync(identity.householdId, data, setData)

  const currentMember = useMemo(
    () => data.members.find((m) => m.id === identity.memberId) ?? null,
    [data.members, identity.memberId],
  )

  /**
   * The Web Share Target hand-off — the browser's answer to the iOS share
   * extension. The service worker forwards a share to `/?share=…`, which opens
   * quick add pre-filled instead of making someone retype a flyer.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const shared = [params.get('title'), params.get('text'), params.get('url')]
      .filter(Boolean)
      .join(' ')
      .trim()
    if (shared) {
      setQuickAddText(shared)
      window.history.replaceState({}, '', window.location.pathname)
    }
    const join = params.get('join')
    if (join) {
      setIdentity((current) => ({ ...current, householdId: join }))
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const navigate = (next: Route) => {
    setShowingLoad(false)
    setShowingSettings(false)
    setTab(next.tab)
    setRoute(next)
  }

  // Onboarding runs until there's a household with a member this browser is.
  if (!data.members.length || !identity.memberId) {
    return (
      <Onboarding
        data={data}
        onComplete={(next, householdId, memberId) => {
          setData(next)
          setIdentity({ householdId, memberId })
        }}
      />
    )
  }

  const body = () => {
    if (showingSettings) {
      return (
        <Settings
          data={data}
          setData={setData}
          identity={identity}
          setIdentity={setIdentity}
          sync={sync}
          onClose={() => setShowingSettings(false)}
        />
      )
    }
    if (showingLoad) return <LoadView data={data} onClose={() => setShowingLoad(false)} />

    switch (tab) {
      case 'pulse':
        return <Pulse data={data} onNavigate={navigate} onOpenLoad={() => setShowingLoad(true)} />
      case 'calendar':
        return <CalendarView data={data} setData={setData} me={currentMember} focusId={route?.id} />
      case 'lists':
        return (
          <Lists
            data={data}
            setData={setData}
            me={currentMember}
            defaults={DEFAULT_LISTS}
            focusList={route?.listName}
          />
        )
      case 'tasks':
        return <Tasks data={data} setData={setData} me={currentMember} />
      case 'meals':
        return <Meals data={data} setData={setData} me={currentMember} />
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="topbar-action" onClick={() => setQuickAddText('')} aria-label="Quick add">
          <PlusIcon />
        </button>
        <span className="topbar-title">{data.householdName || 'Tend'}</span>
        <button
          className="topbar-action"
          onClick={() => setShowingSettings(true)}
          aria-label="Settings"
        >
          <SyncDot state={sync.state} />
        </button>
      </header>

      <main className="content">{body()}</main>

      <nav className="tabbar" aria-label="Sections">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`tab ${tab === id && !showingLoad && !showingSettings ? 'is-active' : ''}`}
            onClick={() => {
              setShowingLoad(false)
              setShowingSettings(false)
              setTab(id)
              setRoute(null)
            }}
            aria-current={tab === id ? 'page' : undefined}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {quickAddText !== null && (
        <QuickAdd
          initialText={quickAddText}
          data={data}
          setData={setData}
          me={currentMember}
          onClose={() => setQuickAddText(null)}
        />
      )}
    </div>
  )
}

/** A small honest status dot rather than a permanent "syncing…" banner. */
function SyncDot({ state }: { state: ReturnType<typeof useHouseholdSync>['state'] }) {
  const label: Record<string, string> = {
    off: 'Local only',
    signedOut: 'Not syncing',
    idle: 'Synced',
    syncing: 'Syncing',
    offline: 'Offline — changes are saved here',
    error: 'Sync problem',
  }
  return (
    <span className={`sync-dot sync-${state}`} title={label[state]} aria-label={`Settings. ${label[state]}`} />
  )
}
