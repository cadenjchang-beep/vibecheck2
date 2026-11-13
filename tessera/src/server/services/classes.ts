import {
  CLASS_LIMITS,
  type AssignmentDto,
  type ClassDetail,
  type ClassesResponse,
  type ClassMemberDto,
  type ClassProgress,
  type ClassSummary,
  type JoinPreview,
  type ProgressCell,
} from '@shared/classes';
import type { Stage } from '@shared/constants';
import { STAGE_WEIGHT } from '@shared/progress';
import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db, type Tx } from '../db/client';
import { assignments, cardProgress, classes, classMembers, sets, setUserState, users } from '../db/schema';
import type { Viewer } from '../http/context';
import { requireVerified } from '../http/context';
import { conflict, forbidden, HttpError, notFound } from '../http/errors';
import { newId, newJoinCode } from '../ids';
import { loadViewableSet } from './policies';
import { enforceRateLimit } from './rate-limit';

type ClassRow = typeof classes.$inferSelect;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/* ------------------------------------------------------------------ */
/* Access                                                              */

async function loadClass(id: string, tx: Tx = db): Promise<ClassRow> {
  const [row] = await tx.select().from(classes).where(eq(classes.id, id)).limit(1);
  if (!row) throw notFound();
  return row;
}

/** A class the viewer teaches or belongs to. Students lose sight of archived classes. */
async function viewableClass(viewer: Viewer, id: string): Promise<{ cls: ClassRow; isTeacher: boolean }> {
  const cls = await loadClass(id);
  if (cls.teacherId === viewer.id) return { cls, isTeacher: true };
  const [member] = await db
    .select({ role: classMembers.role })
    .from(classMembers)
    .where(and(eq(classMembers.classId, id), eq(classMembers.userId, viewer.id)))
    .limit(1);
  if (!member || cls.archivedAt) throw notFound();
  return { cls, isTeacher: false };
}

async function taughtClass(viewer: Viewer, id: string, tx: Tx = db): Promise<ClassRow> {
  const cls = await loadClass(id, tx);
  if (cls.teacherId !== viewer.id) throw notFound();
  return cls;
}

/* ------------------------------------------------------------------ */
/* Read models                                                         */

async function summaries(rows: ClassRow[], viewer: Viewer): Promise<ClassSummary[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [teachers, students, assigned] = await Promise.all([
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, [...new Set(rows.map((r) => r.teacherId))])),
    db
      .select({ classId: classMembers.classId, count: sql<number>`count(*)::int` })
      .from(classMembers)
      .where(and(inArray(classMembers.classId, ids), eq(classMembers.role, 'student')))
      .groupBy(classMembers.classId),
    db
      .select({ classId: assignments.classId, count: sql<number>`count(*)::int` })
      .from(assignments)
      .innerJoin(sets, eq(sets.id, assignments.setId))
      .where(and(inArray(assignments.classId, ids), isNull(sets.deletedAt)))
      .groupBy(assignments.classId),
  ]);
  const teacherName = new Map(teachers.map((t) => [t.id, t.name]));
  const studentCount = new Map(students.map((s) => [s.classId, s.count]));
  const assignmentCount = new Map(assigned.map((a) => [a.classId, a.count]));
  return rows.map((r) => {
    const isTeacher = r.teacherId === viewer.id;
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      teacher: { id: r.teacherId, name: teacherName.get(r.teacherId) ?? '' },
      isTeacher,
      studentCount: studentCount.get(r.id) ?? 0,
      assignmentCount: assignmentCount.get(r.id) ?? 0,
      archived: Boolean(r.archivedAt),
      joinCode: isTeacher ? r.joinCode : null,
    };
  });
}

