import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createSet, newUser, signUp, VOCAB } from './helpers';

/** Runs axe against the page and returns a readable list of violations. */
async function audit(page: Page, label: string): Promise<string[]> {
  const results = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]['page'] }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const problems = results.violations.map(
    (v) => `${label}: [${v.impact}] ${v.id} — ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => `${n.target.join(' ')} ${n.html.slice(0, 160)}`).join('\n    ')}`,
  );
  return problems;
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`accessibility (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    test('public pages', async ({ page }) => {
      const problems: string[] = [];
      for (const path of ['/', '/login', '/signup', '/browse', '/privacy']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        problems.push(...(await audit(page, path)));
      }
      expect(problems, problems.join('\n')).toEqual([]);
    });

    test('signed-in pages and study modes', async ({ page }) => {
      await signUp(page, newUser('a11y'));
      const id = await createSet(page, { title: 'Accessible vocab', cards: VOCAB });
      const pages = [
        '/home',
        '/library',
        '/folders',
        '/classes',
        '/stats',
        '/review',
        '/settings',
        '/sets/new',
        `/sets/${id}`,
        `/sets/${id}/edit`,
        `/sets/${id}/flashcards`,
        `/sets/${id}/learn`,
        `/sets/${id}/test`,
        `/sets/${id}/match`,
        `/sets/${id}/listen`,
        '/search?q=vocab',
      ];
      const problems: string[] = [];
      for (const path of pages) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        problems.push(...(await audit(page, path)));
      }
      expect(problems, problems.join('\n')).toEqual([]);
    });
  });
}
