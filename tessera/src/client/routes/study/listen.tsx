import { Pause, Play, Repeat, SkipBack, SkipForward } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SetDetail } from '@shared/api';
import { LANGUAGES } from '@shared/constants';
import { RichText } from '@/components/rich-text';
import { StudyGate, StudyShell } from '@/components/study/shell';
import { Button } from '@/components/ui/button';
import { Segmented, Tooltip } from '@/components/ui/controls';
import { Alert } from '@/components/ui/feedback';
import { Select } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import { isStudyable } from '@/lib/sets';
import { canSpeak, hasVoiceFor, speak, stopSpeaking } from '@/lib/speech';
import { useStoredState, useStudySession } from '@/lib/study';
import { cn, isTypingTarget } from '@/lib/utils';

type Side = 'term' | 'definition';
interface Prefs {
  rate: number;
  first: Side;
  repeat: boolean;
}
const RATES = [0.75, 1, 1.25, 1.5];
const GAP_MS = { between: 650, after: 1100 };

/** Hands-free listening: each card's two sides are read aloud in turn. */
function Listen({ set }: { set: SetDetail }) {
  const { t } = useI18n();
  const [prefs, setPrefs] = useStoredState<Prefs>('tessera.listen', { rate: 1, first: 'term', repeat: false });
  const cards = useMemo(() => set.cards.filter((c) => isStudyable(c) && c.termPlain && c.definitionPlain), [set.cards]);
  const [index, setIndex] = useState(0);
  /** 0: first side, 1: second side. */
  const [step, setStep] = useState<0 | 1>(0);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const session = useStudySession(set.id, 'listen');
  const run = useRef(0);
  const counted = useRef(new Set<string>());
  const listRef = useRef<HTMLOListElement>(null);
  const supported = canSpeak() || cards.some((c) => c.termAudio || c.definitionAudio);
  const card = cards[index];

  const sideAt = useCallback((s: 0 | 1): Side => (s === 0 ? prefs.first : prefs.first === 'term' ? 'definition' : 'term'), [prefs.first]);

  // One "run" token per utterance: anything that finishes late is ignored.
  useEffect(() => {
    if (!playing || !card) return;
    const token = ++run.current;
    const side = sideAt(step);
    const next = () => {
      if (token !== run.current) return;
      setTimeout(
        () => {
          if (token !== run.current) return;
          if (step === 0) return setStep(1);
          if (!counted.current.has(card.id)) {
            counted.current.add(card.id);
            session.count(null);
          }
          if (index < cards.length - 1) {
            setIndex(index + 1);
            setStep(0);
          } else if (prefs.repeat) {
            setIndex(0);
            setStep(0);
          } else {
            setPlaying(false);
            setEnded(true);
          }
        },
        step === 0 ? GAP_MS.between : GAP_MS.after,
      );
    };
    const audio = side === 'term' ? card.termAudio : card.definitionAudio;
    let element: HTMLAudioElement | null = null;
    if (audio) {
      element = new Audio(audio.url);
      element.playbackRate = prefs.rate;
      element.onended = next;
      element.onerror = next;
      void element.play().catch(next);
    } else {
      speak(side === 'term' ? card.termPlain : card.definitionPlain, side === 'term' ? set.termLang : set.definitionLang, { rate: prefs.rate, onEnd: next });
    }
    return () => {
      run.current++;
      element?.pause();
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, index, step, prefs.rate, prefs.first, prefs.repeat, card?.id]);

  // Keep the screen awake while listening, where the browser allows it.
  useEffect(() => {
    if (!playing || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    navigator.wakeLock.request('screen').then((l) => (lock = l), () => undefined);
    return () => void lock?.release().catch(() => undefined);
  }, [playing]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const jump = useCallback(
    (to: number, play = playing) => {
      setIndex(Math.max(0, Math.min(cards.length - 1, to)));
      setStep(0);
      setEnded(false);
      setPlaying(play);
    },
    [cards.length, playing],
  );
  const toggle = useCallback(() => {
    if (ended) return jump(0, true);
    setPlaying((p) => !p);
  }, [ended, jump]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target)) return;
      const onControl = event.target instanceof HTMLElement && Boolean(event.target.closest('button, a, select'));
      if (event.key === ' ' && !onControl) {
        event.preventDefault();
        toggle();
      } else if (event.key === 'ArrowRight') jump(index + 1);
      else if (event.key === 'ArrowLeft') jump(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, jump, index]);

  const languageName = (code: string) => LANGUAGES.find((l) => l.code === code)?.name ?? code;
  const missingVoice = canSpeak() ? [set.termLang, set.definitionLang].find((lang) => !hasVoiceFor(lang)) : undefined;
  const speaking = playing ? sideAt(step) : null;

  if (!card) return null;
  return (
    <StudyShell
      set={set}
      mode="listen"
      status={<span>{`${index + 1} / ${cards.length}`}</span>}
      progress={{ value: ((index + (step === 1 ? 0.5 : 0)) / cards.length) * 100, label: t('listen.nowPlaying', { current: index + 1, total: cards.length }) }}
    >
      <h1 className="sr-only">{t('landing.modeListen')}</h1>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
        {!supported ? (
          <Alert variant="warning" title={t('listen.unsupportedTitle')} className="mb-4">
            {t('listen.unsupportedBody')}
          </Alert>
        ) : missingVoice && typeof speechSynthesis !== 'undefined' && speechSynthesis.getVoices().length > 0 ? (
          <Alert variant="info" className="mb-4">
            {t('listen.noVoice', { language: languageName(missingVoice) })}
          </Alert>
        ) : null}

        <section className="rounded-3xl border border-border bg-card p-5 shadow-card sm:p-8" aria-live="polite" aria-atomic="true" aria-label={t('listen.nowPlaying', { current: index + 1, total: cards.length })}>
          {(['term', 'definition'] as const).map((side) => (
            <div key={side} className={cn('rounded-2xl p-3 transition-colors', speaking === side && 'bg-primary-soft')}>
              <p className="text-sm font-semibold text-muted-foreground">{side === 'term' ? t('study.term') : t('study.definition')}</p>
              <RichText
                value={side === 'term' ? card.term : card.definition}
                lang={side === 'term' ? set.termLang : set.definitionLang}
                className={cn('mt-1', side === 'term' ? 'font-display text-3xl font-bold' : 'text-xl')}
              />
            </div>
          ))}
          {ended ? <p className="mt-3 text-center text-muted-foreground">{t('listen.finished')}</p> : null}
        </section>

        <div className="mt-5 flex items-center justify-center gap-3">
          <Tooltip label={t('listen.previous')}>
            <Button variant="secondary" size="icon" aria-label={t('listen.previous')} disabled={index === 0} onClick={() => jump(index - 1)}>
              <SkipBack className="rtl:rotate-180" aria-hidden="true" />
            </Button>
          </Tooltip>
          <Button size="lg" className="size-16 rounded-full p-0" aria-label={playing ? t('listen.pause') : t('listen.play')} onClick={toggle} disabled={!supported} autoFocus>
            {playing ? <Pause className="size-7" aria-hidden="true" /> : <Play className="size-7 translate-x-0.5" aria-hidden="true" />}
          </Button>
          <Tooltip label={t('listen.next')}>
            <Button variant="secondary" size="icon" aria-label={t('listen.next')} disabled={index >= cards.length - 1} onClick={() => jump(index + 1)}>
              <SkipForward className="rtl:rotate-180" aria-hidden="true" />
            </Button>
          </Tooltip>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Segmented
            aria-label={t('listen.order')}
            size="sm"
            value={prefs.first}
            onValueChange={(first) => setPrefs((p) => ({ ...p, first }))}
            options={[
              { value: 'term', label: t('study.term') },
              { value: 'definition', label: t('study.definition') },
            ]}
          />
          <Select aria-label={t('listen.speed')} value={prefs.rate} onChange={(e) => setPrefs((p) => ({ ...p, rate: Number(e.target.value) }))} className="h-10 w-auto">
            {RATES.map((rate) => (
              <option key={rate} value={rate}>
                {t('listen.speedValue', { value: rate })}
              </option>
            ))}
          </Select>
          <Button variant="ghost" size="sm" aria-pressed={prefs.repeat} onClick={() => setPrefs((p) => ({ ...p, repeat: !p.repeat }))} className={cn(prefs.repeat && 'bg-primary-soft text-primary-soft-foreground')}>
            <Repeat aria-hidden="true" />
            {t('listen.repeat')}
          </Button>
        </div>

        <h2 className="mt-8 font-sans text-sm font-semibold text-muted-foreground">{t('listen.upNext')}</h2>
        <ol ref={listRef} className="mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto">
          {cards.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                aria-current={i === index}
                aria-label={t('listen.playCard', { number: i + 1, term: c.termPlain })}
                onClick={() => jump(i, true)}
                className={cn('flex w-full items-baseline gap-3 rounded-xl px-3 py-2 text-start transition-colors hover:bg-accent', i === index && 'bg-primary-soft text-primary-soft-foreground')}
              >
                <span className="w-6 shrink-0 text-sm tabular-nums opacity-70">{i + 1}</span>
                <span dir="auto" className="min-w-0 flex-1 truncate font-semibold">
                  {c.termPlain}
                </span>
                <span dir="auto" className="hidden min-w-0 flex-1 truncate opacity-80 sm:block">
                  {c.definitionPlain}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </StudyShell>
  );
}

export default function ListenPage() {
  return (
    <StudyGate mode="listen" minCards={1}>
      {(set) => <Listen key={set.id} set={set} />}
    </StudyGate>
  );
}
