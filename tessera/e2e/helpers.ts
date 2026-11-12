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
