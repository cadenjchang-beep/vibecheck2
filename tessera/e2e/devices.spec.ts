import { expect, test, type Browser, type Page } from '@playwright/test';
import { createSet, DEMO, makeCards, newUser, signUp } from './helpers';

/** Screen shapes the app is laid out for, from the smallest phone to a large monitor. */
const DEVICES = [
  { name: 'small phone', viewport: { width: 320, height: 568 }, touch: true },
  { name: 'phone', viewport: { width: 390, height: 844 }, touch: true },
  { name: 'phone landscape', viewport: { width: 844, height: 390 }, touch: true },
  { name: 'tablet', viewport: { width: 768, height: 1024 }, touch: true },
  { name: 'tablet landscape', viewport: { width: 1024, height: 768 }, touch: true },
  { name: 'large monitor', viewport: { width: 2560, height: 1440 }, touch: false },
];

async function open(browser: Browser, device: (typeof DEVICES)[number], storageState?: string) {
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch && device.viewport.width < 900, storageState });
  return context.newPage();
}

/** Text fields under 16px make iPhones zoom in when they are tapped. */
async function smallInputs(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select, [contenteditable="true"]')]
      .filter((el) => el.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => el.getAttribute('aria-label') ?? el.id),
  );
}

test.describe('every device', () => {
  let state: string;
  let setId: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await signUp(page, newUser('devices'));
    setId = await createSet(page, { title: 'Organelles', cards: makeCards(8) });
    state = `test-results/devices-state-${setId}.json`;
    await page.context().storageState({ path: state });
    await page.close();
  });

  for (const device of DEVICES) {
    test(`fits a ${device.name} (${device.viewport.width}×${device.viewport.height})`, async ({ browser }) => {
      for (const path of ['/home', `/sets/${setId}`, `/sets/${setId}/edit`, `/sets/${setId}/flashcards`, `/sets/${setId}/learn`, '/stats', '/settings']) {
        const page = await open(browser, device, state);
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
        if (device.touch) expect(await smallInputs(page), `${path}: inputs under 16px`).toEqual([]);
        await page.context().close();
      }
    });
  }

  test('a phone held sideways shows the card and its buttons without scrolling', async ({ browser }) => {
    const page = await open(browser, DEVICES[2]!, state);
    await page.goto(`/sets/${setId}/flashcards`);
    const card = page.locator('[aria-describedby="flip-hint"]');
    for (const target of [card, page.getByRole('button', { name: 'Know it' }), page.getByRole('button', { name: 'Still learning' })]) {
      await expect(target).toBeInViewport({ ratio: 1 });
    }
    await page.goto(`/sets/${setId}/learn`);
    await expect(page.locator('#learn-prompt')).toBeInViewport();
    await expect(page.getByRole('group', { name: /^Choose the matching/ }).or(page.getByRole('textbox', { name: /^Type the/ })).or(page.getByRole('button', { name: 'True', exact: true })).first()).toBeInViewport();
    await page.context().close();
  });

  test('controls are finger-sized on touch screens and compact with a mouse', async ({ browser }) => {
    const sizes = async (touch: boolean) => {
      const page = await open(browser, { name: '', viewport: { width: 390, height: 844 }, touch }, state);
      await page.goto(`/sets/${setId}/edit`);
      const box = await page.getByRole('button', { name: 'Delete card 1' }).boundingBox();
      await page.context().close();
      return box!;
    };
    const touch = await sizes(true);
    expect(Math.min(touch.width, touch.height)).toBeGreaterThanOrEqual(44);
    const mouse = await sizes(false);
    expect(mouse.height).toBeLessThan(44);
  });
});

test('the demo accounts are not offered outside previews', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Log in' }).or(page.getByLabel('Email'))).toBeVisible();
  await expect(page.getByText('Demo accounts')).toHaveCount(0);
  expect(DEMO.student.email).toContain('@');
});
