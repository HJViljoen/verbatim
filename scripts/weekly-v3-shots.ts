// The weekly read v3's shots, beside the H7 boards: the email at 640 and 390,
// the full read at 1040, the A4 paper page by page. OFFLINE: the three
// fixtures (lib/test/weekly-read-v3-fixture.ts), or a snapshot dump, rendered
// the way the send and the routes render them, then shot in local Chrome.
//
//   node --import tsx scripts/weekly-v3-shots.ts --out <dir> [--snapshot <data.json> --name <name>]
//
// Writes <name>-email-640.png, <name>-email-390.png, <name>-page-1040.png,
// <name>-print.pdf and <name>-print-<n>.png (pdftoppm), and, for the
// fixtures, each beside its board (<name>-*-beside.png). Needs Google Chrome
// (or CHROME_PATH) and pdftoppm (poppler) for the paper's PNGs.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { createElement } from 'react'

import { WeeklyReadPage } from '../components/email/weekly-read'
import { renderStaticHtml } from '../lib/email/render-html'
import { renderWeeklyReadEmail } from '../lib/email/weekly-read'
import { withBrowser } from '../lib/render/chromium'
import { isWeeklyReadData, type WeeklyReadSnapshotData } from '../lib/reports/weekly-read-build'
import { monthEndSnapshot, ossurSnapshot, sealandV3Snapshot } from '../lib/test/weekly-read-v3-fixture'

const args = process.argv.slice(2)
const flag = (n: string, d = ''): string => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const out = resolve(flag('out', 'scratch/weekly-v3-shots'))
const BOARDS = flag('boards', '/Users/heinrichviljoen/Documents/Heinrich/Verbatim-Design/depth-2026-10/design/shots6')
const APP = 'https://app.verbatimintel.com'
mkdirSync(out, { recursive: true })

const mark = `data:image/png;base64,${readFileSync(resolve('public/brand/verbatim-mark-ink.png')).toString('base64')}`
const markOnInk = `data:image/png;base64,${readFileSync(resolve('public/brand/verbatim-mark-yellow.png')).toString('base64')}`
const FONTS = '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:ital,wght@0,400;0,500;1,400;1,500&display=swap" rel="stylesheet">'

const issues: { name: string; data: WeeklyReadSnapshotData; boards: { email?: string; phone?: string; page?: string; print?: string } }[] = []
if (flag('snapshot')) {
  const raw = JSON.parse(readFileSync(resolve(flag('snapshot')), 'utf8')) as unknown
  const inner = raw && typeof raw === 'object' && 'data' in raw ? (raw as { data: unknown }).data : null
  const d = isWeeklyReadData(inner) ? inner : raw
  if (!isWeeklyReadData(d)) throw new Error('not a weekly read snapshot')
  issues.push({ name: flag('name', 'snapshot'), data: d, boards: {} })
} else {
  issues.push(
    { name: 'ossur', data: ossurSnapshot(), boards: { email: 'H7-Email-Weekly-Alt.png', phone: 'H7-Email-Weekly-Phone.png', page: 'H7-Weekly-Full.png', print: 'H7-Weekly-Full-Print.png' } },
    { name: 'sealand', data: sealandV3Snapshot(), boards: { email: 'H7-Email-Weekly-Sealand.png' } },
    { name: 'month-end', data: monthEndSnapshot(), boards: { email: 'H7-Email-Weekly-MonthEnd.png' } },
  )
}

const pageDoc = (data: WeeklyReadSnapshotData, print: boolean) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${FONTS}</head><body style="margin:0">${renderStaticHtml(createElement(WeeklyReadPage, { data, appUrl: APP, markSrc: mark, fill: !print, print }))}</body></html>`

const beside = (built: string, board: string, title: string, width: number) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#11110f;font-family:-apple-system,sans-serif}
.row{display:flex;gap:24px;padding:24px;align-items:flex-start}
figure{margin:0;flex:none;width:${width}px}
figcaption{color:#e8e6df;font-size:18px;padding:0 0 10px;font-weight:600}
img{display:block;width:${width}px;border:1px solid #3a382f}
h1{color:#e8e6df;font-size:22px;padding:24px 24px 0;margin:0}
</style></head><body><h1>${title}</h1><div class="row">
<figure><figcaption>the board</figcaption><img src="file://${board}"></figure>
<figure><figcaption>built, from its fixture</figcaption><img src="file://${built}"></figure>
</div></body></html>`

