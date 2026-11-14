import { inArray, sql } from 'drizzle-orm';
import { db } from './db/client';
import { users } from './db/schema';
import { env } from './env';
import { log } from './log';

/**
 * Owner mode, for running Tessera just for yourself (OWNER_EMAIL): only the
 * listed addresses can create accounts, and those accounts are confirmed and
 * have Premium from the start, with no email service or payment needed.
 */
export function parseOwnerEmails(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export const ownerEmails = parseOwnerEmails(env.OWNER_EMAIL);

/** Whether this address may sign up: anyone, unless owner mode is on. */
export function maySignUp(email: string, owners: string[] = ownerEmails): boolean {
  return owners.length === 0 || owners.includes(email.trim().toLowerCase());
}

export function isOwner(email: string, owners: string[] = ownerEmails): boolean {
  return owners.includes(email.trim().toLowerCase());
}

/** What signing up does in owner mode: refuse strangers, give the owner Premium. */
export function ownerSignUp<T extends { email: string }>(user: T, owners: string[] = ownerEmails): { allowed: false } | { allowed: true; data: T } {
  if (!maySignUp(user.email, owners)) return { allowed: false };
  if (isOwner(user.email, owners)) return { allowed: true, data: { ...user, emailVerified: true, plan: 'premium' } };
  return { allowed: true, data: user };
}

/** Gives accounts that already exist for the owner addresses the owner's perks. */
export async function syncOwnerAccounts(owners: string[] = ownerEmails): Promise<number> {
  if (owners.length === 0) return 0;
  const updated = await db
    .update(users)
    .set({ emailVerified: true, plan: 'premium', planExpiresAt: null })
    .where(inArray(sql`lower(${users.email})`, owners))
    .returning({ id: users.id });
  if (updated.length) log.info({ accounts: updated.length }, 'owner accounts have Premium');
  return updated.length;
}
