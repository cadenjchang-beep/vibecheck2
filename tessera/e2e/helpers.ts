import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';

const OUTBOX = path.resolve('.data/e2e/outbox');

export interface TestUser {
  name: string;
  email: string;
  password: string;
}

let counter = 0;
/** A fresh account for each test, so tests never depend on one another. */
export function newUser(prefix = 'user'): TestUser {
  counter += 1;
  const id = `${Date.now().toString(36)}${counter}${Math.random().toString(36).slice(2, 6)}`;
  return { name: `Test ${prefix}`, email: `${prefix}-${id}@example.test`, password: 'correct-horse-battery' };
}

export async function signUp(page: Page, user: TestUser, options: { teacher?: boolean; birthYear?: string } = {}): Promise<void> {
  await page.goto('/signup');
  await page.getByLabel('Birth month').selectOption('5');
  await page.getByLabel('Birth year').selectOption(options.birthYear ?? '2000');
  if (options.teacher) await page.getByLabel("I'm a teacher").check();
  await page.getByLabel('Name').fill(user.name);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/home/);
}

export async function logIn(page: Page, user: Pick<TestUser, 'email' | 'password'>): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/home/);
}

export async function logOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/$/);
}

interface OutboxMessage {
  to: string;
  subject: string;
  text: string;
}

