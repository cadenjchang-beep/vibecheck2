import type { ClassDetail, ClassesResponse, ClassProgress, JoinPreview } from '@shared/classes';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from './api';
import { keys } from './query';

export const useClasses = () => useQuery({ queryKey: keys.classes, queryFn: () => api<ClassesResponse>('/api/classes') });

export const useClass = (id: string) => useQuery({ queryKey: keys.class(id), queryFn: () => api<ClassDetail>(`/api/classes/${id}`), retry: false });

export const useClassProgress = (id: string, enabled: boolean) =>
  useQuery({ queryKey: [...keys.class(id), 'progress'], queryFn: () => api<ClassProgress>(`/api/classes/${id}/progress`), enabled });

export const useJoinPreview = (code: string) =>
  useQuery({ queryKey: ['join', code], queryFn: () => api<JoinPreview>(`/api/classes/join/${encodeURIComponent(code)}`), retry: false, enabled: code.length >= 4 });

/** Refreshes every class view, and set lists whose access may have changed. */
export function useRefreshClasses() {
  const client = useQueryClient();
  return useCallback(
    (id?: string) =>
      Promise.all([
        client.invalidateQueries({ queryKey: keys.classes }),
        id ? client.invalidateQueries({ queryKey: keys.class(id) }) : undefined,
        client.invalidateQueries({ queryKey: ['sets'] }),
      ]),
    [client],
  );
}

/** "2026-11-20" from a date input, as the end of that day in the viewer's time zone. */
export function endOfLocalDay(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}T23:59:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
