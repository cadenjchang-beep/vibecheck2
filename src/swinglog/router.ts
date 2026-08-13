import { useEffect, useState } from 'react'

export type Route =
  | { name: 'dashboard' }
  | { name: 'addStudent' }
  | { name: 'student'; studentId: string }
  | { name: 'newLesson'; studentId: string | null }
  | { name: 'lesson'; lessonId: string }
  | { name: 'drills' }
  | { name: 'settings' }

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '')
  const [head, a, b] = path.split('/')

  switch (head) {
    case 'students':
      if (a === 'new') return { name: 'addStudent' }
      if (a) return { name: 'student', studentId: a }
      return { name: 'dashboard' }
    case 'lessons':
      if (a === 'new') return { name: 'newLesson', studentId: b || null }
      if (a) return { name: 'lesson', lessonId: a }
      return { name: 'dashboard' }
    case 'drills':
      return { name: 'drills' }
    case 'settings':
      return { name: 'settings' }
    default:
      return { name: 'dashboard' }
  }
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'dashboard':
      return '#/'
    case 'addStudent':
      return '#/students/new'
    case 'student':
      return `#/students/${route.studentId}`
    case 'newLesson':
      return route.studentId ? `#/lessons/new/${route.studentId}` : '#/lessons/new'
    case 'lesson':
      return `#/lessons/${route.lessonId}`
    case 'drills':
      return '#/drills'
    case 'settings':
      return '#/settings'
  }
}

export function navigate(route: Route): void {
  window.location.hash = hrefFor(route)
}

export function goBack(fallback: Route = { name: 'dashboard' }): void {
  // history.back() is right when the user arrived from inside the app, but a
  // deep link opened cold has nothing to go back to.
  if (window.history.length > 1) window.history.back()
  else navigate(fallback)
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  useEffect(() => {
    // Every screen is its own page as far as the coach is concerned.
    window.scrollTo(0, 0)
  }, [route])

  return route
}
