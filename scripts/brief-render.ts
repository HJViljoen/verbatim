// Draw a stored monthly brief's deck locally, a PNG a page, and check that no
// page clips (lib/reports/briefs/deck.ts paginates by an estimate; this is
// the measurement it errs high against). No database and no model: the brief
// is a JSON file.
//
//   node --import tsx scripts/brief-render.ts --in <brief.json> --out <dir> [--built 2026-10-05]
//
// <brief.json> is a `MonthlyBriefData` (a `report_snapshots.data`, quotes as
// refs with no words: their panels draw nothing), or `{ data, texts }` where
// `texts` maps each quote ref to `{ text, english, lang }` (a dry build's
// words, kept local). Chrome is CHROME_PATH or the Mac's Google Chrome; the
// fonts come from Google Fonts. Exits 1 when any page clips.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import puppeteer from 'puppeteer-core'
import { createElement } from 'react'

const args = process.argv.slice(2)
const flag = (name: string, fallback = ''): string => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}

const FONTS = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:ital,wght@0,400;0,500;1,400&display=swap'

async function main() {
  const input = flag('in')
  const out = flag('out')
  if (!input || !out) {
    console.error('Usage: scripts/brief-render.ts --in <brief.json> --out <dir> [--built YYYY-MM-DD]')
    process.exit(2)
  }
  // Loaded at runtime: react-dom/server, as everywhere outside a test.
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { BriefDeck } = await import('../components/briefs/brief-deck')
  const { resolveQuotes } = await import('../lib/renderables/quotes-freeze')
  const { isMonthlyBriefData } = await import('../lib/reports/briefs/types')

  const raw = JSON.parse(readFileSync(resolve(process.cwd(), input), 'utf8')) as { data?: unknown; texts?: Record<string, unknown> }
  const data = isMonthlyBriefData(raw) ? raw : raw.data
  if (!isMonthlyBriefData(data)) throw new Error(`${input} is not a monthly brief`)
  const texts = new Map(Object.entries(raw.texts ?? {}).filter(([, v]) => v != null))
  const hydrated = resolveQuotes(data, texts as never)
  const built = `${flag('built', new Date().toISOString().slice(0, 10))}T08:00:00.000Z`
  const body = renderToStaticMarkup(createElement(BriefDeck, { data: hydrated, builtAt: built }))
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}"><style>:root{--font-plex-sans:'IBM Plex Sans';--font-plex-serif:'IBM Plex Serif';--font-plex-mono:'IBM Plex Mono';--font-wordmark:'Bricolage Grotesque'}body{margin:0;background:#E9EAEC;padding:24px}</style></head><body>${body}</body></html>`

  const dir = resolve(process.cwd(), out)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${data.role}.html`)
  writeFileSync(file, html)
  const executablePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--font-render-hinting=none'] })
  let clipped = 0
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1328, height: 800, deviceScaleFactor: 1 })
    await page.goto(`file://${file}`, { waitUntil: 'networkidle0' })
    await page.evaluate(() => document.fonts.ready)
    // Anything inside a page's body that reaches past it, down or across.
    const over = await page.evaluate(() => Array.from(document.querySelectorAll('[data-brief-page]')).map((el) => {
      const b = el.querySelector('[data-brief-body]') as HTMLElement | null
      if (!b) return 0
      const box = b.getBoundingClientRect()
      let worst = b.scrollHeight - b.clientHeight
      for (const c of Array.from(b.querySelectorAll('*'))) {
        const r = (c as HTMLElement).getBoundingClientRect()
        if (r.height > 0) worst = Math.max(worst, Math.round(r.bottom - box.bottom))
        if (r.width > 0) worst = Math.max(worst, Math.round(r.right - box.right))
      }
      return worst
    }))
    const pages = await page.$$('[data-brief-page]')
    for (const [k, el] of pages.entries()) {
      await el.screenshot({ path: join(dir, `${data.role}-${String(k + 1).padStart(2, '0')}.png`) as `${string}.png` })
      if (over[k] > 1) { clipped++; console.log(`page ${k + 1}: clips ${over[k]}px`) }
    }
    console.log(`${data.company} · ${data.role}: ${pages.length} pages, ${clipped} clipping, in ${dir}`)
  } finally {
    await browser.close()
  }
  if (clipped) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
