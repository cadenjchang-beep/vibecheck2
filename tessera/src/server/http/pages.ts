import { sql } from 'drizzle-orm';
import type { Hono } from 'hono';
import type { SetDetail } from '@shared/api';
import { APP_NAME, SUBJECTS } from '@shared/constants';
import { auth } from '../auth';
import { db } from '../db/client';
import { env } from '../env';
import { getSetDetail } from '../services/sets';
import { toViewer, type AppEnv, type Ctx, type Viewer } from './context';
import { HttpError } from './errors';

/**
 * Server-side rendering for the pages that have to make sense without
 * JavaScript: public set pages (for search engines and link previews), plus
 * robots.txt and the sitemap. Everything else is the client-side app.
 */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** JSON that is safe to place inside a <script> data block. */
const safeJson = (value: unknown) =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

const HEAD_BLOCK = /<!--app-head-->[\s\S]*?<!--\/app-head-->/;
const BODY_SLOT = '<!--app-html-->';
const NOINDEX = '<meta name="robots" content="noindex" />';

function withHead(indexHtml: string, head: string, body = ''): string {
  return indexHtml.replace(HEAD_BLOCK, head).replace(BODY_SLOT, body);
}

function setDescription(set: SetDetail): string {
  if (set.description.trim()) return truncate(set.description.replace(/\s+/g, ' ').trim(), 180);
  const terms = set.cards
    .slice(0, 8)
    .map((c) => c.termPlain.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(', ');
  return truncate(`Study ${set.cardCount} terms with flashcards, practice tests and spaced repetition: ${terms}`, 180);
}

function renderSetPage(indexHtml: string, set: SetDetail, includePreload: boolean): string {
  const url = `${env.appUrl}/sets/${set.id}`;
  const title = `${set.title} · ${APP_NAME}`;
  const description = setDescription(set);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LearningResource',
    name: set.title,
    description,
    url,
    learningResourceType: 'Flashcards',
    inLanguage: [...new Set([set.termLang, set.definitionLang])],
    author: { '@type': 'Person', name: set.owner.name },
    dateModified: set.updatedAt,
  };
  const head = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    // A link-only set must work for people who have the link, and stay out of search.
    set.visibility === 'unlisted' ? NOINDEX : '',
    `<meta property="og:site_name" content="${APP_NAME}" />`,
    '<meta property="og:type" content="article" />',
    `<meta property="og:title" content="${esc(set.title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(env.appUrl)}/og-image.png" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<script type="application/ld+json">${safeJson(jsonLd)}</script>`,
    includePreload ? `<script type="application/json" id="__preload">${safeJson({ set })}</script>` : '',
  ]
    .filter(Boolean)
    .join('\n    ');

  // Readable content for crawlers and for the moment before the app starts.
  const rows = set.cards
    .slice(0, 200)
    .map((c) => `<dt>${esc(c.termPlain)}</dt><dd>${esc(c.definitionPlain)}</dd>`)
    .join('');
  const body = `<main class="prerender"><h1>${esc(set.title)}</h1>${
    set.description ? `<p>${esc(set.description)}</p>` : ''
  }<p>${set.cardCount} terms · ${esc(set.owner.name)}</p><dl>${rows}</dl></main>`;

  return withHead(indexHtml, head, body);
}

async function viewerFrom(c: Ctx): Promise<Viewer | null> {
  const cookie = c.req.header('cookie');
  if (!cookie || !cookie.includes('tessera')) return null;
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return null;
  const viewer = toViewer(session.user);
  return viewer.onboarded && viewer.consentStatus !== 'pending' ? viewer : null;
}

const SET_PATH = /^\/sets\/([A-Za-z0-9_-]{8,40})\/?$/;

/** Returns the HTML for a client-side route, with set pages rendered on the server. */
export async function renderPage(c: Ctx, indexHtml: string): Promise<{ html: string; status: 200 | 404 }> {
  const match = SET_PATH.exec(c.req.path);
  if (!match || match[1] === 'new') return { html: indexHtml, status: 200 };

  const viewer = await viewerFrom(c);
  try {
    const set = await getSetDetail(viewer, match[1]!, { touch: false });
    if (set.visibility === 'private') {
      // Reached by its owner or a class member: nothing about it goes in the HTML.
      return { html: withHead(indexHtml, `<title>${APP_NAME}</title>\n    ${NOINDEX}`), status: 200 };
    }
    return { html: renderSetPage(indexHtml, set, viewer === null), status: 200 };
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      return { html: withHead(indexHtml, `<title>Not found · ${APP_NAME}</title>\n    ${NOINDEX}`), status: 404 };
    }
    throw err;
  }
}

const PRIVATE_PATHS = [
  '/api/',
  '/home',
  '/library',
  '/review',
  '/stats',
  '/folders',
  '/classes',
  '/settings',
  '/upgrade',
  '/billing',
  '/welcome',
  '/waiting',
  '/consent/',
  '/reset-password',
  '/join/',
];

export function mountSeoRoutes(app: Hono<AppEnv>): void {
  app.get('/robots.txt', (c) => {
    const lines = env.indexable
      ? ['User-agent: *', 'Allow: /', ...PRIVATE_PATHS.map((p) => `Disallow: ${p}`), `Sitemap: ${env.appUrl}/sitemap.xml`]
      : ['User-agent: *', 'Disallow: /'];
    c.header('cache-control', 'public, max-age=3600');
    return c.text(`${lines.join('\n')}\n`);
  });

  app.get('/sitemap.xml', async (c) => {
    if (!env.indexable) return c.text('Not found', 404);
    const result = await db.execute<{ id: string; updated_at: Date }>(sql`
      select id, updated_at from sets
      where visibility = 'public' and deleted_at is null and card_count > 0
      order by updated_at desc
      limit 5000
    `);
    const entry = (loc: string, lastmod?: Date) =>
      `<url><loc>${esc(loc)}</loc>${lastmod ? `<lastmod>${new Date(lastmod).toISOString()}</lastmod>` : ''}</url>`;
    const urls = [
      entry(`${env.appUrl}/`),
      entry(`${env.appUrl}/browse`),
      ...SUBJECTS.map((s) => entry(`${env.appUrl}/browse/${s}`)),
      ...result.rows.map((row) => entry(`${env.appUrl}/sets/${row.id}`, row.updated_at)),
    ];
    c.header('content-type', 'application/xml; charset=utf-8');
    c.header('cache-control', 'public, max-age=3600');
    return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>\n`);
  });
}