/** Mastery and activity of some users on some sets, keyed by user then set. */
async function progressFor(userIds: string[], setCards: Map<string, number>) {
  const result = new Map<string, Map<string, ProgressCell & { stages: Record<Stage, number> }>>();
  const setIds = [...setCards.keys()];
  if (userIds.length === 0 || setIds.length === 0) return result;
  const [stageRows, activity] = await Promise.all([
    db
      .select({ userId: cardProgress.userId, setId: cardProgress.setId, stage: cardProgress.stage, count: sql<number>`count(*)::int` })
      .from(cardProgress)
      .where(and(inArray(cardProgress.userId, userIds), inArray(cardProgress.setId, setIds)))
      .groupBy(cardProgress.userId, cardProgress.setId, cardProgress.stage),
    db
      .select({ userId: setUserState.userId, setId: setUserState.setId, at: setUserState.lastStudiedAt })
      .from(setUserState)
      .where(and(inArray(setUserState.userId, userIds), inArray(setUserState.setId, setIds))),
  ]);

  const cell = (userId: string, setId: string) => {
    let byUser = result.get(userId);
    if (!byUser) result.set(userId, (byUser = new Map()));
    let entry = byUser.get(setId);
    if (!entry) byUser.set(setId, (entry = { mastery: 0, started: 0, lastStudiedAt: null, stages: { new: 0, learning: 0, familiar: 0, mastered: 0 } }));
    return entry;
  };
  for (const row of stageRows) {
    const entry = cell(row.userId, row.setId);
    entry.stages[row.stage as Stage] += row.count;
    entry.started += row.count;
  }
  for (const row of activity) cell(row.userId, row.setId).lastStudiedAt = iso(row.at);
  for (const [, byUser] of result) {
    for (const [setId, entry] of byUser) {
      const total = setCards.get(setId) ?? 0;
      const points = (Object.keys(entry.stages) as Stage[]).reduce((sum, stage) => sum + STAGE_WEIGHT[stage] * entry.stages[stage], 0);
      entry.mastery = total > 0 ? Math.min(100, Math.round((points / total) * 100)) : 0;
      entry.stages.new = Math.max(0, total - entry.started) + entry.stages.new;
    }
  }
  return result;
}

async function assignmentsFor(classRows: ClassRow[], viewer: Viewer, withMine: boolean): Promise<AssignmentDto[]> {
  if (classRows.length === 0) return [];
  const names = new Map(classRows.map((c) => [c.id, c.name]));
  const rows = await db
    .select({
      id: assignments.id,
      classId: assignments.classId,
      dueAt: assignments.dueAt,
      note: assignments.note,
      createdAt: assignments.createdAt,
      setId: sets.id,
      title: sets.title,
      cardCount: sets.cardCount,
    })
    .from(assignments)
    .innerJoin(sets, eq(sets.id, assignments.setId))
    .where(and(inArray(assignments.classId, [...names.keys()]), isNull(sets.deletedAt)))
    .orderBy(sql`${assignments.dueAt} asc nulls last`, desc(assignments.createdAt));

  const mine = withMine ? (await progressFor([viewer.id], new Map(rows.map((r) => [r.setId, r.cardCount])))).get(viewer.id) : undefined;
  return rows.map((r) => {
    const own = mine?.get(r.setId);
    return {
      id: r.id,
      classId: r.classId,
      className: names.get(r.classId) ?? '',
      set: { id: r.setId, title: r.title, cardCount: r.cardCount },
      dueAt: iso(r.dueAt),
      note: r.note,
      createdAt: r.createdAt.toISOString(),
      mine: withMine
        ? {
            mastery: own?.mastery ?? 0,
            stages: own?.stages ?? { new: r.cardCount, learning: 0, familiar: 0, mastered: 0 },
            lastStudiedAt: own?.lastStudiedAt ?? null,
          }
        : null,
    };
  });
}

async function studentsOf(classId: string): Promise<ClassMemberDto[]> {
  const rows = await db
    .select({ id: users.id, name: users.name, image: users.image, joinedAt: classMembers.joinedAt })
    .from(classMembers)
    .innerJoin(users, eq(users.id, classMembers.userId))
    .where(and(eq(classMembers.classId, classId), eq(classMembers.role, 'student')))
    .orderBy(asc(users.name));
  return rows.map((r) => ({ ...r, joinedAt: r.joinedAt.toISOString() }));
}

