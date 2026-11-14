/**
 * Demo accounts loaded by `npm run db:seed` and by previews (SEED_DEMO).
 * Production refuses to create them: the password is published here.
 */
export const DEMO_PASSWORD = 'tessera-demo';

export const DEMO_ACCOUNTS = {
  student: { name: 'Maya Chen', email: 'demo@tessera.test', role: 'student', plan: 'free' },
  teacher: { name: 'Amara Okafor', email: 'teacher@tessera.test', role: 'teacher', plan: 'free' },
  premium: { name: 'Leo Martins', email: 'premium@tessera.test', role: 'student', plan: 'premium' },
} as const;

export type DemoAccount = keyof typeof DEMO_ACCOUNTS;
