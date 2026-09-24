// A TILE-OVERFLOW PROBE, not a shot: renders a page from a named fixture at a
// given width and reports, per tile, `scrollHeight - clientHeight`.
//
//   node --import tsx scripts/tile-overflow.ts --page market --fixture deepLink --width 1440
//
// The page grid gives every tile a fixed span in rows, so a tile whose content
// outgrows its span is CLIPPED — `overflow-hidden`, no scrollbar, no
// affordance. A height estimate that does not count a line the block draws is
// how that happens, and this is the measurement the estimate has to answer to.
//
// TWO MEASURES, because a clip shows up two ways: a box whose `overflowY` is
// hidden and whose `scrollHeight` exceeds its `clientHeight`, and a laid-out
// line whose bottom falls below the tile's own. Absolute, fixed and sub-2px
// nodes are skipped — screen-reader text sits outside the box on purpose.
//
// KNOWN FALSE POSITIVE: a closed `Derivation` disclosure's panel is laid out
// and reports a rect, so a tile holding one reads as clipped by that panel's
// height. Read the node the probe names before believing it, and photograph
// the tile. `market.conclusions` is that case on every arm.
import { readFileSync } from 'fs'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { withBrowser } from '../lib/render/chromium'
import { MarketSurfacePage } from '../components/pages/market-surface'
import { marketFixture, deepLinkFixture, firstUpdateFixture, unrecordedFixture } from '../components/pages/market-surface/fixture'

const args = process.argv.slice(2)
const flag = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const width = Number(flag('width', '1440'))
const which = flag('fixture', 'deepLink')

const FIXTURES: Record<string, () => ReturnType<typeof marketFixture>> = {
  populated: marketFixture,
  deepLink: deepLinkFixture,
  firstUpdate: firstUpdateFixture,
  unrecorded: unrecordedFixture,
}

async function main() {
  const style = (await postcss([tailwind()]).process(readFileSync('app/globals.css', 'utf8'), { from: 'app/globals.css' })).css
  const body = renderToStaticMarkup(MarketSurfacePage({ data: FIXTURES[which]() }))
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${style}
html,body{margin:0;padding:0}
:root{--font-plex-sans:-apple-system,'Segoe UI',sans-serif;--font-plex-serif:Georgia,serif;--font-plex-mono:ui-monospace,monospace;--font-sans:var(--font-plex-sans);--font-serif:var(--font-plex-serif);--font-mono:var(--font-plex-mono)}
body{font-family:var(--font-sans)}
</style></head><body><div style="display:flex;width:${width}px"><div style="width:224px;flex:none"></div>
<main style="flex:1;min-width:0;padding:24px">${body}</main></div></body></html>`
  await withBrowser(async (page) => {
    await page.setViewport({ width, height: 1200, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'load' })
    const rows = await page.evaluate(() => {
      const out: { key: string; client: number; scroll: number; over: number }[] = []
      for (const tile of Array.from(document.querySelectorAll<HTMLElement>('[data-tile]'))) {
        // The CLIP is wherever overflow is hidden, which is not the tile
        // itself: find the deepest clipping box inside it and measure that.
        const key = tile.getAttribute('data-export-key') ?? tile.querySelector('h2')?.textContent?.trim() ?? '(unnamed)'
        const boxes = [tile, ...Array.from(tile.querySelectorAll<HTMLElement>('*'))]
          .filter((el) => getComputedStyle(el).overflowY === 'hidden')
        let worst = { client: tile.clientHeight, scroll: tile.scrollHeight, over: 0 }
        for (const el of boxes) {
          const over = el.scrollHeight - el.clientHeight
          if (over > worst.over) worst = { client: el.clientHeight, scroll: el.scrollHeight, over }
        }
        // AND THE OTHER WAY A LINE IS LOST: a descendant whose bottom falls
        // below the tile's own content box. `overflow-hidden` on a grid row
        // clips without either box reporting a scroll overflow.
        const tb = tile.getBoundingClientRect().bottom
        for (const el of Array.from(tile.querySelectorAll<HTMLElement>('p,span,div,li,td'))) {
          if (!el.textContent?.trim()) continue
          // Screen-reader text is positioned outside the box on purpose, and a
          // fixed/absolute node is not in the tile's flow — neither is a line
          // the tile clipped.
          const cs = getComputedStyle(el)
          if (cs.position === 'absolute' || cs.position === 'fixed') continue
          const r0 = el.getBoundingClientRect()
          if (r0.width < 2 || r0.height < 2) continue
          const over = Math.round(el.getBoundingClientRect().bottom - tb)
          if (over > worst.over) { worst = { client: tile.clientHeight, scroll: tile.clientHeight + over, over }; (worst as { who?: string }).who = el.className + ' :: ' + (el.textContent ?? '').slice(0, 60) }
        }
        out.push({ key, ...worst })
      }
      return { tiles: out, page: document.body.scrollHeight }
    })
    await page.screenshot({ path: `/tmp/tile-overflow-${which}-${width}.png`, fullPage: true })
    console.log(`${which} @ ${width}  page ${rows.page}px`)
    for (const r of rows.tiles) console.log(`  ${r.over > 0 ? 'CLIP' : 'ok  '} ${String(r.over).padStart(4)}px  ${r.key}  (${r.client} / ${r.scroll})${(r as { who?: string }).who ? `\n        ${(r as { who?: string }).who}` : ''}`)
  })
}
main()
