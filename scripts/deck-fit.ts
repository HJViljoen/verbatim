// A DECK-FIT PROBE, not a shot: renders every `Slide`-based artefact at the
// sheet's own 1123px and reports, per sheet, what falls off the bottom of
// `.vb-slide-body` and how much of the sheet's type prints under the 8pt floor
// `components/print/slide.tsx` names.
//
//   node --import tsx scripts/deck-fit.ts --deck sales
//   node --import tsx scripts/deck-fit.ts            (all seven renders)
//
// ALL FIVE ARTEFACTS, BECAUSE THE RULES ARE NOT SCOPED TO TWO (Block D wave
// 3b, the merge). This probe was written beside the 8pt floor and the
// calendar's paper factor, both of which are `.vb-slide-body` rules — and
// `.vb-slide-body` is the two briefs AND the weekly, monthly and quarterly
// decks. Measured on two, the floor read as a clean win; measured on five it
// took the quarterly review from one clipping sheet to three, which is how
// that deck came to declare `floor="deferred"`. A rule written for one sheet
// is measured on every sheet that wears the class.
//
// THREE MEASURES, because "the deck fits" is three claims:
//  · SHEETS — the count, against the artboard's (sales 7, marketing 9).
//  · OVERFLOW — `scrollHeight - clientHeight` on each `.vb-slide-body`, which
//    is `overflow: hidden` over a fixed box, so anything positive is LOST on
//    the PDF with no ellipsis and no warning.
//  · THE FLOOR — every text node's computed size, with every ancestor `zoom`
//    folded in, converted at 297mm / 1123px (1pt = 1123/(297/25.4*72) px).
//
// AND AN SVG LABEL IS MEASURED IN THE UNITS IT PRINTS IN, not the ones it is
// written in. `CalendarLine` and `Sparkline` emit `width="100%"` over a viewBox
// and size every label in viewBox UNITS, so `getComputedStyle().fontSize` on a
// `<text>` is a number in the chart's own coordinate space and says nothing
// about the page: the attention chart's 11px axis label prints at 11 × (the
// chart's rendered width / its viewBox width), which was 33px before this
// wave's column fix and about 13px after it. Measuring the raw value reported
// a chart as three points under the floor while it was three points over. Every
// `<text>` is therefore scaled by its own `<svg>`'s rendered width over its
// viewBox width before the conversion.
//
// It reads the DOM only. No fixture is written, no network beyond the font
// stylesheet the shot harness already loads.
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { withBrowser } from '../lib/render/chromium'
import { DocumentDeck } from '../components/print/document-deck'
import { salesBriefFixture, marketingDeckFixture } from '../components/print/fixture'
import { WeeklyDeck } from '../components/print/weekly-deck'
import { MonthlyDeck } from '../components/print/monthly-deck'
import { QuarterlyDeck } from '../components/print/quarterly-deck'
import { weeklyFixture, formingFixture as weeklyForming } from '../components/blocks/weekly/fixture'
import { WEEKLY_BLOCK_KEYS, weeklySubject } from '../lib/reports/weekly'
import { WEEKLY_SNAPSHOT_VERSION, type WeeklySnapshotData } from '../lib/reports/weekly-build'
import { monthlyFixture, formingMonthlyFixture } from '../components/blocks/monthly/fixture'
import { MONTHLY_BLOCK_KEYS, monthlyPeriod } from '../lib/reports/monthly'
import { MONTHLY_SNAPSHOT_VERSION, type MonthlySnapshotData } from '../lib/reports/monthly-build'
import { quarterlySnapshotFixture, formingFixture as quarterlyForming } from '../components/blocks/quarterly/fixture'

const args = process.argv.slice(2)
const flag = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const only = flag('deck', '')
const out = flag('out', 'scratch/deck-fit')
const FONTS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:ital,wght@0,400;0,500;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap'

// The snapshot a scheduled send would carry, built from the offline fixture —
// the same shape `lib/reports/*-build.ts` writes, so the probe renders what a
// reader receives rather than a bare reading.
const weeklySnapshot = (reading = weeklyFixture()): WeeklySnapshotData => ({
  version: WEEKLY_SNAPSHOT_VERSION, kind: 'weekly', company: 'Sealand', title: 'Sealand · your update',
  period: '6 Sep – 13 Sep', readingAt: '2026-09-18T09:00:00.000Z', month: '2026-09-01',
  keys: [...WEEKLY_BLOCK_KEYS], reading, figures: {}, subject: weeklySubject('Sealand', reading.section1.check),
} as WeeklySnapshotData)