/** Waits for the newest email written to the development outbox for an address. */
export async function latestEmail(to: string, subjectIncludes?: string): Promise<OutboxMessage> {
  let found: OutboxMessage | undefined;
  await expect
    .poll(
      () => {
        let files: string[] = [];
        try {
          files = readdirSync(OUTBOX).sort().reverse();
        } catch {
          return false;
        }
        for (const file of files) {
          const message = JSON.parse(readFileSync(path.join(OUTBOX, file), 'utf8')) as OutboxMessage;
          if (message.to === to && (!subjectIncludes || message.subject.includes(subjectIncludes))) {
            found = message;
            return true;
          }
        }
        return false;
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  return found!;
}

/** The first link in an email, as a path on the app under test. */
export function linkFrom(message: OutboxMessage): string {
  const match = /https?:\/\/[^\s]+/.exec(message.text);
  if (!match) throw new Error(`no link in email "${message.subject}"`);
  const url = new URL(match[0]);
  return `${url.pathname}${url.search}`;
}

export const DEMO = {
  student: { email: 'demo@tessera.test', password: 'tessera-demo' },
  teacher: { email: 'teacher@tessera.test', password: 'tessera-demo' },
  premium: { email: 'premium@tessera.test', password: 'tessera-demo' },
};

export interface CardSeed {
  term: string;
  definition: string;
}

export function makeCards(count: number, prefix = ''): CardSeed[] {
  return Array.from({ length: count }, (_, i) => ({ term: `${prefix}term ${i + 1}`, definition: `${prefix}definition ${i + 1}` }));
}

/** Creates a set through the API as the signed-in user of `page`. Returns its id. */
export async function createSet(
  page: Page,
  options: { title?: string; cards?: CardSeed[]; visibility?: 'private' | 'unlisted' | 'public'; subject?: string } = {},
): Promise<string> {
  const response = await page.request.post('/api/sets', {
    data: {
      title: options.title ?? 'Test set',
      description: '',
      subject: options.subject ?? 'science',
      termLang: 'en',
      definitionLang: 'en',
      visibility: options.visibility ?? 'private',
      cards: options.cards ?? makeCards(6),
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

/** Tab-separated rows, as a spreadsheet puts them on the clipboard. */
export function spreadsheetRows(cards: CardSeed[]): string {
  return cards.map((c) => `${c.term}\t${c.definition}`).join('\n');
}

/** Fails if the page can be scrolled sideways: content is wider than the screen. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const viewport = page.viewportSize()!.width;
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width, `page is ${width}px wide on a ${viewport}px screen`).toBeLessThanOrEqual(viewport);
}

export interface LearnAnswer {
  /** The card's term (found from whichever side was shown). */
  term: string;
  kind: 'mc' | 'tf' | 'written';
  correct: boolean;
}

/**
 * Answers the Learn question on screen. `decide` says whether to answer this
 * card correctly; the helper then gives a right or wrong answer for whatever
 * kind of question it is.
 */
export async function answerLearnQuestion(
  page: Page,
  cards: CardSeed[],
  decide: (term: string, kind: LearnAnswer['kind']) => boolean = () => true,
  /** Press Continue after the feedback appears. */
  advance = true,
): Promise<LearnAnswer> {
  const prompt = (await page.locator('#learn-prompt').innerText()).trim();
  const card = cards.find((c) => c.term === prompt || c.definition === prompt);
  if (!card) throw new Error(`no card matches the prompt "${prompt}"`);
  const expected = card.term === prompt ? card.definition : card.term;
  const other = cards.find((c) => c !== card)!;

  let kind: LearnAnswer['kind'];
  let correct: boolean;
  const input = page.getByRole('textbox', { name: /^Type the/ });
  if (await input.count()) {
    kind = 'written';
    correct = decide(card.term, kind);
    await input.fill(correct ? expected : 'definitely not this');
    await input.press('Enter');
  } else if (await page.getByRole('button', { name: 'True', exact: true }).count()) {
    kind = 'tf';
    correct = decide(card.term, kind);
    const shown = (await page.locator('#learn-statement').innerText()).trim();
    const truth = shown === expected;
    await page.getByRole('button', { name: truth === correct ? 'True' : 'False', exact: true }).click();
  } else {
    kind = 'mc';
    correct = decide(card.term, kind);
    // Options are found by accessible name, which is the answer text alone.
    const group = page.getByRole('group', { name: /^Choose the matching/ });
    if (correct) {
      await group.getByRole('button', { name: expected, exact: true }).click();
    } else {
      const wrong = card.term === prompt ? other.definition : other.term;
      const preferred = group.getByRole('button', { name: wrong, exact: true });
      if (await preferred.count()) await preferred.click();
      else await group.getByRole('button').filter({ hasNot: page.getByText(expected, { exact: true }) }).first().click();
    }
  }
  if (advance) await page.getByRole('button', { name: 'Continue' }).click();
  return { term: card.term, kind, correct };
}

/** Plays Learn until the completion screen, passing checkpoints on the way. */
export async function playLearn(
  page: Page,
  cards: CardSeed[],
  decide: (term: string, kind: LearnAnswer['kind'], askedBefore: number) => boolean = () => true,
): Promise<LearnAnswer[]> {
  const log: LearnAnswer[] = [];
  const asked = new Map<string, number>();
  for (let i = 0; i < 400; i++) {
    const state = await Promise.race([
      page.getByRole('heading', { name: 'Set complete!' }).waitFor().then(() => 'done' as const),
      page.getByRole('heading', { name: 'Checkpoint' }).waitFor().then(() => 'checkpoint' as const),
      page.locator('#learn-prompt').waitFor().then(() => 'question' as const),
    ]);
    if (state === 'done') return log;
    if (state === 'checkpoint') {
      await page.getByRole('button', { name: 'Keep going' }).click();
      continue;
    }
    const answer = await answerLearnQuestion(page, cards, (term, kind) => decide(term, kind, asked.get(term) ?? 0));
    asked.set(answer.term, (asked.get(answer.term) ?? 0) + 1);
    log.push(answer);
  }
  throw new Error('Learn did not finish');
}

export const VOCAB: CardSeed[] = [
  { term: 'hola', definition: 'hello' },
  { term: 'adiós', definition: 'goodbye' },
  { term: 'gracias', definition: 'thank you' },
  { term: 'perro', definition: 'dog' },
  { term: 'gato', definition: 'cat' },
  { term: 'casa', definition: 'house' },
];

/** Waits until everything recorded while studying has reached the server. */
export async function waitForSync(page: Page, setId: string, predicate: (set: any) => boolean): Promise<any> {
  let latest: any;
  await expect
    .poll(
      async () => {
        latest = await (await page.request.get(`/api/sets/${setId}`)).json();
        return predicate(latest);
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  return latest;
}
