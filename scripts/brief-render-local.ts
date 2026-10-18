// A monthly brief drawn locally through the product's own deck
// (components/briefs/brief-deck.tsx, the canvas's pages): a PNG a page, the
// PDF the product prints, and a check that no page clips. No database and no
// model: the brief is its `{ data, texts }` (the brief, quotes as refs, and the
// words each ref resolves to, kept local). Shared by scripts/brief-render.ts
// and the dry builds of scripts/monthly-briefs.ts. Chrome is CHROME_PATH or
// the Mac's Google Chrome; the fonts come from Google Fonts.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import puppeteer from 'puppeteer-core'
import { createElement } from 'react'

import type { LeftOut } from '../lib/reports/briefs/deck'
import type { StoredBriefData } from '../lib/reports/briefs/types'

const FONTS = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:ital,wght@0,400;0,500;1,400&display=swap'

export interface QuoteWords { text: string; english?: string | null; lang?: string | null }

export interface LocalRender {
  pages: number
  /** Pages (1-based) whose body something runs past, or where two runs of
   *  text are drawn over each other, and by how much. */
  clipped: { page: number; px: number }[]
  /** The canvas's pages the deck left out as thin, and why. */
  left: LeftOut[]
  html: string
  pdf: string | null
  pngs: string[]
}

/**
 * Draw one brief into `outDir` as `<name>.html`, `<name>-NN.png` a page and,
 * with `pdf`, `<name>.pdf` (the print deck, a 1280×720 sheet a page). Never
 * throws for a clipped page: it says which.
 */
export async function renderBriefLocal(
  input: { data: StoredBriefData; texts?: Record<string, QuoteWords | null> },
  outDir: string,
  o: { name?: string; built?: string; pdf?: boolean; png?: boolean } = {},
): Promise<LocalRender> {
  // Loaded at runtime: react-dom/server, as everywhere outside a test.
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { BriefDeck } = await import('../components/briefs/brief-deck')
  const { resolveQuotes } = await import('../lib/renderables/quotes-freeze')
  const { planDeck } = await import('../lib/reports/briefs/deck')
  const name = o.name ?? input.data.role
  const texts = new Map(Object.entries(input.texts ?? {}).filter(([, v]) => v != null && v.text))
  const hydrated = resolveQuotes(input.data, texts as never)
  const built = `${(o.built ?? new Date().toISOString()).slice(0, 10)}T08:00:00.000Z`
  const head = `<meta charset="utf-8"><link rel="stylesheet" href="${FONTS}"><style>:root{--font-plex-sans:'IBM Plex Sans';--font-plex-serif:'IBM Plex Serif';--font-plex-mono:'IBM Plex Mono';--font-wordmark:'Bricolage Grotesque'}</style>`
  const screen = renderToStaticMarkup(createElement(BriefDeck, { data: hydrated, builtAt: built }))
  const print = renderToStaticMarkup(createElement(BriefDeck, { data: hydrated, builtAt: built, print: true }))
  mkdirSync(outDir, { recursive: true })
  const html = join(outDir, `${name}.html`)
  writeFileSync(html, `<!doctype html><html><head>${head}<style>body{margin:0;background:#E9EAEC;padding:24px}</style></head><body>${screen}</body></html>`)
  const printFile = join(outDir, `.${name}.print.html`)
  writeFileSync(printFile, `<!doctype html><html><head>${head}<style>body{margin:0}</style></head><body>${print}</body></html>`)

  const executablePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--font-render-hinting=none'] })
  const out: LocalRender = { pages: 0, clipped: [], left: planDeck(hydrated).left, html, pdf: null, pngs: [] }
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1328, height: 800, deviceScaleFactor: 1 })
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' })
    await page.evaluate(() => document.fonts.ready)
    // Anything inside a page's body that reaches past it, down or across; and
    // two runs of text inside it drawn over each other (a row that overflows
    // its column into the foot stays inside the body, so only this sees it:
    // the October products page's last row did, by 7px, 18 Oct).
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
      const rects: { node: number; r: DOMRect }[] = []
      const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(), node = 0; n; n = walker.nextNode(), node += 1) {
        if (!n.textContent?.trim()) continue
        const range = document.createRange()
        range.selectNodeContents(n)
        for (const r of Array.from(range.getClientRects())) if (r.width > 1 && r.height > 1) rects.push({ node, r })
      }
      for (let i = 0; i < rects.length; i += 1) {
        for (let j = i + 1; j < rects.length; j += 1) {
          const a = rects[i]
          const c = rects[j]
          if (a.node === c.node) continue
          const across = Math.min(a.r.right, c.r.right) - Math.max(a.r.left, c.r.left)
          const down = Math.min(a.r.bottom, c.r.bottom) - Math.max(a.r.top, c.r.top)
          if (across > 2 && down > 3) worst = Math.max(worst, Math.round(down))
        }
      }
      return worst
    }))
    const sheets = await page.$$('[data-brief-page]')
    out.pages = sheets.length
    for (const [k, el] of sheets.entries()) {
      if (o.png !== false) {
        const file = join(outDir, `${name}-${String(k + 1).padStart(2, '0')}.png`)
        await el.screenshot({ path: file as `${string}.png` })
        out.pngs.push(file)
      }
      if (over[k] > 1) out.clipped.push({ page: k + 1, px: over[k] })
    }
    if (o.pdf) {
      const p = await browser.newPage()
      await p.goto(`file://${printFile}`, { waitUntil: 'networkidle0' })
      await p.evaluate(() => document.fonts.ready)
      const file = join(outDir, `${name}.pdf`)
      await p.pdf({ path: file, width: '1280px', height: '720px', printBackground: true, preferCSSPageSize: true })
      out.pdf = file
    }
  } finally {
    await browser.close()
  }
  return out
}
