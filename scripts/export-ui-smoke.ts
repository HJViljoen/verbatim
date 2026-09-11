// Drive the export-in-place controls in a real browser: the page-bar menu, the
// hover-revealed tile control, what each offers, exactly what the page-level
// control POSTs to /api/export, and the Exported group on Reports. Dev-only
// (WP4, rewritten 2026-09-11 for the restored controls — the Stage 1 version
// drove the old hand-rolled popover).
//   node --env-file=.env.local --import tsx scripts/export-ui-smoke.ts --out scratch/wp4 --base http://localhost:3114 [--spend]
//
// It signs in as the demo tenant when that tenant exists in this database, and
// otherwise as the owner of --client (default Sealand). Neither the address
// nor the password is printed.
//
// It does NOT render anything by default: the one POST /api/export it makes is
// answered by the browser itself, so the body shape and the reader-facing
// states are checked without spending a render or putting a file in a real
// tenant's archive. --spend lets the call through — only run that against a
// tenant whose archive you are allowed to write to.

import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Page } from 'puppeteer-core'
import { withBrowser } from '../lib/render/chromium'
import { createAdminClient } from '../lib/supabase-admin'
import { DEMO_CLIENT_ID, EXPORT_DAILY_LIMIT } from '../lib/config'

const args = process.argv.slice(2)
const flag = (name: string, dflt: string) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : dflt }
const has = (name: string) => args.includes(`--${name}`)
const out = flag('out', 'scratch/wp4')
const base = flag('base', process.env.RENDER_BASE_URL ?? 'http://localhost:3000')
const company = flag('client', 'Sealand')

const checks: { name: string; ok: boolean; note?: string }[] = []
const check = (name: string, ok: boolean, note?: string) => { checks.push({ name, ok, note }); console.log(`${ok ? '✓' : '✗'} ${name}${note ? ` (${note})` : ''}`) }
const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms))
const menuText = (page: Page) => page.evaluate(() => document.querySelector('[data-slot="dropdown-menu-content"]')?.textContent ?? '')

/** Whose account to drive: the demo tenant when it is here, else a real one. */
async function resolveLogin(): Promise<{ email: string; password: string; demo: boolean }> {
  const admin = createAdminClient()
  const demoPassword = process.env.SHOT_PASSWORD ?? process.env.DEMO_PASSWORD ?? ''
  const { data: demoClient } = await admin.from('clients').select('id').eq('id', DEMO_CLIENT_ID).maybeSingle()
  if (demoClient && demoPassword) {
    return { email: process.env.SHOT_EMAIL ?? 'demo@verbatimintel.com', password: demoPassword, demo: true }
  }
  const password = process.env.SHOT_PASSWORD ?? process.env.SEALAND_LOGIN_PASSWORD ?? ''
  if (!password) throw new Error('no demo tenant in this database and no SEALAND_LOGIN_PASSWORD to fall back on')
  const { data: client } = await admin.from('clients').select('id').eq('company_name', company).maybeSingle()
  if (!client) throw new Error(`no tenant named ${company}`)
  const { data: owner } = await admin.from('users').select('id').eq('client_id', (client as { id: string }).id).eq('role', 'owner').maybeSingle()
  if (!owner) throw new Error(`${company} has no owner to sign in as`)
  const { data: authUser } = await admin.auth.admin.getUserById((owner as { id: string }).id)
  const address = authUser?.user?.email
  if (!address) throw new Error(`${company}'s owner has no address`)
  return { email: address, password, demo: false }
}

