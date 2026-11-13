import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, makeCards, newUser, playLearn, spreadsheetRows, VOCAB, waitForSync, createSet, signUp } from './helpers';

/**
 * The core journey, run on a desktop and on a 375px-wide phone:
 * sign up → make a set by pasting → study it → see the progress.
 */
test.describe('core flow', () => {
  test('a new user signs up, pastes 20 terms and is studying well within two minutes', async ({ page }) => {
    const started = Date.now();
    const user = newUser('core');

    await page.goto('/');
    await page.getByRole('link', { name: 'Get started free' }).first().click();
    await page.getByLabel('Birth month').selectOption('3');
    await page.getByLabel('Birth year').selectOption('2001');
    await page.getByLabel('Name').fill(user.name);
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/home/);
    await expectNoHorizontalOverflow(page);

    // "Create set" is one tap away on every screen size.
    await page.getByRole('link', { name: 'Create set' }).first().click();
    await expect(page).toHaveURL(/\/sets\/new/);
    await page.getByLabel('Title').fill('Twenty pasted terms');
    await page.getByRole('button', { name: 'Import' }).click();
    await page.getByLabel('Paste your cards here').fill(spreadsheetRows(makeCards(20)));
    await page.getByRole('button', { name: 'Import 20 cards' }).click();
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Create set' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Twenty pasted terms' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole('link', { name: 'Flashcards' }).click();
    await expect(page.getByText('term 1', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Flip card' }).click();
    await expect(page.getByText('definition 1', { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // The whole journey is a couple of dozen interactions. Scripted it takes
    // seconds; the limit here leaves a person more than 100 seconds to spare.
    expect(Date.now() - started).toBeLessThan(20_000);
  });

  test('study a set with flashcards and Learn, then see the progress', async ({ page }) => {
    await signUp(page, newUser('study'));
    const id = await createSet(page, { title: 'Spanish basics', cards: VOCAB });
    await page.goto(`/sets/${id}`);
    await expect(page.getByText('0% mastered')).toBeVisible();

    // Flashcards: sort three cards.
    await page.getByRole('link', { name: 'Flashcards' }).click();
    await page.getByRole('button', { name: 'Flip card' }).click();
    await page.getByRole('button', { name: 'Know it' }).click();
    await page.getByRole('button', { name: 'Know it' }).click();
    await page.getByRole('button', { name: 'Still learning' }).click();
    await expectNoHorizontalOverflow(page);
    await page.getByRole('link', { name: 'Close and go back to the set' }).click();
    await expect(page).toHaveURL(new RegExp(`/sets/${id}$`));

    // Learn: answer everything correctly to the end.
    await page.getByRole('link', { name: 'Learn' }).click();
    await expect(page.locator('#learn-prompt')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await playLearn(page, VOCAB);
    await expect(page.getByRole('heading', { name: 'Set complete!' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // Back on the set: every card mastered, and it is saved on the server.
    await page.getByRole('link', { name: 'Back to set' }).click();
    await expect(page.getByText('100% mastered')).toBeVisible();
    const saved = await waitForSync(page, id, (set) => Object.values(set.progress).length === VOCAB.length && set.mastery === 100);
    expect(Object.values(saved.progress).every((p: any) => p.stage === 'mastered')).toBe(true);

    // It survives a reload and shows in the library.
    await page.reload();
    await expect(page.getByText('100% mastered')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.goto('/library');
    await expect(page.getByRole('progressbar', { name: '100% mastered' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
