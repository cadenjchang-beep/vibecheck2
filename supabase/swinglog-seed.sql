-- ============================================================================
-- SwingLog — reference data seed (fault taxonomy + starter drill library)
--
-- Run after swinglog-schema.sql, as the service role (the SQL editor already
-- is). End users have no write grant on these tables.
--
-- Keyed by slug and idempotent, so re-running it updates names/descriptions in
-- place without breaking the lesson_fault_tags and drill_fault_tags that point
-- at these rows. Must stay in sync with src/swinglog/taxonomy.ts.
-- ============================================================================

insert into public.fault_tags (slug, name, category, description) values
  ('posture-slumped',     'Slumped Posture',            'Setup',                 'Rounded upper back at address, weight into the heels.'),
  ('ball-too-forward',    'Ball Too Far Forward',       'Setup',                 'Ball ahead of the low point, encouraging thin contact and an open face.'),
  ('ball-too-back',       'Ball Too Far Back',          'Setup',                 'Ball behind the low point, steepening the strike and shutting the face.'),
  ('grip-too-weak',       'Grip Too Weak',              'Setup',                 'Hands rotated toward the target; face tends to stay open.'),
  ('grip-too-strong',     'Grip Too Strong',            'Setup',                 'Hands rotated away from the target; face tends to close early.'),
  ('alignment-off',       'Alignment Off Target',       'Setup',                 'Feet, hips or shoulders aimed away from the intended start line.'),
  ('takeaway-inside',     'Takeaway Too Far Inside',    'Takeaway & Backswing',  'Club works behind the hands early, usually followed by a lift.'),
  ('backswing-steep',     'Backswing Too Steep',        'Takeaway & Backswing',  'Shaft above the plane line halfway back.'),
  ('backswing-flat',      'Backswing Too Flat',         'Takeaway & Backswing',  'Shaft below the plane line halfway back.'),
  ('across-the-line',     'Across the Line',            'Takeaway & Backswing',  'Club points right of target at the top.'),
  ('laid-off',            'Laid Off',                   'Takeaway & Backswing',  'Club points left of target at the top.'),
  ('overswing',           'Overswing Past Parallel',    'Takeaway & Backswing',  'Backswing runs past control, often with a collapsed lead arm.'),
  ('over-the-top',        'Over the Top',               'Transition & Sequence', 'Upper body starts the downswing, throwing the club outside the plane.'),
  ('casting',             'Casting / Early Release',    'Transition & Sequence', 'Wrist angle released early, spending speed before impact.'),
  ('rushed-transition',   'Rushed Transition',          'Transition & Sequence', 'No change of direction — the downswing begins before the backswing finishes.'),
  ('arms-only',           'Arms-Only Downswing',        'Transition & Sequence', 'Arms drive the downswing with little body rotation.'),
  ('loss-of-lag',         'Loss of Lag',                'Transition & Sequence', 'Trail wrist angle straightens well before the hands reach the ball.'),
  ('path-out-to-in',      'Out-to-In Path',             'Path & Face',           'Club travels left through impact; slices and pulls.'),
  ('path-in-to-out',      'Excessive In-to-Out Path',   'Path & Face',           'Club travels well right through impact; pushes and hooks.'),
  ('face-open',           'Open Face at Impact',        'Path & Face',           'Face points right of the path at separation.'),
  ('face-closed',         'Closed Face at Impact',      'Path & Face',           'Face points left of the path at separation.'),
  ('early-extension',     'Early Extension',            'Body Motion',           'Hips move toward the ball in the downswing, crowding the arms.'),
  ('sway',                'Sway Off the Ball',          'Body Motion',           'Lateral move away from the target instead of loading into the trail side.'),
  ('slide',               'Lateral Slide',              'Body Motion',           'Hips slide past the lead foot rather than rotating open.'),
  ('reverse-pivot',       'Reverse Pivot',              'Body Motion',           'Weight moves toward the target on the backswing and away on the downswing.'),
  ('hanging-back',        'Hanging Back',               'Body Motion',           'Weight stays on the trail foot through impact.'),
  ('loss-of-posture',     'Loss of Posture',            'Body Motion',           'Spine angle changes materially between address and impact.'),
  ('restricted-hip-turn', 'Restricted Hip Turn',        'Body Motion',           'Limited pelvis rotation forcing the arms to supply the swing.'),
  ('shank',               'Shank',                      'Impact & Contact',      'Strike off the hosel.'),
  ('thin-strike',         'Thin / Topped',              'Impact & Contact',      'Low point behind the ball with a rising club head.'),
  ('fat-strike',          'Fat / Chunked',              'Impact & Contact',      'Low point behind the ball with ground contact first.'),
  ('toe-strike',          'Toe Strike',                 'Impact & Contact',      'Contact toward the toe, losing ball speed and turning the face.'),
  ('flipping',            'Flipping Through Impact',    'Impact & Contact',      'Trail wrist bends back through the ball, adding loft and losing shaft lean.'),
  ('deceleration',        'Deceleration Through Impact','Short Game',            'Backswing too long for the shot, so the through-swing slows to compensate.'),
  ('scooping',            'Scooping the Chip',          'Short Game',            'Trying to lift the ball rather than letting the loft work.'),
  ('bunker-entry',        'Inconsistent Bunker Entry',  'Short Game',            'Sand entry point varies shot to shot.')
