import { SwingLogProvider, useSwingLog } from './store'
import { hrefFor, goBack, useRoute, type Route } from './router'
import { Auth } from './screens/Auth'
import { CoachDashboard } from './screens/CoachDashboard'
import { AddStudent } from './screens/AddStudent'
import { StudentProfile } from './screens/StudentProfile'
import { NewLesson } from './screens/NewLesson'
import { LessonDetail } from './screens/LessonDetail'
import { DrillLibrary } from './screens/DrillLibrary'
import { StudentHome } from './screens/StudentHome'
import { Settings } from './screens/Settings'
import { ChevronLeftIcon, FlagIcon, SettingsIcon, TargetIcon, UsersIcon } from './icons'

const TABS = [
  { route: { name: 'dashboard' } as Route, label: 'Roster', Icon: UsersIcon },
  { route: { name: 'drills' } as Route, label: 'Drills', Icon: TargetIcon },
  { route: { name: 'settings' } as Route, label: 'Settings', Icon: SettingsIcon },
]

function isTopLevel(route: Route): boolean {
  return route.name === 'dashboard' || route.name === 'drills' || route.name === 'settings'
}

function Shell() {
  const { data, session, ready, exitPreview } = useSwingLog()
  const route = useRoute()

  if (!ready) return null
  if (!session) return <Auth />

  const student =
    session.studentId !== null ? data.students.find((s) => s.id === session.studentId) : undefined

  // ---- student view -------------------------------------------------------
  if (session.role === 'student') {
    return (
      <div className="sl-app">
        <header className="sl-topbar">
          {route.name === 'lesson' ? (
            <button type="button" className="btn-icon" onClick={() => goBack()} aria-label="Back">
              <ChevronLeftIcon />
            </button>
          ) : (
            <span className="avatar" style={{ width: 34, height: 34, fontSize: '0.72rem' }}>
              <FlagIcon width={16} height={16} />
            </span>
          )}
          <h1>
            {student?.name ?? 'Your swing'}
            <span className="sub">
              {data.coach ? `Coached by ${data.coach.name}` : 'SwingLog'}
            </span>
          </h1>
          {session.preview ? (
            <button type="button" className="btn btn-sm" onClick={exitPreview}>
              Exit preview
            </button>
          ) : (
            <a className="btn-icon" href={hrefFor({ name: 'settings' })} aria-label="Settings">
              <SettingsIcon />
            </a>
          )}
        </header>

        <main className="sl-main" style={{ paddingBottom: 'calc(28px + env(safe-area-inset-bottom))' }}>
          {session.preview && (
            <div className="banner info">
              <span>
                This is exactly what {student?.name ?? 'your student'} sees — read-only, plus ticking
                drills off.
              </span>
            </div>
          )}
          {route.name === 'lesson' ? (
            <LessonDetail lessonId={route.lessonId} />
          ) : route.name === 'settings' && !session.preview ? (
            <Settings />
          ) : session.studentId ? (
            <StudentHome studentId={session.studentId} />
          ) : null}
        </main>
      </div>
    )
  }

  // ---- coach view ---------------------------------------------------------
  const titles: Record<Route['name'], string> = {
    dashboard: data.coach?.name ? `${data.coach.name}’s roster` : 'Roster',
    addStudent: 'Add a student',
    student: student?.name ?? 'Student',
    newLesson: 'New lesson',
    lesson: 'Lesson',
    drills: 'Drill library',
    settings: 'Settings',
  }

  return (
    <div className="sl-app">
      <header className="sl-topbar">
        {isTopLevel(route) ? (
          <span className="avatar" style={{ width: 34, height: 34 }}>
            <FlagIcon width={16} height={16} />
          </span>
        ) : (
          <button type="button" className="btn-icon" onClick={() => goBack()} aria-label="Back">
            <ChevronLeftIcon />
          </button>
        )}
        <h1>
          {titles[route.name]}
          {route.name === 'dashboard' && <span className="sub">SwingLog</span>}
        </h1>
      </header>

      <main className="sl-main">
        {route.name === 'dashboard' && <CoachDashboard />}
        {route.name === 'addStudent' && <AddStudent />}
        {route.name === 'student' && <StudentProfile studentId={route.studentId} />}
        {route.name === 'newLesson' && <NewLesson studentId={route.studentId} />}
        {route.name === 'lesson' && <LessonDetail lessonId={route.lessonId} />}
        {route.name === 'drills' && <DrillLibrary />}
        {route.name === 'settings' && <Settings />}
      </main>

      <nav className="sl-tabbar">
        {TABS.map(({ route: tabRoute, label, Icon }) => (
          <a
            key={label}
            className={`sl-tab${route.name === tabRoute.name ? ' active' : ''}`}
            href={hrefFor(tabRoute)}
          >
            <Icon width={20} height={20} />
            {label}
          </a>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <SwingLogProvider>
      <Shell />
    </SwingLogProvider>
  )
}
