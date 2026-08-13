import type { Drill, FaultTag } from './types'

/**
 * Shared reference data: the fault taxonomy and the starter drill library.
 *
 * These slugs are the contract with the backend — `supabase/swinglog-seed.sql`
 * inserts the same rows keyed by the same slug, so a journal recorded offline
 * still resolves to the right server-side row after sync. Add entries in both
 * places, and never recycle a slug for a different fault.
 */

export const FAULT_CATEGORIES = [
  'Setup',
  'Takeaway & Backswing',
  'Transition & Sequence',
  'Path & Face',
  'Body Motion',
  'Impact & Contact',
  'Short Game',
] as const

export type FaultCategory = (typeof FAULT_CATEGORIES)[number]

export const FAULT_TAGS: FaultTag[] = [
  // Setup
  {
    id: 'posture-slumped',
    name: 'Slumped Posture',
    category: 'Setup',
    description: 'Rounded upper back at address, weight into the heels.',
  },
  {
    id: 'ball-too-forward',
    name: 'Ball Too Far Forward',
    category: 'Setup',
    description: 'Ball ahead of the low point, encouraging thin contact and an open face.',
  },
  {
    id: 'ball-too-back',
    name: 'Ball Too Far Back',
    category: 'Setup',
    description: 'Ball behind the low point, steepening the strike and shutting the face.',
  },
  {
    id: 'grip-too-weak',
    name: 'Grip Too Weak',
    category: 'Setup',
    description: 'Hands rotated toward the target; face tends to stay open.',
  },
  {
    id: 'grip-too-strong',
    name: 'Grip Too Strong',
    category: 'Setup',
    description: 'Hands rotated away from the target; face tends to close early.',
  },
  {
    id: 'alignment-off',
    name: 'Alignment Off Target',
    category: 'Setup',
    description: 'Feet, hips or shoulders aimed away from the intended start line.',
  },

  // Takeaway & Backswing
  {
    id: 'takeaway-inside',
    name: 'Takeaway Too Far Inside',
    category: 'Takeaway & Backswing',
    description: 'Club works behind the hands early, usually followed by a lift.',
  },
  {
    id: 'backswing-steep',
    name: 'Backswing Too Steep',
    category: 'Takeaway & Backswing',
    description: 'Shaft above the plane line halfway back.',
  },
  {
    id: 'backswing-flat',
    name: 'Backswing Too Flat',
    category: 'Takeaway & Backswing',
    description: 'Shaft below the plane line halfway back.',
  },
  {
    id: 'across-the-line',
    name: 'Across the Line',
    category: 'Takeaway & Backswing',
    description: 'Club points right of target at the top.',
  },
  {
    id: 'laid-off',
    name: 'Laid Off',
    category: 'Takeaway & Backswing',
    description: 'Club points left of target at the top.',
  },
  {
    id: 'overswing',
    name: 'Overswing Past Parallel',
    category: 'Takeaway & Backswing',
    description: 'Backswing runs past control, often with a collapsed lead arm.',
  },

  // Transition & Sequence
  {
    id: 'over-the-top',
    name: 'Over the Top',
    category: 'Transition & Sequence',
    description: 'Upper body starts the downswing, throwing the club outside the plane.',
  },
  {
    id: 'casting',
    name: 'Casting / Early Release',
    category: 'Transition & Sequence',
    description: 'Wrist angle released early, spending speed before impact.',
  },
  {
    id: 'rushed-transition',
    name: 'Rushed Transition',
    category: 'Transition & Sequence',
    description: 'No change of direction — the downswing begins before the backswing finishes.',
  },
  {
    id: 'arms-only',
    name: 'Arms-Only Downswing',
    category: 'Transition & Sequence',
    description: 'Arms drive the downswing with little body rotation.',
  },
  {
    id: 'loss-of-lag',
    name: 'Loss of Lag',
    category: 'Transition & Sequence',
    description: 'Trail wrist angle straightens well before the hands reach the ball.',
  },

  // Path & Face
  {
    id: 'path-out-to-in',
    name: 'Out-to-In Path',
    category: 'Path & Face',
    description: 'Club travels left through impact; slices and pulls.',
  },
  {
    id: 'path-in-to-out',
    name: 'Excessive In-to-Out Path',
    category: 'Path & Face',
    description: 'Club travels well right through impact; pushes and hooks.',
  },
  {
    id: 'face-open',
    name: 'Open Face at Impact',
    category: 'Path & Face',
    description: 'Face points right of the path at separation.',
  },
  {
    id: 'face-closed',
    name: 'Closed Face at Impact',
    category: 'Path & Face',
    description: 'Face points left of the path at separation.',
  },

  // Body Motion
  {
    id: 'early-extension',
    name: 'Early Extension',
    category: 'Body Motion',
    description: 'Hips move toward the ball in the downswing, crowding the arms.',
  },
  {
    id: 'sway',
    name: 'Sway Off the Ball',
    category: 'Body Motion',
    description: 'Lateral move away from the target instead of loading into the trail side.',
  },
  {
    id: 'slide',
    name: 'Lateral Slide',
    category: 'Body Motion',
    description: 'Hips slide past the lead foot rather than rotating open.',
  },
  {
    id: 'reverse-pivot',
    name: 'Reverse Pivot',
    category: 'Body Motion',
    description: 'Weight moves toward the target on the backswing and away on the downswing.',
  },
  {
    id: 'hanging-back',
    name: 'Hanging Back',
    category: 'Body Motion',
    description: 'Weight stays on the trail foot through impact.',
  },
  {
    id: 'loss-of-posture',
    name: 'Loss of Posture',
    category: 'Body Motion',
    description: 'Spine angle changes materially between address and impact.',
  },
  {
    id: 'restricted-hip-turn',
    name: 'Restricted Hip Turn',
    category: 'Body Motion',
    description: 'Limited pelvis rotation forcing the arms to supply the swing.',
  },

  // Impact & Contact
  {
    id: 'shank',
    name: 'Shank',
    category: 'Impact & Contact',
    description: 'Strike off the hosel.',
  },
  {
    id: 'thin-strike',
    name: 'Thin / Topped',
    category: 'Impact & Contact',
    description: 'Low point behind the ball with a rising club head.',
  },
  {
    id: 'fat-strike',
    name: 'Fat / Chunked',
    category: 'Impact & Contact',
    description: 'Low point behind the ball with ground contact first.',
  },
  {
    id: 'toe-strike',
    name: 'Toe Strike',
    category: 'Impact & Contact',
    description: 'Contact toward the toe, losing ball speed and turning the face.',
  },
  {
    id: 'flipping',
    name: 'Flipping Through Impact',
    category: 'Impact & Contact',
    description: 'Trail wrist bends back through the ball, adding loft and losing shaft lean.',
  },

  // Short Game
  {
    id: 'deceleration',
    name: 'Deceleration Through Impact',
    category: 'Short Game',
    description: 'Backswing too long for the shot, so the through-swing slows to compensate.',
  },
  {
    id: 'scooping',
    name: 'Scooping the Chip',
    category: 'Short Game',
    description: 'Trying to lift the ball rather than letting the loft work.',
  },
  {
    id: 'bunker-entry',
    name: 'Inconsistent Bunker Entry',
    category: 'Short Game',
    description: 'Sand entry point varies shot to shot.',
  },
]

