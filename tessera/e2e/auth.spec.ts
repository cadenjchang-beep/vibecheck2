import { expect, test } from '@playwright/test';
import { latestEmail, linkFrom, logIn, logOut, newUser, signUp } from './helpers';

test.describe('accounts', () => {
  test('sign up, log out and log back in', async ({ page }) => {
    const user = newUser('auth');
    await signUp(page, user);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // A new account is asked to confirm its email but is not blocked by it.
    await expect(page.getByText('Confirm your email to share sets publicly')).toBeVisible();

    await logOut(page);
    await logIn(page, user);
  });

  test('a wrong password is rejected with a clear message', async ({ page }) => {
    const user = newUser('wrongpw');
    await signUp(page, user);
    await logOut(page);
    await page.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill('not-the-password');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('alert')).toContainText("don't match");
    await expect(page).toHaveURL(/\/login/);
  });

  test('email verification link confirms the address', async ({ page }) => {
    const user = newUser('verify');
    await signUp(page, user);
    const email = await latestEmail(user.email, 'Confirm your email');
    await page.goto(linkFrom(email));
    await expect(page).toHaveURL(/\/home/);
    await expect(page.getByText('Confirm your email to share sets publicly')).toHaveCount(0);
  });

  test('password reset by emailed link', async ({ page }) => {
    const user = newUser('reset');
    await signUp(page, user);
    await logOut(page);

    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill(user.email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText('a reset link is on its way')).toBeVisible();

    const email = await latestEmail(user.email, 'Reset your');
    await page.goto(linkFrom(email));
    await expect(page).toHaveURL(/\/reset-password\?token=/);
    await page.getByLabel('New password').fill('a-brand-new-password');
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page.getByText('Your password has been updated')).toBeVisible();

    await logIn(page, { email: user.email, password: 'a-brand-new-password' });
  });

  test('signed-out visitors are sent to log in, then back to where they were going', async ({ page }) => {
    const user = newUser('next');
    await signUp(page, user);
    await logOut(page);
    await page.goto('/home');
    await expect(page).toHaveURL(/\/login\?next=%2Fhome/);
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/home/);
  });

  test('an under-13 account waits for a parent, who approves by email', async ({ page, browser }) => {
    const child = newUser('child');
    const parentEmail = `parent-${Date.now()}@example.test`;
    const year = String(new Date().getFullYear() - 10);

    await page.goto('/signup');
    await page.getByLabel('Birth month').selectOption('5');
    await page.getByLabel('Birth year').selectOption(year);
    // The teacher option is replaced by the parent email field.
    await expect(page.getByLabel("I'm a teacher")).toHaveCount(0);
    await page.getByLabel("Parent or guardian's email").fill(parentEmail);
    await page.getByLabel('Name').fill(child.name);
    await page.getByLabel('Email', { exact: true }).fill(child.email);
    await page.getByLabel('Password', { exact: true }).fill(child.password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/waiting/);

    // The app stays locked until the parent decides.
    await page.goto('/home');
    await expect(page).toHaveURL(/\/waiting/);

    const email = await latestEmail(parentEmail);
    const parent = await browser.newContext();
    const parentPage = await parent.newPage();
    await parentPage.goto(linkFrom(email));
    await expect(parentPage.getByRole('heading', { level: 1 })).toContainText('A child in your care');
    await parentPage.getByRole('button', { name: 'Approve account' }).click();
    await expect(parentPage.getByText('account is approved')).toBeVisible();
    await parent.close();

    await page.getByRole('button', { name: "I've been approved" }).click();
    await expect(page).toHaveURL(/\/home/);
  });
});
