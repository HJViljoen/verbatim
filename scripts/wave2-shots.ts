// Block D wave 2 · the MERGE's side-by-side shots: every ported app page,
// rendered from its populated fixture at 1440 and put beside its artboard.
//
//   node --import tsx scripts/wave2-shots.ts --out <dir>
//
// WHY A FIXTURE AND NOT THE APP (the wave's own rule, brief §4). There is no
// session cookie here, and a page rendered against production would be the
// refused state on every block — which is not what a fidelity claim is made
// against. The fixtures are the review surface, and they are the same objects
// the render tier asserts on, so a page cannot pass a test in one shape and be
// photographed in another.
//
// The CSS is app/globals.css through the project's own Tailwind pipeline, so
// the tokens, the type ramp and the shadows are the app's. The sidebar is the
// shipped one's WIDTH and groups (components/app-sidebar.tsx is a client
// component wired to the router), drawn as static markup — see
// scripts/e-main-shot.ts, which this generalises.
//
// AND ITS ICONS ARE THE SHIPPED ONES. They were nine grey 16px squares
// (`background:var(--muted)`) in every side-by-side shot of Block D, which
// read as a missing feature: the app has rendered real lucide icons since it
// had a sidebar (`components/app-sidebar.tsx`, `<item.icon className="size-4"`).
// They could not be imported because that file is `"use client"` and wired to
// the router and a server action, so the map moved to `components/nav-icons.ts`
// — a leaf — and this script now renders the SAME icons for the SAME keys, in
// `lib/nav.ts`'s own order. A shot that shows a defect the product does not
// have costs a reviewer the same as one that hides a defect it does.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { withBrowser } from '../lib/render/chromium'

import { OverviewPage } from '../components/pages/overview'
import { SubjectsPage } from '../components/pages/subjects'
import { VOICE_LEGEND, VoiceSurfacePage } from '../components/pages/voice-surface'
import { HowToRead } from '../components/how-to-read'
import { MarketSurfacePage } from '../components/pages/market-surface'
import { CompetitiveSurfacePage } from '../components/pages/competitive-surface'
import { WeekPage } from '../components/pages/week'

import { overviewFixture } from '../components/pages/overview/fixture'
import { subjectsFixture } from '../components/pages/subjects/fixture'
import { subjectsView } from '../lib/pages/subjects-view'
import { voiceFixture } from '../components/pages/voice-surface/fixture'
import { marketFixture } from '../components/pages/market-surface/fixture'
import { competitiveFixture } from '../components/pages/competitive-surface/fixture'
import { weekFixture } from '../components/pages/week/fixture'
import { NAV_ICON } from '../components/nav-icons'
import { surfacesIn, type NavGroup, type NavKey } from '../lib/nav'

const args = process.argv.slice(2)
const flag = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const out = flag('out', 'scratch/wave2-shots')
const artboards = flag(
  'artboards',
  '/Users/heinrichviljoen/Documents/Heinrich/Cold-Reviews/Verbatim-IA-Review-2026-09-13/mock-sealand/artboards',
)

const FONTS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:ital,wght@0,400;0,500;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap'

// THE ROWS COME OFF `lib/nav.ts`, not a list retyped here — the labels, the
// order and the four groups are the one table's, which is what the app reads
// too, so a surface renamed in the table is renamed in the shot.
const GROUPS: NavGroup[] = ['read', 'steer', 'agent']
const rowsOf = (g: NavGroup) => surfacesIn(g).map((s) => ({ key: s.key, label: s.label }))

// The shipped row's icon, at the shipped size: 16px, stroke 2, ink on the
// active row and on the Agent's, `#6E7378` otherwise (components/app-sidebar.tsx,
// as `sidebar2.py` draws it).
const icon = (key: NavKey, ink: boolean) =>
  renderToStaticMarkup(
    createElement(NAV_ICON[key], {
      width: 16,
      height: 16,
      color: ink ? 'var(--foreground)' : '#6E7378',
      strokeWidth: 2,
      'aria-hidden': true,
    }),
  )

// The navigation of 1 Oct, drawn as the app draws it: 256px of white, a
// hairline on its right edge, the wordmark, four groups split by hairlines
// and no group labels, the Agent a filled yellow row, Studio and Settings at
// the foot. The active page is a pill of the ink at 7% and semibold, no bar.
const row = (s: { key: NavKey; label: string }, active: string) => {
  const agent = s.key === 'ask'
  const on = s.label === active
  const fill = agent ? 'background:#FFD43B;font-weight:600;' : on ? 'background:rgba(38,41,44,0.07);font-weight:600;' : ''
  return `<div style="display:flex;align-items:center;gap:12px;height:40px;padding:0 12px;border-radius:6px;font-size:14px;color:var(--foreground);${fill}">${icon(s.key, agent || on)}<span>${s.label}</span></div>`
}
const HAIRLINE = '<div style="height:1px;background:#E4E2DC;margin:8px 12px"></div>'
const sidebar = (active: string) => `
<aside style="width:256px;flex:none;display:flex;flex-direction:column;gap:4px;padding:18px 12px 16px;box-sizing:border-box;background:#FFFFFF;border-right:1px solid #E4E2DC">
  <div style="padding:4px 12px 18px;display:flex;align-items:center;gap:7px">
    <span style="font-size:18px;font-weight:700;letter-spacing:-.02em;color:var(--foreground)">Verbatim</span>
  </div>
  ${GROUPS.map((g) => rowsOf(g).map((s) => row(s, active)).join('')).join(HAIRLINE)}
  <div style="flex-grow:1"></div>
  ${rowsOf('foot').map((s) => row(s, active)).join('')}
</aside>`

