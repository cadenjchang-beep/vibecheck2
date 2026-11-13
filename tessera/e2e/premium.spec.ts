import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createSet, newUser, signUp } from './helpers';

test('upgrade to Premium with the test provider, then manage the plan', async ({ page }) => {
  await signUp(page, newUser('premium'));
  await page.goto('/home');
  await expect(page.getByRole('complementary', { name: 'From Tessera' })).toBeVisible();

  await page.goto('/settings');
  await expect(page.getByText("You're on the free plan.")).toBeVisible();
  await page.getByRole('link', { name: 'See what Premium includes' }).click();
  await expect(page.getByRole('heading', { name: 'Tessera Premium' })).toBeVisible();
  await expect(page.getByRole('row', { name: /AI requests each month 20 500/ })).toBeVisible();
  await page.getByRole('button', { name: 'Upgrade for $5 a month' }).click();
  await expect(page.getByText('Welcome to Premium!')).toBeVisible();

  // Premium removes the promotion and unlocks detailed stats.
  await page.goto('/home');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'From Tessera' })).toHaveCount(0);

  await page.goto('/settings');
  await expect(page.getByText("You're on Premium. Thank you!")).toBeVisible();
  await expect(page.getByText(/^Renews on/)).toBeVisible();
  await page.getByRole('button', { name: 'Manage billing' }).click();
  await expect(page.getByText(/^Premium ends on/)).toBeVisible();
});

test('download your data, then delete the account', async ({ page }) => {
  const user = newUser('leaver');
  await signUp(page, user);
  await createSet(page, { title: 'My only set' });

  await page.goto('/settings');
  const downloading = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download my data' }).click();
  const file = await (await downloading).path();
  const data = JSON.parse(await readFile(file, 'utf8'));
  expect(data.profile.email).toBe(user.email);
  expect(data.sets.map((s: { title: string }) => s.title)).toEqual(['My only set']);

  await page.getByRole('button', { name: 'Delete my account' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete your account for good?' });
  await dialog.getByLabel('Enter your password to confirm').fill('wrong password');
  await dialog.getByRole('button', { name: 'Delete my account' }).click();
  await expect(dialog.getByText(/password/i).last()).toBeVisible();
  await dialog.getByLabel('Enter your password to confirm').fill(user.password);
  await dialog.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('Your account has been deleted.')).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});
