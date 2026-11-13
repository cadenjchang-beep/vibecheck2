import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CardDto, CardProgressDto, SetDetail } from '@shared/api';
import type { Stage, StudyMode } from '@shared/constants';
import { masteryPercent } from '@shared/progress';
import type { Rating } from '@shared/srs';
import { applyEvent, type AnswerKind, type CardProgress, type SessionInput, type StudyEvent } from '@shared/study';
import { isActive, useUser } from './me';
import { enqueue, getPending, onSynced, subscribePending } from './outbox';
import { keys } from './query';
import { uuid } from './utils';

function derived(cards: CardDto[], progress: Record<string, CardProgressDto>) {
  const now = Date.now();
  const stages: Stage[] = [];
  let due = 0;
  let studied = false;
  for (const card of cards) {
    const p = progress[card.id];
    if (!p) continue;
    stages.push(p.stage);
    if (p.dueAt && new Date(p.dueAt).getTime() <= now) due++;
    if (p.stage !== 'new' || p.correctCount + p.incorrectCount > 0) studied = true;
  }
  return { mastery: studied ? masteryPercent(stages, cards.length) : null, dueCount: due };
}

/** Applies an event to the cached set immediately, exactly as the server will. */
function applyToCache(client: QueryClient, event: StudyEvent, timeZone: string): void {
  client.setQueryData<SetDetail>(keys.set(event.setId), (set) => {
    if (!set) return set;
    const current = set.progress[event.cardId];
    const next: CardProgress = applyEvent(current, event, timeZone);
    const progress = { ...set.progress, [event.cardId]: { cardId: event.cardId, ...next } };
    return { ...set, progress, ...derived(set.cards, progress), lastStudiedAt: event.at };
  });
}

/** Folds the server's authoritative progress back into the cache after a sync. */
export function installSyncReconciler(client: QueryClient): () => void {
  return onSynced((result, sent) => {
    const setOf = new Map(sent.events.map((e) => [e.cardId, e.setId]));
    const bySet = new Map<string, Record<string, CardProgressDto>>();
    for (const [cardId, progress] of Object.entries(result.progress)) {
      const setId = setOf.get(cardId);
      if (!setId) continue;
      bySet.set(setId, { ...(bySet.get(setId) ?? {}), [cardId]: progress });
    }
    for (const [setId, patch] of bySet) {
      client.setQueryData<SetDetail>(keys.set(setId), (set) => {
        if (!set) return set;
        const progress = { ...set.progress, ...patch };
        return { ...set, progress, ...derived(set.cards, progress) };
      });
    }
    // Lists and totals that depend on what was just studied.
    void client.invalidateQueries({ queryKey: keys.dashboard });
    void client.invalidateQueries({ queryKey: keys.stats });
    void client.invalidateQueries({ queryKey: ['sets'] });
    void client.invalidateQueries({ queryKey: ['review'] });
  });
}

export interface Recorder {
  /** False for visitors: nothing is stored, the session still works. */
  enabled: boolean;
  answer: (cardId: string, kind: AnswerKind, correct: boolean) => void;
  rate: (cardId: string, setId: string, rating: Rating) => void;
}

/** Records answers for one set: updates the screen at once and queues the event for sync. */
export function useRecorder(setId: string, mode: StudyMode): Recorder {
  const client = useQueryClient();
  const user = useUser();
  const enabled = isActive(user);
  const timeZone = user?.timezone ?? 'UTC';

  const record = useCallback(
    (event: StudyEvent) => {
      if (!enabled) return;
      applyToCache(client, event, timeZone);
      void enqueue({ events: [event] });
    },
    [client, enabled, timeZone],
  );

  return useMemo(
    () => ({
      enabled,
      answer: (cardId, kind, correct) =>
        record({ id: uuid(), type: 'answer', cardId, setId, mode, kind, correct, at: new Date().toISOString() }),
      rate: (cardId, cardSetId, rating) =>
        record({ id: uuid(), type: 'rating', cardId, setId: cardSetId, mode: 'review', rating, at: new Date().toISOString() }),
    }),
    [enabled, record, setId, mode],
  );
}

