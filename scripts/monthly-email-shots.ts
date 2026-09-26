// "September in your market" (market-first WP2.1): the monthly email,
// rendered from its offline fixtures through the send path's own renderer
// (`renderMonthlyEmail`), written as HTML and screenshotted at a phone's width
// and the email column's, to put beside the approved preview's artboard
// (MonthlyReport.dc.html, "What we send").
//
//   node --import tsx scripts/monthly-email-shots.ts --out <dir> [--widths 600,390]
//
// OFFLINE: no database, no dev server, no model. The fixtures are Sealand's
// September on production's 24 Sep figures read as September ended (and
// Össur's staging September), `components/blocks/monthly/fixture.ts`.
// Chromium is the one `lib/render/chromium.ts` launches for the PDFs.

import { mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { withBrowser } from '../lib/render/chromium'
import { renderMonthlyEmail } from '../lib/email/monthly'
import { MONTHLY_BLOCK_KEYS, monthlyStamp, monthlyTitle } from '../lib/reports/monthly'
import { MONTHLY_SNAPSHOT_VERSION, type MonthlySnapshotData } from '../lib/reports/monthly-build'
import type { MonthlyData } from '../lib/pages/monthly'
import { filledSlotsFixture, monthlyFixture, ossurMonthlyFixture } from '../components/blocks/monthly/fixture'

const args = process.argv.slice(2)
const flag = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const out = flag('out', 'scratch/monthly-email-shots')
const widths = flag('widths', '600,390').split(',').map(Number).filter((w) => w > 0)
const APP = 'https://app.verbatimintel.com'

const snapshot = (reading: MonthlyData): MonthlySnapshotData => ({
  version: MONTHLY_SNAPSHOT_VERSION,
  kind: 'monthly',
  company: reading.brand,
  title: monthlyTitle(reading.month),
  period: monthlyStamp(reading.month, reading.readTo),
  readingAt: reading.readingAt,
  month: reading.month,
  monthStatus: reading.monthStatus,
  keys: [...MONTHLY_BLOCK_KEYS],
  reading,
  figures: {},
  subject: reading.subject,
})

const STATES: { key: string; data: () => MonthlySnapshotData }[] = [
  // What ships at deploy 3 if no slot package lands: the four slots absent.
  { key: 'sealand-skeleton', data: () => snapshot(monthlyFixture()) },
  // Every slot filled (the first-cut filled arms; arrivals and change marked
  // HYPOTHETICAL in the fixture).
  { key: 'sealand-filled', data: () => snapshot(filledSlotsFixture()) },
  { key: 'ossur-skeleton', data: () => snapshot(ossurMonthlyFixture()) },
]

async function main() {
  mkdirSync(out, { recursive: true })
  for (const s of STATES) {
    const email = renderMonthlyEmail({ data: s.data(), shareUrl: `${APP}/r/tok`, appUrl: APP, attached: true })
    writeFileSync(join(out, `${s.key}.html`), email.html)
    writeFileSync(join(out, `${s.key}.txt`), `Subject: ${email.subject}\n\n${email.text}\n`)
  }
  await withBrowser(async (page) => {
    for (const width of widths) {
      await page.setViewport({ width, height: 1200, deviceScaleFactor: 1 })
      for (const s of STATES) {
        await page.goto(`file://${resolve(out, `${s.key}.html`)}`, { waitUntil: 'networkidle0' })
        const name = `${s.key}-${width}`
        writeFileSync(join(out, `${name}.png`), await page.screenshot({ fullPage: true, type: 'png' }))
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        const height = await page.evaluate(() => document.documentElement.scrollHeight)
        console.log(`${name}.png · ${width}×${height} · horizontal overflow ${over}px`)
      }
    }
  })
}

main().catch((e) => { console.error(e); process.exit(1) })
