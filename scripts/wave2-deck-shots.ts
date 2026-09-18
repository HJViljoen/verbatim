// Block D wave 2 · the MERGE's deck shots: the four printed briefs and the
// quarterly, rendered from their populated fixtures at the deck's own sheet
// size (1123 × 631 per slide) and put beside their artboards.
//
//   node --import tsx scripts/wave2-deck-shots.ts --out <dir>
//
// The sales and marketing decks are where this merge did the most work — two
// packages ported one `DocumentDeck` — so the sheets are photographed rather
// than argued about. Same harness as scripts/wave2-shots.ts.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { withBrowser } from '../lib/render/chromium'
import { DocumentDeck } from '../components/print/document-deck'
import { salesBriefFixture, marketingDeckFixture } from '../components/print/fixture'

const args = process.argv.slice(2)
const flag = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const out = flag('out', 'scratch/wave2-deck-shots')
const artboards = flag(
  'artboards',
  '/Users/heinrichviljoen/Documents/Heinrich/Cold-Reviews/Verbatim-IA-Review-2026-09-13/mock-sealand/artboards',
)
const FONTS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:ital,wght@0,400;0,500;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap'

async function css(): Promise<string> {
  const res = await postcss([tailwind()]).process(readFileSync('app/globals.css', 'utf8'), { from: 'app/globals.css' })
  return res.css
}

const doc = (style: string, body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}"><style>${style}
html,body{margin:0;padding:0;background:#e7e5df}
:root{--font-plex-sans:'IBM Plex Sans',-apple-system,'Segoe UI',sans-serif;--font-plex-serif:'IBM Plex Serif',Georgia,serif;--font-plex-mono:'IBM Plex Mono',ui-monospace,monospace;--font-emoji:'Apple Color Emoji','Segoe UI Emoji',sans-serif;--font-sans:var(--font-plex-sans);--font-serif:var(--font-plex-serif);--font-mono:var(--font-plex-mono)}
body{font-family:var(--font-sans);-webkit-font-smoothing:antialiased}
</style></head><body><div class="vb-print vb-preview" style="width:1123px">${body}</div></body></html>`

// `vb-print` IS NOT DECORATION. app/globals.css scopes the whole 12-column
// print grid to `.vb-print [data-col="n"]`, so a deck rendered without that
// ancestor class draws every shared sheet as overlapping full-width children —
// which is what the merge's first run of this script photographed before the
// class was added, and it was the harness and not the deck.

const pair = (built: string, artboard: string, title: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#11110f;font-family:-apple-system,'Segoe UI',sans-serif}
.row{display:flex;gap:24px;padding:24px;align-items:flex-start}
figure{margin:0;flex:none}
figcaption{color:#e8e6df;font-size:22px;padding:0 0 10px;font-weight:600}
img{display:block;width:1123px;border:1px solid #3a382f}
h1{color:#e8e6df;font-size:26px;padding:24px 24px 0;margin:0}
</style></head><body><h1>${title}</h1><div class="row">
<figure><figcaption>the artboard (the spec)</figcaption><img src="file://${artboard}"></figure>
<figure><figcaption>the merged tree, from its populated fixture</figcaption><img src="file://${built}"></figure>
</div></body></html>`

const DECKS: { key: string; artboard: string; markup: () => string }[] = [
  { key: 'sales-brief', artboard: 'SalesBrief.dc.html', markup: () => renderToStaticMarkup(DocumentDeck({ data: salesBriefFixture(), date: '28 Sep 2026' })) },
  { key: 'marketing-brief', artboard: 'MarketingBrief.dc.html', markup: () => renderToStaticMarkup(DocumentDeck({ data: marketingDeckFixture(), date: '28 Sep 2026' })) },
]

async function main() {
  mkdirSync(out, { recursive: true })
  const style = await css()
  for (const d of DECKS) writeFileSync(join(out, `built-${d.key}.html`), doc(style, d.markup()))
  await withBrowser(async (page) => {
    await page.setViewport({ width: 1123, height: 900, deviceScaleFactor: 1 })
    for (const d of DECKS) {
      await page.goto(`file://${resolve(out, `built-${d.key}.html`)}`, { waitUntil: 'networkidle0' })
      writeFileSync(join(out, `built-${d.key}.png`), await page.screenshot({ fullPage: true, type: 'png' }))
      const art = join(artboards, d.artboard)
      if (!existsSync(art)) { console.log(`no artboard for ${d.key}`); continue }
      await page.goto(`file://${art}`, { waitUntil: 'networkidle0' })
      writeFileSync(join(out, `artboard-${d.key}.png`), await page.screenshot({ fullPage: true, type: 'png' }))
      const html = join(out, `side-by-side-${d.key}.html`)
      writeFileSync(html, pair(resolve(out, `built-${d.key}.png`), resolve(out, `artboard-${d.key}.png`), d.key))
      await page.goto(`file://${html}`, { waitUntil: 'networkidle0' })
      writeFileSync(join(out, `side-by-side-${d.key}.png`), await page.screenshot({ fullPage: true, type: 'png' }))
      console.log(`side-by-side-${d.key}.png`)
    }
  })
}

main().catch((e) => { console.error(e); process.exit(1) })
