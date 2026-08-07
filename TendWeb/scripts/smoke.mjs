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

// -- Onboarding --------------------------------------------------------------
await step('onboarding renders', async () => {
  await page.getByRole('button', { name: 'Show me' }).click()
  await page.getByRole('button', { name: 'Set up our household' }).click()
})

await step('household created', async () => {
  await page.getByLabel('Household name').fill('The Test House')
  await page.getByPlaceholder('Your name').fill('Sam')
  await page.getByPlaceholder('Someone else').fill('Alex')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForSelector('.tabbar')
})

// -- Quick add ---------------------------------------------------------------
await step('quick add parses a recurring event', async () => {
  await page.getByRole('button', { name: 'Quick add' }).click()
  await page.getByLabel('What would you like to add?').fill('soccer practice every Tue 5pm at Lincoln Park')
  const interpretation = page.locator('.interpretation')
  await interpretation.waitFor()
  const chips = await interpretation.locator('.chip').allInnerTexts()
  if (!chips.some((c) => c.includes('Every week'))) throw new Error(`no recurrence chip: ${chips}`)
  if (!chips.some((c) => c.includes('Lincoln Park'))) throw new Error(`no location chip: ${chips}`)
  await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click()
})

await step('event lands on the calendar', async () => {
  await page.getByRole('button', { name: 'Calendar' }).click()
  // The first occurrence is the coming Tuesday, which may fall outside the
  // current week — Upcoming looks three months ahead.
  await page.getByRole('tab', { name: 'List' }).click()
  await page.getByText('soccer practice').first().waitFor()
})

// -- Recurring edit scope ----------------------------------------------------
await step('editing a repeating event asks for scope', async () => {
  await page.getByText('soccer practice').first().click()
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByText('This is a repeating event').waitFor()
  await page.getByRole('button', { name: 'This event only' }).click()
})

// -- Lists -------------------------------------------------------------------
await step('list add keeps focus for a second item', async () => {
  await page.getByRole('button', { name: 'Lists' }).click()
  const field = page.getByLabel('Add to Groceries')
  await field.fill('oat milk')
  await field.press('Enter')
  // The field must still be focused, or "add six things" is six round trips.
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  if (focused !== 'Add to Groceries') throw new Error(`focus lost, active = ${focused}`)
  await page.keyboard.type('2 dozen eggs')
  await page.keyboard.press('Enter')
})

await step('quantity is split out and aisles group', async () => {
  await page.getByText('eggs', { exact: true }).waitFor()
  await page.locator('.aisle h2', { hasText: 'Dairy & Eggs' }).waitFor()
})

await step('checking off moves the item to Done', async () => {
  await page.getByRole('button', { name: /oat milk\. Still needed/ }).click()
  await page.locator('.aisle h2', { hasText: 'Done' }).waitFor()
})

// -- Load view ---------------------------------------------------------------
await step('load view reflects the check-off and keeps its caveat', async () => {
  await page.getByRole('button', { name: 'Pulse' }).click()
  await page.locator('.load-card').click()
  await page.getByText('The shape of the week').waitFor()
  const caveat = await page.locator('.caveat').innerText()
  if (!caveat.startsWith('This is only what Tend can see')) throw new Error(`caveat missing: ${caveat}`)
  const names = await page.locator('.load-bar-head span:first-child').allInnerTexts()
  if (names[0] !== 'Sam') throw new Error(`household order lost: ${names}`)
})

// -- Tasks and meals ---------------------------------------------------------
await step('tasks and meals render their empty states', async () => {
  await page.getByRole('button', { name: 'Back' }).click()
  await page.getByRole('button', { name: 'Tasks' }).click()
  await page.getByText('No open tasks').waitFor()
  await page.getByRole('button', { name: 'Meals' }).click()
  await page.locator('.day-card').first().waitFor()
})

// -- Persistence -------------------------------------------------------------
await step('data survives a reload', async () => {
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Lists' }).click()
  await page.getByText('eggs', { exact: true }).waitFor()
})

await page.screenshot({ path: process.env.SHOT ?? 'shot.png', fullPage: false })
await browser.close()

if (errors.length) {
  console.error('\nBrowser errors:\n' + errors.join('\n'))
  process.exit(1)
}
console.log('\nAll smoke steps passed.')
