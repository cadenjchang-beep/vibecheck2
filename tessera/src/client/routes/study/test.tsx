import { Brain, Check, Minus, Plus, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import type { CardDto, SetDetail } from '@shared/api';
import type { LearnCard, McOption } from '@shared/learn';
import { randomSeed } from '@shared/random';
import { cardCount, generateTest, gradeTest, TEST_KINDS, type TestConfig, type TestKind, type TestQuestion, type TestResponses, type TestResult } from '@shared/test';
import { ExplainButton } from '@/components/ai/explain';
import { useDistractors } from '@/lib/ai';
import { SideContent, type Side } from '@/components/study/side-content';
import { SessionSummary, StudyGate, StudyShell } from '@/components/study/shell';
import { Button } from '@/components/ui/button';
import { Segmented, Switch, ToggleRow } from '@/components/ui/controls';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import { useRecorder, useStoredState, useStudySession } from '@/lib/study';
import { clamp, cn } from '@/lib/utils';

interface Prefs {
  count: number;
  types: TestConfig['types'];
  answerWith: TestConfig['answerWith'];
  lenient: boolean;
  starredOnly: boolean;
}

const DEFAULT_PREFS: Prefs = { count: 20, types: { tf: true, mc: true, matching: true, written: true }, answerWith: 'auto', lenient: true, starredOnly: false };
const SECTION: Record<TestKind, 'test.sectionTf' | 'test.sectionMc' | 'test.sectionMatching' | 'test.sectionWritten'> = {
  tf: 'test.sectionTf',
  mc: 'test.sectionMc',
  matching: 'test.sectionMatching',
  written: 'test.sectionWritten',
};
const TYPE_LABEL: Record<TestKind, 'test.typeTf' | 'test.typeMc' | 'test.typeMatching' | 'test.typeWritten'> = {
  tf: 'test.typeTf',
  mc: 'test.typeMc',
  matching: 'test.typeMatching',
  written: 'test.typeWritten',
};

function Test({ set }: { set: SetDetail }) {
  const { t, formatDuration } = useI18n();
  const [prefs, setPrefs] = useStoredState<Prefs>('tessera.test', DEFAULT_PREFS);
  const recorder = useRecorder(set.id, 'test');
  const session = useStudySession(set.id, 'test');
  const byId = useMemo(() => new Map(set.cards.map((c) => [c.id, c])), [set.cards]);
  const starredIds = useMemo(() => new Set(set.cards.filter((c) => set.progress[c.id]?.starred).map((c) => c.id)), [set.cards, set.progress]);
  const starredOnly = prefs.starredOnly && starredIds.size > 0;
  const pool: LearnCard[] = useMemo(
    () =>
      set.cards
        .filter((c) => c.termPlain && c.definitionPlain && (!starredOnly || starredIds.has(c.id)))
        .map((c) => ({ id: c.id, term: c.termPlain, definition: c.definitionPlain })),
    [set.cards, starredOnly, starredIds],
  );

  const [questions, setQuestions] = useState<TestQuestion[] | null>(null);
  const [responses, setResponses] = useState<TestResponses>({});
  const [result, setResult] = useState<TestResult | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [mistakesOnly, setMistakesOnly] = useState(false);
  const distractors = useDistractors(set.id);
  const [elapsed, setElapsed] = useState(0);

  const count = clamp(prefs.count, 1, Math.max(1, pool.length));
  const langs = { termLang: set.termLang, definitionLang: set.definitionLang };
  const sideName = (side: Side) => (side === 'term' ? t('study.term') : t('study.definition')).toLowerCase();
  const enabledTypes = TEST_KINDS.filter((k) => prefs.types[k]).length;

  const start = () => {
    session.restart();
    setQuestions(generateTest(pool, { count, types: prefs.types, answerWith: prefs.answerWith }, randomSeed(), distractors));
    setResponses({});
    setResult(null);
    setMistakesOnly(false);
    window.scrollTo(0, 0);
  };

  const respond = (id: string, value: TestResponses[string]) => setResponses((r) => ({ ...r, [id]: value }));

  const submit = () => {
    if (!questions) return;
    const graded = gradeTest(questions, responses, { lenient: prefs.lenient });
    for (const q of graded.questions) {
      for (const card of q.cards) {
        recorder.answer(card.cardId, card.kind, card.correct);
        session.count(card.correct);
      }
    }
    setElapsed(session.elapsed());
    session.finish({ score: graded.score, details: { points: graded.points, maxPoints: graded.maxPoints, questions: questions.length } });
    setResult(graded);
    setConfirm(false);
    window.scrollTo(0, 0);
  };

  const optionContent = (option: McOption | { cardId: string; text: string }, side: Side) => {
    const source = option.cardId ? byId.get(option.cardId) : undefined;
    return source ? <SideContent card={source} side={side} langs={langs} imageClassName="mb-2 max-h-24 rounded-lg" /> : <span dir="auto">{option.text}</span>;
  };

  // ── Setup ──────────────────────────────────────────────────────────────────
  if (!questions) {
    return (
      <StudyShell set={set} mode="test">
        <section className="mx-auto my-auto w-full max-w-xl rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8" aria-labelledby="test-setup">
          <h1 id="test-setup" className="text-3xl font-extrabold">
            {t('test.setupTitle')}
          </h1>
          <p className="mt-2 text-muted-foreground">{t('test.setupBody')}</p>
          <div className="mt-6 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label htmlFor="test-count" className="text-sm font-semibold">
                {t('test.count')} <span className="font-normal text-muted-foreground">{t('test.countOf', { max: pool.length })}</span>
              </label>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="icon" aria-label="−" onClick={() => setPrefs((p) => ({ ...p, count: clamp(count - 1, 1, pool.length) }))} disabled={count <= 1}>
                  <Minus aria-hidden="true" />
                </Button>
                <Input
                  id="test-count"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={pool.length}
                  value={count}
                  onChange={(e) => setPrefs((p) => ({ ...p, count: clamp(Number(e.target.value) || 1, 1, pool.length) }))}
                  className="w-24 text-center text-lg font-bold"
                />
                <Button variant="secondary" size="icon" aria-label="+" onClick={() => setPrefs((p) => ({ ...p, count: clamp(count + 1, 1, pool.length) }))} disabled={count >= pool.length}>
                  <Plus aria-hidden="true" />
                </Button>
              </div>
            </div>
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-sm font-semibold">{t('test.typesHeading')}</legend>
              {TEST_KINDS.map((kind) => (
                <ToggleRow
                  key={kind}
                  htmlFor={`test-${kind}`}
                  label={t(TYPE_LABEL[kind])}
                  control={
                    <Switch
                      id={`test-${kind}`}
                      checked={prefs.types[kind]}
                      disabled={prefs.types[kind] && enabledTypes === 1}
                      onCheckedChange={(checked) => setPrefs((p) => ({ ...p, types: { ...p.types, [kind]: checked } }))}
                    />
                  }
                />
              ))}
            </fieldset>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">{t('study.answerWith')}</span>
              <Segmented
                aria-label={t('study.answerWith')}
                value={prefs.answerWith}
                onValueChange={(answerWith) => setPrefs((p) => ({ ...p, answerWith }))}
                options={[
                  { value: 'auto', label: t('study.answerAuto') },
                  { value: 'term', label: t('study.term') },
                  { value: 'definition', label: t('study.definition') },
                ]}
              />
            </div>
            <ToggleRow
              htmlFor="test-lenient"
              label={t('learn.lenient')}
              control={<Switch id="test-lenient" checked={prefs.lenient} onCheckedChange={(lenient) => setPrefs((p) => ({ ...p, lenient }))} />}
            />
            <ToggleRow
              htmlFor="test-starred"
              label={t('study.starredOnly')}
              description={starredIds.size === 0 ? t('study.starredOnlyNone') : undefined}
              control={<Switch id="test-starred" checked={starredOnly} disabled={starredIds.size === 0} onCheckedChange={(checked) => setPrefs((p) => ({ ...p, starredOnly: checked }))} />}
            />
            <Button size="lg" onClick={start} disabled={pool.length === 0}>
              {t('test.start')}
            </Button>
          </div>
        </section>
      </StudyShell>
    );
  }

  const total = questions.length;
  const answered = questions.filter((q) => {
    const r = responses[q.id];
    if (q.kind === 'matching') return typeof r === 'object' && r !== null && q.cardIds.every((id) => r[id]);
    return q.kind === 'written' ? typeof r === 'string' && r.trim() !== '' : r !== undefined;
  }).length;
  const resultFor = (id: string) => result?.questions.find((q) => q.questionId === id);

  const promptFor = (card: CardDto, side: Side) => (
    <div data-prompt="" className="font-sans text-xl leading-snug font-bold">
      <SideContent card={card} side={side} langs={langs} imageClassName="mb-2 max-h-36 rounded-xl" />
    </div>
  );

  const choice = (selected: boolean, state: 'idle' | 'right' | 'wrong' | 'dim') =>
    cn(
      'flex min-h-12 w-full items-center gap-3 rounded-xl border-2 bg-card px-3.5 py-2.5 text-start transition-colors',
      state === 'idle' && (selected ? 'border-primary bg-primary-soft' : 'border-border hover:border-primary/60'),
      state === 'right' && 'border-success bg-success-soft text-success-soft-foreground',
      state === 'wrong' && 'border-destructive bg-destructive-soft text-destructive-soft-foreground',
      state === 'dim' && 'border-border opacity-60',
    );

  const renderQuestion = (q: TestQuestion, number: number): ReactNode => {
    const graded = resultFor(q.id);
    const locked = Boolean(result);
    const response = responses[q.id];
    const card = q.kind === 'matching' ? undefined : byId.get(q.cardId)!;
    const mark = graded ? (
      <span
        className={cn(
          'ms-auto inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-bold',
          graded.correct ? 'bg-success-soft text-success-soft-foreground' : 'bg-destructive-soft text-destructive-soft-foreground',
        )}
      >
        {graded.correct ? <Check className="size-4" aria-hidden="true" /> : <X className="size-4" aria-hidden="true" />}
        {graded.correct ? t('test.markCorrect') : graded.answered ? t('test.markIncorrect') : t('test.markUnanswered')}
        {q.kind === 'matching' ? ` ${graded.points}/${graded.maxPoints}` : ''}
      </span>
    ) : null;

    return (
      <li key={q.id} data-kind={q.kind} className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5" aria-labelledby={`${q.id}-label`}>
        <div className="mb-3 flex items-center gap-2">
          <span id={`${q.id}-label`} className="text-sm font-semibold text-muted-foreground">
            {t('test.questionNumber', { number })}
          </span>
          {mark}
        </div>

        {q.kind === 'tf' && card ? (
          <>
            {promptFor(card, q.promptSide)}
            <div data-statement="" className="mt-3 rounded-xl bg-muted p-3 text-lg">
              {optionContent(q.shown, q.answerSide)}
            </div>
            <fieldset disabled={locked} className="mt-3">
              <legend className="mb-2 text-sm font-semibold text-muted-foreground">{t('test.tfPrompt', { side: sideName(q.answerSide) })}</legend>
              <div className="grid grid-cols-2 gap-2" role="radiogroup">
                {[true, false].map((value) => {
                  const selected = response === value;
                  const state = !locked ? 'idle' : value === q.isTrue ? 'right' : selected ? 'wrong' : 'dim';
                  return (
                    <button key={String(value)} type="button" role="radio" aria-checked={selected} onClick={() => respond(q.id, value)} className={cn(choice(selected, state), 'justify-center font-bold')}>
                      {value ? t('learn.true') : t('learn.false')}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            {locked && !q.isTrue ? (
              <p className="mt-3 text-sm">
                <span className="font-semibold text-muted-foreground">{t('study.correctAnswer')}: </span>
                <span dir="auto">{q.answerSide === 'term' ? card.termPlain : card.definitionPlain}</span>
              </p>
            ) : null}
          </>
        ) : null}

        {q.kind === 'mc' && card ? (
          <>
            {promptFor(card, q.promptSide)}
            <fieldset disabled={locked} className="mt-3">
              <legend className="mb-2 text-sm font-semibold text-muted-foreground">{t('test.mcPrompt', { side: sideName(q.answerSide) })}</legend>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
                {q.options.map((option, index) => {
                  const selected = response === index;
                  const state = !locked ? 'idle' : index === q.correctIndex ? 'right' : selected ? 'wrong' : 'dim';
                  return (
                    <button key={index} type="button" role="radio" aria-checked={selected} onClick={() => respond(q.id, index)} className={choice(selected, state)}>
                      <span className="min-w-0 flex-1">{optionContent(option, q.answerSide)}</span>
                      {locked && index === q.correctIndex ? <span className="sr-only">({t('study.correctAnswer')})</span> : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </>
        ) : null}

        {q.kind === 'written' && card ? (
          <>
            {promptFor(card, q.promptSide)}
            <label htmlFor={`${q.id}-input`} className="mt-3 mb-2 block text-sm font-semibold text-muted-foreground">
              {t('test.writtenPrompt', { side: sideName(q.answerSide) })}
            </label>
            <Input
              id={`${q.id}-input`}
              value={typeof response === 'string' ? response : ''}
              onChange={(e) => respond(q.id, e.target.value)}
              readOnly={locked}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              dir="auto"
              lang={q.answerSide === 'term' ? set.termLang : set.definitionLang}
              aria-invalid={graded && !graded.correct ? true : undefined}
              className={cn(graded?.correct && 'border-success')}
            />
            {graded && (!graded.correct || graded.written === 'almost') ? (
              <p className="mt-2 text-sm">
                <span className="font-semibold text-muted-foreground">{t('study.correctAnswer')}: </span>
                <span dir="auto" className="font-semibold">
                  {q.expected}
                </span>
                {graded.correct ? <span className="ms-2 text-muted-foreground">{t('test.almostNote')}</span> : null}
              </p>
            ) : null}
          </>
        ) : null}

        {q.kind === 'matching' ? (
          <fieldset disabled={locked}>
            <legend className="mb-3 font-semibold">{t('test.matchingPrompt', { prompt: sideName(q.promptSide), answer: sideName(q.answerSide) })}</legend>
            <ul className="flex flex-col gap-3">
              {q.cardIds.map((cardId) => {
                const prompt = byId.get(cardId)!;
                const picks = typeof response === 'object' && response !== null ? response : {};
                const cardResult = graded?.cards.find((c) => c.cardId === cardId);
                const promptText = q.promptSide === 'term' ? prompt.termPlain : prompt.definitionPlain;
                return (
                  <li key={cardId} className="grid items-center gap-2 sm:grid-cols-[2fr_3fr]">
                    <div className="font-semibold">
                      <SideContent card={prompt} side={q.promptSide} langs={langs} imageClassName="mb-1 max-h-20 rounded-lg" />
                    </div>
                    <div>
                      <Select
                        aria-label={t('test.matchingFor', { text: promptText })}
                        value={picks[cardId] ?? ''}
                        onChange={(e) => respond(q.id, { ...picks, [cardId]: e.target.value })}
                        aria-invalid={cardResult && !cardResult.correct ? true : undefined}
                        className={cn(cardResult?.correct && 'border-success')}
                      >
                        <option value="">{t('test.matchingChoose')}</option>
                        {q.choices.map((c) => (
                          <option key={c.cardId} value={c.cardId}>
                            {c.text}
                          </option>
                        ))}
                      </Select>
                      {cardResult && !cardResult.correct ? (
                        <p className="mt-1 text-sm">
                          <span className="font-semibold text-muted-foreground">{t('study.correctAnswer')}: </span>
                          <span dir="auto">{q.answerSide === 'term' ? prompt.termPlain : prompt.definitionPlain}</span>
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ) : null}

        {graded && !graded.correct && card ? (
          <ExplainButton
            className="mt-3"
            setId={set.id}
            answerSide={q.answerSide}
            term={card.termPlain}
            definition={card.definitionPlain}
            given={q.kind === 'written' && typeof response === 'string' ? response : q.kind === 'mc' && typeof response === 'number' ? (q.options[response]?.text ?? '') : ''}
          />
        ) : null}
      </li>
    );
  };

  const sections = TEST_KINDS.map((kind) => ({ kind, items: questions.filter((q) => q.kind === kind) })).filter((s) => s.items.length > 0);
  const numbered = new Map(questions.map((q, i) => [q.id, i + 1]));
  const mistakes = result ? result.questions.filter((q) => !q.correct).length : 0;
  const visible = (q: TestQuestion) => !mistakesOnly || !resultFor(q.id)?.correct;

  return (
    <StudyShell
      set={set}
      mode="test"
      status={result ? <span>{t('test.scoreLabel', { score: result.score })}</span> : <span>{t('test.answered', { done: answered, total })}</span>}
      progress={result ? undefined : { value: (answered / total) * 100, label: t('test.answered', { done: answered, total }) }}
    >
      {result ? (
        <SessionSummary
          setId={set.id}
          title={t('test.scoreLabel', { score: result.score })}
          body={`${t('test.scoreSummary', { points: result.points, max: result.maxPoints })} ${result.score >= 90 ? t('test.gradeGreat') : result.score >= 60 ? t('test.gradeGood') : t('test.gradeKeep')}`}
          stats={[
            { label: t('study.correct'), value: result.points },
            { label: t('study.incorrect'), value: result.maxPoints - result.points },
            { label: t('study.time'), value: formatDuration(elapsed) },
          ]}
          primary={
            <Button
              size="lg"
              onClick={() => {
                setQuestions(null);
                setResult(null);
              }}
            >
              {t('test.retake')}
            </Button>
          }
          steps={mistakes > 0 ? [{ to: `/sets/${set.id}/learn`, label: t('test.practiseMissed'), icon: <Brain aria-hidden="true" /> }] : undefined}
        />
      ) : (
        <h1 className="sr-only">{t('landing.modeTest')}</h1>
      )}

      {result ? (
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <h2 className="me-auto text-xl font-bold">{t('test.reviewHeading')}</h2>
          <Segmented
            aria-label={t('test.reviewHeading')}
            size="sm"
            value={mistakesOnly ? 'mistakes' : 'all'}
            onValueChange={(v) => setMistakesOnly(v === 'mistakes')}
            options={[
              { value: 'all', label: t('test.filterAll') },
              { value: 'mistakes', label: t('test.filterMistakes', { count: mistakes }) },
            ]}
          />
        </div>
      ) : null}
      {result && mistakesOnly && mistakes === 0 ? <p className="mt-4 text-muted-foreground">{t('test.noMistakes')}</p> : null}

      <div className={cn('mx-auto w-full max-w-2xl', result ? 'mt-4' : '')}>
        {sections.map((section) => {
          const items = section.items.filter(visible);
          if (items.length === 0) return null;
          return (
            <section key={section.kind} className="mb-8" aria-labelledby={`section-${section.kind}`}>
              <h2 id={`section-${section.kind}`} className="mb-3 text-lg font-bold">
                {t(SECTION[section.kind])}
              </h2>
              <ol className="flex flex-col gap-3">{items.map((q) => renderQuestion(q, numbered.get(q.id)!))}</ol>
            </section>
          );
        })}
      </div>

      {!result ? (
        <div className="sticky bottom-0 -mx-4 mt-auto border-t border-border bg-background/95 px-4 py-3 backdrop-blur-md">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <p className="flex-1 text-sm font-semibold text-muted-foreground" aria-live="polite">
              {t('test.answered', { done: answered, total })} · {t('common.cardCount', { count: cardCount(questions) })}
            </p>
            <Button size="lg" onClick={() => (answered < total ? setConfirm(true) : submit())}>
              {t('test.submit')}
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('test.unansweredTitle')}
        description={t('test.unansweredBody', { count: total - answered })}
        confirmLabel={t('test.submitAnyway')}
        cancelLabel={t('test.keepWorking')}
        onConfirm={submit}
      />
    </StudyShell>
  );
}

export default function TestPage() {
  return (
    <StudyGate mode="test" minCards={2}>
      {(set) => <Test key={set.id} set={set} />}
    </StudyGate>
  );
}
