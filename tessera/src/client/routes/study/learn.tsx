import { Check, ClipboardCheck, RotateCcw, Volume2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { CardDto, SetDetail } from '@shared/api';
import type { Stage } from '@shared/constants';
import { gradeWritten, type WrittenResult } from '@shared/grading';
import {
  answerQuestion,
  createLearn,
  DEFAULT_LEARN_OPTIONS,
  isFinished,
  nextQuestion,
  summarize,
  type LearnCard,
  type LearnOptions,
  type LearnStart,
  type LearnState,
  type McOption,
  type Question,
  type Side,
} from '@shared/learn';
import { randomSeed } from '@shared/random';
import { Mosaic } from '@/components/mosaic';
import { RichText } from '@/components/rich-text';
import { StageLegend } from '@/components/stage-legend';
import { SessionSummary, StudyGate, StudyShell } from '@/components/study/shell';
import { Button } from '@/components/ui/button';
import { Segmented, Switch, ToggleRow } from '@/components/ui/controls';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { BUILT } from '@/lib/built';
import { useI18n } from '@/lib/i18n';
import { isActive, useUser } from '@/lib/me';
import { canSpeak, speak } from '@/lib/speech';
import { useRecorder, useStoredState, useStudySession } from '@/lib/study';
import { cn, isTypingTarget } from '@/lib/utils';

interface Prefs {
  types: LearnOptions['types'];
  answerWith: LearnOptions['answerWith'];
  lenient: boolean;
  starredOnly: boolean;
}

const DEFAULT_PREFS: Prefs = { types: DEFAULT_LEARN_OPTIONS.types, answerWith: 'auto', lenient: true, starredOnly: false };
/** Questions between progress checkpoints. */
const CHECKPOINT_EVERY = 10;
const STAGE_RANK: Record<Stage, number> = { new: 0, learning: 1, familiar: 2, mastered: 3 };

interface Feedback {
  correct: boolean;
  result: WrittenResult;
  /** What the learner typed, for typed answers. */
  given?: string;
  /** Index chosen in multiple choice, or the true/false choice. */
  choice?: number | boolean;
  /** True when "I don't know" was pressed. */
  skipped?: boolean;
  overridden?: boolean;
}

interface Turn {
  engine: LearnState;
  question: Question | null;
}

function startTurn(cards: LearnCard[], start: LearnStart, prefs: Prefs): Turn {
  const engine = createLearn(cards, start, { ...DEFAULT_LEARN_OPTIONS, types: prefs.types, answerWith: prefs.answerWith }, randomSeed());
  const step = nextQuestion(engine, cards);
  return step ? { engine: step.state, question: step.question } : { engine, question: null };
}

function SideContent({ card, side, set, className }: { card: CardDto; side: Side; set: SetDetail; className?: string }) {
  const { t } = useI18n();
  const image = side === 'term' ? card.termImage : card.definitionImage;
  return (
    <>
      {image ? <img src={image.url} alt={t('study.imageAlt')} className="mb-3 max-h-44 rounded-xl" /> : null}
      <RichText value={side === 'term' ? card.term : card.definition} lang={side === 'term' ? set.termLang : set.definitionLang} className={className} />
    </>
  );
}

function Learn({ set }: { set: SetDetail }) {
  const { t, formatDuration } = useI18n();
  const signedIn = isActive(useUser());
  const [prefs, setPrefs] = useStoredState<Prefs>('tessera.learn', DEFAULT_PREFS);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const recorder = useRecorder(set.id, 'learn');
  const session = useStudySession(set.id, 'learn');

  const byId = useMemo(() => new Map(set.cards.map((c) => [c.id, c])), [set.cards]);
  const starredIds = useMemo(() => new Set(set.cards.filter((c) => set.progress[c.id]?.starred).map((c) => c.id)), [set.cards, set.progress]);
  const starredOnly = prefs.starredOnly && starredIds.size > 0;

  // The deck and starting stages are fixed when a session starts; the engine
  // then tracks changes itself, in step with what is being saved.
  const build = useCallback(
    (current: Prefs): { cards: LearnCard[]; turn: Turn } => {
      const cards: LearnCard[] = set.cards
        .filter((c) => c.termPlain && c.definitionPlain)
        .filter((c) => !(current.starredOnly && starredIds.size > 0) || starredIds.has(c.id))
        .map((c) => ({ id: c.id, term: c.termPlain, definition: c.definitionPlain }));
      const start: LearnStart = Object.fromEntries(cards.map((c) => [c.id, set.progress[c.id] ? { stage: set.progress[c.id]!.stage, streak: set.progress[c.id]!.streak } : undefined]));
      return { cards, turn: startTurn(cards, start, current) };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [set.id],
  );

  const [{ cards, turn }, setGame] = useState(() => build(prefs));
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [phase, setPhase] = useState<'question' | 'checkpoint' | 'done'>(() => (turn.question ? 'question' : 'done'));
  const [sinceCheckpoint, setSinceCheckpoint] = useState(0);
  const [typed, setTyped] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const continueRef = useRef<HTMLButtonElement>(null);
  const promptRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const restart = useCallback(
    (next: Prefs = prefs) => {
      session.finish();
      session.restart();
      const game = build(next);
      setGame(game);
      setFeedback(null);
      setTyped('');
      setSinceCheckpoint(0);
      setPhase(game.turn.question ? 'question' : 'done');
    },
    [build, prefs, session],
  );

  const changePrefs = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    restart(next);
  };

  const { engine, question } = turn;
  const summary = useMemo(() => summarize(engine), [engine]);
  const targetRank = STAGE_RANK[engine.target];
  const progressValue = useMemo(() => {
    const items = Object.values(engine.items);
    if (items.length === 0) return 0;
    const points = items.reduce((sum, item) => sum + (item.done ? targetRank : Math.min(STAGE_RANK[item.stage], targetRank - 0.5)), 0);
    return (points / (items.length * targetRank)) * 100;
  }, [engine, targetRank]);

  const answer = useCallback((next: Feedback) => setFeedback(next), []);

  const proceed = useCallback(() => {
    if (!question || !feedback) return;
    recorder.answer(question.cardId, question.kind, feedback.correct);
    session.count(feedback.correct);
    const after = answerQuestion(engine, question, feedback.correct);
    setFeedback(null);
    setTyped('');
    if (isFinished(after)) {
      setGame({ cards, turn: { engine: after, question: null } });
      setElapsed(session.elapsed());
      session.finish();
      setPhase('done');
      return;
    }
    const step = nextQuestion(after, cards)!;
    setGame({ cards, turn: { engine: step.state, question: step.question } });
    if (sinceCheckpoint + 1 >= CHECKPOINT_EVERY) {
      setSinceCheckpoint(0);
      setPhase('checkpoint');
    } else {
      setSinceCheckpoint(sinceCheckpoint + 1);
    }
  }, [question, feedback, recorder, session, engine, cards, sinceCheckpoint]);

  // Focus follows the task: the answer box, the prompt, or the Continue button.
  useEffect(() => {
    if (phase !== 'question' || optionsOpen) return;
    if (feedback) continueRef.current?.focus();
    else if (question?.kind === 'written') inputRef.current?.focus();
    else promptRef.current?.focus();
  }, [feedback, question, phase, optionsOpen]);

  useEffect(() => {
    if (phase !== 'question' || optionsOpen || !question || feedback) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target)) return;
      if (question.kind === 'mc') {
        const index = Number(event.key) - 1;
        if (Number.isInteger(index) && index >= 0 && index < question.options.length) {
          event.preventDefault();
          answer({ correct: index === question.correctIndex, result: index === question.correctIndex ? 'correct' : 'incorrect', choice: index });
        }
      } else if (question.kind === 'tf') {
        const key = event.key.toLowerCase();
        const choice = key === 't' || key === '1' ? true : key === 'f' || key === '2' ? false : null;
        if (choice !== null) {
          event.preventDefault();
          answer({ correct: choice === question.isTrue, result: choice === question.isTrue ? 'correct' : 'incorrect', choice });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, optionsOpen, question, feedback, answer]);

  const sideName = (side: Side) => (side === 'term' ? t('study.term') : t('study.definition')).toLowerCase();

  const options = (
    <Dialog open={optionsOpen} onOpenChange={setOptionsOpen}>
      <DialogContent title={t('study.optionsTitle', { mode: t('landing.modeLearn') })}>
        <div className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-semibold">{t('learn.typesHeading')}</legend>
            {(
              [
                ['mc', t('learn.typeMc')],
                ['tf', t('learn.typeTf')],
                ['written', t('learn.typeWritten')],
              ] as const
            ).map(([kind, label]) => {
              const enabledCount = Object.values(prefs.types).filter(Boolean).length;
              return (
                <ToggleRow
                  key={kind}
                  htmlFor={`learn-${kind}`}
                  label={label}
                  control={
                    <Switch
                      id={`learn-${kind}`}
                      checked={prefs.types[kind]}
                      // The last remaining type cannot be switched off.
                      disabled={prefs.types[kind] && enabledCount === 1}
                      onCheckedChange={(checked) => changePrefs({ types: { ...prefs.types, [kind]: checked } })}
                    />
                  }
                />
              );
            })}
            <p className="text-sm text-muted-foreground">{t('learn.typesNeedOne')}</p>
          </fieldset>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">{t('study.answerWith')}</span>
            <Segmented
              aria-label={t('study.answerWith')}
              value={prefs.answerWith}
              onValueChange={(answerWith) => changePrefs({ answerWith })}
              options={[
                { value: 'auto', label: t('study.answerAuto') },
                { value: 'term', label: t('study.term') },
                { value: 'definition', label: t('study.definition') },
              ]}
            />
            {prefs.answerWith === 'auto' ? <p className="text-sm text-muted-foreground">{t('study.answerAutoHint')}</p> : null}
          </div>
          <ToggleRow
            htmlFor="learn-lenient"
            label={t('learn.lenient')}
            description={t('learn.lenientHint')}
            control={<Switch id="learn-lenient" checked={prefs.lenient} onCheckedChange={(lenient) => setPrefs((p) => ({ ...p, lenient }))} />}
          />
          <ToggleRow
            htmlFor="learn-starred"
            label={t('study.starredOnly')}
            description={starredIds.size === 0 ? t('study.starredOnlyNone') : undefined}
            control={<Switch id="learn-starred" checked={starredOnly} disabled={starredIds.size === 0} onCheckedChange={(checked) => changePrefs({ starredOnly: checked })} />}
          />
          <Button
            variant="secondary"
            onClick={() => {
              restart();
              setOptionsOpen(false);
            }}
          >
            {t('study.restart')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  const shell = (children: ReactNode) => (
    <StudyShell
      set={set}
      mode="learn"
      status={<span>{t('learn.mastered', { done: summary.done, total: summary.total })}</span>}
      progress={{ value: progressValue, label: t('learn.mastered', { done: summary.done, total: summary.total }) }}
      onOpenOptions={() => setOptionsOpen(true)}
    >
      {children}
      {options}
    </StudyShell>
  );

  if (cards.length === 0) {
    return shell(<EmptyState level={1} className="my-auto" icon={<RotateCcw />} title={t('study.notEnoughTitle')} description={t('study.notEnoughBody', { count: 2 })} />);
  }

  const stageCounts = summary.byStage;
  const mosaicStages = Object.values(engine.items)
    .map((item) => item.stage)
    .sort((a, b) => STAGE_RANK[b] - STAGE_RANK[a]);

  if (phase === 'done') {
    return shell(
      <SessionSummary
        setId={set.id}
        title={t('learn.doneTitle')}
        body={engine.target === 'mastered' ? t('learn.doneBodyMastered') : t('learn.doneBodyFamiliar')}
        stats={[
          { label: t('study.accuracy'), value: summary.accuracy === null ? '–' : `${summary.accuracy}%` },
          { label: t('study.cards'), value: summary.total },
          { label: t('study.time'), value: formatDuration(elapsed) },
        ]}
        primary={
          <Button size="lg" onClick={() => restart()}>
            {t('study.tryAgain')}
          </Button>
        }
        steps={[
          ...(BUILT.test ? [{ to: `/sets/${set.id}/test`, label: t('flashcards.tryTest'), icon: <ClipboardCheck aria-hidden="true" /> }] : []),
          ...(BUILT.review ? [{ to: `/sets/${set.id}/review`, label: t('learn.goToReview'), icon: <RotateCcw aria-hidden="true" /> }] : []),
        ]}
      >
        <Mosaic stages={mosaicStages} className="mt-5" />
        {signedIn && BUILT.review ? <p className="mt-4 text-sm text-muted-foreground">{t('learn.doneReview')}</p> : null}
      </SessionSummary>,
    );
  }

  if (phase === 'checkpoint') {
    const struggling = summary.struggling.slice(0, 5).map((id) => byId.get(id)).filter((c): c is CardDto => Boolean(c));
    return shell(
      <section className="mx-auto my-auto w-full max-w-xl motion-safe:animate-rise" aria-labelledby="checkpoint-title">
        <div className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
          <h1 id="checkpoint-title" className="text-3xl font-extrabold">
            {t('learn.checkpointTitle')}
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">{t('learn.checkpointBody', { count: summary.remaining })}</p>
          <Mosaic stages={mosaicStages} className="mt-5" />
          <StageLegend counts={stageCounts} className="mt-4" />
          {struggling.length > 0 ? (
            <div className="mt-5">
              <h2 className="font-sans text-sm font-semibold text-muted-foreground">{t('learn.checkpointStruggling')}</h2>
              <ul className="mt-2 flex flex-col gap-1.5">
                {struggling.map((card) => (
                  <li key={card.id} className="rounded-xl bg-muted px-3 py-2">
                    <RichText value={card.term} lang={set.termLang} className="font-semibold" />
                    <RichText value={card.definition} lang={set.definitionLang} className="text-sm text-muted-foreground" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <Button size="lg" className="mt-6 w-full" autoFocus onClick={() => setPhase('question')}>
            {t('study.keepGoing')}
          </Button>
        </div>
      </section>,
    );
  }

  if (!question) return shell(null);
  const card = byId.get(question.cardId)!;
  const answered = feedback !== null;
  const answerText = question.answerSide === 'term' ? card.termPlain : card.definitionPlain;

  const optionContent = (option: McOption) => {
    const source = option.cardId ? byId.get(option.cardId) : undefined;
    return source ? <SideContent card={source} side={question.answerSide} set={set} /> : <span dir="auto">{option.text}</span>;
  };

  const submitWritten = (event: FormEvent) => {
    event.preventDefault();
    if (answered || !typed.trim()) return;
    const grade = gradeWritten(typed, answerText, { lenient: prefs.lenient });
    answer({ correct: grade.correct, result: grade.result, given: typed.trim() });
  };

  let feedbackText = '';
  if (feedback) {
    if (feedback.overridden) feedbackText = t('learn.overridden');
    else if (feedback.correct) feedbackText = feedback.result === 'almost' ? t('learn.almost') : t('learn.correct');
    else feedbackText = feedback.result === 'almost' ? t('learn.almost') : t('learn.incorrectWillReturn');
  }
  // Show the right answer whenever the learner did not produce exactly it.
  const revealAnswer = feedback && (!feedback.correct || feedback.result === 'almost' || feedback.overridden);
  const tfReveal = feedback && question.kind === 'tf' && !question.isTrue;

  return shell(
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
      {engine.refresher && engine.answered === 0 ? (
        <Alert variant="info" className="mb-4">
          {t('learn.refresher')}
        </Alert>
      ) : null}

      <section className="rounded-3xl border border-border bg-card p-5 shadow-card sm:p-7" aria-labelledby="learn-prompt">
        <div className="flex items-start gap-2">
          <p className="flex-1 text-sm font-semibold text-muted-foreground">{question.promptSide === 'term' ? t('study.term') : t('study.definition')}</p>
          {canSpeak() ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('study.speak')}
              onClick={() => speak(question.promptSide === 'term' ? card.termPlain : card.definitionPlain, question.promptSide === 'term' ? set.termLang : set.definitionLang)}
            >
              <Volume2 aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <h1 id="learn-prompt" ref={promptRef} tabIndex={-1} className="mt-1 font-sans text-2xl leading-snug font-bold outline-none sm:text-3xl">
          <SideContent card={card} side={question.promptSide} set={set} />
        </h1>

        {question.kind === 'tf' ? (
          <div className="mt-5 rounded-2xl bg-muted p-4">
            <p className="text-sm font-semibold text-muted-foreground">{question.answerSide === 'term' ? t('study.term') : t('study.definition')}</p>
            <div id="learn-statement" className="mt-1 text-xl font-semibold">
              {optionContent(question.shown)}
            </div>
          </div>
        ) : null}
      </section>

      <div className="mt-5">
        {question.kind === 'mc' ? (
          <fieldset disabled={answered}>
            <legend className="mb-3 text-sm font-semibold text-muted-foreground">{t('learn.chooseAnswer', { side: sideName(question.answerSide) })}</legend>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {question.options.map((option, index) => {
                const isCorrect = index === question.correctIndex;
                const isChosen = feedback?.choice === index;
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => answer({ correct: isCorrect, result: isCorrect ? 'correct' : 'incorrect', choice: index })}
                    className={cn(
                      'flex min-h-16 items-center gap-3 rounded-2xl border-2 bg-card p-3.5 text-start text-[1.05rem] transition-colors',
                      !answered && 'border-border hover:border-primary hover:bg-primary-soft',
                      answered && isCorrect && 'border-success bg-success-soft text-success-soft-foreground',
                      answered && isChosen && !isCorrect && 'border-destructive bg-destructive-soft text-destructive-soft-foreground',
                      answered && !isCorrect && !isChosen && 'border-border opacity-60',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold',
                        answered && isCorrect ? 'bg-success text-success-foreground' : answered && isChosen ? 'bg-destructive text-destructive-foreground' : 'bg-secondary text-muted-foreground',
                      )}
                    >
                      {answered && isCorrect ? <Check className="size-4" /> : answered && isChosen ? <X className="size-4" /> : index + 1}
                    </span>
                    <span className="min-w-0 flex-1">{optionContent(option)}</span>
                    {answered && isCorrect ? <span className="sr-only">({t('study.correctAnswer')})</span> : null}
                    {answered && isChosen && !isCorrect ? <span className="sr-only">({t('study.yourAnswer')})</span> : null}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        {question.kind === 'tf' ? (
          <fieldset disabled={answered}>
            <legend className="mb-3 text-sm font-semibold text-muted-foreground">{t('learn.trueFalsePrompt', { side: sideName(question.answerSide) })}</legend>
            <div className="grid grid-cols-2 gap-2.5">
              {[true, false].map((value) => {
                const isCorrect = value === question.isTrue;
                const isChosen = feedback?.choice === value;
                return (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => answer({ correct: isCorrect, result: isCorrect ? 'correct' : 'incorrect', choice: value })}
                    className={cn(
                      'flex h-16 items-center justify-center gap-2 rounded-2xl border-2 bg-card text-lg font-bold transition-colors',
                      !answered && 'border-border hover:border-primary hover:bg-primary-soft',
                      answered && isCorrect && 'border-success bg-success-soft text-success-soft-foreground',
                      answered && isChosen && !isCorrect && 'border-destructive bg-destructive-soft text-destructive-soft-foreground',
                      answered && !isCorrect && !isChosen && 'border-border opacity-60',
                    )}
                  >
                    {answered && isCorrect ? <Check className="size-5" aria-hidden="true" /> : null}
                    {answered && isChosen && !isCorrect ? <X className="size-5" aria-hidden="true" /> : null}
                    {value ? t('learn.true') : t('learn.false')}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        {question.kind === 'written' ? (
          <form onSubmit={submitWritten} noValidate>
            <label htmlFor="learn-answer" className="mb-2 block text-sm font-semibold text-muted-foreground">
              {t('learn.typeAnswer', { side: sideName(question.answerSide) })}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="learn-answer"
                ref={inputRef}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                readOnly={answered}
                placeholder={t('learn.answerPlaceholder')}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
                dir="auto"
                lang={question.answerSide === 'term' ? set.termLang : set.definitionLang}
                aria-invalid={answered && !feedback?.correct ? true : undefined}
                className={cn('h-13 flex-1 text-lg', answered && feedback?.correct && 'border-success')}
              />
              {!answered ? (
                <Button type="submit" size="lg" disabled={!typed.trim()}>
                  {t('learn.submit')}
                </Button>
              ) : null}
            </div>
            {!answered ? (
              <Button variant="link" className="mt-2" onClick={() => answer({ correct: false, result: 'incorrect', skipped: true })}>
                {t('learn.dontKnow')}
              </Button>
            ) : null}
          </form>
        ) : null}
      </div>

      {/* Result of the answer, announced to screen readers as soon as it appears. */}
      <div aria-live="assertive" aria-atomic="true" className="mt-4">
        {feedback ? (
          <div
            className={cn(
              'rounded-2xl p-4 motion-safe:animate-rise',
              feedback.correct ? 'bg-success-soft text-success-soft-foreground' : 'bg-destructive-soft text-destructive-soft-foreground',
            )}
          >
            <p className="flex items-center gap-2 text-lg font-bold">
              {feedback.correct ? <Check className="size-5" aria-hidden="true" /> : <X className="size-5" aria-hidden="true" />}
              {feedbackText}
            </p>
            {revealAnswer && question.kind !== 'tf' ? (
              <div className="mt-2">
                <p className="text-sm font-semibold opacity-80">{t('learn.itWas')}</p>
                <div className="text-lg font-semibold text-foreground">
                  <SideContent card={card} side={question.answerSide} set={set} />
                </div>
                {feedback.given ? (
                  <p className="mt-2 text-sm">
                    <span className="font-semibold opacity-80">{t('learn.youAnswered')}:</span> <span dir="auto">{feedback.given}</span>
                  </p>
                ) : null}
              </div>
            ) : null}
            {tfReveal ? (
              <div className="mt-2">
                <p className="text-sm font-semibold opacity-80">{t('learn.actuallyFalse', { side: sideName(question.answerSide) })}</p>
                <div className="text-lg font-semibold text-foreground">
                  <SideContent card={card} side={question.answerSide} set={set} />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {feedback ? (
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {question.kind === 'written' && !feedback.correct && !feedback.skipped ? (
            <Button variant="secondary" size="lg" onClick={() => setFeedback({ ...feedback, correct: true, overridden: true })}>
              {t('learn.override')}
            </Button>
          ) : null}
          <Button ref={continueRef} size="lg" onClick={proceed}>
            {t('study.continue')}
          </Button>
        </div>
      ) : null}
    </div>,
  );
}

export default function LearnPage() {
  return (
    <StudyGate mode="learn" minCards={2}>
      {(set) => <Learn key={set.id} set={set} />}
    </StudyGate>
  );
}
