import { useQuery } from '@tanstack/react-query';
import type { DashboardResponse, StatsDetailed, StatsOverview } from '@shared/api';
import { api } from './api';
import { keys } from './query';

export const useDashboard = () => useQuery({ queryKey: keys.dashboard, queryFn: ({ signal }) => api<DashboardResponse>('/api/stats/dashboard', { signal }) });
export const useOverview = () => useQuery({ queryKey: [...keys.stats, 'overview'], queryFn: ({ signal }) => api<StatsOverview>('/api/stats/overview', { signal }) });
export const useDetailedStats = (enabled: boolean) =>
  useQuery({ queryKey: [...keys.stats, 'detailed'], queryFn: ({ signal }) => api<StatsDetailed>('/api/stats/detailed', { signal }), enabled });

/** Noon on the given calendar day, so formatting never slips to the neighbouring day. */
export const dayDate = (day: string) => new Date(`${day}T12:00:00`);