export async function listClasses(viewer: Viewer): Promise<ClassesResponse> {
  const [taught, joined] = await Promise.all([
    db.select().from(classes).where(eq(classes.teacherId, viewer.id)).orderBy(sql`${classes.archivedAt} is not null`, desc(classes.createdAt)),
    db
      .select({ cls: classes })
      .from(classMembers)
      .innerJoin(classes, eq(classes.id, classMembers.classId))
      .where(and(eq(classMembers.userId, viewer.id), eq(classMembers.role, 'student'), isNull(classes.archivedAt)))
      .orderBy(desc(classMembers.joinedAt)),
  ]);
  const enrolledRows = joined.map((j) => j.cls);
  const upcoming = (await assignmentsFor(enrolledRows, viewer, true)).filter((a) => (a.mine?.mastery ?? 0) < 100).slice(0, 20);
  return { teaching: await summaries(taught, viewer), enrolled: await summaries(enrolledRows, viewer), upcoming };
}

export async function getClassDetail(viewer: Viewer, id: string): Promise<ClassDetail> {
  const { cls, isTeacher } = await viewableClass(viewer, id);
  const [summary] = await summaries([cls], viewer);
  return {
    ...summary!,
    assignments: await assignmentsFor([cls], viewer, !isTeacher),
    students: isTeacher ? await studentsOf(id) : [],
  };
}

export async function getClassProgress(viewer: Viewer, id: string): Promise<ClassProgress> {
  const cls = await taughtClass(viewer, id);
  const [students, list] = await Promise.all([studentsOf(id), assignmentsFor([cls], viewer, false)]);
  const progress = await progressFor(
    students.map((s) => s.id),
    new Map(list.map((a) => [a.set.id, a.set.cardCount])),
  );
  const cells: ClassProgress['cells'] = {};
  for (const student of students) {
    cells[student.id] = {};
    for (const a of list) {
      const p = progress.get(student.id)?.get(a.set.id);
      cells[student.id]![a.id] = { mastery: p?.mastery ?? 0, started: p?.started ?? 0, lastStudiedAt: p?.lastStudiedAt ?? null };
    }
  }
  return {
    students,
    assignments: list.map((a) => ({ id: a.id, setId: a.set.id, title: a.set.title, cardCount: a.set.cardCount, dueAt: a.dueAt })),
    cells,
  };
}

/* ------------------------------------------------------------------ */
/* Teacher actions                                                     */

async function uniqueCode(tx: Tx): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newJoinCode();
    const [taken] = await tx.select({ id: classes.id }).from(classes).where(eq(classes.joinCode, code)).limit(1);
    if (!taken) return code;
  }
  throw new HttpError(503, 'code_unavailable', 'Could not create a join code. Try again.');
}

export async function createClass(viewer: Viewer, input: { name: string; description: string }): Promise<string> {
  if (viewer.role !== 'teacher') throw forbidden('teacher_only', 'Only teacher accounts can create classes.');
  requireVerified(viewer);
  await enforceRateLimit(`class-create:${viewer.id}`, { window: 3600, max: 30 });
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.insert(classes).values({ id, teacherId: viewer.id, name: input.name, description: input.description, joinCode: await uniqueCode(tx) });
    await tx.insert(classMembers).values({ classId: id, userId: viewer.id, role: 'teacher' });
  });
  return id;
}

export async function updateClass(viewer: Viewer, id: string, input: { name?: string; description?: string; archived?: boolean }): Promise<void> {
  await taughtClass(viewer, id);
  const patch: Partial<typeof classes.$inferInsert> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.archived !== undefined) patch.archivedAt = input.archived ? new Date() : null;
  if (Object.keys(patch).length) await db.update(classes).set({ ...patch, updatedAt: new Date() }).where(eq(classes.id, id));
}

export async function newClassCode(viewer: Viewer, id: string): Promise<string> {
  return db.transaction(async (tx) => {
    await taughtClass(viewer, id, tx);
    const code = await uniqueCode(tx);
    await tx.update(classes).set({ joinCode: code, updatedAt: new Date() }).where(eq(classes.id, id));
    return code;
  });
}

export async function deleteClass(viewer: Viewer, id: string): Promise<void> {
  await taughtClass(viewer, id);
  await db.delete(classes).where(eq(classes.id, id));
}

export async function removeStudent(viewer: Viewer, id: string, userId: string): Promise<void> {
  await taughtClass(viewer, id);
  await db.delete(classMembers).where(and(eq(classMembers.classId, id), eq(classMembers.userId, userId), eq(classMembers.role, 'student')));
}

