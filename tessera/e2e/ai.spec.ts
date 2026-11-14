import { expect, test } from '@playwright/test';
import { answerLearnQuestion, createSet, latestEmail, linkFrom, newUser, signUp, VOCAB } from './helpers';

test.describe('AI features (test provider)', () => {
  test.beforeEach(async ({ page }) => {
    const user = newUser('ai');
    await signUp(page, user);
    await page.goto(linkFrom(await latestEmail(user.email, 'Confirm your email')));
    await expect(page).toHaveURL(/\/home/);
  });

  test('generates cards from notes, lets them be edited first, and labels them', async ({ page }) => {
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByRole('menuitem', { name: 'Create with AI' }).click();

    const dialog = page.getByRole('dialog', { name: 'Make cards with AI' });
    await dialog.getByLabel('Paste your notes').fill('Planets\nMercury - closest planet to the Sun\nVenus - hottest planet\nMars - the red planet');
    await expect(dialog.getByText('20 AI requests left this month')).toBeVisible();
    await dialog.getByRole('button', { name: 'Generate cards' }).click();

    const preview = page.getByRole('dialog', { name: 'Check your cards' });
    await expect(preview.getByLabel('Term 1')).toHaveValue('Mercury');
    await preview.getByLabel('Definition 2').fill('the hottest planet in the solar system');
    await preview.getByRole('checkbox', { name: 'Include card 3' }).click();
    await preview.getByRole('button', { name: 'Add 2 cards' }).click();
    await expect(page.getByText('2 AI cards added')).toBeVisible();

    await expect(page.getByLabel('Title')).toHaveValue('Planets');
    await expect(page.getByRole('listitem').filter({ hasText: 'AI-generated' })).toHaveCount(2);

    // A per-card suggestion is appended to the definition and can be undone.
    await page.getByRole('button', { name: 'AI suggestions for card 1' }).click();
    await page.getByRole('menuitem', { name: 'Add a memory trick' }).click();
    await expect(page.getByRole('textbox', { name: /Definition.*1/ })).toContainText('A memory trick for Mercury');

    await page.getByRole('button', { name: 'Create set' }).first().click();
    await expect(page).toHaveURL(/\/sets\/[^/]+$/);
    await expect(page.getByText('the hottest planet in the solar system')).toBeVisible();
    await expect(page.getByText('AI-generated')).toHaveCount(2);
  });

  test('explains a missed answer and writes wrong answers for multiple choice', async ({ page }) => {
    const id = await createSet(page, { title: 'Spanish basics', cards: VOCAB });
    await page.goto(`/sets/${id}`);
    await page.getByRole('button', { name: 'More options' }).click();
    await page.getByRole('menuitem', { name: 'Better wrong answers (AI)' }).click();
    await expect(page.getByText('Multiple-choice questions in this set now use AI-written wrong answers.')).toBeVisible();

    await page.goto(`/sets/${id}/learn`);
    await answerLearnQuestion(page, VOCAB, () => false, false);
    await page.getByRole('button', { name: 'Explain this' }).click();
    await expect(page.getByText('Why this is the answer')).toBeVisible();
    await expect(page.getByText(/^The answer is ".+"\. You wrote/)).toBeVisible();
  });
});
