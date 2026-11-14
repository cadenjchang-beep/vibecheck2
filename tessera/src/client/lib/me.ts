import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { MeResponse, MeUser } from '@shared/api';
import { entitlementsFor, type Entitlements } from '@shared/entitlements';
import { api, ApiError } from './api';
import { useI18n } from './i18n';
import { keys } from './query';

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: ({ signal }) => api<MeResponse>('/api/me', { signal }),
    staleTime: 60_000,
  });
}

/** The signed-in user, `null` for a visitor, `undefined` while still loading. */
export function useUser(): MeUser | null | undefined {
  const { data } = useMe();
  return data === undefined ? undefined : data.user;
}

/** True once the account can use the app (onboarded and, if under 13, approved). */
export function isActive(user: MeUser | null | undefined): user is MeUser {
  return Boolean(user && user.onboarded && user.consentStatus !== 'pending');
}

export function useEntitlements(): Entitlements {
  const { data } = useMe();
  return data?.entitlements ?? entitlementsFor('free');
}

export function useFeatures() {
  const { data } = useMe();
  return data?.features;
}

export function useRefreshMe() {
  const client = useQueryClient();
  return useCallback(() => client.invalidateQueries({ queryKey: keys.me }), [client]);
}

/** Turns any thrown value into a message in the user's language. */
export function useErrorMessage() {
  const { t, tMaybe } = useI18n();
  return useCallback(
    (error: unknown): string => {
      if (error instanceof ApiError) {
        return tMaybe(`errors.${error.code.toLowerCase()}`) ?? (error.status >= 500 ? t('errors.internal_error') : error.message);
      }
      return t('errors.generic');
    },
    [t, tMaybe],
  );
}