async function css(): Promise<string> {
  const src = readFileSync('app/globals.css', 'utf8')
  const res = await postcss([tailwind()]).process(src, { from: 'app/globals.css' })
  return res.css
}

// next/font sets the three --font-plex-* on <html>; Tailwind INLINES the theme
// value, so .font-serif resolves to var(--font-plex-serif) and not to
// var(--font-sans). Defining only the aliases left every mono and serif node
// rendering as body sans (scripts/e-main-shot.ts, 2026-09-18).
const doc = (style: string, body: string, active: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}"><style>${style}
html,body{margin:0;padding:0}
:root{--font-plex-sans:'IBM Plex Sans',-apple-system,'Segoe UI',sans-serif;--font-plex-serif:'IBM Plex Serif',Georgia,serif;--font-plex-mono:'IBM Plex Mono',ui-monospace,monospace;--font-emoji:'Apple Color Emoji','Segoe UI Emoji',sans-serif;--font-sans:var(--font-plex-sans);--font-serif:var(--font-plex-serif);--font-mono:var(--font-plex-mono)}
body{font-family:var(--font-sans);-webkit-font-smoothing:antialiased}
</style></head><body><div style="display:flex;width:1440px;background:#F7F6F2">${sidebar(active)}
<main style="flex:1;min-width:0;padding:28px 40px 40px">${body}</main></div></body></html>`

const pair = (built: string, artboard: string, title: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#11110f;font-family:-apple-system,'Segoe UI',sans-serif}
.row{display:flex;gap:24px;padding:24px;align-items:flex-start}
figure{margin:0;flex:none;width:1440px}
figcaption{color:#e8e6df;font-size:22px;padding:0 0 10px;font-weight:600}
img{display:block;width:1440px;border:1px solid #3a382f}
h1{color:#e8e6df;font-size:26px;padding:24px 24px 0;margin:0}
</style></head><body><h1>${title}</h1><div class="row">
<figure><figcaption>the artboard (the spec)</figcaption><img src="file://${artboard}"></figure>
<figure><figcaption>the merged tree, from its populated fixture</figcaption><img src="file://${built}"></figure>
</div></body></html>`

interface Page { key: string; nav: string; artboard: string; markup: () => string }
const PAGES: Page[] = [
  { key: 'overview', nav: 'Your market', artboard: 'Main.dc.html', markup: () => renderToStaticMarkup(OverviewPage({ data: overviewFixture() })) },
  { key: 'subjects', nav: 'Subjects', artboard: 'Subjects.dc.html', markup: () => renderToStaticMarkup(SubjectsPage({ view: subjectsView(subjectsFixture(), null, 'fixture') })) },
  // VOICE TAKES ITS PAGE BAR'S RIGHT-HAND END FROM ITS CALLER, so the shot has
  // to pass it or photograph a bar the app does not have. Every other page
  // here mounts `HowToRead` inside its own component; Voice's route passes it
  // in (see VoiceSurfacePage's `controls`), and this script passed nothing —
  // so the one built control on that bar appeared in no wave-2 shot and every
  // reader of the side-by-side scored the page bar as missing something the
  // page has. `useSearchParams` returns null with no router mounted, which is
  // the case the component is written for.
  {
    key: 'voice',
    nav: 'Conversation',
    artboard: 'Voice.dc.html',
    markup: () => renderToStaticMarkup(VoiceSurfacePage({
      data: voiceFixture(),
      // AS AN ELEMENT, NOT A CALL. `HowToRead` reads `useSearchParams`, and a
      // hook only runs inside a render — called as a function here it throws
      // "Invalid hook call". As an element `renderToStaticMarkup` runs it, and
      // the hook returns null with no router mounted, which is the case the
      // component is written for.
      controls: createElement(HowToRead, { items: VOICE_LEGEND, basePath: '/dashboard/voice', anchor: 'voice' }),
    })),
  },
  { key: 'market', nav: 'Your moves', artboard: 'Market.dc.html', markup: () => renderToStaticMarkup(MarketSurfacePage({ data: marketFixture() })) },
  { key: 'competitive', nav: 'Competitive', artboard: 'Competitive.dc.html', markup: () => renderToStaticMarkup(CompetitiveSurfacePage({ data: competitiveFixture() })) },
  { key: 'week', nav: 'This week', artboard: 'ThisWeek.dc.html', markup: () => renderToStaticMarkup(WeekPage({ data: weekFixture() })) },
]

async function main() {
  mkdirSync(out, { recursive: true })
  const style = await css()
  for (const p of PAGES) writeFileSync(join(out, `built-${p.key}.html`), doc(style, p.markup(), p.nav))

  await withBrowser(async (page) => {
    await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 1 })
    for (const p of PAGES) {
      await page.goto(`file://${resolve(out, `built-${p.key}.html`)}`, { waitUntil: 'networkidle0' })
      writeFileSync(join(out, `built-${p.key}.png`), await page.screenshot({ fullPage: true, type: 'png' }))
      const art = join(artboards, p.artboard)
      if (!existsSync(art)) { console.log(`no artboard for ${p.key}`); continue }
      await page.goto(`file://${art}`, { waitUntil: 'networkidle0' })
      writeFileSync(join(out, `artboard-${p.key}.png`), await page.screenshot({ fullPage: true, type: 'png' }))
      const html = join(out, `side-by-side-${p.key}.html`)
      writeFileSync(html, pair(resolve(out, `built-${p.key}.png`), resolve(out, `artboard-${p.key}.png`), p.key))
      await page.goto(`file://${html}`, { waitUntil: 'networkidle0' })
      writeFileSync(join(out, `side-by-side-${p.key}.png`), await page.screenshot({ fullPage: true, type: 'png' }))
      console.log(`side-by-side-${p.key}.png`)
    }
  })
}

main().catch((e) => { console.error(e); process.exit(1) })
