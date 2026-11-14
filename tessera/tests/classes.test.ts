import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createUser, sampleSet, type TestClient } from './helpers';

async function setUpClass() {
  const teacher = await createUser({ role: 'teacher', name: 'Ms Rivera' });
  const student = await createUser({ name: 'Ana' });
  const set = await teacher.post('/api/sets', sampleSet({ title: 'Greek letters' }));
  const { id } = await teacher.post('/api/classes', { name: 'Period 3 Biology' });
  const detail = await teacher.get(`/api/classes/${id}`);
  return { teacher, student, set, classId: id as string, code: detail.joinCode as string };
}

const answer = (user: TestClient, set: any, index: number, correct = true) =>
  user.post('/api/study/sync', {
    events: [
      {
        id: randomUUID(),
        type: 'answer',
        mode: 'learn',
        kind: 'written',
        correct,
        cardId: set.cards[index].id,
        setId: set.id,
        at: new Date().toISOString(),
      },
    ],
  });

describe('classes', () => {
  it('only teachers with a confirmed email can create one', async () => {
    const student = await createUser();
    expect((await student.request('POST', '/api/classes', { name: 'Mine' })).status).toBe(403);
    const unverified = await createUser({ role: 'teacher', verified: false });
    const res = await unverified.request('POST', '/api/classes', { name: 'Mine' });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('email_unverified');
  });

  it('lets students join by code, shares assigned private sets, and reports progress to the teacher', async () => {
    const { teacher, student, set, classId, code } = await setUpClass();
    expect(code).toMatch(/^[A-Z2-9]{7}$/);

    // The private set is out of reach until it is assigned to a class the student is in.
    expect((await student.request('GET', `/api/sets/${set.id}`)).status).toBe(404);

    const preview = await student.get(`/api/classes/join/${code.toLowerCase()}`);
    expect(preview).toMatchObject({ name: 'Period 3 Biology', teacherName: 'Ms Rivera', alreadyMember: false });
    expect(await student.post('/api/classes/join', { code: `${code.slice(0, 3)}-${code.slice(3)}` })).toEqual({ id: classId });

    const due = new Date(Date.now() + 3 * 86_400_000).toISOString();
    await teacher.post(`/api/classes/${classId}/assignments`, { setId: set.id, dueAt: due, note: 'Before Friday' });
    expect((await student.get(`/api/sets/${set.id}`)).viaClass).toEqual({ id: classId, name: 'Period 3 Biology' });

    // The student sees the class without its join code or roster, with their own progress.
    const seen = await student.get(`/api/classes/${classId}`);
    expect(seen.joinCode).toBeNull();
    expect(seen.students).toEqual([]);
    expect(seen.assignments[0]).toMatchObject({ note: 'Before Friday', set: { title: 'Greek letters', cardCount: 3 }, mine: { mastery: 0 } });

    await answer(student, set, 0);
    await answer(student, set, 0);
    await answer(student, set, 1);
    const list = await student.get('/api/classes');
    expect(list.enrolled.map((c: any) => c.name)).toEqual(['Period 3 Biology']);
    expect(list.upcoming[0].mine.mastery).toBeGreaterThan(0);

    const progress = await teacher.get(`/api/classes/${classId}/progress`);
    expect(progress.students.map((s: any) => s.name)).toEqual(['Ana']);
    const assignmentId = progress.assignments[0].id;
    expect(progress.cells[student.id][assignmentId]).toMatchObject({ started: 2 });
    expect(progress.cells[student.id][assignmentId].mastery).toBeGreaterThan(0);
    expect(progress.cells[student.id][assignmentId].lastStudiedAt).not.toBeNull();
  });

  it('keeps class data to its members and the teacher', async () => {
    const { student, classId, set, teacher } = await setUpClass();
    const outsider = await createUser();
    await student.post('/api/classes/join', { code: (await teacher.get(`/api/classes/${classId}`)).joinCode });
    expect((await outsider.request('GET', `/api/classes/${classId}`)).status).toBe(404);
    expect((await student.request('GET', `/api/classes/${classId}/progress`)).status).toBe(404);
    expect((await student.request('POST', `/api/classes/${classId}/assignments`, { setId: set.id })).status).toBe(404);
    // A teacher cannot assign someone else's private set.
    const theirs = await outsider.post('/api/sets', sampleSet());
    expect((await teacher.request('POST', `/api/classes/${classId}/assignments`, { setId: theirs.id })).status).toBe(404);
  });

  it('revokes access when the student leaves, is removed, or the class is archived', async () => {
    const { teacher, student, set, classId, code } = await setUpClass();
    await student.post('/api/classes/join', { code });
    await teacher.post(`/api/classes/${classId}/assignments`, { setId: set.id });
    expect((await student.request('GET', `/api/sets/${set.id}`)).status).toBe(200);

    await teacher.request('PATCH', `/api/classes/${classId}`, { archived: true });
    expect((await student.request('GET', `/api/sets/${set.id}`)).status).toBe(404);
    expect((await student.request('POST', '/api/classes/join', { code })).status).toBe(404);
    await teacher.request('PATCH', `/api/classes/${classId}`, { archived: false });

    await teacher.request('DELETE', `/api/classes/${classId}/members/${student.id}`);
    expect((await student.request('GET', `/api/sets/${set.id}`)).status).toBe(404);

    await student.post('/api/classes/join', { code });
    expect((await student.request('POST', `/api/classes/${classId}/leave`)).status).toBe(204);
    expect((await student.request('GET', `/api/classes/${classId}`)).status).toBe(404);

    // A new code stops the old one working.
    const { joinCode } = await teacher.post(`/api/classes/${classId}/code`);
    expect(joinCode).not.toBe(code);
    expect((await student.request('GET', `/api/classes/join/${code}`)).status).toBe(404);
  });

  it('rejects assigning the same set twice', async () => {
    const { teacher, set, classId } = await setUpClass();
    await teacher.post(`/api/classes/${classId}/assignments`, { setId: set.id });
    const again = await teacher.request('POST', `/api/classes/${classId}/assignments`, { setId: set.id });
    expect(again.status).toBe(409);
  });
});
