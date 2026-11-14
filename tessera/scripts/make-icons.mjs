// Renders the app icons and the Open Graph image from SVG with the bundled
// Chromium. Run after changing the mark: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const PRIMARY = '#811e5f';
const GOLD = '#c57800';
const PAPER = '#fbf9f5';

const tiles = (fill = PRIMARY, gold = GOLD) => `
  <rect x="2" y="2" width="12.5" height="12.5" rx="3.4" fill="${fill}"/>
  <rect x="2" y="17.5" width="12.5" height="12.5" rx="3.4" fill="${fill}" opacity=".55"/>
  <rect x="17.5" y="17.5" width="12.5" height="12.5" rx="3.4" fill="${fill}" opacity=".8"/>
  <rect x="18.2" y="1.2" width="12.5" height="12.5" rx="3.4" fill="${gold}" transform="rotate(9 24.45 7.45)"/>`;

/** The mark on a paper square; `inset` leaves the maskable safe zone free. */
const icon = (inset) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="100%" height="100%">
  <rect width="32" height="32" fill="${PAPER}"/>
  <g transform="translate(${16 - 16 * inset} ${16 - 16 * inset}) scale(${inset})">${tiles()}</g></svg>`;

const og = `<div style="width:1200px;height:630px;background:${PAPER};display:flex;align-items:center;gap:56px;padding:0 96px;box-sizing:border-box;font-family:system-ui,sans-serif">
  <svg viewBox="0 0 32 32" width="260" height="260">${tiles()}</svg>
  <div><div style="font-size:112px;font-weight:800;color:#1d1720;letter-spacing:-3px">Tessera</div>
  <div style="font-size:44px;color:#5b5160;margin-top:12px">Learn it piece by piece.</div></div></div>`;

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(html, size, file) {
  await page.setViewportSize(size);
  await page.setContent(`<html><body style="margin:0">${html}</body></html>`);
  await writeFile(file, await page.screenshot({ type: 'png' }));
}
for (const [name, px, inset] of [
  ['icon-192', 192, 0.8],
  ['icon-512', 512, 0.8],
  ['maskable-512', 512, 0.6],
  ['apple-touch-icon', 180, 0.72],
]) {
  await render(`<div style="width:${px}px;height:${px}px">${icon(inset)}</div>`, { width: px, height: px }, `public/icons/${name}.png`);
}
await render(og, { width: 1200, height: 630 }, 'public/og-image.png');
await browser.close();
console.log('icons written');
