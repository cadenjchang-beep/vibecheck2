export type RoundType = 'casual' | 'tournament' | 'practice-round' | 'match-play'

export const ROUND_TYPE_LABELS: Record<RoundType, string> = {
  casual: 'Casual',
  tournament: 'Tournament',
  'practice-round': 'Practice round',
  'match-play': 'Match play',
}

export interface HoleScore {
  par: number
  strokes: number
  putts?: number
}

export interface GolfRound {
  id: string
  date: string // yyyy-mm-dd
  course: string
  holes: 9 | 18
  par: number
  score: number
  roundType: RoundType
  tournamentId?: string
  tee?: string
  courseRating?: number
  slope?: number
  holesData?: HoleScore[]
  putts?: number
  fairwaysHit?: number
  fairwaysTotal?: number
  greensInReg?: number
  penalties?: number
  weather?: string
  playedWith?: string
  highlights?: string
  workOns?: string
  notes?: string
  createdAt: number
  updatedAt?: number
}

export type RoundDraft = Omit<GolfRound, 'id' | 'createdAt' | 'updatedAt'>

export interface Tournament {
  id: string
  name: string
  course?: string
  startDate: string
  endDate?: string
  position?: number
  fieldSize?: number
  notes?: string
  createdAt: number
  updatedAt?: number
}

export type TournamentDraft = Omit<Tournament, 'id' | 'createdAt' | 'updatedAt'>

export type PracticeType =
  | 'range'
  | 'short-game'
  | 'putting'
  | 'bunker'
  | 'on-course'
  | 'simulator'
  | 'lesson'
  | 'fitness'

export const PRACTICE_TYPE_LABELS: Record<PracticeType, string> = {
  range: 'Driving range',
  'short-game': 'Short game',
  putting: 'Putting',
  bunker: 'Bunker',
  'on-course': 'On-course practice',
  simulator: 'Simulator',
  lesson: 'Lesson',
  fitness: 'Fitness / gym',
}

export interface PracticeSession {
  id: string
  date: string
  type: PracticeType
  durationMin?: number
  ballsHit?: number
  focus?: string
  drills?: string
  rating?: number // 1-5 session quality
  notes?: string
  createdAt: number
  updatedAt?: number
}

export type PracticeDraft = Omit<PracticeSession, 'id' | 'createdAt' | 'updatedAt'>

export interface Club {
  id: string
  name: string
  carry?: number
  total?: number
  notes?: string
  updatedAt?: number
}

export interface Goal {
  id: string
  text: string
  targetDate?: string
  achieved: boolean
  createdAt: number
  updatedAt?: number
}

export interface JournalData {
  version: 2
  rounds: GolfRound[]
  practice: PracticeSession[]
  tournaments: Tournament[]
  clubs: Club[]
  goals: Goal[]
}

export function emptyData(): JournalData {
  return { version: 2, rounds: [], practice: [], tournaments: [], clubs: [], goals: [] }
}

export function toPar(round: GolfRound): number {
  return round.score - round.par
}

export function formatToPar(diff: number): string {
  if (diff === 0) return 'E'
  return diff > 0 ? `+${diff}` : `${diff}`
}

export interface HoleBreakdown {
  eagles: number
  birdies: number
  pars: number
  bogeys: number
  doublesPlus: number
}

export function holeBreakdown(holes: HoleScore[]): HoleBreakdown {
  const b: HoleBreakdown = { eagles: 0, birdies: 0, pars: 0, bogeys: 0, doublesPlus: 0 }
  for (const h of holes) {
    const d = h.strokes - h.par
    if (d <= -2) b.eagles++
    else if (d === -1) b.birdies++
    else if (d === 0) b.pars++
    else if (d === 1) b.bogeys++
    else b.doublesPlus++
  }
  return b
}

/** WHS-style score differential; requires course rating and slope. */
export function scoreDifferential(round: GolfRound): number | null {
  if (round.courseRating === undefined || round.slope === undefined || round.slope <= 0) return null
  return ((round.score - round.courseRating) * 113) / round.slope
}

/**
 * Simplified World Handicap System index estimate from 18-hole rounds
 * that have course rating and slope. Not an official handicap.
 */
export function handicapIndex(rounds: GolfRound[]): number | null {
  const diffs = rounds
    .filter((r) => r.holes === 18)
    .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date.localeCompare(b.date)))
    .map(scoreDifferential)
    .filter((d): d is number => d !== null)
    .slice(-20)

  const n = diffs.length
  if (n < 3) return null

  // WHS table: how many of the lowest differentials count, plus adjustment.
  let count: number
  let adj = 0
  if (n === 3) { count = 1; adj = -2 }
  else if (n === 4) { count = 1; adj = -1 }
  else if (n === 5) { count = 1 }
  else if (n === 6) { count = 2; adj = -1 }
  else if (n <= 8) { count = 2 }
  else if (n <= 11) { count = 3 }
  else if (n <= 14) { count = 4 }
  else if (n <= 16) { count = 5 }
  else if (n <= 18) { count = 6 }
  else if (n === 19) { count = 7 }
  else { count = 8 }

  const best = [...diffs].sort((a, b) => a - b).slice(0, count)
  const index = best.reduce((s, d) => s + d, 0) / count + adj
  return Math.round(index * 10) / 10
}
