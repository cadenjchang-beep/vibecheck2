import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createSet, DEMO, expectNoHorizontalOverflow, logIn, newUser, signUp, VOCAB } from './helpers';

async function studySome(page: import('@playwright/test').Page, setId: string, correct: boolean[]) {
  const set = await (await page.request.get(`/api/sets/${setId}`)).json();
  await page.request.post('/api/study/sync', {
    data: {
      events: correct.map((ok, i) => ({ id: randomUUID(), type: 'answer', mode: 'learn', kind: 'mc', correct: ok, cardId: set.cards[i].id, setId, at: new Date(Date.now() - (correct.length - i) * 1000).toISOString() })),
      sessions: [{ clientId: randomUUID(), setId, mode: 'learn', startedAt: new Date(Date.now() - 180_000).toISOString(), endedAt: new Date().toISOString(), durationSeconds: 150, cardsStudied: correct.length, correctCount: correct.filter(Boolean).length, incorrectCount: correct.filter((c) => !c).length }],
    },
  });
}

test.describe('dashboard and stats', () => {
  test('the home page shows the streak, the daily goal, what is due and recent sets', async ({ page }) => {
    await signUp(page, newUser('dash'));
    await expect(page.getByRole('heading', { name: 'Make your first study set' })).toBeVisible();
    const id = await createSet(page, { title: 'Dashboard set', cards: VOCAB });
    await page.goto(`/sets/${id}`);
    await studySome(page, id, [true, true, false]);

    await page.goto('/home');
    await expect(page.getByRole('heading', { name: '1-day streak' })).toBeVisible();
    await expect(page.getByText("You've studied today.")).toBeVisible();
    await expect(page.getByText('3 of 20 cards')).toBeVisible();
    await expect(page.getByText('1 card is due')).toBeVisible();
    await expect(page.getByRole('link', { name: /Dashboard set/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('stats: weekly chart with a table view, totals, and premium-only detail', async ({ page }) => {
    await signUp(page, newUser('stats'));
    const id = await createSet(page, { cards: VOCAB });
    await studySome(page, id, [true, false, true, true]);
    await page.goto('/stats');
    await expect(page.getByRole('heading', { level: 1, name: 'Your stats' })).toBeVisible();
    // Each bar is reachable by keyboard and says what it shows.
    await expect(page.getByRole('img', { name: /: 4 cards$/ })).toBeVisible();
    await page.getByRole('radio', { name: 'Minutes' }).click();
    await expect(page.getByRole('img', { name: /: 3 minutes$/ })).toBeVisible();
    await page.getByRole('button', { name: 'Show as table' }).click();
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(8);
    await expect(page.getByRole('heading', { name: 'Detailed analytics' })).toBeVisible();
    await expect(page.getByText('See twelve weeks of activity')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('premium accounts see detailed analytics', async ({ page }) => {
    await logIn(page, DEMO.premium);
    await page.goto('/stats');
    await expect(page.getByRole('heading', { name: 'Cards per day, last 12 weeks' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Reviews due, next 14 days' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cards you miss most' })).toBeVisible();
  });

  test('per-card history opens from the stage marker', async ({ page }) => {
    await signUp(page, newUser('history'));
    const id = await createSet(page, { cards: VOCAB.slice(0, 3) });
    await studySome(page, id, [false, true]);
    await page.goto(`/sets/${id}`);
    await page.getByRole('button', { name: /Progress and history for "hola"/ }).click();
    const dialog = page.getByRole('dialog', { name: 'History for "hola"' });
    await expect(dialog.getByText('Multiple choice')).toBeVisible();
    await expect(dialog.getByText('Learning')).toBeVisible();
  });
});

test.describe('folders', () => {
  test('create a folder, file a set into it from the set page, remove it, delete and undo', async ({ page }) => {
    await signUp(page, newUser('folders'));
    const id = await createSet(page, { title: 'Filed set' });
    await page.goto('/folders');
    await expect(page.getByRole('heading', { name: 'No folders yet' })).toBeVisible();
    await page.getByRole('button', { name: 'New folder' }).first().click();
    await page.getByLabel('Folder name').fill('Spring exams');
    await page.getByRole('button', { name: 'Create folder' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Spring exams' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'This folder is empty' })).toBeVisible();

    await page.goto(`/sets/${id}`);
    await page.getByRole('button', { name: 'More options' }).click();
    await page.getByRole('menuitem', { name: 'Add to folder' }).click();
    await page.getByRole('checkbox', { name: 'Spring exams' }).check();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Folders updated')).toBeVisible();

    await page.goto('/folders');
    await expect(page.getByText('1 set', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: /Spring exams/ }).click();
    await expect(page.getByRole('link', { name: /Filed set/ })).toBeVisible();
    await page.getByRole('button', { name: 'Remove Filed set from this folder' }).click();
    await expect(page.getByRole('heading', { name: 'This folder is empty' })).toBeVisible();

    await page.getByRole('button', { name: 'More options' }).click();
    await page.getByRole('menuitem', { name: 'Delete folder' }).click();
    await expect(page).toHaveURL(/\/folders$/);
    await expect(page.getByRole('link', { name: /Spring exams/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('link', { name: /Spring exams/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('search and browse', () => {
  test('search public sets from the header, filter by subject, and browse by subject', async ({ page }) => {
    await signUp(page, newUser('search'));
    await createSet(page, { title: 'My private chemistry notes' });
    await page.getByRole('search').getByRole('searchbox').fill('organelles');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/search\?q=organelles/);
    await expect(page.getByRole('link', { name: /Cell biology: organelles/ })).toBeVisible();

    // A term inside a set finds the set.
    await page.getByRole('main').getByRole('searchbox').fill('mitochondrion');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('link', { name: /Cell biology/ })).toBeVisible();
    await page.getByLabel('Subject').selectOption('law');
    await expect(page.getByRole('heading', { name: 'No sets found' })).toBeVisible();

    await page.goto('/browse');
    await page.getByRole('link', { name: /Languages/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Languages sets' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Spanish: 30 essential verbs/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('visitors can browse and search, and never see private sets', async ({ page, browser }) => {
    await signUp(page, newUser('hidden'));
    const tag = `secret${Date.now().toString(36)}`;
    await createSet(page, { title: `${tag} private plans` });
    const visitor = await browser.newContext();
    const visitorPage = await visitor.newPage();
    await visitorPage.goto(`/search?q=${tag}`);
    await expect(visitorPage.getByRole('heading', { name: 'No sets found' })).toBeVisible();
    await visitorPage.goto('/search?q=cloud');
    await expect(visitorPage.getByRole('link', { name: /Cloud computing fundamentals/ })).toBeVisible();
    await visitor.close();
  });
});

test.describe('settings', () => {
  test('change name, daily goal, reminders and theme', async ({ page }) => {
    const user = newUser('settings');
    await signUp(page, user);
    await page.goto('/settings');
    await page.getByLabel('Name').fill('Renamed Learner');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Settings saved').first()).toBeVisible();
    await page.getByLabel('Daily goal').selectOption('50');
    await page.getByRole('radio', { name: 'Email' }).click();
    await expect(page.getByLabel('Remind me at')).toBeVisible();
    await page.getByRole('radio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByLabel('Name')).toHaveValue('Renamed Learner');
    await expect(page.getByLabel('Daily goal')).toHaveValue('50');
    const me = await (await page.request.get('/api/me')).json();
    expect(me.user).toMatchObject({ name: 'Renamed Learner', dailyGoal: 50, reminderChannel: 'email' });
  });
});
