import { describe, expect, it } from 'vitest';
import { app, createUser, guest, sampleSet } from './helpers';

describe('premium billing (test provider)', () => {
  it('upgrades through checkout, lifts the limits, and lets the plan be managed', async () => {
    const user = await createUser();
    expect(await user.get('/api/billing')).toMatchObject({ plan: 'free', provider: 'mock', subscription: null, price: { amount: 5 } });
    expect((await user.get('/api/me')).entitlements).toMatchObject({ plan: 'free', aiMonthlyLimit: 20, imageUploads: false });

    expect(await user.post('/api/billing/checkout')).toEqual({ url: '/upgrade?checkout=success' });
    const me = await user.get('/api/me');
    expect(me.user.plan).toBe('premium');
    expect(me.entitlements).toMatchObject({ plan: 'premium', aiMonthlyLimit: 500, imageUploads: true, detailedAnalytics: true, adFree: true });

    const again = await user.request('POST', '/api/billing/checkout');
    expect(again.status).toBe(409);

    await user.post('/api/billing/portal');
    expect((await user.get('/api/billing')).subscription).toMatchObject({ status: 'active', cancelAtPeriodEnd: true, manageable: true });
  });

  it('does not sell Premium to under-13 accounts', async () => {
    const child = await createUser({ birthYear: new Date().getFullYear() - 10, consentStatus: 'granted' });
    const res = await child.request('POST', '/api/billing/checkout');
    expect(res.status).toBe(403);
  });

  it('ignores webhooks when Stripe is not the provider', async () => {
    const res = await app.request('/api/billing/webhook', { method: 'POST', body: '{}', headers: { 'stripe-signature': 't=1,v1=x' } });
    expect(res.status).toBe(404);
  });
});

describe('your data', () => {
  it('exports everything held for the account as a download', async () => {
    const user = await createUser({ name: 'Exporter' });
    await user.post('/api/sets', sampleSet({ title: 'Exported set' }));
    const res = await user.request('GET', '/api/me/export');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="tessera-export-/);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const data = await res.json();
    expect(data.profile).toMatchObject({ name: 'Exporter', email: user.email });
    expect(data.sets[0].title).toBe('Exported set');
    expect(data.sets[0].cards.map((c: any) => c.term)).toEqual(['alpha', 'beta', 'gamma']);
    expect((await guest.request('GET', '/api/me/export')).status).toBe(401);
  });

  it('deletes the account and everything in it with the password', async () => {
    const user = await createUser();
    const set = await user.post('/api/sets', sampleSet({ visibility: 'public' }));
    const wrong = await user.request('POST', '/api/auth/delete-user', { password: 'not-my-password' });
    expect(wrong.ok).toBe(false);
    const res = await user.request('POST', '/api/auth/delete-user', { password: 'correct-horse-battery' });
    expect(res.status).toBe(200);
    expect((await user.get('/api/me')).user).toBeNull();
    expect((await guest.request('GET', `/api/sets/${set.id}`)).status).toBe(404);
  });
});
