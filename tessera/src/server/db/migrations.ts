import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from './client';

/** Applies every pending SQL migration in ./drizzle. Safe to run on each deploy. */
export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder: './drizzle' });
}
