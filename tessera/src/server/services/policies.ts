import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { db, type Tx } from '../db/client';
import { assignments, classMembers, classes, sets, type SetRow } from '../db/schema';
import type { Viewer } from '../http/context';
import { forbidden, notFound } from '../http/errors';

/**
 * Who may see and change what. Every route that touches a set goes through
 * these functions, so the access rules live in exactly one place.
 *
 *   private   the owner, plus members of a class the set is assigned to
 *   unlisted  anyone who has the link (never listed or searchable)
 *   public    anyone, and it appears in search and browse
 */

type ViewerRef = Pick<Viewer, 'id'> | null;

export interface SetAccess {
  set: SetRow;
  isOwner: boolean;
  /** Set when access comes only from a class assignment. */
  viaClass: { id: string; name: string } | null;
}

async function classGrantingAccess(tx: Tx, userId: string, setId: string) {
  const [row] = await tx
    .select({ id: classes.id, name: classes.name })
    .from(assignments)
    .innerJoin(classes, eq(classes.id, assignments.classId))
    .innerJoin(classMembers, and(eq(classMembers.classId, classes.id), eq(classMembers.userId, userId)))
    .where(and(eq(assignments.setId, setId), isNull(classes.archivedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Loads a set the viewer is allowed to see. Anything else, whether it does not
 * exist, was deleted or is private, is reported as "not found" so that a
 * private set's existence is never revealed.
 */
export async function loadViewableSet(viewer: ViewerRef, setId: string, tx: Tx = db): Promise<SetAccess> {
  const [set] = await tx
    .select()
    .from(sets)
    .where(and(eq(sets.id, setId), isNull(sets.deletedAt)))
    .limit(1);
  if (!set) throw notFound();
  if (viewer && set.ownerId === viewer.id) return { set, isOwner: true, viaClass: null };
  const viaClass = viewer ? await classGrantingAccess(tx, viewer.id, setId) : null;
  if (set.visibility === 'private' && !viaClass) throw notFound();
  return { set, isOwner: false, viaClass };
}

/** Loads a set the viewer owns; only owners may edit, delete or share. */
export async function loadOwnedSet(
  viewer: Pick<Viewer, 'id'>,
  setId: string,
  tx: Tx = db,
  options: { includeDeleted?: boolean; forUpdate?: boolean } = {},
): Promise<SetRow> {
  const query = tx
    .select()
    .from(sets)
    .where(and(eq(sets.id, setId), options.includeDeleted ? undefined : isNull(sets.deletedAt)))
    .limit(1);
  const [set] = options.forUpdate ? await query.for('update') : await query;
  // Not the owner: say "not found" for a private set, "forbidden" for one they can see.
  if (!set) throw notFound();
  if (set.ownerId !== viewer.id) {
    if (set.visibility === 'private') throw notFound();
    throw forbidden('not_owner', 'Only the owner of this set can change it.');
  }
  return set;
}

/**
 * SQL condition selecting the sets a viewer may see, for list queries.
 * `s` is the alias of the sets table in the surrounding query.
 */
export function viewableSetCondition(viewerId: string | null, s: SQL = sql`s`): SQL {
  if (!viewerId) return sql`(${s}.deleted_at is null and ${s}.visibility <> 'private')`;
  return sql`(${s}.deleted_at is null and (
    ${s}.owner_id = ${viewerId}
    or ${s}.visibility <> 'private'
    or exists (
      select 1 from assignments a
      join classes c on c.id = a.class_id and c.archived_at is null
      join class_members m on m.class_id = c.id and m.user_id = ${viewerId}
      where a.set_id = ${s}.id
    )
  ))`;
}

/** Publishing to everyone needs a confirmed email, and is not offered to under-13s. */
export function assertMayPublish(viewer: Viewer): void {
  if (viewer.isChild) throw forbidden('child_restricted', 'Accounts under 13 cannot publish sets publicly.');
  if (!viewer.emailVerified) throw forbidden('email_unverified', 'Confirm your email address to publish a set publicly.');
}
