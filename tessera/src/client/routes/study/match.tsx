import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Trophy } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { MatchScoresResponse, SetDetail } from '@shared/api';
import { createRng, randomSeed, shuffle } from '@shared/random';
import { RichText } from '@/components/rich-text';
import { SessionSummary, StudyGate, StudyShell } from '@/components/study/shell';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { isActive, useUser } from '@/lib/me';
import { enqueue, flushOutbox } from '@/lib/outbox';
import { useStudySession } from '@/lib/study';
import { cn, uuid } from '@/lib/utils';

const MAX_PAIRS = 6;
const PENALTY_MS = 1000;

interface Tile {
  id: string;
  cardId: string;
  side: 'term' | 'definition';
  rich: string;
  plain: string;
  lang: string;
}

function formatTime(ms: number): string {
  const total = Math.max(0, ms);
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const tenths = Math.floor((total % 1000) / 100);
  return `${minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : seconds}.${tenths}`;
}

function Leaderboard({ setId, pairs, highlight }: { setId: string; pairs: number; highlight?: number }) {
  const { t } = useI18n();
  const scores = useQuery({
    queryKey: ['match', setId, pairs],
    queryFn: ({ signal }) => api<MatchScoresResponse>(`/api/sets/${setId}/match-scores`, { query: { pairs }, signal }),
  });
  if (!scores.data) return null;
  const { personal, leaders } = scores.data;
  const others = leaders.some((l) => !l.isYou);
  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <section aria-labelledby="best-title">
        <h2 id="best-title" className="flex items-center gap-1.5 font-sans text-sm font-semibold text-muted-foreground">
          <Trophy className="size-4 text-gold" aria-hidden="true" />
          {t('match.yourBest')}
        </h2>
        {personal.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t('match.noScores')}</p>
        ) : (
          <ol className="mt-2 flex flex-col gap-1">
            {personal.map((score, i) => (
              <li key={i} className={cn('flex justify-between rounded-lg px-3 py-1.5 tabular-nums', score.timeMs === highlight ? 'bg-primary-soft font-bold text-primary-soft-foreground' : 'bg-muted')}>
                <span>{t('match.rank', { position: i + 1 })}</span>
                <span>{formatTime(score.timeMs)}s</span>
              </li>
            ))}
          </ol>
        )}
      </section>
      {others ? (
        <section aria-labelledby="leaders-title">
          <h2 id="leaders-title" className="font-sans text-sm font-semibold text-muted-foreground">
            {t('match.leaders')}
          </h2>
          <ol className="mt-2 flex flex-col gap-1">
            {leaders.map((leader, i) => (
              <li key={i} className={cn('flex justify-between gap-3 rounded-lg px-3 py-1.5', leader.isYou ? 'bg-primary-soft font-bold text-primary-soft-foreground' : 'bg-muted')}>
                <span dir="auto" className="truncate">
                  {t('match.rank', { position: i + 1 })} {leader.name ?? t('match.anonymous')}
                  {leader.isYou ? ` (${t('match.youTag')})` : ''}
                </span>
                <span className="tabular-nums">{formatTime(leader.timeMs)}s</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

function Match({ set }: { set: SetDetail }) {
  const { t } = useI18n();
  const signedIn = isActive(useUser());
  const client = useQueryClient();
  const session = useStudySession(set.id, 'match');
  const playable = useMemo(() => set.cards.filter((c) => c.termPlain && c.definitionPlain), [set.cards]);
  const pairs = Math.min(MAX_PAIRS, playable.length);

  const [phase, setPhase] = useState<'ready' | 'playing' | 'done'>('ready');
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [finalMs, setFinalMs] = useState(0);
  const startedAt = useRef(0);
  const dragState = useRef<{ id: string; x: number; y: number; pointer: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const start = () => {
    const rng = createRng(randomSeed());
    const chosen = shuffle(playable, rng).slice(0, pairs);
    const next: Tile[] = chosen.flatMap((c) => [
      { id: `${c.id}:t`, cardId: c.id, side: 'term' as const, rich: c.term, plain: c.termPlain, lang: set.termLang },
      { id: `${c.id}:d`, cardId: c.id, side: 'definition' as const, rich: c.definition, plain: c.definitionPlain, lang: set.definitionLang },
    ]);
    setTiles(shuffle(next, rng));
    setMatched(new Set());
    setSelected(null);
    setWrong([]);
    setMistakes(0);
    setElapsed(0);
    setAnnouncement('');
    session.restart();
    startedAt.current = performance.now();
    setPhase('playing');
  };

  useEffect(() => {
    if (phase !== 'playing') return;
    const timer = setInterval(() => setElapsed(performance.now() - startedAt.current), 100);
    return () => clearInterval(timer);
  }, [phase]);

  const finish = useCallback(
    (totalMistakes: number) => {
      const timeMs = Math.round(performance.now() - startedAt.current + totalMistakes * PENALTY_MS);
      setFinalMs(timeMs);
      setPhase('done');
      for (let i = 0; i < pairs; i++) session.count(null);
      session.finish({ details: { timeMs, pairs, mistakes: totalMistakes } });
      if (!signedIn) return;
      void enqueue({ matchScores: [{ clientId: uuid(), setId: set.id, timeMs: Math.max(1000, timeMs), pairs, mistakes: totalMistakes }] })
        .then(() => flushOutbox())
        .then(() => client.invalidateQueries({ queryKey: ['match', set.id] }));
    },
    [client, pairs, session, set.id, signedIn],
  );

  const attempt = useCallback(
    (aId: string, bId: string) => {
      const a = tiles.find((x) => x.id === aId);
      const b = tiles.find((x) => x.id === bId);
      if (!a || !b || a.id === b.id || matched.has(a.id) || matched.has(b.id)) return;
      setSelected(null);
      if (a.cardId === b.cardId) {
        const next = new Set(matched).add(a.id).add(b.id);
        setMatched(next);
        const term = a.side === 'term' ? a.plain : b.plain;
        const left = pairs - next.size / 2;
        setAnnouncement(`${t('match.matched', { term })} ${left > 0 ? t('match.pairsLeft', { count: left }) : ''}`);
        if (left === 0) finish(mistakes);
      } else {
        setMistakes((m) => m + 1);
        setWrong([a.id, b.id]);
        setAnnouncement(t('match.notMatch'));
        setTimeout(() => setWrong([]), 450);
      }
    },
    [tiles, matched, pairs, t, finish, mistakes],
  );

  const choose = (id: string) => {
    if (suppressClick.current) return;
    if (selected === id) setSelected(null);
    else if (selected) attempt(selected, id);
    else setSelected(id);
  };

  // Dragging one tile onto another is the same as choosing both.
  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragState.current = { id, x: event.clientX, y: event.clientY, pointer: event.pointerId, moved: false };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = dragState.current;
    if (!state || state.pointer !== event.pointerId) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (!state.moved && Math.hypot(dx, dy) < 8) return;
    if (!state.moved) {
      state.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setDrag({ id: state.id, dx, dy });
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = dragState.current;
    dragState.current = null;
    if (!state || !state.moved) return;
    setDrag(null);
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 60);
    const target = document
      .elementsFromPoint(event.clientX, event.clientY)
      .map((el) => (el as HTMLElement).closest<HTMLElement>('[data-tile]'))
      .find((el) => el && el.dataset.tile !== state.id);
    if (target?.dataset.tile) attempt(state.id, target.dataset.tile);
  };

  // Arrow keys move between tiles; the grid is a single tab stop.
  const onGridKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const buttons = Array.from(gridRef.current?.querySelectorAll<HTMLButtonElement>('button[data-tile]:not(:disabled)') ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) return;
    event.preventDefault();
    const columns = getComputedStyle(gridRef.current!).gridTemplateColumns.split(' ').length;
    const rtl = getComputedStyle(gridRef.current!).direction === 'rtl';
    const step = event.key === 'ArrowLeft' ? (rtl ? 1 : -1) : event.key === 'ArrowRight' ? (rtl ? -1 : 1) : event.key === 'ArrowUp' ? -columns : columns;
    buttons[Math.max(0, Math.min(buttons.length - 1, index + step))]?.focus();
  };

  if (phase === 'ready') {
    return (
      <StudyShell set={set} mode="match">
        <section className="mx-auto my-auto w-full max-w-xl rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
          <h1 className="text-3xl font-extrabold">{t('match.readyTitle')}</h1>
          <p className="mt-2 text-lg text-muted-foreground">{t('match.readyBody')}</p>
          <Button size="lg" className="mt-6 w-full" autoFocus onClick={start}>
            {t('match.start')}
          </Button>
          {signedIn ? <Leaderboard setId={set.id} pairs={pairs} /> : null}
        </section>
      </StudyShell>
    );
  }

  if (phase === 'done') {
    return (
      <StudyShell set={set} mode="match">
        <SessionSummary
          setId={set.id}
          title={t('match.doneTitle')}
          body={t('match.doneTime', { time: `${formatTime(finalMs)}s` })}
          stats={[
            { label: t('match.time'), value: `${formatTime(finalMs)}s` },
            { label: t('study.cards'), value: pairs },
            { label: t('study.incorrect'), value: mistakes },
          ]}
          primary={
            <Button size="lg" onClick={start}>
              {t('match.playAgain')}
            </Button>
          }
          steps={[{ to: `/sets/${set.id}/flashcards`, label: t('landing.modeFlashcards'), icon: <Layers aria-hidden="true" /> }]}
        >
          {signedIn ? <Leaderboard setId={set.id} pairs={pairs} highlight={Math.max(1000, finalMs)} /> : null}
        </SessionSummary>
      </StudyShell>
    );
  }

  const left = pairs - matched.size / 2;
  return (
    <StudyShell
      set={set}
      mode="match"
      status={
        <span role="timer" aria-label={t('match.timer')}>
          {formatTime(elapsed + mistakes * PENALTY_MS)}s
        </span>
      }
      progress={{ value: (matched.size / tiles.length) * 100, label: t('match.pairsLeft', { count: left }) }}
    >
      <h1 className="sr-only">{t('match.readyTitle')}</h1>
      <p className="sr-only" aria-live="assertive" aria-atomic="true">
        {announcement}
      </p>
      <p className="mb-3 flex justify-between text-sm font-semibold text-muted-foreground">
        <span>{t('match.pairsLeft', { count: left })}</span>
        <span className={cn(mistakes > 0 && 'text-destructive')}>{t('match.mistakes', { count: mistakes })}</span>
      </p>
      <div ref={gridRef} role="group" aria-label={t('match.board')} onKeyDown={onGridKey} className="grid flex-1 auto-rows-fr grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3">
        {tiles.map((tile) => {
          const isMatched = matched.has(tile.id);
          const isSelected = selected === tile.id;
          const isWrong = wrong.includes(tile.id);
          const dragging = drag?.id === tile.id;
          return (
            <button
              key={tile.id}
              type="button"
              data-tile={tile.id}
              disabled={isMatched}
              aria-pressed={isSelected}
              aria-label={`${tile.side === 'term' ? t('match.tileTerm', { text: tile.plain }) : t('match.tileDefinition', { text: tile.plain })}`}
              onClick={() => choose(tile.id)}
              onPointerDown={(e) => onPointerDown(e, tile.id)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={dragging ? { transform: `translate(${drag.dx}px, ${drag.dy}px) scale(1.04)`, zIndex: 20, transition: 'none' } : undefined}
              className={cn(
                'flex min-h-20 touch-none items-center justify-center rounded-2xl border-2 bg-card p-2 text-center shadow-card transition-[transform,opacity,border-color,background-color] duration-200 select-none sm:min-h-28 sm:p-3',
                isMatched && 'pointer-events-none scale-90 border-transparent opacity-0',
                !isMatched && !isSelected && !isWrong && 'border-border hover:border-primary/60',
                isSelected && 'border-primary bg-primary-soft',
                isWrong && 'border-destructive bg-destructive-soft motion-safe:animate-shake',
                dragging && 'shadow-pop',
              )}
            >
              <RichText value={tile.rich} lang={tile.lang} className={cn('line-clamp-5 max-w-full text-sm sm:text-base', tile.side === 'term' && 'font-bold')} />
            </button>
          );
        })}
      </div>
    </StudyShell>
  );
}

export default function MatchPage() {
  return (
    <StudyGate mode="match" minCards={2}>
      {(set) => <Match key={set.id} set={set} />}
    </StudyGate>
  );
}
