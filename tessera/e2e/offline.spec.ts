import { expect, test } from '@playwright/test';
import { answerLearnQuestion, createSet, newUser, signUp, VOCAB, waitForSync } from './helpers';

test('an opened set can be studied offline, and the answers sync when back online', async ({ page, context }) => {
  await signUp(page, newUser('offline'));
  const id = await createSet(page, { title: 'Offline vocab', cards: VOCAB });

  await page.goto(`/sets/${id}`);
  await expect(page.getByRole('heading', { name: 'Offline vocab' })).toBeVisible();
  // Wait for the service worker to install, precache the app and take control.
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, undefined, { timeout: 20_000 });
  // Open the set once more under the worker, so its answer is cached.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Offline vocab' })).toBeVisible();

  await context.setOffline(true);
  await page.goto(`/sets/${id}/learn`);
  await expect(page.locator('#learn-prompt')).toBeVisible();
  await answerLearnQuestion(page, VOCAB);
  await answerLearnQuestion(page, VOCAB);

  await context.setOffline(false);
  await page.getByRole('link', { name: 'Close and go back to the set' }).click();
  await waitForSync(page, id, (set) => Object.keys(set.progress).length >= 1);
});

test('the app is installable: manifest, icons and worker are served', async ({ page, request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ name: 'Tessera', display: 'standalone', start_url: '/home?source=pwa' });
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
  const worker = await (await request.get('/sw.js')).text();
  expect(worker).not.toContain('__PRECACHE_MANIFEST__');
  expect(worker).toMatch(/\/assets\/index-[\w-]+\.js/);
  expect((await request.get('/og-image.png')).headers()['content-type']).toBe('image/png');
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
});
