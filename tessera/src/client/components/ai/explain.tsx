import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { explain, useAiAvailable, useRecordUsage } from '@/lib/ai';
import { useI18n } from '@/lib/i18n';
import { useErrorMessage } from '@/lib/me';
import { cn } from '@/lib/utils';

export interface ExplainProps {
  setId: string;
  term: string;
  definition: string;
  /** What the learner answered, if anything. */
  given: string;
  /** The side the learner had to produce. */
  answerSide?: 'term' | 'definition';
  className?: string;
}

/** "Explain why I was wrong": a short AI explanation shown under a missed question. */
export function ExplainButton({ setId, term, definition, given, answerSide = 'definition', className }: ExplainProps) {
  const { t } = useI18n();
  const available = useAiAvailable();
  const errorMessage = useErrorMessage();
  const recordUsage = useRecordUsage();
  const [state, setState] = useState<{ status: 'idle' | 'loading' } | { status: 'done'; text: string } | { status: 'error'; message: string }>({
    status: 'idle',
  });
  if (!available) return null;

  const run = async () => {
    setState({ status: 'loading' });
    try {
      const result = await explain({ setId, term, definition, given, answerSide });
      recordUsage(result.usage);
      setState({ status: 'done', text: result.text });
    } catch (err) {
      setState({ status: 'error', message: errorMessage(err) });
    }
  };

  return (
    <div className={cn('flex flex-col items-start gap-2', className)} aria-live="polite">
      {state.status === 'done' ? (
        <div className="w-full rounded-xl border border-border bg-muted/50 p-3 text-sm">
          <p className="mb-1 flex items-center gap-1.5 font-semibold">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            {t('ai.explainTitle')}
          </p>
          <p dir="auto" className="whitespace-pre-line">
            {state.text}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">{t('ai.explainLabel')}</p>
        </div>
      ) : (
        <Button variant="secondary" size="sm" loading={state.status === 'loading'} onClick={() => void run()}>
          <Sparkles aria-hidden="true" />
          {state.status === 'loading' ? t('ai.explainWorking') : t('ai.explain')}
        </Button>
      )}
      {state.status === 'error' ? (
        <Alert variant="error" className="w-full">
          {state.message}
        </Alert>
      ) : null}
    </div>
  );
}
