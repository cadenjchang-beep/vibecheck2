import { describe, expect, it } from 'vitest';
import { db } from '@server/db/client';
import { users } from '@server/db/schema';
import { ownerSignUp, syncOwnerAccounts } from '@server/owner';
import { DatabaseStorage } from '@server/services/storage';
import { eq } from 'drizzle-orm';
import { createUser } from './helpers';

describe('owner mode', () => {
  const owners = ['me@example.test'];

  it('lets only the owner sign up, with Premium and a confirmed email', () => {
    expect(ownerSignUp({ email: 'stranger@example.test' }, owners)).toEqual({ allowed: false });
    expect(ownerSignUp({ email: 'Me@Example.test' }, owners)).toEqual({
      allowed: true,
      data: { email: 'Me@Example.test', emailVerified: true, plan: 'premium' },
    });
    // Without owner mode, sign-up is open and unchanged.
    expect(ownerSignUp({ email: 'anyone@example.test' }, [])).toEqual({ allowed: true, data: { email: 'anyone@example.test' } });
  });

  it('upgrades an owner account that already existed', async () => {
    const user = await createUser({ verified: false });
    expect(await syncOwnerAccounts([user.email.toUpperCase().toLowerCase()])).toBe(1);
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row).toMatchObject({ plan: 'premium', emailVerified: true, planExpiresAt: null });
    expect((await user.get('/api/me')).entitlements.plan).toBe('premium');
  });
});

describe('uploads stored in the database', () => {
  it('stores, serves ranges of, and deletes files', async () => {
    const storage = new DatabaseStorage();
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    await storage.put('test/one.bin', bytes, 'application/octet-stream');
    const whole = await storage.get('test/one.bin');
    expect(new Uint8Array(await new Response(whole!.body).arrayBuffer())).toEqual(bytes);
    const part = await storage.get('test/one.bin', { start: 2, end: 4 });
    expect(part).toMatchObject({ size: 3, total: 8, range: { start: 2, end: 4 } });
    expect(new Uint8Array(await new Response(part!.body).arrayBuffer())).toEqual(new Uint8Array([3, 4, 5]));
    await storage.delete('test/one.bin');
    expect(await storage.get('test/one.bin')).toBeNull();
  });
});
