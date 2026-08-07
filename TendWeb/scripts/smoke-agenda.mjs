import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:4173'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 420, height: 900 } })

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`)
})

const step = async (name, fn) => {
  await fn()
  console.log(`  ok  ${name}`)
}

await page.goto(BASE, { waitUntil: 'networkidle' })

await step('onboarding with three household members', async () => {
  await page.getByRole('button', { name: 'Show me' }).click()
  await page.getByRole('button', { name: 'Set up our household' }).click()
  await page.getByLabel('Household name').fill('The Test House')
  await page.getByPlaceholder('Your name').fill('Sam')
  await page.getByPlaceholder('Someone else').fill('Alex')
  await page.getByRole('button', { name: 'Add another' }).click()
  await page.locator('.member-fields input').nth(2).fill('Mika')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForSelector('.tabbar')
})

const add = async (text) => {
  await page.getByRole('button', { name: 'Quick add' }).click()
  await page.getByLabel('What would you like to add?').fill(text)
  await page.locator('.interpretation').waitFor()
  await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click()
}

await step('seed a few events across different days and people', async () => {
  await add('dentist thursday 9:30am @sam')
  await add('soccer practice every Tue 5pm at Lincoln Park @alex')
  await add('parent teacher night next friday 6pm @mika')
})

await step('agenda (List) shows every event grouped by day', async () => {
  await page.getByRole('button', { name: 'Calendar' }).click()
  await page.getByRole('tab', { name: 'List' }).click()
  await page.locator('.date-group-head').first().waitFor()
  const groupCount = await page.locator('.date-group').count()
  if (groupCount < 2) throw new Error(`expected multiple date groups, got ${groupCount}`)
  await page.getByText('dentist').first().waitFor()
  await page.getByText('soccer practice').first().waitFor()
})

await step('search narrows the list and clear restores it', async () => {
  const before = await page.locator('.event-row').count()
  await page.getByLabel('Search events').fill('dentist')
  await page.waitForFunction(
    (n) => document.querySelectorAll('.event-row').length < n,
    before,
  )
  const matched = await page.locator('.event-row').count()
  if (matched !== 1) throw new Error(`expected exactly 1 match for "dentist", got ${matched}`)
  await page.getByRole('button', { name: 'Clear search' }).click()
  await page.waitForFunction(
    (n) => document.querySelectorAll('.event-row').length === n,
    before,
  )
})

await step('member filter narrows to one person', async () => {
  await page.locator('.member-chip', { hasText: 'Sam' }).click()
  await page.getByText('dentist').first().waitFor()
  const soccerVisible = await page.getByText('soccer practice').count()
  if (soccerVisible !== 0) throw new Error('member filter did not hide Alex’s event')
  await page.locator('.member-chip', { hasText: 'Everyone' }).click()
  await page.getByText('soccer practice').first().waitFor()
})

await step('a search with no matches shows the empty state and clears cleanly', async () => {
  await page.getByLabel('Search events').fill('zzz-nothing-matches-zzz')
  await page.getByText('No matching events').waitFor()
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await page.getByText('dentist').first().waitFor()
})

await step('opening an agenda row opens the real event editor', async () => {
  await page.getByText('dentist').first().click()
  await page.getByRole('dialog', { name: 'Event' }).getByText('Edit event').waitFor()
  await page.getByRole('button', { name: 'Cancel' }).click()
})

await step('past events toggle reveals the "Jump to today" affordance when relevant', async () => {
  // With nothing seeded in the past, the toggle should still work without
  // throwing, even if there is nothing to jump past.
  await page.getByRole('button', { name: 'Show past events' }).click()
  await page.getByRole('button', { name: 'Hide past events' }).waitFor()
})

await page.screenshot({ path: process.env.SHOT ?? 'agenda-shot.png', fullPage: false })
await browser.close()

if (errors.length) {
  console.error('\nBrowser errors:\n' + errors.join('\n'))
  process.exit(1)
}
console.log('\nAll agenda smoke steps passed.')
