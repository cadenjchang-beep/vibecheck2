export interface GolfRound {
  id: string
  date: string // yyyy-mm-dd
  course: string
  holes: 9 | 18
  par: number
  score: number
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
}

export type RoundDraft = Omit<GolfRound, 'id' | 'createdAt'>

export function toPar(round: GolfRound): number {
  return round.score - round.par
}

export function formatToPar(diff: number): string {
  if (diff === 0) return 'E'
  return diff > 0 ? `+${diff}` : `${diff}`
}
