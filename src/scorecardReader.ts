import Anthropic from '@anthropic-ai/sdk'
import { betaJSONSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/beta/json-schema'
import { blobToBase64 } from './image'

/** What Claude transcribed from one scorecard (front and back photos count as one card). */
export interface ScorecardReading {
  course: string | null
  /** yyyy-mm-dd, only when a full date is written on the card. */
  date: string | null
  tee: string | null
  courseRating: number | null
  slope: number | null
  holeCount: 9 | 18
  /** Par per hole played; null where unreadable. */
  par: (number | null)[]
  players: ScorecardPlayer[]
  /** Caveats worth showing the golfer (unclear digits, totals that don't add up…). */
  notes: string | null
}

export interface ScorecardPlayer {
  name: string
  strokes: (number | null)[]
  putts: (number | null)[] | null
  /** 1-based hole numbers whose numbers were hard to read. */
  uncertainHoles: number[]
}

const MODEL = 'claude-opus-5-5'

const SYSTEM_PROMPT = `You transcribe photos of golf scorecards for a golfer's personal round journal. The golfer reviews your transcription before saving it, so mark anything you are unsure of rather than guessing silently.

How to read the card:
- players: one entry per person whose scores are written on the card, top to bottom. Use the name or initials as written, or "Player 1", "Player 2"… when a row has no name.
- strokes: each player's gross strokes for every hole played, in hole order. Use null for a hole left blank or impossible to read. Ignore net scores, handicap dots/strokes, match-play +/− or W/L marks, and Stableford points.
- Circles, squares and other marks around a number are birdie/bogey decorations: read the number inside.
- putts: if putts are recorded per hole (a separate row, or a small number in the corner of the score box), list them in hole order; otherwise null.
- par: the par row for the holes played. If the card prints several par rows, use the one for the tees the player marked (otherwise the men's par).
- holeCount: 9 if only nine holes were played (front or back), otherwise 18. All per-hole arrays must contain exactly holeCount entries, starting with the first hole played.
- course: the course or club name printed on the card. tee: the tee name or colour the golfer played, if marked. courseRating / slope: the rating and slope printed for that tee, if shown.
- date: only when a full date is written on the card, as YYYY-MM-DD; otherwise null.
- Cross-check each player's hole scores against any OUT / IN / TOTAL figures written on the card. If they disagree, look at the digits again; list the 1-based hole numbers you remain unsure of in uncertainHoles and explain briefly in notes.
- notes: one or two short sentences for the golfer about anything they should double-check, or null. If the photo is not a golf scorecard, return no players and say so in notes.`

const nullable = <const T extends object>(schema: T) => ({ anyOf: [schema, { type: 'null' }] }) as const

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    course: nullable({ type: 'string' }),
    date: nullable({ type: 'string', format: 'date' }),
    tee: nullable({ type: 'string' }),
    courseRating: nullable({ type: 'number' }),
    slope: nullable({ type: 'integer' }),
    holeCount: { type: 'integer', enum: [9, 18] },
    par: { type: 'array', items: nullable({ type: 'integer' }) },
    players: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          strokes: { type: 'array', items: nullable({ type: 'integer' }) },
          putts: nullable({ type: 'array', items: nullable({ type: 'integer' }) }),
          uncertainHoles: { type: 'array', items: { type: 'integer' } },
        },
        required: ['name', 'strokes', 'putts', 'uncertainHoles'],
        additionalProperties: false,
      },
    },
    notes: nullable({ type: 'string' }),
  },
  required: ['course', 'date', 'tee', 'courseRating', 'slope', 'holeCount', 'par', 'players', 'notes'],
  additionalProperties: false,
} as const

function inRange(value: number | null | undefined, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null
}

function fit<T>(values: readonly T[], length: number, fill: T): T[] {
  return Array.from({ length }, (_, i) => (i < values.length ? values[i] : fill))
}

function trimmed(value: string | null | undefined): string | null {
  const t = value?.trim()
  return t ? t : null
}

function apiErrorMessage(e: InstanceType<typeof Anthropic.APIError>): string {
  const body = e.error as { error?: { message?: unknown } } | undefined
  return typeof body?.error?.message === 'string' ? body.error.message : e.message
}

/**
 * Sends the photo(s) of one scorecard to Claude and returns the transcription.
 * The request goes straight from the browser to the Anthropic API using the
 * golfer's own key.
 */
export async function readScorecard(
  apiKey: string,
  photos: Blob[],
  playerName: string,
): Promise<ScorecardReading> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const images = await Promise.all(
    photos.map(async (photo) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: await blobToBase64(photo) },
    })),
  )
  const instructions = [
    photos.length > 1
      ? `These ${photos.length} photos show different sides or parts of the same scorecard.`
      : 'Transcribe this scorecard.',
    playerName.trim()
      ? `The golfer keeping this journal usually appears on cards as "${playerName.trim()}".`
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  let response
  try {
    response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'medium',
        format: betaJSONSchemaOutputFormat(OUTPUT_SCHEMA),
      },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [...images, { type: 'text', text: instructions }] }],
    })
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      throw new Error('Your Anthropic API key was rejected — check it under More → Scorecard reading.')
    }
    if (e instanceof Anthropic.PermissionDeniedError) {
      throw new Error(`Your API key isn't allowed to do this: ${apiErrorMessage(e)}`)
    }
    if (e instanceof Anthropic.RateLimitError) {
      throw new Error('The Anthropic API is rate-limiting this key — wait a minute and try again.')
    }
    if (e instanceof Anthropic.BadRequestError) {
      throw new Error(`The Anthropic API refused the request: ${apiErrorMessage(e)}`)
    }
    if (e instanceof Anthropic.APIError && e.status) {
      throw new Error(`Anthropic API error (${e.status}): ${apiErrorMessage(e)}`)
    }
    if (e instanceof Anthropic.APIConnectionError) {
      throw new Error('Could not reach the Anthropic API — check your internet connection.')
    }
    throw e
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined to read this photo.')
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('The reading was cut off before it finished — try again.')
  }
  const out = response.parsed_output
  if (!out) throw new Error('Claude returned a reading this app could not understand — try again.')

  const holeCount: 9 | 18 = out.holeCount === 9 ? 9 : 18
  const players = out.players
    .map((p, i) => ({
      name: trimmed(p.name) ?? `Player ${i + 1}`,
      strokes: fit(p.strokes.map((s) => inRange(s, 1, 20)), holeCount, null),
      putts: p.putts ? fit(p.putts.map((s) => inRange(s, 0, 9)), holeCount, null) : null,
      uncertainHoles: p.uncertainHoles.filter((h) => h >= 1 && h <= holeCount),
    }))
    .filter((p) => p.strokes.some((s) => s !== null))

  if (players.length === 0) {
    throw new Error(trimmed(out.notes) ?? 'No hole scores were found on this photo.')
  }

  const rating = typeof out.courseRating === 'number' && out.courseRating >= 50 && out.courseRating <= 85
  return {
    course: trimmed(out.course),
    date: out.date && /^\d{4}-\d{2}-\d{2}$/.test(out.date) ? out.date : null,
    tee: trimmed(out.tee),
    courseRating: rating ? Math.round(out.courseRating! * 10) / 10 : null,
    slope: inRange(out.slope, 55, 155),
    holeCount,
    par: fit(out.par.map((p) => inRange(p, 2, 7)), holeCount, null),
    players,
    notes: trimmed(out.notes),
  }
}
