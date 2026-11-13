import { createStore, get, update, type UseStore } from 'idb-keyval';
import type { CardProgressDto } from '@shared/api';
import type { MatchScoreInput } from '@shared/schemas';
import type { SessionInput, StudyEvent } from '@shared/study';
import { api, ApiError } from './api';
import { reportClientError } from './report';

/**
 * Study activity waiting to reach the server.
 *
 * Everything recorded while studying goes here first, in IndexedDB, and is
 * sent in the background. That makes studying work the same online and
 * offline: nothing is lost if the connection drops or the tab is closed, and
 * because every item carries its own id the server ignores anything it has
 * already seen.
 */

interface Box {
  events: StudyEvent[];
  sessions: SessionInput[];
  matchScores: MatchScoreInput[];
}

export interface SyncResult {
  progress: Record<string, CardProgressDto>;
  appliedEvents: number;
  streak: { current: number; longest: number };
}

type Listener = (result: SyncResult, sent: Box) => void;

const emptyBox = (): Box => ({ events: [], sessions: [], matchScores: [] });
const BATCH = { events: 400, sessions: 50, matchScores: 50 };

let store: UseStore | null = null;
try {
  store = createStore('tessera-outbox', 'outbox');
} catch {
  store = null;
}
/** Used when IndexedDB is unavailable (some private windows): lasts for the visit. */
const memory = new Map<string, Box>();

let userId: string | null = null;
let flushing: Promise<SyncResult | null> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<Listener>();
const pendingListeners = new Set<() => void>();
let pending = 0;

const boxKey = () => `box:${userId}`;

async function read(): Promise<Box> {
  if (!userId) return emptyBox();
  if (store) {
    try {
      return (await get<Box>(boxKey(), store)) ?? emptyBox();
    } catch {
      store = null;
    }
  }
  return memory.get(boxKey()) ?? emptyBox();
}

async function mutate(change: (box: Box) => Box): Promise<void> {
  if (!userId) return;
  const key = boxKey();
  if (store) {
    try {
      await update<Box>(key, (old) => change(old ?? emptyBox()), store);
      return;
    } catch {
      store = null;
    }
  }
  memory.set(key, change(memory.get(key) ?? emptyBox()));
}

function setPending(count: number): void {
  if (count === pending) return;
  pending = count;
  pendingListeners.forEach((l) => l());
}

const size = (box: Box) => box.events.length + box.sessions.length + box.matchScores.length;

/** Each signed-in user has their own outbox, so activity is never sent as someone else. */
export function setOutboxUser(id: string | null): void {
  if (id === userId) return;
  userId = id;
  setPending(0);
  if (id) void read().then((box) => { setPending(size(box)); scheduleFlush(200); });
}

export async function enqueue(items: Partial<Box>): Promise<void> {
  if (!userId) return;
  await mutate((box) => ({
    events: [...box.events, ...(items.events ?? [])],
    sessions: [...box.sessions, ...(items.sessions ?? [])],
    matchScores: [...box.matchScores, ...(items.matchScores ?? [])],
  }));
  setPending(pending + (items.events?.length ?? 0) + (items.sessions?.length ?? 0) + (items.matchScores?.length ?? 0));
  scheduleFlush(1200);
}

export function scheduleFlush(delay = 0): void {
  clearTimeout(timer);
  timer = setTimeout(() => void flushOutbox(), delay);
}

/** Sends one batch. Resolves to the server's answer, or null if nothing was sent. */
export function flushOutbox(): Promise<SyncResult | null> {
  if (flushing) return flushing;
  flushing = (async () => {
    if (!userId || !navigator.onLine) return null;
    const box = await read();
    if (size(box) === 0) {
      setPending(0);
      return null;
    }
    const batch: Box = {
      events: box.events.slice(0, BATCH.events),
      sessions: box.sessions.slice(0, BATCH.sessions),
      matchScores: box.matchScores.slice(0, BATCH.matchScores),
    };
    const sentFor = userId;
    const remove = async () => {
      const eventIds = new Set(batch.events.map((e) => e.id));
      const sessionIds = new Set(batch.sessions.map((s) => s.clientId));
      const scoreIds = new Set(batch.matchScores.map((m) => m.clientId));
      await mutate((current) => ({
        events: current.events.filter((e) => !eventIds.has(e.id)),
        sessions: current.sessions.filter((s) => !sessionIds.has(s.clientId)),
        matchScores: current.matchScores.filter((m) => !scoreIds.has(m.clientId)),
      }));
    };
    try {
      const result = await api<SyncResult>('/api/study/sync', { method: 'POST', body: batch });
      if (userId !== sentFor) return null;
      await remove();
      const left = size(await read());
      setPending(left);
      listeners.forEach((listener) => listener(result, batch));
      if (left > 0) scheduleFlush(50);
      return result;
    } catch (err) {
      // A batch the server refuses as invalid would be refused forever: drop it.
      if (err instanceof ApiError && err.status === 400) {
        await remove();
        setPending(size(await read()));
        reportClientError(err, 'outbox: rejected batch');
      }
      return null;
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

export function onSynced(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function subscribePending(listener: () => void): () => void {
  pendingListeners.add(listener);
  return () => pendingListeners.delete(listener);
}

export const getPending = () => pending;

/** Retry whenever the app has a chance of reaching the server again. */
export function installOutboxTriggers(): void {
  window.addEventListener('online', () => scheduleFlush(300));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleFlush(300);
  });
  setInterval(() => {
    if (pending > 0) scheduleFlush();
  }, 30_000);
}
