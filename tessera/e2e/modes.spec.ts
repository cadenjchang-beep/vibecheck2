import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createSet, expectNoHorizontalOverflow, newUser, signUp, VOCAB, waitForSync, type CardSeed } from './helpers';

const DAY = 86_400_000;

/** Answers every question on the test page; `wrong` lists terms to get wrong. */
async function fillTest(page: Page, cards: CardSeed[], wrong: string[] = []) {
  const find = (text: string) => cards.find((c) => c.term === text || c.definition === text)!;
  const answerTo = (text: string) => (find(text).term === text ? find(text).definition : find(text).term);
  const items = page.locator('li[data-kind]');
  for (let i = 0; i < (await items.count()); i++) {
    const item = items.nth(i);
    const kind = await item.getAttribute('data-kind');
    if (kind === 'matching') {
      const selects = item.getByRole('combobox');
      for (let s = 0; s < (await selects.count()); s++) {
        const prompt = ((await selects.nth(s).getAttribute('aria-label')) ?? '').replace('Answer for ', '');
        const card = find(prompt);
        const other = cards.find((c) => c !== card)!;
        const pick = wrong.includes(card.term) ? other : card;
        // Choose from what this question offers; a wrong pick may not be listed.
        const options = await selects.nth(s).locator('option').allInnerTexts();
        const wanted = pick.term === prompt ? pick.definition : card.term === prompt ? pick.definition : pick.term;
        await selects.nth(s).selectOption({ label: options.includes(wanted) ? wanted : options.find((o) => o !== answerTo(prompt) && o !== 'Choose…')! });
      }
      continue;
    }
    const prompt = (await item.locator('[data-prompt]').innerText()).trim();
    const card = find(prompt);
    const miss = wrong.includes(card.term);
    if (kind === 'written') {
      await item.getByRole('textbox').fill(miss ? 'not the answer' : answerTo(prompt));
    } else if (kind === 'tf') {
      const truth = (await item.locator('[data-statement]').innerText()).trim() === answerTo(prompt);
      await item.getByRole('radio', { name: truth !== miss ? 'True' : 'False', exact: true }).click();
    } else {
      const radios = item.getByRole('radio');
      if (!miss) await item.getByRole('radio', { name: answerTo(prompt), exact: true }).click();
      else await radios.filter({ hasNotText: answerTo(prompt) }).first().click();
    }
  }
}

