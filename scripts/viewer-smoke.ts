// Drive the in-app report viewer in a real browser: sign in, go to Reports ›
// Built, open the first build, and check the four things that matter — the
// panel is there, the sidebar is still visible beside it, the pages actually
// rendered, and Close puts the list back. Screenshots the open state at
// desktop and phone widths. Read-only: it opens and closes a report and
// touches nothing else.
//
//   node --env-file=.env.local --import tsx scripts/viewer-smoke.ts --out scratch/viewer

import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Page } from 'puppeteer-core'
import { withBrowser } from '../lib/render/chromium'

const args = process.argv.slice(2)
const flag = (name: string, dflt: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}
const out = flag('out', 'scratch/viewer')
const base = flag('base', process.env.RENDER_BASE_URL ?? 'http://localhost:3000')
const email = process.env.SHOT_EMAIL ?? ''
// The Sealand evaluation account's password lives in .env.local, like the
// demo one the export smoke falls back to.
const password = process.env.SHOT_PASSWORD ?? process.env.SEALAND_LOGIN_PASSWORD ?? ''

const DIALOG = '[role="dialog"][aria-label="Report viewer"]'

async function login(page: Page) {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle0' })
  await page.type('input[name="email"]', email)
  await page.type('input[name="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForFunction(() => location.pathname.startsWith('/dashboard'), { timeout: 60000 })
}

/** The first row under Built, opened. Returns what the panel is showing. */
async function openFirstBuild(page: Page) {
  await page.goto(`${base}/dashboard/reports?group=built`, { waitUntil: 'networkidle0' })
  const row = await page.$('#reports-list li a')
  if (!row) throw new Error('no build rows under Built')
  const title = await page.$eval('#reports-list li a p', (el) => el.textContent?.trim() ?? '')
  await row.click()
  await page.waitForSelector(DIALOG, { timeout: 60000 })
  // The deck is scaled by a client component; wait for it to have measured.
  await page.waitForFunction((sel) => (document.querySelector(sel)?.querySelectorAll('.vb-slide').length ?? 0) > 0, { timeout: 60000 }, DIALOG)
  return title
}

async function main() {
  if (!email || !password) throw new Error('set SHOT_EMAIL and SHOT_PASSWORD')
  mkdirSync(out, { recursive: true })
  await withBrowser(async (page) => {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
    await login(page)

    const title = await openFirstBuild(page)
    const seen = await page.evaluate((sel) => {
      const dialog = document.querySelector(sel) as HTMLElement | null
      const sidebar = document.querySelector('[data-sidebar="sidebar"]') as HTMLElement | null
      const sb = sidebar?.getBoundingClientRect()
      const d = dialog?.getBoundingClientRect()
      const backdrop = document.querySelector('a[aria-label="Close the report"]') as HTMLElement | null
      const bd = backdrop?.getBoundingClientRect()
      // Is the sidebar's own middle the top element there, or is something over it?
      const at = sb ? document.elementFromPoint(sb.left + sb.width / 2, sb.top + sb.height / 2) : null
      return {
        dialog: !!dialog,
        slides: dialog?.querySelectorAll('.vb-slide').length ?? 0,
        sidebarVisible: !!sb && sb.width > 0 && sb.right > 0,
        sidebarWidth: sb ? Math.round(sb.width) : 0,
        sidebarClickable: !!at && !!sidebar?.contains(at),
        panel: d ? { top: Math.round(d.top), left: Math.round(d.left), right: Math.round(window.innerWidth - d.right), bottom: Math.round(window.innerHeight - d.bottom) } : null,
        backdropLeft: bd ? Math.round(bd.left) : null,
      }
    }, DIALOG)
    console.log(`build: ${title}`)
    console.log(JSON.stringify(seen, null, 2))
    if (!seen.dialog) throw new Error('no viewer panel')
    if (seen.slides < 1) throw new Error('no pages rendered in the viewer')
    if (!seen.sidebarVisible) throw new Error('the sidebar is not visible beside the panel')
    if (!seen.sidebarClickable) throw new Error('something is covering the sidebar')

    writeFileSync(join(out, 'viewer-1440.png'), await page.screenshot({ type: 'png' }))

    // Escape closes it too — the enhancement over the Links.
    await page.keyboard.press('Escape')
    await page.waitForFunction((sel) => !document.querySelector(sel), { timeout: 30000 }, DIALOG)
    console.log('escape closed the panel')

    // Close puts the list back.
    await openFirstBuild(page)
    let closed = false
    for (const link of await page.$$(`${DIALOG} a`)) {
      if ((await link.evaluate((el) => el.textContent?.trim())) === 'Close') { await link.click(); closed = true; break }
    }
    if (!closed) throw new Error('no Close link on the panel')
    await page.waitForFunction((sel) => !document.querySelector(sel), { timeout: 30000 }, DIALOG)
    const closedTo = await page.evaluate(() => location.search)
    if (closedTo.includes('view=')) throw new Error(`Close left view= in the URL: ${closedTo}`)
    console.log(`closed to: ${closedTo}`)

    // The Studio's own Open links, when this workspace has a build made there
    // (a build made on the command line has no report and is not listed).
    await page.goto(`${base}/dashboard/studio`, { waitUntil: 'networkidle0' })
    const studioOpen = await page.$$('a[href*="view="]')
    console.log(`studio: ${studioOpen.length} Open link(s)`)
    if (studioOpen.length) {
      await studioOpen[0].click()
      await page.waitForSelector(DIALOG, { timeout: 60000 })
      console.log('studio: the panel opened')
    }

    // The phone: full bleed with a small inset, sidebar off canvas.
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
    await openFirstBuild(page)
    writeFileSync(join(out, 'viewer-390.png'), await page.screenshot({ type: 'png' }))
    console.log(`wrote ${join(out, 'viewer-1440.png')} and ${join(out, 'viewer-390.png')}`)
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
