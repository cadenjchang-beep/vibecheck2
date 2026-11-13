import { expect, test } from '@playwright/test';
import { createSet, expectNoHorizontalOverflow, newUser, signUp, VOCAB } from './helpers';

// Runs in the 375px "mobile" project (see playwright.config.ts) as well as on desktop.
test('every page fits a 375px screen without sideways scrolling', async ({ page }) => {
  for (const path of ['/', '/login', '/signup', '/forgot-password', '/browse', '/privacy', '/terms']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expectNoHorizontalOverflow(page);
  }

  await signUp(page, newUser('narrow'));
  const id = await createSet(page, { title: 'A set with a fairly long title to see how it wraps on a phone', cards: VOCAB });
  const pages = [
    '/home',
    '/library',
    '/folders',
    '/classes',
    '/stats',
    '/review',
    '/settings',
    '/search?q=set',
    '/sets/new',
    `/sets/${id}`,
    `/sets/${id}/edit`,
    `/sets/${id}/flashcards`,
    `/sets/${id}/learn`,
    `/sets/${id}/test`,
    `/sets/${id}/match`,
    `/sets/${id}/listen`,
    `/sets/${id}/print`,
    '/join/ABCDEFG',
    '/no-such-page',
  ];
  for (const path of pages) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test('Arabic switches the layout to right-to-left and still fits', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tessera.locale', 'ar'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.getByRole('link', { name: 'تسجيل الدخول' }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await signUp(page, newUser('rtl'));
  const id = await createSet(page, { title: 'مفردات', cards: VOCAB });
  for (const path of ['/home', '/library', `/sets/${id}`, `/sets/${id}/flashcards`, `/sets/${id}/learn`]) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expectNoHorizontalOverflow(page);
  }
  await page.goto('/home');
  await expect(page.getByRole('link', { name: 'المكتبة' }).first()).toBeVisible();
});