on conflict (slug) do update
  set name = excluded.name,
      category = excluded.category,
      description = excluded.description;

insert into public.drills (slug, name, description) values
  ('pump-drill', 'Pump Drill', 'From the top, pump the club down to waist height three times feeling the trail elbow drop in front of the hip, then hit on the fourth.'),
  ('headcover-outside-ball', 'Headcover Outside the Ball', 'Place a headcover an inch outside and just ahead of the ball. Miss it on the way down — impossible with an over-the-top move.'),
  ('wall-drill', 'Butt-of-Club Wall Drill', 'Set up with your seat just touching a wall. Make slow swings keeping contact with the wall until past impact.'),
  ('chair-drill', 'Chair Drill', 'Address the ball with a chair back against your hips. Rotate rather than thrust — the trail hip should clear the chair, not push into it.'),
  ('step-through-drill', 'Step-Through Drill', 'Hit half-speed shots and let the trail foot step through past the lead foot after impact. Forces weight onto the lead side.'),
  ('feet-together', 'Feet-Together Drill', 'Heels touching, three-quarter swings. Any sway or arm-driven move loses balance immediately.'),
  ('towel-under-arms', 'Towel Under Both Arms', 'Trap a towel across the chest under both upper arms. Swing at 70% keeping it in place through impact.'),
  ('l-to-l', 'L-to-L Half Swings', 'Lead arm parallel to the ground with a 90° wrist set going back, mirrored on the follow through. Keep the L intact into the ball.'),
  ('impact-bag', 'Impact Bag', 'Drive into the bag and hold. Hands ahead of the club head, lead wrist flat, trail heel just off the ground.'),
  ('gate-drill', 'Tee Gate Drill', 'Two tees barely wider than the club head. Swing through the gate without touching either — instant strike-location feedback.'),
  ('alignment-station', 'Alignment Stick Station', 'One stick on the toe line, one perpendicular at the ball position. Build every range session inside it.'),
  ('mirror-posture', 'Mirror Posture Check', 'Face-on and down-the-line in a mirror: hinge from the hips, neutral spine, arms hanging under the shoulders. Ten reps, no club.'),
  ('grip-checkpoint', 'Grip Checkpoint Drill', 'Build the grip off the ball, check two knuckles on the lead hand and matching V lines, then place the club down. Twenty reps.'),
  ('plane-rehearsal', 'Shaft-on-Plane Rehearsal', 'Stop halfway back and check the shaft covers the toe line, then halfway down for the same. Rehearse ten times before each ball.'),
  ('face-checkpoint', 'Halfway-Back Face Check', 'Pause with the lead arm parallel: the face should match the spine angle. Note open or shut, then adjust and repeat.'),
  ('nine-to-three', '9-to-3 Control Swings', 'Lead arm to 9 o’clock back, trail arm to 3 o’clock through. Same tempo, same finish, twenty balls.'),
  ('one-arm-chip', 'One-Arm Chipping', 'Chip with the lead hand only. The hand cannot flip without losing the club, so the loft has to do the work.'),
  ('line-in-sand', 'Line-in-the-Sand Bunker Drill', 'Draw a line in the bunker and make swings entering on the line every time, no ball. Then place a ball two inches ahead of it.'),
  ('towel-behind-ball', 'Towel-Behind-Ball Divot Drill', 'Lay a towel a hand-width behind the ball. Strike ball first, divot in front, towel untouched.'),
  ('pause-at-top', 'Pause-at-the-Top Drill', 'Full backswing, count one full second at the top, then start down with the lower body. Rebuilds the change of direction.')