const monthlySnapshot = (reading = monthlyFixture()): MonthlySnapshotData => ({
  version: MONTHLY_SNAPSHOT_VERSION, kind: 'monthly', company: 'Sealand', title: 'Sealand · the month',
  period: monthlyPeriod(reading.month, reading.monthStatus, reading.readingAt), readingAt: reading.readingAt,
  month: reading.month, monthStatus: reading.monthStatus, keys: [...MONTHLY_BLOCK_KEYS], reading, figures: {},
  subject: reading.subject,
} as MonthlySnapshotData)

// `sheets` is the artboard's own frame count where the mock draws one
// (the two briefs, the quarterly review's eight); the weekly and monthly decks
// are paginated off their block list and report their own.
const DECKS = [
  { key: 'sales', sheets: 7, markup: () => renderToStaticMarkup(DocumentDeck({ data: salesBriefFixture(), date: '28 Sep 2026' })) },
  { key: 'marketing', sheets: 9, markup: () => renderToStaticMarkup(DocumentDeck({ data: marketingDeckFixture(), date: '28 Sep 2026' })) },
  { key: 'weekly', sheets: 0, markup: () => renderToStaticMarkup(WeeklyDeck({ data: weeklySnapshot(), date: '28 Sep 2026' })) },
  { key: 'weekly-forming', sheets: 0, markup: () => renderToStaticMarkup(WeeklyDeck({ data: weeklySnapshot(weeklyForming()), date: '28 Sep 2026' })) },
  { key: 'monthly', sheets: 0, markup: () => renderToStaticMarkup(MonthlyDeck({ data: monthlySnapshot(), date: '28 Sep 2026' })) },
  { key: 'monthly-forming', sheets: 0, markup: () => renderToStaticMarkup(MonthlyDeck({ data: monthlySnapshot(formingMonthlyFixture()), date: '28 Sep 2026' })) },
  { key: 'quarterly', sheets: 8, markup: () => renderToStaticMarkup(QuarterlyDeck({ data: quarterlySnapshotFixture(), date: '28 Sep 2026' })) },
  { key: 'quarterly-forming', sheets: 8, markup: () => renderToStaticMarkup(QuarterlyDeck({ data: quarterlySnapshotFixture(quarterlyForming()), date: '28 Sep 2026' })) },
].filter((d) => !only || d.key === only || d.key.startsWith(`${only}-`))

const PROBE = `(() => {
  const PT = 1123 / (297 / 25.4 * 72);
  const zoomOf = (el) => { let z = 1, n = el; while (n && n.nodeType === 1) { const v = parseFloat(getComputedStyle(n).zoom || '1'); if (v && v !== 1) z *= v; n = n.parentElement } return z };
  const svgScale = (el) => {
    const svg = el.ownerSVGElement || (el.tagName === 'svg' ? el : null);
    if (!svg) return 1;
    const vb = svg.viewBox && svg.viewBox.baseVal;
    if (!vb || !vb.width) return 1;
    // The rect is already zoomed and zoomOf is applied once by the caller, so
    // the zoom comes back out here rather than being counted twice.
    const w = svg.getBoundingClientRect().width / zoomOf(svg);
    return w ? w / vb.width : 1;
  };
  const slides = [...document.querySelectorAll('.vb-slide')];
  return slides.map((s, i) => {
    const b = s.querySelector('.vb-slide-body');
    const nodes = [];
    const walk = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = walk.nextNode())) {
      if (!t.nodeValue || !t.nodeValue.trim()) continue;
      const el = t.parentElement; if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      // An SVG <title> is the chart's tooltip and its accessible name. It is
      // never painted, so it has no size on paper and no business in a floor
      // count — it reported three of the subjects line's month tooltips as the
      // smallest type on the marketing brief.
      if (el.tagName === 'title' || el.tagName === 'desc') continue;
      const px = parseFloat(cs.fontSize) * svgScale(el) * zoomOf(el);
      nodes.push({ pt: +(px / PT).toFixed(2), text: t.nodeValue.trim().slice(0, 40) });
    }
    const under = nodes.filter((n) => n.pt < 8);
    // SLACK: how much of the body's height nothing reaches. The lowest laid-out
    // box inside the body against the body's own bottom — a sheet that clips
    // reports 0 here and its overflow above, a sheet with 200 reports a fifth
    // of a landscape page that no ink reaches.
    let slack = null;
    if (b) {
      const box = b.getBoundingClientRect();
      // clientHeight is the body's own layout box; the rects are zoomed. One
      // divisor converts between them.
      const zoom = box.height / b.clientHeight || 1;
      // THE LOWEST INK, NOT THE LOWEST BOX. Half the layout is flex columns
      // with h-full or an mt-auto spacer, so the lowest ELEMENT is the body
      // itself on every sheet and the measure read 0 everywhere. A Range over
      // each text node gives the box the glyphs actually occupy, and an <svg>
      // is measured as a whole because its ink is not text.
      let low = 0;
      const w2 = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
      let t2;
      const range = document.createRange();
      while ((t2 = w2.nextNode())) {
        if (!t2.nodeValue || !t2.nodeValue.trim()) continue;
        const el2 = t2.parentElement;
        if (!el2 || el2.tagName === 'title' || el2.tagName === 'desc') continue;
        if (getComputedStyle(el2).display === 'none') continue;
        range.selectNodeContents(t2);
        const r = range.getBoundingClientRect();
        if (r.height >= 1) low = Math.max(low, r.bottom - box.top);
      }
      for (const svg of b.querySelectorAll('svg')) {
        const r = svg.getBoundingClientRect();
        if (r.height >= 2) low = Math.max(low, r.bottom - box.top);
      }
      slack = Math.max(0, Math.round(b.clientHeight - low / zoom));
    }
    return {
      slack,
      sheet: i + 1,
      title: (s.querySelector('h1')?.textContent || '(cover)').slice(0, 44),
      over: b ? b.scrollHeight - b.clientHeight : null,
      bodyH: b ? b.clientHeight : null,
      nodes: nodes.length,
      under: under.length,
      minPt: nodes.length ? Math.min(...nodes.map((n) => n.pt)) : null,
      maxPt: nodes.length ? Math.max(...nodes.map((n) => n.pt)) : null,
      worst: under.sort((a, b2) => a.pt - b2.pt).slice(0, 4),
    };
  });
})()`

