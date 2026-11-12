import type { Plan } from './constants';

/**
 * The single place plan differences are defined. The server enforces these;
 * the client reads the same object to decide what to show or offer.
 */
export interface Entitlements {
  plan: Plan;
  /** AI requests (generation, suggestions, explanations) per calendar month. */
  aiMonthlyLimit: number;
  imageUploads: boolean;
  audioUploads: boolean;
  /** Explicitly saving whole sets, with their media, for offline use. */
  offlineDownloads: boolean;
  detailedAnalytics: boolean;
  adFree: boolean;
  /** Total bytes of uploaded media. */
  storageBytes: number;
}

const FREE: Entitlements = {
  plan: 'free',
  aiMonthlyLimit: 20,
  imageUploads: false,
  audioUploads: false,
  offlineDownloads: false,
  detailedAnalytics: false,
  adFree: false,
  storageBytes: 0,
};

const PREMIUM: Entitlements = {
  plan: 'premium',
  aiMonthlyLimit: 500,
  imageUploads: true,
  audioUploads: true,
  offlineDownloads: true,
  detailedAnalytics: true,
  adFree: true,
  storageBytes: 2 * 1024 * 1024 * 1024,
};

export type Feature = 'imageUploads' | 'audioUploads' | 'offlineDownloads' | 'detailedAnalytics' | 'adFree';

export function entitlementsFor(plan: Plan): Entitlements {
  return plan === 'premium' ? PREMIUM : FREE;
}

export function hasFeature(entitlements: Entitlements, feature: Feature): boolean {
  return entitlements[feature];
}

/** A premium plan that has run past its paid period counts as free. */
export function effectivePlan(plan: string, planExpiresAt: Date | string | null | undefined, now = new Date()): Plan {
  if (plan !== 'premium') return 'free';
  if (!planExpiresAt) return 'premium';
  return new Date(planExpiresAt).getTime() > now.getTime() ? 'premium' : 'free';
}

export const PREMIUM_PRICE = { amount: 5, currency: 'USD', interval: 'month' } as const;
