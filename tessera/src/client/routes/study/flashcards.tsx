import { ArrowLeft, ArrowRight, Brain, Check, ClipboardCheck, Pause, Play, Shuffle, Star, Undo2, Volume2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { CardDto, SetDetail } from '@shared/api';
import { createRng, randomSeed, shuffle } from '@shared/random';
import { RichText } from '@/components/rich-text';
import { SessionSummary, StudyGate, StudyShell } from '@/components/study/shell';
import { Button } from '@/components/ui/button';
import { Segmented, Switch, ToggleRow, Tooltip } from '@/components/ui/controls';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { BUILT } from '@/lib/built';
import { useI18n } from '@/lib/i18n';
import { isStudyable, useStarCard } from '@/lib/sets';
import { canSpeak, speak, stopSpeaking } from '@/lib/speech';
import { useRecorder, useStoredState, useStudySession } from '@/lib/study';
import { cn, isTypingTarget } from '@/lib/utils';

type Side = 'term' | 'definition';
type Result = 'know' | 'learning';

interface Prefs {
  front: Side;
  shuffle: boolean;
  /** Sort cards into "know it" and "still learning" as you go. */
  track: boolean;
  starredOnly: boolean;
}

const DEFAULT_PREFS: Prefs = { front: 'term', shuffle: false, track: true, starredOnly: false };
const AUTOPLAY_MS = 3200;
const SWIPE_DISTANCE = 96;

function textSize(text: string): string {
  const length = [...text].length;
  if (length <= 24) return 'text-3xl sm:text-5xl';
  if (length <= 70) return 'text-2xl sm:text-4xl';
  if (length <= 160) return 'text-xl sm:text-3xl';
  if (length <= 320) return 'text-lg sm:text-2xl';
  return 'text-base sm:text-xl';
}

function Face({ card, side, set, label, hidden, back }: { card: CardDto; side: Side; set: SetDetail; label: string; hidden: boolean; back?: boolean }) {
  const { t } = useI18n();
  const rich = side === 'term' ? card.term : card.definition;
  const plain = side === 'term' ? card.termPlain : card.definitionPlain;
  const image = side === 'term' ? card.termImage : card.definitionImage;
  return (
    <div
      data-face={back ? 'back' : 'front'}
      aria-hidden={hidden}
      className={cn(
        'flip-face flex flex-col rounded-3xl border border-border bg-card p-5 shadow-raised sm:p-8',
        back && 'flip-face-back',
      )}
    >
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto py-2 text-center">
        {image ? <img src={image.url} alt={t('study.imageAlt')} className="max-h-[45%] max-w-full rounded-xl object-contain" draggable={false} /> : null}
        {plain ? (
          <RichText
            value={rich}
            lang={side === 'term' ? set.termLang : set.definitionLang}
            className={cn('max-w-full font-semibold', side === 'term' && 'font-display', textSize(plain))}
          />
        ) : null}
      </div>
    </div>
  );
}

function Flashcards({ set }: { set: SetDetail }) {
  const { t } = useI18n();
  const [prefs, setPrefs] = useStoredState<Prefs>('tessera.flashcards', DEFAULT_PREFS);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [seed, setSeed] = useState(randomSeed);
  /** When set, the round is limited to these cards (the ones still being learned). */
  const [subset, setSubset] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [finished, setFinished] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [drag, setDrag] = useState(0);

  const recorder = useRecorder(set.id, 'flashcards');
  const session = useStudySession(set.id, 'flashcards');
  const starCard = useStarCard(set.id);
  /** The last sorted card, not yet recorded so that it can still be undone. */
  const pending = useRef<{ cardId: string; know: boolean } | null>(null);
  const seen = useRef(new Set<string>());
  const dragState = useRef<{ x: number; y: number; id: number; moved: boolean } | null>(null);
  const swiped = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const studyable = useMemo(() => set.cards.filter(isStudyable), [set.cards]);
  const starredIds = useMemo(() => new Set(studyable.filter((c) => set.progress[c.id]?.starred).map((c) => c.id)), [studyable, set.progress]);
  const starredOnly = prefs.starredOnly && starredIds.size > 0;
  // Stars are read when a round starts, so starring mid-round does not change the deck.
  const latestStars = useRef(starredIds);
  latestStars.current = starredIds;
  const roundStars = useRef(starredIds);

  const deck = useMemo(() => {
    let cards = studyable;
    if (subset) cards = cards.filter((c) => subset.includes(c.id));
    else if (starredOnly) cards = cards.filter((c) => roundStars.current.has(c.id));
    return prefs.shuffle ? shuffle(cards, createRng(seed)) : cards;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyable, subset, starredOnly, prefs.shuffle, seed]);

  const card = deck[Math.min(index, deck.length - 1)];
  const backSide: Side = prefs.front === 'term' ? 'definition' : 'term';
  const visibleSide = flipped ? backSide : prefs.front;
  const track = prefs.track && !autoplay;

  const commitPending = useCallback(() => {
    const item = pending.current;
    if (!item) return;
    pending.current = null;
    recorder.answer(item.cardId, 'flashcard', item.know);
    session.count(item.know);
  }, [recorder, session]);

  // Anything still pending is recorded when the page is left.
  useEffect(() => commitPending, [commitPending]);
  useEffect(() => stopSpeaking, []);

  const restart = useCallback(
    (cards: string[] | null) => {
      commitPending();
      session.finish();
      session.restart();
      seen.current = new Set();
      roundStars.current = latestStars.current;
      setSubset(cards);
      setSeed(randomSeed());
      setIndex(0);
      setFlipped(false);
      setResults({});
      setFinished(false);
      setAutoplay(false);
    },
    [commitPending, session],
  );

  const finish = useCallback(() => {
    commitPending();
    setFinished(true);
    setAutoplay(false);
    session.finish();
  }, [commitPending, session]);

  const flip = useCallback(() => {
    if (!card) return;
    setFlipped((f) => !f);
    if (!track && !seen.current.has(card.id)) {
      seen.current.add(card.id);
      session.count(null);
    }
  }, [card, track, session]);

  const go = useCallback(
    (step: 1 | -1, result?: Result) => {
      if (!card) return;
      if (step === 1) {
        if (result) {
          commitPending();
          pending.current = { cardId: card.id, know: result === 'know' };
          setResults((r) => ({ ...r, [card.id]: result }));
        }
        if (index >= deck.length - 1) {
          finish();
          return;
        }
        setIndex(index + 1);
      } else {
        if (index === 0) return;
        const previous = deck[index - 1]!;
        // Going back in sorting mode undoes the previous card's answer.
        if (track && pending.current?.cardId === previous.id) pending.current = null;
        if (track) setResults(({ [previous.id]: _undone, ...rest }) => rest);
        setIndex(index - 1);
      }
      setFlipped(false);
      setDrag(0);
    },
    [card, commitPending, deck, finish, index, track],
  );

  const know = useCallback(() => go(1, track ? 'know' : undefined), [go, track]);
  const stillLearning = useCallback(() => (track ? go(1, 'learning') : go(-1)), [go, track]);

  const toggleStar = useCallback(() => {
    if (card && recorder.enabled) starCard.mutate({ cardId: card.id, starred: !set.progress[card.id]?.starred });
  }, [card, recorder.enabled, set.progress, starCard]);

  const readAloud = useCallback(() => {
    if (!card) return;
    const audio = visibleSide === 'term' ? card.termAudio : card.definitionAudio;
    if (audio) void new Audio(audio.url).play().catch(() => undefined);
    else speak(visibleSide === 'term' ? card.termPlain : card.definitionPlain, visibleSide === 'term' ? set.termLang : set.definitionLang);
  }, [card, set.definitionLang, set.termLang, visibleSide]);

  // Auto-play: show the front, flip, show the back, move on.
  useEffect(() => {
    if (!autoplay || finished || optionsOpen) return;
    const timer = setTimeout(() => (flipped ? go(1) : flip()), AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [autoplay, finished, optionsOpen, flipped, index, go, flip]);

  useEffect(() => {
    if (finished || optionsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target)) return;
      const onButton = event.target instanceof HTMLElement && Boolean(event.target.closest('button, a')) && event.target !== cardRef.current;
      switch (event.key) {
        case ' ':
        case 'Enter':
          if (onButton) return; // let the focused button do its own thing
          event.preventDefault();
          flip();
          break;
        case 'ArrowUp':
        case 'ArrowDown':
          event.preventDefault();
          flip();
          break;
        case 'ArrowRight':
          event.preventDefault();
          know();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          stillLearning();
          break;
        case 'z':
        case 'Z':
        case 'Backspace':
          if (track) go(-1);
          break;
        case 's':
        case 'S':
          toggleStar();
          break;
        case 'p':
        case 'P':
          setAutoplay((a) => !a);
          break;
        default:
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finished, optionsOpen, flip, know, stillLearning, go, track, toggleStar]);

  // Swipe: right for "know it" (or next), left for "still learning" (or previous).
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragState.current = { x: event.clientX, y: event.clientY, id: event.pointerId, moved: false };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragState.current;
    if (!state || state.id !== event.pointerId) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (!state.moved) {
      // Leave vertical gestures to the page so it can still scroll.
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy)) return;
      state.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setDrag(dx);
  };
  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragState.current;
    if (!state || state.id !== event.pointerId) return;
    dragState.current = null;
    if (!state.moved) return; // a tap: the click handler flips the card
    // The browser still sends a click after a drag; that one must not flip.
    swiped.current = true;
    setTimeout(() => (swiped.current = false), 50);
    const dx = event.clientX - state.x;
    setDrag(0);
    if (event.type !== 'pointerup' || Math.abs(dx) < SWIPE_DISTANCE) return;
    if (dx > 0) know();
    else stillLearning();
  };

  const coarsePointer = useMemo(() => window.matchMedia('(pointer: coarse)').matches, []);
  const knowCount = Object.values(results).filter((r) => r === 'know').length;
  const learningIds = Object.entries(results)
    .filter(([, r]) => r === 'learning')
    .map(([id]) => id);

  const options = (
    <Dialog open={optionsOpen} onOpenChange={setOptionsOpen}>
      <DialogContent title={t('study.optionsTitle', { mode: t('landing.modeFlashcards') })}>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">{t('study.frontSide')}</span>
            <Segmented
              aria-label={t('study.frontSide')}
              value={prefs.front}
              onValueChange={(front) => {
                setPrefs((p) => ({ ...p, front }));
                setFlipped(false);
              }}
              options={[
                { value: 'term', label: t('study.term') },
                { value: 'definition', label: t('study.definition') },
              ]}
            />
          </div>
          <ToggleRow
            htmlFor="fc-track"
            label={t('flashcards.track')}
            description={t('flashcards.trackHint')}
            control={<Switch id="fc-track" checked={prefs.track} onCheckedChange={(checked) => { setPrefs((p) => ({ ...p, track: checked })); restart(null); }} />}
          />
          <ToggleRow
            htmlFor="fc-shuffle"
            label={t('study.shuffle')}
            control={<Switch id="fc-shuffle" checked={prefs.shuffle} onCheckedChange={(checked) => { setPrefs((p) => ({ ...p, shuffle: checked })); restart(subset); }} />}
          />
          <ToggleRow
            htmlFor="fc-starred"
            label={t('study.starredOnly')}
            description={starredIds.size === 0 ? t('study.starredOnlyNone') : undefined}
            control={
              <Switch
                id="fc-starred"
                checked={starredOnly}
                disabled={starredIds.size === 0}
                onCheckedChange={(checked) => { setPrefs((p) => ({ ...p, starredOnly: checked })); restart(null); }}
              />
            }
          />
          <ToggleRow
            htmlFor="fc-autoplay"
            label={t('flashcards.autoplay')}
            description={t('flashcards.autoplayHint')}
            control={<Switch id="fc-autoplay" checked={autoplay} onCheckedChange={setAutoplay} />}
          />
          <Button variant="secondary" onClick={() => { restart(null); setOptionsOpen(false); }}>
            {t('study.restart')}
          </Button>
          <dl className="hidden grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-border pt-4 text-sm md:grid" aria-label={t('study.shortcuts')}>
            {[
              ['Space', t('flashcards.keysFlip')],
              ['→', t('flashcards.keysKnow')],
              ['←', t('flashcards.keysLearning')],
              ['Z', t('flashcards.keysUndo')],
              ['S', t('flashcards.keysStar')],
              ['P', t('flashcards.keysPlay')],
            ].map(([key, label]) => (
              <div key={key} className="contents">
                <dt>
                  <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-input bg-muted px-1.5 font-sans text-xs font-semibold">{key}</kbd>
                </dt>
                <dd className="text-muted-foreground">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (!card) return null;

  if (finished) {
    const sorted = Object.keys(results).length > 0;
    return (
      <StudyShell set={set} mode="flashcards" onOpenOptions={() => setOptionsOpen(true)}>
        <SessionSummary
          setId={set.id}
          title={t('flashcards.doneTitle')}
          body={
            sorted
              ? learningIds.length === 0
                ? t('flashcards.allKnown')
                : t('flashcards.doneSorted', { know: knowCount, total: deck.length })
              : t('flashcards.donePlain', { count: deck.length })
          }
          stats={
            sorted
              ? [
                  { label: t('flashcards.know'), value: knowCount },
                  { label: t('flashcards.stillLearning'), value: learningIds.length },
                  { label: t('study.cards'), value: deck.length },
                ]
              : undefined
          }
          primary={
            <>
              {learningIds.length > 0 ? (
                <Button size="lg" onClick={() => restart(learningIds)}>
                  {t('flashcards.studyLearning', { count: learningIds.length })}
                </Button>
              ) : null}
              <Button size="lg" variant={learningIds.length > 0 ? 'secondary' : 'primary'} onClick={() => restart(null)}>
                {t('study.restart')}
              </Button>
            </>
          }
          steps={[
            { to: `/sets/${set.id}/learn`, label: t('flashcards.tryLearn'), icon: <Brain aria-hidden="true" /> },
            ...(BUILT.test ? [{ to: `/sets/${set.id}/test`, label: t('flashcards.tryTest'), icon: <ClipboardCheck aria-hidden="true" /> }] : []),
          ]}
        />
        {options}
      </StudyShell>
    );
  }

  const starred = Boolean(set.progress[card.id]?.starred);
  const visibleText = visibleSide === 'term' ? card.termPlain : card.definitionPlain;
  const sideLabel = (side: Side) => (side === 'term' ? t('study.term') : t('study.definition'));
  const swipeHint = Math.abs(drag) > SWIPE_DISTANCE * 0.6 ? (drag > 0 ? 'know' : 'learning') : null;

  return (
    <StudyShell
      set={set}
      mode="flashcards"
      status={<span aria-label={t('flashcards.counter', { current: index + 1, total: deck.length })}>{`${index + 1} / ${deck.length}`}</span>}
      progress={{ value: (index / deck.length) * 100, label: t('flashcards.counter', { current: index + 1, total: deck.length }) }}
      onOpenOptions={() => setOptionsOpen(true)}
    >
      <h1 className="sr-only">{t('landing.modeFlashcards')}</h1>
      {/* Tells screen readers what the card shows whenever it changes. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {t('flashcards.showing', { side: sideLabel(visibleSide), text: visibleText })}
      </p>

      {track ? (
        <div className="mb-3 flex items-center justify-between gap-2 text-sm font-semibold">
          <span aria-hidden="true" className="rounded-full bg-warning-soft px-3 py-1 text-warning-soft-foreground">
            {t('flashcards.learningCount', { count: learningIds.length })}
          </span>
          <Tooltip label={t('flashcards.undo')}>
            <Button variant="ghost" size="icon-sm" aria-label={t('flashcards.undo')} disabled={index === 0} onClick={() => go(-1)}>
              <Undo2 aria-hidden="true" />
            </Button>
          </Tooltip>
          <span aria-hidden="true" className="rounded-full bg-success-soft px-3 py-1 text-success-soft-foreground">
            {t('flashcards.knowCount', { count: knowCount })}
          </span>
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flip-scene relative min-h-[46dvh] flex-1 sm:min-h-[26rem]">
          <div
            ref={cardRef}
            role="button"
            tabIndex={0}
            aria-label={t('flashcards.flip')}
            aria-describedby="flip-hint"
            onClick={() => {
              if (!swiped.current) flip();
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            style={drag ? { transform: `translateX(${drag}px) rotate(${drag / 40}deg)`, transition: 'none' } : undefined}
            className="absolute inset-0 cursor-pointer touch-pan-y rounded-3xl transition-transform duration-200 select-none motion-reduce:!rotate-0"
          >
            <div key={card.id} data-flipped={flipped} className="flip-card size-full motion-safe:animate-fade-in">
              <Face card={card} side={prefs.front} set={set} label={sideLabel(prefs.front)} hidden={flipped} />
              <Face card={card} side={backSide} set={set} label={sideLabel(backSide)} hidden={!flipped} back />
            </div>
            {swipeHint ? (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute top-5 rounded-full px-4 py-1.5 text-sm font-bold',
                  swipeHint === 'know' ? 'start-5 bg-success text-success-foreground' : 'end-5 bg-warning text-warning-foreground',
                )}
              >
                {swipeHint === 'know' ? (track ? t('flashcards.swipeKnow') : t('common.next')) : track ? t('flashcards.swipeLearning') : t('common.previous')}
              </span>
            ) : null}
          </div>
          <div className="absolute end-3 top-3 flex gap-0.5">
            {canSpeak() || card.termAudio || card.definitionAudio ? (
              <Tooltip label={t('study.speak')}>
                <Button variant="ghost" size="icon" aria-label={t('study.speak')} onClick={readAloud}>
                  <Volume2 aria-hidden="true" />
                </Button>
              </Tooltip>
            ) : null}
            {recorder.enabled ? (
              <Tooltip label={starred ? t('study.unstar') : t('study.star')}>
                <Button variant="ghost" size="icon" aria-label={starred ? t('study.unstar') : t('study.star')} aria-pressed={starred} onClick={toggleStar}>
                  <Star className={cn(starred && 'fill-gold text-gold')} aria-hidden="true" />
                </Button>
              </Tooltip>
            ) : null}
          </div>
        </div>
        <p id="flip-hint" className="mt-3 text-center text-sm text-muted-foreground">
          {coarsePointer ? t('flashcards.flipHintTouch') : t('flashcards.flipHint')}
        </p>
      </div>

      {track ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button size="lg" variant="secondary" onClick={stillLearning} className="min-w-0 border-warning/60 px-3 text-warning-soft-foreground hover:bg-warning-soft">
            <X aria-hidden="true" />
            <span className="truncate">{t('flashcards.stillLearning')}</span>
          </Button>
          <Button size="lg" variant="secondary" onClick={know} className="min-w-0 border-success/60 px-3 text-success-soft-foreground hover:bg-success-soft">
            <Check aria-hidden="true" />
            <span className="truncate">{t('flashcards.know')}</span>
          </Button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <Button size="lg" variant="secondary" onClick={() => go(-1)} disabled={index === 0} aria-label={t('flashcards.previous')} className="min-w-0 px-3">
            <ArrowLeft className="rtl:rotate-180" aria-hidden="true" />
            <span className="hidden sm:inline">{t('common.previous')}</span>
          </Button>
          <Tooltip label={autoplay ? t('flashcards.pause') : t('flashcards.play')}>
            <Button variant="ghost" size="icon" aria-label={autoplay ? t('flashcards.pause') : t('flashcards.play')} aria-pressed={autoplay} onClick={() => setAutoplay((a) => !a)}>
              {autoplay ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            </Button>
          </Tooltip>
          <Button size="lg" variant="secondary" onClick={() => go(1)} aria-label={t('flashcards.next')} className="min-w-0 px-3">
            <span className="hidden sm:inline">{t('common.next')}</span>
            <ArrowRight className="rtl:rotate-180" aria-hidden="true" />
          </Button>
        </div>
      )}
      <div className="mt-3 flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={prefs.shuffle}
          onClick={() => {
            setPrefs((p) => ({ ...p, shuffle: !p.shuffle }));
            restart(subset);
          }}
          className={cn(prefs.shuffle && 'bg-primary-soft text-primary-soft-foreground')}
        >
          <Shuffle aria-hidden="true" />
          {t('study.shuffle')}
        </Button>
      </div>
      {options}
    </StudyShell>
  );
}

export default function FlashcardsPage() {
  return (
    <StudyGate mode="flashcards" minCards={1}>
      {(set) => <Flashcards key={set.id} set={set} />}
    </StudyGate>
  );
}