on conflict (slug) do update
  set name = excluded.name,
      description = excluded.description;

-- Which drill addresses which fault. Rebuilt wholesale so removing a pairing in
-- the app's taxonomy removes it here too.
with pairs (drill_slug, fault_slug) as (values
  ('pump-drill','over-the-top'), ('pump-drill','casting'), ('pump-drill','path-out-to-in'),
  ('headcover-outside-ball','over-the-top'), ('headcover-outside-ball','path-out-to-in'),
  ('wall-drill','early-extension'), ('wall-drill','loss-of-posture'),
  ('chair-drill','early-extension'), ('chair-drill','restricted-hip-turn'),
  ('step-through-drill','hanging-back'), ('step-through-drill','rushed-transition'), ('step-through-drill','slide'),
  ('feet-together','sway'), ('feet-together','arms-only'), ('feet-together','rushed-transition'),
  ('towel-under-arms','arms-only'), ('towel-under-arms','flipping'), ('towel-under-arms','restricted-hip-turn'),
  ('l-to-l','casting'), ('l-to-l','loss-of-lag'), ('l-to-l','flipping'),
  ('impact-bag','flipping'), ('impact-bag','casting'), ('impact-bag','thin-strike'),
  ('gate-drill','shank'), ('gate-drill','toe-strike'),
  ('alignment-station','alignment-off'), ('alignment-station','ball-too-forward'), ('alignment-station','ball-too-back'),
  ('mirror-posture','posture-slumped'), ('mirror-posture','loss-of-posture'),
  ('grip-checkpoint','grip-too-weak'), ('grip-checkpoint','grip-too-strong'),
  ('plane-rehearsal','backswing-steep'), ('plane-rehearsal','backswing-flat'), ('plane-rehearsal','takeaway-inside'),
  ('face-checkpoint','face-open'), ('face-checkpoint','face-closed'), ('face-checkpoint','across-the-line'), ('face-checkpoint','laid-off'),
  ('nine-to-three','overswing'), ('nine-to-three','rushed-transition'), ('nine-to-three','face-open'),
  ('one-arm-chip','scooping'), ('one-arm-chip','deceleration'),
  ('line-in-sand','bunker-entry'), ('line-in-sand','fat-strike'),
  ('towel-behind-ball','fat-strike'), ('towel-behind-ball','thin-strike'), ('towel-behind-ball','hanging-back'),
  ('pause-at-top','rushed-transition'), ('pause-at-top','over-the-top'), ('pause-at-top','loss-of-lag')
),
resolved as (
  select d.id as drill_id, f.id as fault_tag_id
  from pairs p
  join public.drills d on d.slug = p.drill_slug
  join public.fault_tags f on f.slug = p.fault_slug
),
removed as (
  -- Scoped to the seeded drills only: a coach-authored drill's pairings are
  -- not this file's business.
  delete from public.drill_fault_tags dft
  where dft.drill_id in (select drill_id from resolved)
    and not exists (
      select 1 from resolved r
      where r.drill_id = dft.drill_id and r.fault_tag_id = dft.fault_tag_id
    )
  returning 1
)
insert into public.drill_fault_tags (drill_id, fault_tag_id)
select drill_id, fault_tag_id from resolved
on conflict do nothing;
