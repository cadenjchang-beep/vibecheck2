import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createSet, DEMO, logIn, makeCards, newUser, signUp, spreadsheetRows } from './helpers';

test.describe('creating and editing sets', () => {
  test('create a set by pasting 20 terms from a spreadsheet', async ({ page }) => {
    await signUp(page, newUser('paste'));
    await page.goto('/sets/new');
    await page.getByLabel('Title').fill('Pasted vocabulary');

    await page.getByRole('button', { name: 'Import' }).click();
    await page.getByLabel('Paste your cards here').fill(spreadsheetRows(makeCards(20)));
    // Tab-separated text is recognised without touching any setting.
    await expect(page.getByRole('radio', { name: 'Tab' })).toBeChecked();
    await expect(page.getByText('20 cards', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Import 20 cards' }).click();

    await expect(page.getByRole('textbox', { name: 'Term for card 20' })).toHaveText('term 20');
    await expect(page.getByRole('textbox', { name: 'Definition for card 20' })).toHaveText('definition 20');
    await page.getByRole('button', { name: 'Create set' }).first().click();

    await expect(page).toHaveURL(/\/sets\/[A-Za-z0-9]+$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Pasted vocabulary' })).toBeVisible();
    await expect(page.getByText('20 terms')).toBeVisible();
    await expect(page.getByText('definition 20')).toBeVisible();
    // Every study mode is available straight away.
    await expect(page.getByRole('link', { name: 'Flashcards' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Learn' })).toBeVisible();
  });

  test('pasting rows straight into a card field offers to import them', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signUp(page, newUser('direct'));
    await page.goto('/sets/new');
    await page.evaluate((text) => navigator.clipboard.writeText(text), spreadsheetRows(makeCards(5)));
    await page.getByRole('textbox', { name: 'Term for card 1' }).click();
    await page.keyboard.press('ControlOrMeta+v');
    await expect(page.getByRole('dialog', { name: 'Import cards' })).toBeVisible();
    await page.getByRole('button', { name: 'Import 5 cards' }).click();
    await expect(page.getByRole('textbox', { name: 'Definition for card 5' })).toHaveText('definition 5');
  });

  test('custom separators, with a preview before importing', async ({ page }) => {
    await signUp(page, newUser('custom'));
    await page.goto('/sets/new');
    await page.getByRole('button', { name: 'Import' }).click();
    await page.getByLabel('Paste your cards here').fill('uno = one | dos = two | tres = three');
    await page.getByRole('radiogroup', { name: 'Between term and definition' }).getByRole('radio', { name: 'Custom' }).click();
    await page.getByLabel('Between term and definition: Custom separator').fill(' = ');
    await page.getByRole('radiogroup', { name: 'Between cards' }).getByRole('radio', { name: 'Custom' }).click();
    await page.getByLabel('Between cards: Custom separator').fill('|');
    await expect(page.getByRole('button', { name: 'Import 3 cards' })).toBeEnabled();
    await page.getByRole('button', { name: 'Import 3 cards' }).click();
    await expect(page.getByRole('textbox', { name: 'Term for card 3' })).toHaveText('tres');
    await expect(page.getByRole('textbox', { name: 'Definition for card 3' })).toHaveText('three');
  });

  test('a title and at least one card are required', async ({ page }) => {
    await signUp(page, newUser('validate'));
    await page.goto('/sets/new');
    await page.getByRole('button', { name: 'Create set' }).first().click();
    await expect(page.getByText('Give your set a title.')).toBeVisible();
    await expect(page.getByLabel('Title')).toBeFocused();
    await page.getByLabel('Title').fill('Only a title');
    await page.getByRole('button', { name: 'Create set' }).first().click();
    await expect(page.getByText('Add at least one card')).toBeVisible();
    await expect(page).toHaveURL(/\/sets\/new/);
  });

  test('rich text formatting is kept, and typing continues to a new card with Tab', async ({ page }) => {
    await signUp(page, newUser('rich'));
    await page.goto('/sets/new');
    await page.getByLabel('Title').fill('Chemistry');
    const term = page.getByRole('textbox', { name: 'Term for card 1' });
    await term.click();
    await page.keyboard.type('water');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+b');
    const definition = page.getByRole('textbox', { name: 'Definition for card 1' });
    await definition.click();
    await page.keyboard.type('H');
    await page.getByRole('button', { name: 'Subscript' }).first().click();
    await page.keyboard.type('2');
    await page.getByRole('button', { name: 'Subscript' }).first().click();
    await page.keyboard.type('O');

    // Fill the remaining rows by keyboard only, adding a fourth card with Tab.
    await page.getByRole('textbox', { name: 'Term for card 2' }).click();
    await page.keyboard.type('salt');
    await page.keyboard.press('Tab');
    await page.keyboard.type('NaCl');
    await page.getByRole('textbox', { name: 'Term for card 3' }).click();
    await page.keyboard.type('ammonia');
    await page.getByRole('textbox', { name: 'Definition for card 3' }).click();
    await page.keyboard.type('NH3');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('textbox', { name: 'Term for card 4' })).toBeFocused();
    await page.keyboard.type('methane');

    await page.getByRole('button', { name: 'Create set' }).first().click();
    await expect(page).toHaveURL(/\/sets\/[A-Za-z0-9]+$/);
    await expect(page.locator('b', { hasText: 'water' })).toBeVisible();
    await expect(page.locator('sub', { hasText: '2' })).toBeVisible();
    await expect(page.getByText('methane')).toBeVisible();
  });

  test('reorder cards with buttons and with the keyboard, delete a card and undo it', async ({ page }) => {
    await signUp(page, newUser('reorder'));
    const id = await createSet(page, { cards: makeCards(4) });
    await page.goto(`/sets/${id}/edit`);
    const termAt = (n: number) => page.getByRole('textbox', { name: `Term for card ${n}` });
    await expect(termAt(1)).toHaveText('term 1');

    await page.getByRole('button', { name: 'Move card 1 down' }).click();
    await expect(termAt(1)).toHaveText('term 2');
    await expect(termAt(2)).toHaveText('term 1');

    // Keyboard drag: pick up card 4, move it up two places, drop.
    const handle = page.getByRole('button', { name: 'Reorder card 4' });
    const announcement = page.locator('[id^="DndLiveRegion"]');
    await handle.focus();
    await page.keyboard.press('Space');
    await expect(handle).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('ArrowUp');
    // Each move is announced to screen readers; wait for it as a user would.
    await expect(announcement).toHaveText('Card moved to position 3 of 4.');
    await page.keyboard.press('ArrowUp');
    await expect(announcement).toHaveText('Card moved to position 2 of 4.');
    await page.keyboard.press('Space');
    await expect(announcement).toHaveText('Card dropped at position 2 of 4.');
    await expect(termAt(2)).toHaveText('term 4');

    await page.getByRole('button', { name: 'Delete card 1' }).click();
    await expect(termAt(1)).toHaveText('term 4');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(termAt(1)).toHaveText('term 2');

    await page.getByRole('button', { name: 'Save changes' }).first().click();
    await expect(page).toHaveURL(new RegExp(`/sets/${id}$`));
    const terms = page.getByRole('region', { name: /Terms in this set/ }).getByRole('listitem');
    await expect(terms).toHaveCount(4);
    await expect(terms.nth(0)).toContainText('term 2');
    await expect(terms.nth(1)).toContainText('term 4');
    await expect(terms.nth(2)).toContainText('term 1');
    await expect(terms.nth(3)).toContainText('term 3');
  });

  test('unsaved work comes back after the tab is closed', async ({ page }) => {
    await signUp(page, newUser('draft'));
    await page.goto('/sets/new');
    await page.getByLabel('Title').fill('Half-finished set');
    await page.getByRole('textbox', { name: 'Term for card 1' }).fill('remember me');
    await page.waitForTimeout(900); // the draft is written after a short pause
    await page.goto('/home');
    await page.goto('/sets/new');
    await expect(page.getByText('We restored your unsaved draft.')).toBeVisible();
    await expect(page.getByLabel('Title')).toHaveValue('Half-finished set');
    await expect(page.getByRole('textbox', { name: 'Term for card 1' })).toHaveText('remember me');
    await page.getByRole('button', { name: 'Discard draft' }).click();
    await expect(page.getByLabel('Title')).toHaveValue('');
  });

  test('leaving the editor with unsaved changes asks first', async ({ page }) => {
    await signUp(page, newUser('leave'));
    const id = await createSet(page);
    await page.goto(`/sets/${id}/edit`);
    await page.getByLabel('Title').fill('Changed title');
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Leave without saving?' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(page).toHaveURL(/\/edit$/);
    await expect(page.getByLabel('Title')).toHaveValue('Changed title');
  });
});

test.describe('the set page', () => {
  test('star terms and filter to the starred ones', async ({ page }) => {
    await signUp(page, newUser('star'));
    const id = await createSet(page, { cards: makeCards(5) });
    await page.goto(`/sets/${id}`);
    await page.getByRole('button', { name: 'Star "term 2"' }).click();
    await page.getByRole('button', { name: 'Star "term 4"' }).click();
    await page.getByRole('radio', { name: 'Starred (2)' }).click();
    const terms = page.getByRole('region', { name: /Terms in this set/ }).getByRole('listitem');
    await expect(terms).toHaveCount(2);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Remove star from "term 2"' })).toBeVisible();
  });

  test('delete a set and undo the deletion', async ({ page }) => {
    await signUp(page, newUser('delete'));
    const id = await createSet(page, { title: 'Soon deleted' });
    await page.goto(`/sets/${id}`);
    await page.getByRole('button', { name: 'More options' }).click();
    await page.getByRole('menuitem', { name: 'Delete set' }).click();
    await expect(page).toHaveURL(/\/library/);
    await expect(page.getByText('"Soon deleted" was deleted')).toBeVisible();
    await expect(page.getByRole('link', { name: /Soon deleted/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('link', { name: /Soon deleted/ })).toBeVisible();
  });

  test('make a copy of a set', async ({ page }) => {
    await signUp(page, newUser('copy'));
    const id = await createSet(page, { title: 'Original set', cards: makeCards(3) });
    await page.goto(`/sets/${id}`);
    await page.getByRole('button', { name: 'More options' }).click();
    await page.getByRole('menuitem', { name: 'Make a copy' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Original set (copy)' })).toBeVisible();
    await expect(page).not.toHaveURL(new RegExp(`/sets/${id}$`));
    await expect(page.getByText('3 terms')).toBeVisible();
  });

  test('export a set as CSV', async ({ page }) => {
    await signUp(page, newUser('csv'));
    const id = await createSet(page, {
      title: 'CSV export',
      cards: [
        { term: 'plain', definition: 'simple' },
        { term: 'with, comma', definition: 'say "hi"' },
        { term: '=SUM(A1)', definition: 'a formula-looking term' },
      ],
    });
    await page.goto(`/sets/${id}`);
    await page.getByRole('button', { name: 'More options' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Export as CSV' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('csv-export.csv');
    const content = readFileSync(await file.path(), 'utf8');
    expect(content).toContain('plain,simple');
    expect(content).toContain('"with, comma","say ""hi"""');
    // A cell that looks like a formula is neutralised for spreadsheet apps.
    expect(content).toContain("'=SUM(A1)");
  });

  test('print layout offers table, cards and glossary', async ({ page }) => {
    await signUp(page, newUser('print'));
    const id = await createSet(page, { title: 'Printable', cards: makeCards(4) });
    await page.goto(`/sets/${id}/print`);
    await expect(page.getByRole('heading', { level: 1, name: 'Printable' })).toBeVisible();
    await expect(page.locator('table tr')).toHaveCount(4);
    await page.getByRole('radio', { name: 'Cards' }).click();
    await expect(page.locator('main ul > li')).toHaveCount(4);
    await page.getByRole('radio', { name: 'Glossary' }).click();
    await expect(page.locator('main dl dt')).toHaveCount(4);
  });

  test('sharing: change who can see a set from the share dialog', async ({ page, browser }) => {
    await signUp(page, newUser('share'));
    const id = await createSet(page, { title: 'Shared by link' });
    await page.goto(`/sets/${id}`);

    const visitor = await browser.newContext();
    const visitorPage = await visitor.newPage();
    await visitorPage.goto(`/sets/${id}`);
    await expect(visitorPage.getByRole('heading', { name: "This page isn't here" })).toBeVisible();

    await page.getByRole('button', { name: 'Share' }).click();
    await page.getByRole('radio', { name: /Anyone with the link/ }).click();
    await expect(page.getByText('Sharing updated')).toBeVisible();

    await visitorPage.reload();
    await expect(visitorPage.getByRole('heading', { level: 1, name: 'Shared by link' })).toBeVisible();
    // A visitor sees the set but none of the owner's controls.
    await expect(visitorPage.getByRole('link', { name: 'Edit' })).toHaveCount(0);
    await visitor.close();
  });
});

test.describe('privacy of sets', () => {
  test('a private set cannot be opened by another user, by URL or through the API', async ({ page, browser }) => {
    await signUp(page, newUser('owner'));
    const id = await createSet(page, { title: 'My private notes', visibility: 'private' });
    await page.goto(`/sets/${id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'My private notes' })).toBeVisible();

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signUp(otherPage, newUser('intruder'));

    for (const path of [`/sets/${id}`, `/sets/${id}/edit`, `/sets/${id}/print`]) {
      await otherPage.goto(path);
      await expect(otherPage.getByRole('heading', { name: "This page isn't here" })).toBeVisible();
      await expect(otherPage.getByText('My private notes')).toHaveCount(0);
    }
    expect((await otherPage.request.get(`/api/sets/${id}`)).status()).toBe(404);
    expect((await otherPage.request.put(`/api/sets/${id}`, { data: { title: 'x', cards: [] } })).status()).toBe(404);
    expect((await otherPage.request.delete(`/api/sets/${id}`)).status()).toBe(404);

    // The raw page HTML gives nothing away either, and says "not found".
    const html = await otherPage.request.get(`/sets/${id}`);
    expect(html.status()).toBe(404);
    expect(await html.text()).not.toContain('My private notes');
    await other.close();

    // Still intact for its owner.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'My private notes' })).toBeVisible();
  });

  test('a signed-out visitor is not shown a private set', async ({ page, browser }) => {
    await signUp(page, newUser('owner2'));
    const id = await createSet(page, { title: 'Hidden from visitors' });
    const visitor = await browser.newContext();
    const response = await visitor.request.get(`/sets/${id}`);
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain('Hidden from visitors');
    expect((await visitor.request.get(`/api/sets/${id}`)).status()).toBe(404);
    await visitor.close();
  });
});

test.describe('public set pages', () => {
  test('are rendered on the server with a title, description and Open Graph tags', async ({ page, request }) => {
    await logIn(page, DEMO.teacher);
    const library = (await (await page.request.get('/api/sets')).json()) as { items: Array<{ id: string; title: string }> };
    const spanish = library.items.find((s) => s.title.startsWith('Spanish'))!;

    // Fetched without cookies and without running any JavaScript, as a crawler would.
    const response = await request.get(`/sets/${spanish.id}`, { headers: { cookie: '' } });
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain('<title>Spanish: 30 essential verbs · Tessera</title>');
    expect(html).toContain('property="og:title" content="Spanish: 30 essential verbs"');
    expect(html).toMatch(/property="og:url" content="http:\/\/localhost:\d+\/sets\//);
    expect(html).toContain('property="og:image"');
    expect(html).toContain('rel="canonical"');
    expect(html).toContain('application/ld+json');
    // The terms themselves are in the HTML.
    expect(html).toContain('<dt>conocer</dt>');
    expect(html).not.toContain('name="robots" content="noindex"');
  });

  test('open and study without an account, with a prompt to sign up', async ({ browser, page }) => {
    await logIn(page, DEMO.teacher);
    const library = (await (await page.request.get('/api/sets')).json()) as { items: Array<{ id: string; title: string }> };
    const set = library.items.find((s) => s.title.startsWith('Cell biology'))!;

    const visitor = await browser.newContext();
    const visitorPage = await visitor.newPage();
    await visitorPage.goto(`/sets/${set.id}`);
    await expect(visitorPage.getByRole('heading', { level: 1, name: /Cell biology/ })).toBeVisible();
    await expect(visitorPage.getByText('mitochondrion')).toBeVisible();
    // Markup stored on a card is rendered as formatting, not shown as tags.
    await expect(visitorPage.locator('sub', { hasText: '2' }).first()).toBeVisible();
    await expect(visitorPage.getByRole('link', { name: 'Sign up free to save your progress' })).toBeVisible();
    await visitor.close();
  });

  test('robots.txt and the sitemap list public content only', async ({ page, request }) => {
    await signUp(page, newUser('seo'));
    const privateId = await createSet(page, { title: 'Not for the sitemap' });
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('Disallow: /api/');
    expect(robots).toContain('Sitemap: ');
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).toContain('/browse/science');
    expect(sitemap).toMatch(/\/sets\/[A-Za-z0-9]+<\/loc>/);
    expect(sitemap).not.toContain(privateId);
  });
});