test.describe('Test mode', () => {
  test('take a test with every question type and get a score with a review of mistakes', async ({ page }) => {
    await signUp(page, newUser('test'));
    const id = await createSet(page, { cards: VOCAB });
    await page.goto(`/sets/${id}/test`);
    await expect(page.getByRole('heading', { name: 'Set up your test' })).toBeVisible();
    await page.getByRole('button', { name: 'Start test' }).click();

    await expect(page.locator('li[data-kind]').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    // Submitting with gaps asks first.
    await page.getByRole('button', { name: 'Submit test' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Submit with questions unanswered?' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep working' }).click();

    await fillTest(page, VOCAB, ['perro']);
    await page.getByRole('button', { name: 'Submit test' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Score: 83%' })).toBeVisible();
    await expect(page.getByText('5 of 6 correct')).toBeVisible();
    await page.getByRole('radio', { name: 'Mistakes (1)' }).click();
    await expect(page.locator('li[data-kind]')).toHaveCount(1);
    await expectNoHorizontalOverflow(page);

    const saved = await waitForSync(page, id, (set) => Object.keys(set.progress).length === 6);
    const perro = saved.progress[saved.cards.find((c: any) => c.termPlain === 'perro').id];
    expect(perro).toMatchObject({ incorrectCount: 1, correctCount: 0 });
    expect(Object.values(saved.progress).filter((p: any) => p.correctCount === 1)).toHaveLength(5);

    // A perfect paper.
    await page.getByRole('button', { name: 'Take a new test' }).click();
    await page.getByRole('button', { name: 'Start test' }).click();
    await fillTest(page, VOCAB);
    await page.getByRole('button', { name: 'Submit test' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Score: 100%' })).toBeVisible();
  });

  test('question count and types are configurable', async ({ page }) => {
    await signUp(page, newUser('testcfg'));
    const id = await createSet(page, { cards: VOCAB });
    await page.goto(`/sets/${id}/test`);
    await page.getByLabel('Number of cards').fill('3');
    for (const name of ['True or false', 'Matching', 'Written']) await page.getByRole('switch', { name }).click();
    await page.getByRole('button', { name: 'Start test' }).click();
    await expect(page.locator('li[data-kind]')).toHaveCount(3);
    await expect(page.locator('li[data-kind="mc"]')).toHaveCount(3);
  });
});

test.describe('Match', () => {
  test('pair every tile, see the time and a personal best; a wrong pair costs a second', async ({ page }) => {
    await signUp(page, newUser('match'));
    const id = await createSet(page, { cards: VOCAB });
    await page.goto(`/sets/${id}/match`);
    await page.getByRole('button', { name: 'Start game' }).click();
    await expect(page.getByRole('group', { name: 'Matching board' }).getByRole('button')).toHaveCount(12);
    await expectNoHorizontalOverflow(page);

    // A wrong pair first.
    await page.getByRole('button', { name: 'Term: hola' }).click();
    await page.getByRole('button', { name: 'Definition: goodbye' }).click();
    await expect(page.getByText('1 wrong pair')).toBeVisible();

    // Then every pair, some by clicking and one by keyboard.
    for (const card of VOCAB.slice(0, 5)) {
      await page.getByRole('button', { name: `Term: ${card.term}` }).click();
      await page.getByRole('button', { name: `Definition: ${card.definition}` }).click();
    }
    await page.getByRole('button', { name: 'Term: casa' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Definition: house' }).focus();
    await page.keyboard.press('Space');

    await expect(page.getByRole('heading', { name: 'Board cleared!' })).toBeVisible();
    await expect(page.getByText(/You finished in \d+(\.\d)?s\./)).toBeVisible();
    // The time is saved and shown as a personal best.
    await expect(page.getByRole('heading', { name: 'Your best times' })).toBeVisible();
    await expect(page.locator('#best-title ~ ol > li')).toHaveCount(1);
    const scores = await (await page.request.get(`/api/sets/${id}/match-scores?pairs=6`)).json();
    expect(scores.personal).toHaveLength(1);
    expect(scores.personal[0].mistakes).toBe(1);
  });

  test('drag one tile onto its partner', async ({ page }) => {
    await signUp(page, newUser('drag'));
    const id = await createSet(page, { cards: VOCAB.slice(0, 2) });
    await page.goto(`/sets/${id}/match`);
    await page.getByRole('button', { name: 'Start game' }).click();
    const from = (await page.getByRole('button', { name: 'Term: hola' }).boundingBox())!;
    const to = (await page.getByRole('button', { name: 'Definition: hello' }).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByText('1 pair left', { exact: true })).toBeVisible();
    await expect(page.getByText('0 wrong pairs')).toBeVisible();
  });
});

test.describe('spaced repetition review', () => {
  test('review a set: new cards are introduced, "again" comes back, ratings schedule the next review', async ({ page }) => {
    await signUp(page, newUser('review'));
    const id = await createSet(page, { cards: VOCAB.slice(0, 3) });
    await page.goto(`/sets/${id}/review`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('hola');
    await expect(page.getByText('New card')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // The answer is hidden until asked for; then each button shows its interval.
    await expect(page.getByText('hello', { exact: true })).toHaveCount(0);
    await page.keyboard.press('Space');
    await expect(page.getByText('hello', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Again.*10 min/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Good.*1 day/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Easy.*4 days/ })).toBeVisible();
    await page.getByRole('button', { name: /^Again/ }).click();

    // adiós: good, by keyboard. gracias: easy.
    await page.keyboard.press('Space');
    await page.keyboard.press('3');
    await page.getByRole('button', { name: 'Show answer' }).click();
    await page.getByRole('button', { name: /^Easy/ }).click();

    // The forgotten card is back before the session can end.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('hola');
    await page.getByRole('button', { name: 'Show answer' }).click();
    await page.getByRole('button', { name: /^Good/ }).click();
    await expect(page.getByRole('heading', { name: 'Review complete' })).toBeVisible();

    const saved = await waitForSync(page, id, (set) => Object.values(set.progress).filter((p: any) => p.repetitions === 1).length === 3);
    const of = (term: string) => saved.progress[saved.cards.find((c: any) => c.termPlain === term).id];
    expect(of('hola')).toMatchObject({ intervalDays: 1, incorrectCount: 1, correctCount: 1 });
    expect(of('adiós')).toMatchObject({ intervalDays: 1, easeFactor: 2.5 });
    expect(of('gracias').intervalDays).toBe(4);

    // Nothing is due now; the daily queue says when the next review is.
    await page.goto(`/sets/${id}/review`);
    await expect(page.getByRole('heading', { name: 'Nothing to review right now' })).toBeVisible();
    await page.goto('/review');
    await expect(page.getByRole('heading', { name: "You're all caught up" })).toBeVisible();
    await expect(page.getByText(/Your next review is/)).toBeVisible();
  });

  test('the daily queue gathers due cards from every set', async ({ page }) => {
    await signUp(page, newUser('queue'));
    const first = await createSet(page, { title: 'First set', cards: VOCAB.slice(0, 2) });
    const second = await createSet(page, { title: 'Second set', cards: VOCAB.slice(2, 4) });
    // Reviews "rated good" several days ago: all four cards are overdue today.
    for (const id of [first, second]) {
      const set = await (await page.request.get(`/api/sets/${id}`)).json();
      await page.request.post('/api/study/sync', {
        data: {
          events: set.cards.map((c: any, i: number) => ({
            id: randomUUID(),
            type: 'rating',
            mode: 'review',
            rating: 3,
            cardId: c.id,
            setId: id,
            at: new Date(Date.now() - (4 + i) * DAY).toISOString(),
          })),
        },
      });
    }
    await page.goto('/review');
    await expect(page.getByText('4 cards to review')).toBeVisible();
    await expect(page.getByRole('link', { name: 'First set' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Second set' })).toBeVisible();
    // The due count is on the navigation too.
    await expect(page.getByRole('navigation', { name: 'Main' }).first().getByText('4 cards due')).toBeAttached();

    await page.getByRole('link', { name: 'Start review' }).click();
    for (let i = 0; i < 4; i++) {
      await expect(page.getByText(/From (First|Second) set/)).toBeVisible();
      await page.getByRole('button', { name: 'Show answer' }).click();
      await page.getByRole('button', { name: /^Good/ }).click();
    }
    await expect(page.getByRole('heading', { name: 'Review complete' })).toBeVisible();
    // A second "good" moves each card on to six days.
    const saved = await waitForSync(page, first, (set) => Object.values(set.progress).every((p: any) => p.repetitions === 2));
    expect(Object.values(saved.progress).every((p: any) => p.intervalDays === 6)).toBe(true);
    await page.getByRole('link', { name: 'Review', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: "You're all caught up" })).toBeVisible();
  });
});

test.describe('Listen', () => {
  test('reads each card aloud in turn and can be paused', async ({ page }) => {
    // Headless browsers have no voices: stand in for the speech engine and record what it is asked to say.
    await page.addInitScript(() => {
      const spoken: string[] = [];
      (window as any).__spoken = spoken;
      class Utterance {
        text: string;
        lang = '';
        rate = 1;
        voice = null;
        onend: null | (() => void) = null;
        onerror: null | (() => void) = null;
        constructor(text: string) {
          this.text = text;
        }
      }
      (window as any).SpeechSynthesisUtterance = Utterance;
      Object.defineProperty(window, 'speechSynthesis', {
        value: {
          getVoices: () => [],
          cancel: () => undefined,
          speak: (u: Utterance) => {
            spoken.push(`${u.lang}:${u.text}`);
            setTimeout(() => u.onend?.(), 40);
          },
        },
      });
    });
    await signUp(page, newUser('listen'));
    const id = await createSet(page, { cards: VOCAB.slice(0, 3) });
    await page.goto(`/sets/${id}/listen`);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByText('That was the last card.')).toBeVisible({ timeout: 20_000 });
    const spoken = await page.evaluate(() => (window as any).__spoken as string[]);
    expect(spoken).toEqual(['en:hola', 'en:hello', 'en:adiós', 'en:goodbye', 'en:gracias', 'en:thank you']);

    // Jump to a card from the list, then pause.
    await page.getByRole('button', { name: /^Play from card 2 adiós/ }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
