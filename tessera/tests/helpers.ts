import { eq } from 'drizzle-orm';
import { createApp } from '@server/app';
import { auth } from '@server/auth';
import { db } from '@server/db/client';
import { users } from '@server/db/schema';

export const app = createApp();

let counter = 0;

export interface TestClient {
  id: string;
  email: string;
  name: string;
  cookie: string;
  /** Sends a request as this user. `body` is JSON-encoded. */
  request: (method: string, path: string, body?: unknown) => Promise<Response>;
  get: <T = any>(path: string) => Promise<T>;
  post: <T = any>(path: string, body?: unknown) => Promise<T>;
  put: <T = any>(path: string, body?: unknown) => Promise<T>;
}

interface UserOptions {
  name?: string;
  role?: 'student' | 'teacher';
  plan?: 'free' | 'premium';
  verified?: boolean;
  onboarded?: boolean;
  /** Birth year; a recent one makes the account under 13. */
  birthYear?: number;
  consentStatus?: 'not_required' | 'pending' | 'granted';
}

function makeClient(id: string, email: string, name: string, cookie: string): TestClient {
  const request = async (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const json = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await request(method, path, body);
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  };
  return {
    id,
    email,
    name,
    cookie,
    request,
    get: (path) => json('GET', path),
    post: (path, body) => json('POST', path, body ?? {}),
    put: (path, body) => json('PUT', path, body ?? {}),
  };
}

/** Registers a real account through the auth API and returns a signed-in client. */
export async function createUser(options: UserOptions = {}): Promise<TestClient> {
  counter += 1;
  const email = `u${Date.now().toString(36)}${counter}${Math.random().toString(36).slice(2, 7)}@example.test`;
  const name = options.name ?? `User ${counter}`;
  const { headers, response } = await auth.api.signUpEmail({
    body: { name, email, password: 'correct-horse-battery' },
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const onboarded = options.onboarded ?? true;
  await db
    .update(users)
    .set({
      emailVerified: options.verified ?? true,
      role: options.role ?? 'student',
      plan: options.plan ?? 'free',
      birthYear: options.birthYear ?? 1998,
      birthMonth: 6,
      consentStatus: options.consentStatus ?? 'not_required',
      onboardedAt: onboarded ? new Date() : null,
    })
    .where(eq(users.id, response.user.id));
  return makeClient(response.user.id, email, name, cookie);
}

/** A client with no session: a signed-out visitor. */
export const guest = {
  request: async (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
};

export function sampleSet(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Sample set',
    description: 'For tests',
    subject: 'science',
    termLang: 'en',
    definitionLang: 'en',
    visibility: 'private',
    cards: [
      { term: 'alpha', definition: 'first letter' },
      { term: 'beta', definition: 'second letter' },
      { term: 'gamma', definition: 'third letter' },
    ],
    ...overrides,
  };
}

export function cards(count: number): Array<{ term: string; definition: string }> {
  return Array.from({ length: count }, (_, i) => ({ term: `term ${i + 1}`, definition: `definition ${i + 1}` }));
}
