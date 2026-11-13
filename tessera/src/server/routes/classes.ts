import { assignmentInputSchema, assignmentUpdateSchema, classInputSchema, classUpdateSchema, joinSchema } from '@shared/classes';
import { Hono } from 'hono';
import { parseJson, parseWith, requireViewer, type AppEnv } from '../http/context';
import {
  addAssignment,
  createClass,
  deleteClass,
  getClassDetail,
  getClassProgress,
  joinClass,
  leaveClass,
  listClasses,
  newClassCode,
  previewJoin,
  removeAssignment,
  removeStudent,
  updateAssignment,
  updateClass,
} from '../services/classes';

export const classRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await listClasses(requireViewer(c))))

  .post('/', async (c) => {
    const viewer = requireViewer(c);
    const id = await createClass(viewer, await parseJson(c, classInputSchema));
    return c.json({ id }, 201);
  })

  .get('/join/:code', async (c) => {
    const { code } = parseWith(joinSchema, { code: c.req.param('code') });
    return c.json(await previewJoin(requireViewer(c), code));
  })

  .post('/join', async (c) => {
    const viewer = requireViewer(c);
    const { code } = await parseJson(c, joinSchema);
    return c.json({ id: await joinClass(viewer, code) });
  })

  .get('/:id', async (c) => c.json(await getClassDetail(requireViewer(c), c.req.param('id'))))

  .patch('/:id', async (c) => {
    const viewer = requireViewer(c);
    await updateClass(viewer, c.req.param('id'), await parseJson(c, classUpdateSchema));
    return c.body(null, 204);
  })

  .delete('/:id', async (c) => {
    await deleteClass(requireViewer(c), c.req.param('id'));
    return c.body(null, 204);
  })

  .post('/:id/code', async (c) => c.json({ joinCode: await newClassCode(requireViewer(c), c.req.param('id')) }))

  .get('/:id/progress', async (c) => c.json(await getClassProgress(requireViewer(c), c.req.param('id'))))

  .post('/:id/leave', async (c) => {
    await leaveClass(requireViewer(c), c.req.param('id'));
    return c.body(null, 204);
  })

  .delete('/:id/members/:userId', async (c) => {
    await removeStudent(requireViewer(c), c.req.param('id'), c.req.param('userId'));
    return c.body(null, 204);
  })

  .post('/:id/assignments', async (c) => {
    const viewer = requireViewer(c);
    const id = await addAssignment(viewer, c.req.param('id'), await parseJson(c, assignmentInputSchema));
    return c.json({ id }, 201);
  })

  .patch('/:id/assignments/:assignmentId', async (c) => {
    const viewer = requireViewer(c);
    await updateAssignment(viewer, c.req.param('id'), c.req.param('assignmentId'), await parseJson(c, assignmentUpdateSchema));
    return c.body(null, 204);
  })

  .delete('/:id/assignments/:assignmentId', async (c) => {
    await removeAssignment(requireViewer(c), c.req.param('id'), c.req.param('assignmentId'));
    return c.body(null, 204);
  });
