import { BUILT } from '@/lib/built';

export interface ExplainProps {
  setId: string;
  term: string;
  definition: string;
  /** What the learner answered, if anything. */
  given: string;
  className?: string;
}

/** "Explain why I was wrong". Renders nothing until the AI features are available. */
export function ExplainButton(_props: ExplainProps) {
  if (!BUILT.ai) return null;
  return null;
}
