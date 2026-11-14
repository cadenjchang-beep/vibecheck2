import { eq } from 'drizzle-orm';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@shared/demo';
import { auth } from '../auth';
import { db } from './client';
import { users } from './schema';

export const SEED_USERS = DEMO_ACCOUNTS;

interface SeedUser {
  name: string;
  email: string;
  role: 'student' | 'teacher';
  plan?: 'free' | 'premium';
}

/** Creates a ready-to-use account, or returns the existing one. */
export async function ensureUser(seed: SeedUser): Promise<string> {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, seed.email)).limit(1);
  if (existing) return existing.id;
  const created = await auth.api.signUpEmail({ body: { name: seed.name, email: seed.email, password: DEMO_PASSWORD } });
  await db
    .update(users)
    .set({
      emailVerified: true,
      role: seed.role,
      plan: seed.plan ?? 'free',
      birthYear: 1996,
      birthMonth: 4,
      consentStatus: 'not_required',
      onboardedAt: new Date(),
    })
    .where(eq(users.id, created.user.id));
  return created.user.id;
}

/** Demo accounts (password: DEMO_PASSWORD) and three public sample sets. Safe to repeat. */
export async function seedDemo(): Promise<void> {
  for (const user of Object.values(SEED_USERS)) await ensureUser(user);
  const { seedContent } = await import('./seed-content');
  await seedContent();
}
