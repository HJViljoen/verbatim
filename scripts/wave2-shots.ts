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
import { LogOut } from 'lucide-react'
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
import { voiceFixture } from '../components/pages/voice-surface/fixture'
import { marketFixture } from '../components/pages/market-surface/fixture'
import { competitiveFixture } from '../components/pages/competitive-surface/fixture'
import { weekFixture } from '../components/pages/week/fixture'
import { SidebarTenant } from '../components/sidebar-tenant-loader'
import { NAV_ICON } from '../components/nav-icons'
import { surfacesIn, type NavKey } from '../lib/nav'

const args = process.argv.slice(2)
const flag = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const out = flag('out', 'scratch/wave2-shots')
const artboards = flag(
  'artboards',
  '/Users/heinrichviljoen/Documents/Heinrich/Cold-Reviews/Verbatim-IA-Review-2026-09-13/mock-sealand/artboards',
)

const FONTS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:ital,wght@0,400;0,500;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap'

// THE ROWS COME OFF `lib/nav.ts`, not a list retyped here — the labels and the
// order are the one table's, which is what the app reads too. `NAV` used to be
// that list by hand and is now derived, so a surface renamed in the table is
// renamed in the shot.
const NAV = surfacesIn('Intelligence').map((s) => ({ key: s.key, label: s.label }))
const ACCOUNT = surfacesIn('Account').map((s) => ({ key: s.key, label: s.label }))
const TENANT = renderToStaticMarkup(SidebarTenant({ brand: 'Sealand', role: 'admin' }))

// The shipped row's icon, at the shipped size. `size-4` is 16px and the app
// paints it `text-muted-foreground`, `text-foreground` on the active row —
// which is what `Main.dc.html` draws (16 × 16, stroke-width 2, `#6E7378` and
// `#26292C`). `currentColor` lets the row's own colour reach it, as the class
// does in the app.
const icon = (key: NavKey, active: boolean) =>
  renderToStaticMarkup(
    createElement(NAV_ICON[key], {
      width: 16,
      height: 16,
      color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
      strokeWidth: 2,
      'aria-hidden': true,
    }),
  )

// Logout is the one row with no `NavKey`; it is the app's `LogOut`, drawn the
// same way. Imported lazily here rather than added to the nav map, because it
// is not a surface and `components/nav-icons.ts` holds surfaces.
const LOGOUT_ICON = renderToStaticMarkup(
  createElement(LogOut, { width: 16, height: 16, color: 'var(--muted-foreground)', strokeWidth: 2, 'aria-hidden': true }),
)

const sidebar = (active: string) => `
<aside style="width:224px;flex:none;display:flex;flex-direction:column;background:var(--sidebar);box-shadow:var(--shadow-tile)">
  <div style="display:flex;align-items:baseline;gap:8px;padding:20px 16px 4px">
    <span style="font-size:17px;font-weight:700;letter-spacing:-.02em;color:var(--foreground)">Verbatim</span>
  </div>
  <nav style="display:flex;flex-direction:column;gap:4px;padding-top:8px">
    <div style="padding:0 14px">
      <div style="height:28px;display:flex;align-items:center;padding:0 10px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted-foreground)">Intelligence</div>
      ${NAV.map((s) => `
      <div style="position:relative;display:flex;align-items:center;gap:10px;height:36px;padding:0 10px;border-radius:4.8px;font-size:14px;font-weight:${s.label === active ? 600 : 400};color:${s.label === active ? 'var(--foreground)' : 'var(--sidebar-foreground)'}">
        ${s.label === active ? '<span style="position:absolute;left:-8px;top:8px;bottom:8px;width:2px;border-radius:9999px;background:var(--primary)"></span>' : ''}
        ${icon(s.key, s.label === active)}<span>${s.label}</span>
      </div>`).join('')}
    </div>
    <div style="padding:0 14px">
      <div style="height:28px;display:flex;align-items:center;padding:0 10px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted-foreground)">Account</div>
      ${ACCOUNT.map((s) => `
      <div style="display:flex;align-items:center;gap:10px;height:36px;padding:0 10px;font-size:14px;color:var(--sidebar-foreground)">${icon(s.key, false)}<span>${s.label}</span></div>`).join('')}
    </div>
  </nav>
  <div style="margin-top:auto;padding:0 14px 16px">
    ${TENANT}
    <div style="display:flex;align-items:center;gap:10px;height:36px;padding:0 10px;font-size:14px;color:var(--sidebar-foreground)">${LOGOUT_ICON}<span>Logout</span></div>
  </div>
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
</style></head><body><div style="display:flex;width:1440px;background:var(--background)">${sidebar(active)}
<main style="flex:1;min-width:0;padding:24px">${body}</main></div></body></html>`

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
  { key: 'overview', nav: 'Overview', artboard: 'Main.dc.html', markup: () => renderToStaticMarkup(OverviewPage({ data: overviewFixture() })) },
  { key: 'subjects', nav: 'Subjects', artboard: 'Subjects.dc.html', markup: () => renderToStaticMarkup(SubjectsPage({ data: subjectsFixture() })) },
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
    nav: 'Voice',
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
  { key: 'market', nav: 'Market', artboard: 'Market.dc.html', markup: () => renderToStaticMarkup(MarketSurfacePage({ data: marketFixture() })) },
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
