import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Cached data stays usable offline for a week.
      gcTime: 7 * 24 * 60 * 60 * 1000,
      // Serve from cache first; fetch when the network is available.
      networkMode: 'offlineFirst',
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && (error.isNetwork || error.status < 500)) return false;
        return failureCount < 2;
      },
    },
    mutations: { networkMode: 'offlineFirst', retry: false },
  },
});

export const keys = {
  me: ['me'] as const,
  set: (id: string) => ['set', id] as const,
  sets: (scope: string) => ['sets', scope] as const,
  dashboard: ['dashboard'] as const,
  folders: ['folders'] as const,
  folder: (id: string) => ['folder', id] as const,
  classes: ['classes'] as const,
  class: (id: string) => ['class', id] as const,
  stats: ['stats'] as const,
  review: (setId?: string) => ['review', setId ?? 'all'] as const,
  search: (params: Record<string, string>) => ['search', params] as const,
  aiUsage: ['ai-usage'] as const,
  billing: ['billing'] as const,
};
