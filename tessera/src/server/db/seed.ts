import { eq } from 'drizzle-orm';
import { auth } from '../auth';
import { log } from '../log';
import { db, pool } from './client';
import { users } from './schema';

export const DEMO_PASSWORD = 'tessera-demo';

interface SeedUser {
  name: string;
  email: string;
  role: 'student' | 'teacher';
  plan?: 'free' | 'premium';
}

export const SEED_USERS = {
  teacher: { name: 'Amara Okafor', email: 'teacher@tessera.test', role: 'teacher' },
  student: { name: 'Maya Chen', email: 'demo@tessera.test', role: 'student' },
  premium: { name: 'Leo Martins', email: 'premium@tessera.test', role: 'student', plan: 'premium' },
} satisfies Record<string, SeedUser>;

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

export async function seed(): Promise<void> {
  for (const user of Object.values(SEED_USERS)) await ensureUser(user);
  const { seedContent } = await import('./seed-content');
  await seedContent();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .then(() => log.info('seed complete'))
    .catch((err) => {
      log.error({ err }, 'seed failed');
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