async function main() {
  await withBrowser(async (page) => {
    const shoot = async (html: string, file: string, width: number) => {
      const path = join(out, `${file}.html`)
      writeFileSync(path, html)
      await page.setViewport({ width, height: 900, deviceScaleFactor: 1 })
      await page.emulateMediaType('screen')
      await page.goto(`file://${path}`, { waitUntil: 'networkidle0' })
      await page.evaluate(() => document.fonts.ready)
      const png = join(out, `${file}.png`)
      await page.screenshot({ path: png as `${string}.png`, fullPage: true })
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth)
      console.log(`${file}.png  (${width} wide; scrollWidth ${scroll}${scroll > width ? ' OVERFLOWS' : ''})`)
      return png
    }
    for (const issue of issues) {
      const email = renderWeeklyReadEmail({ data: issue.data, appUrl: APP, markSrc: mark, markOnInkSrc: markOnInk, shareUrl: `${APP}/r/preview` }).html
      const e640 = await shoot(email, `${issue.name}-email-640`, 640)
      const e390 = await shoot(email, `${issue.name}-email-390`, 390)
      const p1040 = await shoot(pageDoc(issue.data, false), `${issue.name}-page-1040`, 1040)
      await shoot(pageDoc(issue.data, false), `${issue.name}-page-390`, 390)
      // The paper, as /render prints it: the page's own @page rule.
      const printHtml = join(out, `${issue.name}-print.html`)
      writeFileSync(printHtml, pageDoc(issue.data, true))
      await page.goto(`file://${printHtml}`, { waitUntil: 'networkidle0' })
      await page.evaluate(() => document.fonts.ready)
      const pdf = join(out, `${issue.name}-print.pdf`)
      writeFileSync(pdf, await page.pdf({ printBackground: true, preferCSSPageSize: true }))
      let pages: string[] = []
      try {
        execFileSync('pdftoppm', ['-r', '72', '-png', pdf, join(out, `${issue.name}-print`)])
        pages = readdirSync(out).filter((f) => f.startsWith(`${issue.name}-print-`) && f.endsWith('.png') && /-\d+\.png$/.test(f)).sort().map((f) => join(out, f))
        console.log(`${issue.name}-print-*.png (${pages.length} pages)`)
      } catch {
        console.log(`${issue.name}-print.pdf (pdftoppm not found: no PNGs)`)
      }
      // The paper's pages two to a row, beside the print board where there is one.
      if (pages.length > 0) {
        const grid = `<div style="display:grid;grid-template-columns:repeat(2,420px);gap:16px">${pages.map((pg) => `<img src="file://${pg}" style="width:420px;border:1px solid #3a382f;background:#fff">`).join('')}</div>`
        const board = issue.boards.print && existsSync(join(BOARDS, issue.boards.print)) ? `<figure style="margin:0"><figcaption style="color:#e8e6df;font:600 18px -apple-system;padding:0 0 10px">the board</figcaption><img src="file://${join(BOARDS, issue.boards.print)}" style="width:860px;border:1px solid #3a382f"></figure>` : ''
        await shoot(`<!doctype html><html><body style="margin:0;background:#11110f"><div style="display:flex;gap:24px;padding:24px;align-items:flex-start">${board}<figure style="margin:0"><figcaption style="color:#e8e6df;font:600 18px -apple-system;padding:0 0 10px">built, A4 pages</figcaption>${grid}</figure></div></body></html>`, `${issue.name}-print-beside`, board ? 1800 : 920)
      }
      const b = issue.boards
      const pair = async (built: string, board: string | undefined, tag: string, title: string, width: number) => {
        if (!board || !existsSync(join(BOARDS, board))) return
        await shoot(beside(built, join(BOARDS, board), title, width), `${issue.name}-${tag}-beside`, width * 2 + 72)
      }
      await pair(e640, b.email, 'email', `${issue.name}: the email at 640 beside ${b.email}`, 640)
      await pair(e390, b.phone, 'phone', `${issue.name}: the email at 390 beside ${b.phone}`, 390)
      await pair(p1040, b.page, 'page', `${issue.name}: the full read at 1040 beside ${b.page}`, 1040)
    }
  })
}

main().catch((e) => { console.error(e); process.exit(1) })