/** Faults a coach sees as one-tap chips before searching. Overridable per coach. */
export const DEFAULT_PINNED_FAULT_IDS = [
  'over-the-top',
  'early-extension',
  'casting',
  'path-out-to-in',
  'fat-strike',
  'flipping',
]

interface SeedDrill extends Omit<Drill, 'createdAt' | 'custom'> {
  faultTagIds: string[]
}

export const DRILL_LIBRARY: SeedDrill[] = [
  {
    id: 'pump-drill',
    name: 'Pump Drill',
    description:
      'From the top, pump the club down to waist height three times feeling the trail elbow drop in front of the hip, then hit on the fourth.',
    instructionalVideoUrl: null,
    faultTagIds: ['over-the-top', 'casting', 'path-out-to-in'],
  },
  {
    id: 'headcover-outside-ball',
    name: 'Headcover Outside the Ball',
    description:
      'Place a headcover an inch outside and just ahead of the ball. Miss it on the way down — impossible with an over-the-top move.',
    instructionalVideoUrl: null,
    faultTagIds: ['over-the-top', 'path-out-to-in'],
  },
  {
    id: 'wall-drill',
    name: 'Butt-of-Club Wall Drill',
    description:
      'Set up with your seat just touching a wall. Make slow swings keeping contact with the wall until past impact.',
    instructionalVideoUrl: null,
    faultTagIds: ['early-extension', 'loss-of-posture'],
  },
  {
    id: 'chair-drill',
    name: 'Chair Drill',
    description:
      'Address the ball with a chair back against your hips. Rotate rather than thrust — the trail hip should clear the chair, not push into it.',
    instructionalVideoUrl: null,
    faultTagIds: ['early-extension', 'restricted-hip-turn'],
  },
  {
    id: 'step-through-drill',
    name: 'Step-Through Drill',
    description:
      'Hit half-speed shots and let the trail foot step through past the lead foot after impact. Forces weight onto the lead side.',
    instructionalVideoUrl: null,
    faultTagIds: ['hanging-back', 'rushed-transition', 'slide'],
  },
  {
    id: 'feet-together',
    name: 'Feet-Together Drill',
    description:
      'Heels touching, three-quarter swings. Any sway or arm-driven move loses balance immediately.',
    instructionalVideoUrl: null,
    faultTagIds: ['sway', 'arms-only', 'rushed-transition'],
  },
  {
    id: 'towel-under-arms',
    name: 'Towel Under Both Arms',
    description:
      'Trap a towel across the chest under both upper arms. Swing at 70% keeping it in place through impact.',
    instructionalVideoUrl: null,
    faultTagIds: ['arms-only', 'flipping', 'restricted-hip-turn'],
  },
  {
    id: 'l-to-l',
    name: 'L-to-L Half Swings',
    description:
      'Lead arm parallel to the ground with a 90° wrist set going back, mirrored on the follow through. Keep the L intact into the ball.',
    instructionalVideoUrl: null,
    faultTagIds: ['casting', 'loss-of-lag', 'flipping'],
  },
  {
    id: 'impact-bag',
    name: 'Impact Bag',
    description:
      'Drive into the bag and hold. Hands ahead of the club head, lead wrist flat, trail heel just off the ground.',
    instructionalVideoUrl: null,
    faultTagIds: ['flipping', 'casting', 'thin-strike'],
  },
  {
    id: 'gate-drill',
    name: 'Tee Gate Drill',
    description:
      'Two tees barely wider than the club head. Swing through the gate without touching either — instant strike-location feedback.',
    instructionalVideoUrl: null,
    faultTagIds: ['shank', 'toe-strike'],
  },
  {
    id: 'alignment-station',
    name: 'Alignment Stick Station',
    description:
      'One stick on the toe line, one perpendicular at the ball position. Build every range session inside it.',
    instructionalVideoUrl: null,
    faultTagIds: ['alignment-off', 'ball-too-forward', 'ball-too-back'],
  },
  {
    id: 'mirror-posture',
    name: 'Mirror Posture Check',
    description:
      'Face-on and down-the-line in a mirror: hinge from the hips, neutral spine, arms hanging under the shoulders. Ten reps, no club.',
    instructionalVideoUrl: null,
    faultTagIds: ['posture-slumped', 'loss-of-posture'],
  },
  {
    id: 'grip-checkpoint',
    name: 'Grip Checkpoint Drill',
    description:
      'Build the grip off the ball, check two knuckles on the lead hand and matching V lines, then place the club down. Twenty reps.',
    instructionalVideoUrl: null,
    faultTagIds: ['grip-too-weak', 'grip-too-strong'],
  },
  {
    id: 'plane-rehearsal',
    name: 'Shaft-on-Plane Rehearsal',
    description:
      'Stop halfway back and check the shaft covers the toe line, then halfway down for the same. Rehearse ten times before each ball.',
    instructionalVideoUrl: null,
    faultTagIds: ['backswing-steep', 'backswing-flat', 'takeaway-inside'],
  },
  {
    id: 'face-checkpoint',
    name: 'Halfway-Back Face Check',
    description:
      'Pause with the lead arm parallel: the face should match the spine angle. Note open or shut, then adjust and repeat.',
    instructionalVideoUrl: null,
    faultTagIds: ['face-open', 'face-closed', 'across-the-line', 'laid-off'],
  },
  {
    id: 'nine-to-three',
    name: '9-to-3 Control Swings',
    description:
      'Lead arm to 9 o’clock back, trail arm to 3 o’clock through. Same tempo, same finish, twenty balls.',
    instructionalVideoUrl: null,
    faultTagIds: ['overswing', 'rushed-transition', 'face-open'],
  },
  {
    id: 'one-arm-chip',
    name: 'One-Arm Chipping',
    description:
      'Chip with the lead hand only. The hand cannot flip without losing the club, so the loft has to do the work.',
    instructionalVideoUrl: null,
    faultTagIds: ['scooping', 'deceleration'],
  },
  {
    id: 'line-in-sand',
    name: 'Line-in-the-Sand Bunker Drill',
    description:
      'Draw a line in the bunker and make swings entering on the line every time, no ball. Then place a ball two inches ahead of it.',
    instructionalVideoUrl: null,
    faultTagIds: ['bunker-entry', 'fat-strike'],
  },
  {
    id: 'towel-behind-ball',
    name: 'Towel-Behind-Ball Divot Drill',
    description:
      'Lay a towel a hand-width behind the ball. Strike ball first, divot in front, towel untouched.',
    instructionalVideoUrl: null,
    faultTagIds: ['fat-strike', 'thin-strike', 'hanging-back'],
  },
  {
    id: 'pause-at-top',
    name: 'Pause-at-the-Top Drill',
    description:
      'Full backswing, count one full second at the top, then start down with the lower body. Rebuilds the change of direction.',
    instructionalVideoUrl: null,
    faultTagIds: ['rushed-transition', 'over-the-top', 'loss-of-lag'],
  },
]

const faultById = new Map(FAULT_TAGS.map((f) => [f.id, f]))

export function getFault(id: string): FaultTag | undefined {
  return faultById.get(id)
}

export function faultName(id: string): string {
  return faultById.get(id)?.name ?? id
}