async function main() {
  const login = await resolveLogin()
  console.log(`signing in as the ${login.demo ? 'demo tenant' : `${company} owner`}; renders ${has('spend') ? 'WILL' : 'will not'} be spent`)
  mkdirSync(out, { recursive: true })

  await withBrowser(async (page) => {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })
    const shot = async (name: string) => writeFileSync(join(out, `${name}.png`), await page.screenshot({ type: 'png' }))
    const goto = (path: string) => page.goto(`${base}${path}`, { waitUntil: 'networkidle0', timeout: 120_000 })

    // The one request the controls make, answered here unless --spend.
    let posted: string | null = null
    await page.setRequestInterception(true)
    page.on('request', (r) => {
      if (r.method() !== 'POST' || !r.url().endsWith('/api/export')) return void r.continue()
      posted = r.postData() ?? ''
      if (has('spend')) return void r.continue()
      r.respond({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: `That is ${EXPORT_DAILY_LIMIT} exports today, which is the daily limit.` }) })
    })

    await goto('/login')
    await page.type('input[type="email"]', login.email)
    await page.type('input[type="password"]', login.password)
    // The login is a server action that redirects — a soft navigation, so wait
    // on the URL rather than on a document load.
    await page.click('button[type="submit"]')
    await page.waitForFunction(() => location.pathname.startsWith('/dashboard'), { timeout: 120_000 })
      .catch(async () => { throw new Error(`login did not land on /dashboard: ${(await page.evaluate(() => document.body.innerText)).slice(0, 200)}`) })

    // 1. The page bar's Export pill and its menu.
    await goto('/dashboard')
    const pill = await page.$('xpath/.//button[.//span[contains(., "Export")]]')
    check('the page bar has an Export control', Boolean(pill))
    if (!pill) throw new Error('no page Export button')
    await pill.click()
    await page.waitForSelector('[data-slot="dropdown-menu-content"]', { timeout: 10_000 })
    await settle()
    await shot('1-page-menu')
    const m = await menuText(page)
    check('the menu offers the page both ways', m.includes('This page') && m.includes('This page, everything'), m.slice(0, 80))
    check('the menu offers a tile as an image', m.includes('A tile as an image'))
    check('no "Add to a report" entry', !/Add to a report/i.test(m))

    // 2. "This page" → what the client actually asks the route for.
    const item = await page.$('xpath/.//div[@data-slot="dropdown-menu-item"][normalize-space(span[1])="This page"]')
    if (!item) throw new Error('no "This page" item')
    await item.click()
    await settle(600)
    await shot('2-after-click')
    const sent = posted ? (JSON.parse(posted) as Record<string, unknown>) : null
    check('it POSTs the page as a default-variant PDF', sent?.kind === 'page' && sent?.page === 'dashboard' && sent?.variant === 'default' && sent?.format === 'pdf', posted ?? 'no POST seen')
    check('it carries the page’s own params and names no tile', typeof sent?.params === 'object' && sent?.tileKey === undefined, posted ?? '')
    await page.waitForFunction(
      () => /is downloading|limit is reached|Couldn|Nothing to export/.test(document.querySelector('[data-slot="dropdown-menu-content"]')?.textContent ?? ''),
      { timeout: 180_000 },
    )
    await shot('3-answer')
    const answer = (await menuText(page)).trim()
    check(has('spend') ? 'the export came back' : 'the cap is reported in the reader’s words',
      has('spend') ? /is downloading/.test(answer) : answer.includes(`Today's export limit is reached (${EXPORT_DAILY_LIMIT}). Tomorrow it resets.`),
      answer.slice(0, 120))
    await page.keyboard.press('Escape')

    // 3. The tile control: invisible until the tile is hovered.
    await goto('/dashboard')
    const sel = '[data-tile] button[aria-label="Export this tile"]'
    const resting = await page.$eval(sel, (el) => getComputedStyle(el.parentElement as HTMLElement).opacity)
    check('the tile control is invisible at rest', resting === '0', `opacity ${resting}`)
    const tile = await page.$('[data-tile]:has(button[aria-label="Export this tile"])')
    await tile?.hover()
    await settle(400)
    if (tile) writeFileSync(join(out, '4-tile-hover.png'), await tile.screenshot({ type: 'png' }))
    await page.click(sel)
    await page.waitForSelector('[data-slot="dropdown-menu-content"]', { timeout: 10_000 })
    await settle()
    await shot('5-tile-menu')
    const tm = await menuText(page)
    check('the tile offers an image and a one-page PDF', tm.includes('Image') && tm.includes('One-page PDF'), tm.slice(0, 60))
    await page.keyboard.press('Escape')

    // 4. The controls never print themselves.
    const marked = await page.evaluate(() => ({
      pill: Boolean(document.querySelector('button[data-print-hide] span')),
      tiles: document.querySelectorAll('[data-tile] button[data-print-hide]').length,
    }))
    check('every control is marked print-hidden', marked.pill && marked.tiles > 0, `pill ${marked.pill}, ${marked.tiles} tile controls`)

    // 5. Where a file is found again: Reports › Exported.
    await goto('/dashboard/reports?group=exported')
    await settle(600)
    await shot('6-reports-exported')
    const text = await page.evaluate(() => document.body.innerText)
    check('Reports has an Exported group', text.includes('Exported'))
    check('the group says what it holds', /Nothing exported yet|a whole page|one tile|a question/.test(text),
      text.split('\n').find((l) => /Nothing exported yet|whole page|one tile/.test(l))?.slice(0, 90))
    check('no pipeline words on the page', !/\bsnapshot|\bartifact/i.test(text))
  })

  const bad = checks.filter((c) => !c.ok)
  console.log(`\n${checks.length - bad.length}/${checks.length} checks passed`)
  if (bad.length) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exit(1) })
