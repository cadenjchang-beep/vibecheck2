import { expect, test } from '@playwright/test';
import { answerLearnQuestion, createSet, DEMO, logIn, newUser, playLearn, signUp, VOCAB, waitForSync } from './helpers';

test.describe('Learn mode', () => {
  test('a card answered wrongly comes back until it is answered correctly', async ({ page }) => {
    await signUp(page, newUser('learn'));
    const id = await createSet(page, { cards: VOCAB });
    await page.goto(`/sets/${id}/learn`);

    // Miss "perro" the first two times it is asked; answer everything else correctly.
    const log = await playLearn(page, VOCAB, (term, _kind, askedBefore) => !(term === 'perro' && askedBefore < 2));
    const perro = log.filter((a) => a.term === 'perro');
    expect(perro.slice(0, 2).map((a) => a.correct)).toEqual([false, false]);
    // It kept coming back, and every answer after the misses was correct.
    expect(perro.length).toBeGreaterThanOrEqual(5);
    expect(perro.slice(2).every((a) => a.correct)).toBe(true);
    // It was asked more often than a card that was never missed.
    expect(perro.length).toBeGreaterThan(log.filter((a) => a.term === 'gato').length);
    // The session could only finish once it had been answered correctly.
    expect(log[log.length - 1]!.correct).toBe(true);
    await expect(page.getByRole('heading', { name: 'Set complete!' })).toBeVisible();

    const saved = await waitForSync(page, id, (set) => set.mastery === 100);
    const perroId = saved.cards.find((c: any) => c.termPlain === 'perro').id;
    expect(saved.progress[perroId]).toMatchObject({ stage: 'mastered', incorrectCount: 2 });
  });

  test('a missed card is shown again after only a couple of other questions', async ({ page }) => {
    await signUp(page, newUser('soon'));
    const id = await createSet(page, { cards: VOCAB });
    await page.goto(`/sets/${id}/learn`);
    const first = await answerLearnQuestion(page, VOCAB, () => false);
    const next = [];
    for (let i = 0; i < 3; i++) next.push((await answerLearnQuestion(page, VOCAB)).term);
    // Not immediately, but within the next three questions.
    expect(next[0]).not.toBe(first.term);
    expect(next).toContain(first.term);
  });

  test('typed answers: a small typo is forgiven, a wrong answer can be overridden', async ({ page }) => {
    await signUp(page, newUser('typed'));
    const cards = [
      { term: 'mitochondrion', definition: 'produces most of the ATP in a cell' },
      { term: 'ribosome', definition: 'builds proteins from messenger RNA' },
      { term: 'nucleus', definition: 'holds the DNA of the cell' },
    ];
    const id = await createSet(page, { cards });
    await page.goto(`/sets/${id}/learn`);
    // Typed answers only, so every question asks for the term.
    await page.getByRole('button', { name: 'Options' }).click();
    await page.getByRole('switch', { name: 'Multiple choice' }).click();
    await page.getByRole('switch', { name: 'True or false' }).click();
    await page.keyboard.press('Escape');

    const answerFor = async () => {
      const prompt = (await page.locator('#learn-prompt').innerText()).trim();
      return cards.find((c) => c.definition === prompt)!.term;
    };
    const input = page.getByRole('textbox', { name: 'Type the term' });

    // One letter missing: accepted, with the exact spelling shown.
    const first = await answerFor();
    await input.fill(first.slice(0, -1));
    await input.press('Enter');
    await expect(page.getByText('Almost! Check the spelling.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'I was right' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Continue' }).click();

    // A synonym the set does not know about: marked wrong, then overridden.
    await input.fill('some other word');
    await input.press('Enter');
    await expect(page.getByText('Not quite. This one will come back.')).toBeVisible();
    await page.getByRole('button', { name: 'I was right' }).click();
    await expect(page.getByText('Counted as correct.')).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();

    // "I don't know" shows the answer and cannot be overridden.
    await page.getByRole('button', { name: "I don't know" }).click();
    await expect(page.getByText('The answer is')).toBeVisible();
    await expect(page.getByRole('button', { name: 'I was right' })).toHaveCount(0);
  });

  test('works by keyboard alone: number keys choose, Enter continues', async ({ page }) => {
    await signUp(page, newUser('keys'));
    const id = await createSet(page, { cards: VOCAB });
    await page.goto(`/sets/${id}/learn`);
    await expect(page.locator('#learn-prompt')).toBeFocused();
    await page.keyboard.press('1');
    // The result is announced and focus lands on Continue.
    await expect(page.getByRole('button', { name: 'Continue' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0);
    await expect(page.locator('#learn-prompt')).toBeFocused();
  });

  test('without typed answers a set is finished at "familiar"', async ({ page }) => {
    await signUp(page, newUser('familiar'));
    const id = await createSet(page, { cards: VOCAB.slice(0, 4) });
    await page.goto(`/sets/${id}/learn`);
    await page.getByRole('button', { name: 'Options' }).click();
    await page.getByRole('switch', { name: 'Typed answer' }).click();
    await page.keyboard.press('Escape');
    const log = await playLearn(page, VOCAB.slice(0, 4));
    expect(log.every((a) => a.kind !== 'written')).toBe(true);
    await expect(page.getByText('You recognised every card.')).toBeVisible();
    const saved = await waitForSync(page, id, (set) => Object.keys(set.progress).length === 4);
    expect(Object.values(saved.progress).every((p: any) => p.stage === 'familiar')).toBe(true);
  });
});

test.describe('Flashcards', () => {
  test('flip, sort and finish using only the keyboard', async ({ page }) => {
    await signUp(page, newUser('fckeys'));
    const id = await createSet(page, { cards: VOCAB.slice(0, 4) });
    await page.goto(`/sets/${id}/flashcards`);
    await expect(page.getByText('hola', { exact: true })).toBeVisible();

    await page.keyboard.press('Space');
    await expect(page.getByText('Definition: hello')).toBeAttached(); // what a screen reader hears
    await page.keyboard.press('ArrowRight'); // know it
    await page.keyboard.press('ArrowLeft'); // still learning
    await expect(page.getByText('Still learning: 1')).toBeVisible();
    await expect(page.getByText('Know: 1')).toBeVisible();

    // Undo the last card and sort it the other way.
    await page.keyboard.press('z');
    await expect(page.getByText('Still learning: 0')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');

    await expect(page.getByRole('heading', { name: "You've been through every card" })).toBeVisible();
    await expect(page.getByText('You know 3 of 4.')).toBeVisible();

    // A second round with only the card still being learned.
    await page.getByRole('button', { name: "Study the 1 card you're still learning" }).click();
    await expect(page.getByText('gracias', { exact: true })).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Card 1 of 1' })).toBeVisible();

    const saved = await waitForSync(page, id, (set) => Object.keys(set.progress).length === 4);
    const stageOf = (term: string) => saved.progress[saved.cards.find((c: any) => c.termPlain === term).id];
    expect(stageOf('hola')).toMatchObject({ stage: 'learning', correctCount: 1 });
    // The undone answer was never recorded: only the final choice counts.
    expect(stageOf('adiós')).toMatchObject({ correctCount: 1, incorrectCount: 0 });
    expect(stageOf('gracias')).toMatchObject({ correctCount: 0, incorrectCount: 1 });
  });

  test('swipe right for "know it" and left for "still learning"', async ({ page }) => {
    await signUp(page, newUser('swipe'));
    const id = await createSet(page, { cards: VOCAB.slice(0, 3) });
    await page.goto(`/sets/${id}/flashcards`);
    const card = page.getByRole('button', { name: 'Flip card' });
    const box = (await card.boundingBox())!;
    const swipe = async (dx: number) => {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx / 2, y, { steps: 4 });
      await page.mouse.move(x + dx, y, { steps: 4 });
      await page.mouse.up();
    };
    await swipe(220);
    await expect(page.getByText('Know: 1')).toBeVisible();
    await swipe(-220);
    await expect(page.getByText('Still learning: 1')).toBeVisible();
    // A short drag is not a swipe, and does not flip the card either.
    await swipe(30);
    await expect(page.getByRole('progressbar', { name: 'Card 3 of 3' })).toBeVisible();
    await expect(page.getByText('Term: gracias')).toBeAttached();
  });

  test('options: definition first, shuffle and plain browsing without sorting', async ({ page }) => {
    await signUp(page, newUser('fcopts'));
    const id = await createSet(page, { cards: VOCAB });
    await page.goto(`/sets/${id}/flashcards`);
    await page.getByRole('button', { name: 'Options' }).click();
    await page.getByRole('radio', { name: 'Definition' }).click();
    await page.getByRole('switch', { name: 'Sort cards as I go' }).click();
    await page.keyboard.press('Escape');

    await expect(page.getByText('Definition: hello')).toBeAttached();
    await expect(page.getByRole('button', { name: 'Know it' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Next card' }).click();
    await expect(page.getByRole('progressbar', { name: 'Card 2 of 6' })).toBeVisible();
    await page.getByRole('button', { name: 'Previous card' }).click();
    await expect(page.getByRole('progressbar', { name: 'Card 1 of 6' })).toBeVisible();

    // The choice is remembered for next time.
    await page.reload();
    await expect(page.getByText('Definition: hello')).toBeAttached();
    await expect(page.getByRole('button', { name: 'Next card' })).toBeVisible();
  });

  test('star a card while studying and study only starred cards', async ({ page }) => {
    await signUp(page, newUser('fcstar'));
    const id = await createSet(page, { cards: VOCAB });
    await page.goto(`/sets/${id}/flashcards`);
    await page.getByRole('button', { name: 'Know it' }).click();
    await page.getByRole('button', { name: 'Star this card' }).click(); // adiós
    await expect(page.getByRole('button', { name: 'Remove star' })).toBeVisible();

    await page.getByRole('button', { name: 'Options' }).click();
    await page.getByRole('switch', { name: 'Study starred terms only' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('progressbar', { name: 'Card 1 of 1' })).toBeVisible();
    await expect(page.getByText('adiós', { exact: true })).toBeVisible();
  });
});

test.describe('studying without an account', () => {
  test('a visitor can study a public set; nothing is saved and they are invited to sign up', async ({ page, browser }) => {
    await logIn(page, DEMO.teacher);
    const library = (await (await page.request.get('/api/sets')).json()) as { items: Array<{ id: string; title: string }> };
    const set = library.items.find((s) => s.title.startsWith('Spanish'))!;

    const visitor = await browser.newContext();
    const visitorPage = await visitor.newPage();
    const syncCalls: string[] = [];
    visitorPage.on('request', (r) => r.url().includes('/api/study/sync') && syncCalls.push(r.url()));

    await visitorPage.goto(`/sets/${set.id}/flashcards`);
    await expect(visitorPage.getByText('ser', { exact: true })).toBeVisible();
    for (let i = 0; i < 30; i++) await visitorPage.getByRole('button', { name: 'Know it' }).click();
    await expect(visitorPage.getByRole('heading', { name: "You've been through every card" })).toBeVisible();
    await expect(visitorPage.getByText("You're studying as a guest, so progress isn't saved.")).toBeVisible();
    await expect(visitorPage.getByRole('link', { name: 'Sign up free to keep your progress' })).toBeVisible();
    // No star button for visitors, and nothing was sent to be recorded.
    expect(syncCalls).toHaveLength(0);
    await visitor.close();
  });

  test('a set with too few cards explains what the mode needs', async ({ page }) => {
    await signUp(page, newUser('few'));
    const id = await createSet(page, { cards: [{ term: 'only', definition: 'one' }] });
    await page.goto(`/sets/${id}/learn`);
    await expect(page.getByRole('heading', { name: 'Not enough cards yet' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add cards' })).toBeVisible();
  });
});
