import type {
  AiDistractorsResponse,
  AiExplainInput,
  AiGenerateResponse,
  AiGenerateTextInput,
  AiSuggestInput,
  AiTextResponse,
  AiUsageDto,
} from '@shared/ai';
import type { Distractors } from '@shared/learn';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, ApiError } from './api';
import { useFeatures, useUser } from './me';
import { keys } from './query';

/** True when this server has AI turned on and the viewer can use it. */
export function useAiAvailable(): boolean {
  const features = useFeatures();
  const user = useUser();
  return Boolean(features?.ai) && Boolean(user);
}

export function useAiUsage(enabled = true) {
  return useQuery({
    queryKey: keys.aiUsage,
    queryFn: () => api<AiUsageDto>('/api/ai/usage'),
    enabled,
    staleTime: 30_000,
  });
}

/** Keeps the cached allowance in step with what the last AI response reported. */
export function useRecordUsage() {
  const client = useQueryClient();
  return useCallback((usage: AiUsageDto | null | undefined) => usage && client.setQueryData(keys.aiUsage, usage), [client]);
}

export const generateFromText = (input: Partial<AiGenerateTextInput> & Pick<AiGenerateTextInput, 'source' | 'text'>, signal?: AbortSignal) =>
  api<AiGenerateResponse>('/api/ai/generate', { method: 'POST', body: input, signal });

export function generateFromFile(file: File, fields: { count: number; termLang: string; definitionLang: string }, signal?: AbortSignal) {
  const form = new FormData();
  form.set('file', file);
  form.set('count', String(fields.count));
  form.set('termLang', fields.termLang);
  form.set('definitionLang', fields.definitionLang);
  return api<AiGenerateResponse>('/api/ai/generate', { method: 'POST', body: form, signal });
}

export const suggest = (input: Partial<AiSuggestInput> & Pick<AiSuggestInput, 'kind' | 'term'>) =>
  api<AiTextResponse>('/api/ai/suggest', { method: 'POST', body: input });

export const explain = (input: Partial<AiExplainInput> & Pick<AiExplainInput, 'setId' | 'term' | 'definition'>) =>
  api<AiTextResponse>('/api/ai/explain', { method: 'POST', body: input });

const distractorKey = (setId: string) => ['distractors', setId] as const;

/**
 * Cached AI-written wrong answers for a set. Reading them is free; nothing is
 * generated here. Without them, Learn and Test fall back to other cards' answers.
 */
export function useDistractors(setId: string | undefined): Distractors | undefined {
  const features = useFeatures();
  const { data } = useQuery({
    queryKey: distractorKey(setId ?? ''),
    queryFn: () => api<AiDistractorsResponse>(`/api/ai/distractors/${setId}`),
    enabled: Boolean(setId) && Boolean(features?.ai),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return data?.distractors;
}

export function useWriteDistractors(setId: string) {
  const client = useQueryClient();
  const record = useRecordUsage();
  return useCallback(async () => {
    const result = await api<AiDistractorsResponse>(`/api/ai/distractors/${setId}`, { method: 'POST' });
    client.setQueryData(distractorKey(setId), result);
    record(result.usage);
    return result;
  }, [client, record, setId]);
}

export function isQuotaError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === 'ai_quota_exceeded';
}
