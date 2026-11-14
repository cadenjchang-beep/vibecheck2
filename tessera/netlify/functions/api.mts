// The Tessera server as a Netlify function: the JSON API, sign-in, public set
// pages (rendered with their title and preview image), robots.txt and the
// sitemap. Netlify's CDN serves the web app itself.
import { indexHtml } from '../lib/environment';
import type { Config, Context } from '@netlify/functions';
import { createApp } from '../../src/server/app';

const app = createApp({ client: { indexHtml, serveFiles: false } });

export default (request: Request, context: Context) => app.fetch(request, { context });

export const config: Config = {
  path: ['/api/*', '/sets/:id', '/robots.txt', '/sitemap.xml'],
  excludedPath: ['/sets/new'],
};