const IDLE_MS = 60_000;

export interface SessionTracker {
  /** Counts one studied card; pass null when there is no right or wrong. */
  count: (correct: boolean | null) => void;
  /** Ends the session and queues it. Later calls do nothing until `restart`. */
  finish: (extra?: Pick<SessionInput, 'score' | 'details'>) => void;
  restart: () => void;
  /** Seconds of active study so far. */
  elapsed: () => number;
}

/**
 * Measures a study session: active time only (it stops counting when the tab
 * is hidden or nothing has been touched for a minute) plus answer counts.
 */
export function useStudySession(setId: string | null, mode: StudyMode): SessionTracker {
  const enabled = isActive(useUser());
  const fresh = () => {
    const now = Date.now();
    return { startedAt: now, activeMs: 0, lastTick: now, lastInput: now, cards: 0, correct: 0, incorrect: 0, finished: false };
  };
  const state = useRef(fresh());

  const tick = useCallback(() => {
    const s = state.current;
    const now = Date.now();
    if (!s.finished && document.visibilityState === 'visible' && now - s.lastInput < IDLE_MS) s.activeMs += Math.min(now - s.lastTick, 5000);
    s.lastTick = now;
  }, []);

  const finish = useCallback<SessionTracker['finish']>(
    (extra) => {
      const s = state.current;
      if (s.finished) return;
      tick();
      s.finished = true;
      const durationSeconds = Math.round(s.activeMs / 1000);
      if (!enabled || (s.cards === 0 && durationSeconds < 5)) return;
      void enqueue({
        sessions: [
          {
            clientId: uuid(),
            setId,
            mode,
            startedAt: new Date(s.startedAt).toISOString(),
            endedAt: new Date().toISOString(),
            durationSeconds,
            cardsStudied: s.cards,
            correctCount: s.correct,
            incorrectCount: s.incorrect,
            score: extra?.score ?? null,
            details: extra?.details,
          },
        ],
      });
    },
    [enabled, mode, setId, tick],
  );

  useEffect(() => {
    // The effect can run more than once for one screen (React's development
    // double-mount, or a dependency changing). A session ended by an earlier
    // cleanup must not leave this one permanently stopped.
    if (state.current.finished) state.current = fresh();
    const touch = () => {
      tick();
      state.current.lastInput = Date.now();
    };
    const interval = setInterval(tick, 1000);
    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);
    document.addEventListener('visibilitychange', tick);
    // Leaving the page ends the session, however it is left.
    const leave = () => finish();
    window.addEventListener('pagehide', leave);
    return () => {
      clearInterval(interval);
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('pagehide', leave);
      finish();
    };
  }, [finish, tick]);

  return useMemo(
    () => ({
      count: (correct) => {
        const s = state.current;
        s.cards++;
        if (correct === true) s.correct++;
        if (correct === false) s.incorrect++;
      },
      finish,
      restart: () => {
        state.current = fresh();
      },
      elapsed: () => {
        tick();
        return Math.round(state.current.activeMs / 1000);
      },
    }),
    [finish, tick],
  );
}

/** How many recorded items have not reached the server yet. */
export function usePendingSync(): number {
  return useSyncExternalStore(subscribePending, getPending, () => 0);
}

/** A setting remembered on this device between visits. */
export function useStoredState<T>(key: string, initial: T): [T, (value: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? { ...initial, ...(JSON.parse(raw) as T) } : initial;
    } catch {
      return initial;
    }
  });
  const update = useCallback(
    (next: T | ((previous: T) => T)) => {
      setValue((previous) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(previous) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* not remembered, still applied */
        }
        return resolved;
      });
    },
    [key],
  );
  return [value, update];
}