export async function addAssignment(viewer: Viewer, classId: string, input: { setId: string; dueAt: string | null; note: string }): Promise<string> {
  await taughtClass(viewer, classId);
  // Teachers can assign their own sets and anyone's shared ones, never someone else's private set.
  const { set } = await loadViewableSet(viewer, input.setId);
  if (set.cardCount === 0) throw new HttpError(400, 'empty_set', 'Add cards to this set before assigning it.');
  const [{ count }] = (await db.select({ count: sql<number>`count(*)::int` }).from(assignments).where(eq(assignments.classId, classId))) as [{ count: number }];
  if (count >= CLASS_LIMITS.assignmentsMax) throw conflict('too_many_assignments', 'This class has the most assignments it can hold.');
  const id = newId();
  const inserted = await db
    .insert(assignments)
    .values({ id, classId, setId: set.id, assignedBy: viewer.id, dueAt: input.dueAt ? new Date(input.dueAt) : null, note: input.note })
    .onConflictDoNothing()
    .returning({ id: assignments.id });
  if (inserted.length === 0) throw conflict('already_assigned', 'This set is already assigned to the class.');
  return id;
}

export async function updateAssignment(viewer: Viewer, classId: string, assignmentId: string, input: { dueAt?: string | null; note?: string }) {
  await taughtClass(viewer, classId);
  const patch: Partial<typeof assignments.$inferInsert> = {};
  if (input.dueAt !== undefined) patch.dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (input.note !== undefined) patch.note = input.note;
  if (Object.keys(patch).length === 0) return;
  const updated = await db
    .update(assignments)
    .set(patch)
    .where(and(eq(assignments.id, assignmentId), eq(assignments.classId, classId)))
    .returning({ id: assignments.id });
  if (updated.length === 0) throw notFound();
}

export async function removeAssignment(viewer: Viewer, classId: string, assignmentId: string): Promise<void> {
  await taughtClass(viewer, classId);
  await db.delete(assignments).where(and(eq(assignments.id, assignmentId), eq(assignments.classId, classId)));
}

/* ------------------------------------------------------------------ */
/* Student actions                                                     */

async function classByCode(code: string): Promise<ClassRow> {
  const [cls] = await db
    .select()
    .from(classes)
    .where(and(eq(classes.joinCode, code), isNull(classes.archivedAt)))
    .limit(1);
  if (!cls) throw notFound('class_not_found');
  return cls;
}

export async function previewJoin(viewer: Viewer, code: string): Promise<JoinPreview> {
  await enforceRateLimit(`class-join:${viewer.id}`, { window: 3600, max: 60 }, 'rate_limited');
  const cls = await classByCode(code);
  const [summary] = await summaries([cls], viewer);
  const [member] = await db
    .select({ role: classMembers.role })
    .from(classMembers)
    .where(and(eq(classMembers.classId, cls.id), eq(classMembers.userId, viewer.id)))
    .limit(1);
  return {
    id: cls.id,
    name: cls.name,
    teacherName: summary!.teacher.name,
    studentCount: summary!.studentCount,
    alreadyMember: Boolean(member),
    isTeacher: cls.teacherId === viewer.id,
  };
}

export async function joinClass(viewer: Viewer, code: string): Promise<string> {
  await enforceRateLimit(`class-join:${viewer.id}`, { window: 3600, max: 60 }, 'rate_limited');
  const cls = await classByCode(code);
  if (cls.teacherId === viewer.id) return cls.id;
  const [{ count }] = (await db
    .select({ count: sql<number>`count(*)::int` })
    .from(classMembers)
    .where(and(eq(classMembers.classId, cls.id), eq(classMembers.role, 'student')))) as [{ count: number }];
  if (count >= CLASS_LIMITS.studentsMax) throw conflict('class_full', 'This class is full.');
  await db.insert(classMembers).values({ classId: cls.id, userId: viewer.id, role: 'student' }).onConflictDoNothing();
  return cls.id;
}

export async function leaveClass(viewer: Viewer, id: string): Promise<void> {
  const cls = await loadClass(id);
  if (cls.teacherId === viewer.id) throw forbidden('teacher_cannot_leave', 'Delete or archive the class instead.');
  await db.delete(classMembers).where(and(eq(classMembers.classId, id), eq(classMembers.userId, viewer.id), ne(classMembers.role, 'teacher')));
}