async function main() {
  mkdirSync(out, { recursive: true })
  const style = (await postcss([tailwind()]).process(readFileSync('app/globals.css', 'utf8'), { from: 'app/globals.css' })).css
  await withBrowser(async (page) => {
    await page.setViewport({ width: 1123, height: 900, deviceScaleFactor: 1 })
    for (const d of DECKS) {
      const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}"><style>${style}
html,body{margin:0;padding:0;background:#e7e5df}
:root{--font-plex-sans:'IBM Plex Sans',-apple-system,'Segoe UI',sans-serif;--font-plex-serif:'IBM Plex Serif',Georgia,serif;--font-plex-mono:'IBM Plex Mono',ui-monospace,monospace;--font-emoji:'Apple Color Emoji',sans-serif;--font-sans:var(--font-plex-sans);--font-serif:var(--font-plex-serif);--font-mono:var(--font-plex-mono)}
body{font-family:var(--font-sans)}
</style></head><body><div class="vb-print vb-preview" style="width:1123px">${d.markup()}</div></body></html>`
      const f = join(out, `fit-${d.key}.html`)
      writeFileSync(f, html)
      await page.goto(`file://${resolve(f)}`, { waitUntil: 'networkidle0' })
      await page.evaluate('document.fonts && document.fonts.ready')
      const rows = (await page.evaluate(PROBE)) as { sheet: number; title: string; over: number; slack: number; nodes: number; under: number; minPt: number; maxPt: number; worst: { pt: number; text: string }[] }[]
      const totalNodes = rows.reduce((a, r) => a + r.nodes, 0)
      const totalUnder = rows.reduce((a, r) => a + r.under, 0)
      const clipped = rows.filter((r) => (r.over ?? 0) > 2)
      const against = d.sheets ? ` (artboard ${d.sheets})` : ''
      console.log(`\n=== ${d.key}: ${rows.length} sheets${against} · ${totalUnder} of ${totalNodes} nodes under 8pt · ${clipped.length} sheets clip`)
      for (const r of rows) {
        console.log(`  ${String(r.sheet).padStart(2)} ${r.title.padEnd(46)} over=${String(r.over).padStart(5)} slack=${String(r.slack).padStart(4)} nodes=${String(r.nodes).padStart(3)} under8=${String(r.under).padStart(3)} ${r.minPt}–${r.maxPt}pt`)
        for (const w of r.worst) console.log(`        ${w.pt}pt  ${JSON.stringify(w.text)}`)
      }
    }
  })
}

main().catch((e) => { console.error(e); process.exit(1) })
