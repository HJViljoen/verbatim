// The pages build's side-by-side shots (integration, 1 Oct): each of the ten
// rebuilt pages, rendered from its fixture at 1440 wide, beside its approved
// artboard (`Page-*.dc.html`).
//
//   node --import tsx scripts/pages-shots.ts --out <dir> --artboards <dir>
//
// WHAT IS REAL. Each page is its route's own composition (the components the
// route renders, in its order), fed the package's render fixture: the same
// objects the render tier asserts on, most of them built from the artboard's
// own Sealand data. The shell is the shipped one: `SidebarProvider` and
// `AppSidebar` (the real rows, icons, groups and active pill) and `<main>`
// with the dashboard layout's own classes, under a stub router so the client
// components render. The CSS is app/globals.css through the project's Tailwind
// pipeline, so the tokens are whatever the tree holds (before THEME merges,
// the old ones).
//
// WHAT IS THE HARNESS'S (and so not a finding):
//   - the pane grows with the page instead of scrolling inside itself, and the
//     viewport is set to the page's height, so one shot holds all of it;
//   - the sidebar's header is the wordmark's markup drawn here (the shipped
//     `SidebarWordmark` loads Bricolage through next/font, which only Next's
//     compiler runs), with Bricolage from Google Fonts;
//   - no billing banner and no operator rows (a client's view).
//
// LOCAL ONLY: no database, no network but Google Fonts, nothing written but
// the shots.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { createElement as h, Fragment, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime'
import { withBrowser } from '../lib/render/chromium'

import { SidebarProvider } from '../components/ui/sidebar'
import { AppSidebar } from '../components/app-sidebar'
import { VerbatimMark } from '../components/brand/mark'
import { PageBar, PageFrame } from '../components/shell/page-grid'
import { SEALAND_CLIENT_ID } from '../lib/config'
import { surface } from '../lib/nav'

import { HomePage } from '../components/pages/home'
import { HOME_DATA } from '../lib/pages/home-fixture'
import { MarketPicturePage } from '../components/pages/overview/picture'
import { PICTURE_FIXTURE } from '../components/pages/overview/picture/fixture'
import { WeekReadPage } from '../components/pages/week/read-page'
import { weekReadPage } from '../lib/pages/week-read'
import { sealandRead } from '../lib/test/weekly-read-fixture'
import type { AttributionInputs } from '../lib/brands/attribution'
import { VoiceSurfacePage } from '../components/pages/voice-surface'
import { conversationFixture } from '../components/pages/voice-surface/fixture-conversation'
import { CompetitivePage } from '../components/pages/competitive-surface/page'
import { designFixture } from '../components/pages/competitive-surface/page/fixture'
import { SubjectsPage } from '../components/pages/subjects/page'
import { marketSubjectsFixture, waterproofingFixture } from '../components/pages/subjects/fixture'
import { subjectsView, type SubjectReadLine } from '../lib/pages/subjects-view'
import { MovesPage } from '../components/pages/moves'
import { consideringFixture, statementsFixture } from '../components/pages/moves/fixture'
import { sealandMovesFixture } from '../components/pages/market-surface/fixture'
import { AskCard } from '../components/pages/agent/ask-card'
import { EarlierQuestions } from '../components/pages/agent/earlier'
import { PageTitle } from '../components/pages/studio/ui'
import { YourReports } from '../components/pages/studio/your-reports'
import { studioRows } from '../lib/pages/studio'
import { PRIVACY_LINE } from '../lib/reading/method'
import { SettingsFrame } from '../components/settings-frame'
import { SearchTerms } from '../components/pages/settings/search-terms'
import { YourAccounts } from '../components/pages/settings/your-accounts'
import { BrandsYouTrack, Communities, NotYourMarket } from '../components/pages/settings/tracked-cards'
import { whatYouTrack } from '../lib/pages/settings'

const args = process.argv.slice(2)
const flag = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const out = resolve(flag('out', 'scratch/pages-shots'))
const artboards = resolve(flag('artboards', '.'))
const only = flag('only', '')

const FONTS = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:ital,wght@0,400;0,500;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap'

// ---- the fixtures the routes would be given --------------------------------------

/** This week: the stored Sealand read through the page's own builder, with the
 *  brand split the render test pins (lib/pages/week-read.ts). */
function weekData() {
  const COTO = 'c0000000-0000-0000-0000-000000000001'
  const PATA = 'c0000000-0000-0000-0000-000000000002'
  const F1 = Array.from({ length: 16 }, (_, i) => `v${i}`)
  const audiences = new Map(F1.map((v) => [v, 'industry-other']))
  audiences.set('v0', 'competitor:Cotopaxi')
  audiences.set('v1', 'competitor:Cotopaxi')
  for (const v of ['q1', 'x1', 'x2', 'x3', 'w1']) audiences.set(v, 'industry-other')
  const attribution: AttributionInputs = {
    audiences,
    namings: new Map([
      ['v2', [{ brandKey: PATA, commentId: 'c2', month: '2026-09-01' }]],
      ['v3', [{ brandKey: PATA, commentId: 'c3', month: '2026-09-01' }]],
      ['w1', [{ brandKey: COTO, commentId: 'cw', month: '2026-09-01' }]],
    ]),
    brands: { client: 'Sealand', rivals: new Map([[COTO, 'Cotopaxi'], [PATA, 'Patagonia']]), counts: () => true },
  }
  const base = sealandRead()
  return weekReadPage({
    read: sealandRead({
      findings: base.findings.map((f, i) => (i === 0 ? { ...f, monthVideoIds: F1 } : f)),
      alsoHeard: [
        { themeId: 'ta', label: 'Confusion over airline size rules', videos: 3, videoIds: ['x1', 'x2', 'x3'] },
        { themeId: 'tb', label: 'Cotopaxi praised for practical travel', videos: 3, videoIds: ['w1'] },
      ],
    }),
    brand: 'Sealand',
    names: { client: 'Sealand', market: { long: 'Other bags in your market', short: 'other bags' } },
    attribution,
    themeComments: new Map([['t1', new Set(['c2', 'c3'])], ['tb', new Set(['cw'])]]),
    origins: new Map([['e:e2aa9829-a7ec-4947-ac47-387a9a14133c', { commentId: 'cq', videoId: 'q1' }]]),
  })
}

/** Subjects: the market fixture with the read's line on the open subject, as
 *  an owner sees it (the editor's controls drawn). */
function subjectsData() {
  const data = marketSubjectsFixture()
  const full = { ...data, list: { ...data.list, canEdit: true }, selected: { ...data.selected!, unanswered: waterproofingFixture().selected!.unanswered } }
  const read: SubjectReadLine = {
    month: '2026-09-01',
    sentence: 'Buyers ask for specific bags and replacements, naming size, colour, condition and office use before they buy.',
    contents: ['Searching for a specific bag', 'Looking for a better replacement bag'],
    quote: { ref: 'e:1', text: 'I think it’s time to buy the bluey purple smaller backpack! Great color and easier for me to fly with.', date: '2026-09-21', platform: 'youtube', thread: null },
  }
  return subjectsView(full, read, SEALAND_CLIENT_ID)
}

/** Your moves: the Sealand shortlist, no dated moves and no plans (the
 *  artboard's state), and the three real statements. */
function movesData() {
  const base = sealandMovesFixture()
  return { ...base, plans: [], moves: { ...base.moves, rows: [] }, advice: { ...base.advice, shortlist: { rows: consideringFixture(), earlier: 0 } } }
}

/** Studio: what production holds for Sealand on 1 Oct (the weekly read's one
 *  schedule, Daniela and Brayden; no brief schedule yet), seen by an owner. */
function studioData() {
  return studioRows({
    tenant: 'Sealand',
    schedules: [{ id: 's-wr', name: 'This week in your market', artefact: 'weekly_read', starter_key: 'weekly_read', recipients: ['daniela@sealandgear.com', 'brayden@sealandgear.com'], active: true }],
    sends: [],
    members: [
      { email: 'daniela@sealandgear.com', full_name: 'Daniela De Siena' },
      { email: 'brayden@sealandgear.com', full_name: 'Brayden' },
    ],
    now: new Date('2026-10-01T12:00:00Z'),
  })
}

/** Settings: Sealand's tracking config as the artboard read it
 *  (pages3_data.json `settings_tracking`). */
function settingsModel() {
  return whatYouTrack({
    tenant: 'Sealand',
    config: {
      brand_keywords: ['sealand gear', '#sealandgear', 'sealand bag'],
      industry_keywords: ['eco backpack', 'handmade bag', 'recycled bag', 'recycled sailcloth', 'sailcloth bag', 'sustainable backpack', 'sustainable fashion', 'travel gear', 'upcycled backpack', 'upcycled bag', 'made from waste', 'locally made south africa'],
      competitor_keywords: ['cotopaxi backpack', 'freitag bag', 'frtg', 'rareform bag', 'north face backpack', 'patagonia black hole', 'fombrand'],
      exclude_terms: ['argentina', 'chile', 'torres del paine', 'ecuador', 'volcano', 'schengen', 'immigration', 'border control', 'hip hop'],
      competitor_names: ['Cotopaxi', 'Freedom of Movement', 'Freitag', 'Old School', 'Patagonia', 'Rareform', 'The North Face'],
      competitor_handles: {
        Cotopaxi: { instagram: 'cotopaxi', tiktok: 'cotopaxiofficial', youtube: 'UCcotopaxi' },
        'Freedom of Movement': { instagram: 'fombrand', tiktok: 'fombrand' },
        Freitag: { instagram: 'freitaglab', tiktok: 'freitaglab', youtube: 'UCfreitag' },
        'Old School': { instagram: 'oldschool_ltd', tiktok: 'oldschool_ltd' },
        Patagonia: { instagram: 'patagonia', tiktok: 'patagonia', youtube: 'UCpatagonia' },
        Rareform: { instagram: 'rareform', tiktok: 'rareform' },
        'The North Face': { instagram: 'thenorthface', tiktok: 'thenorthface', youtube: 'UCtnf' },
      },
      own_handles: { instagram: 'sealandgear', tiktok: 'sealandgear', youtube: 'UCsealand' },
      subreddits: ['backpacks', 'onebag', 'travelgear'].map((name) => ({ name, status: 'active', discovered_at: '2026-09-01' })),
    },
    rivals: [],
    notMine: 0,
  })
}

const noop = async <T,>(prev: T): Promise<T> => prev

// ---- the pages, as their routes compose them -------------------------------------

interface Page { key: string; path: string; artboard: string; page: () => ReactNode }
const PAGES: Page[] = [
  { key: 'dashboard', path: '/dashboard', artboard: 'Page-Dashboard.dc.html', page: () => h(HomePage, { data: HOME_DATA }) },
  { key: 'your-market', path: '/dashboard/overview', artboard: 'Page-Your-market.dc.html', page: () => h(MarketPicturePage, { data: PICTURE_FIXTURE }) },
  { key: 'this-week', path: '/dashboard/week', artboard: 'Page-This-week.dc.html', page: () => h(WeekReadPage, { data: weekData(), title: surface('week').label }) },
  { key: 'conversation', path: '/dashboard/voice', artboard: 'Page-Conversation.dc.html', page: () => h(VoiceSurfacePage, { data: conversationFixture(), params: {} }) },
  { key: 'competitive', path: '/dashboard/competitive', artboard: 'Page-Competitive.dc.html', page: () => h(CompetitivePage, { data: designFixture() }) },
  { key: 'subjects', path: '/dashboard/subjects', artboard: 'Page-Subjects.dc.html', page: () => h(SubjectsPage, { view: subjectsData() }) },
  { key: 'your-moves', path: '/dashboard/market', artboard: 'Page-Your-moves.dc.html', page: () => h(MovesPage, { market: movesData(), statements: statementsFixture() }) },
  {
    key: 'agent', path: '/dashboard/agent', artboard: 'Page-Agent.dc.html',
    page: () => h(PageFrame, {
      className: 'gap-[22px]',
      children: h(Fragment, null,
        h(PageBar, { title: surface('ask').label }),
        h(AskCard, {
          canSend: true,
          window: { current: 'days90', href: { days90: '/dashboard/agent', all: '/dashboard/agent?window=all' } },
          asked: { asked: 0, cap: 40 },
          planLimit: 'PDF, up to 4 MB',
        }),
        h(EarlierQuestions, { history: null }),
      ),
    }),
  },
  {
    key: 'studio', path: '/dashboard/studio', artboard: 'Page-Studio.dc.html',
    page: () => h('div', { className: 'flex min-h-0 flex-1 flex-col gap-[22px] text-[#26292C]' },
      h(PageTitle, { title: surface('studio').label }),
      h(YourReports, { rows: studioData(), canEdit: true, privacy: PRIVACY_LINE }),
    ),
  },
  {
    key: 'settings', path: '/dashboard/settings', artboard: 'Page-Settings.dc.html',
    page: () => {
      const model = settingsModel()
      return h(SettingsFrame, {
        active: 'tracking', title: 'Settings', operator: false,
        children: h('div', { className: 'grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]' },
          h('div', { className: 'flex min-w-0 flex-col gap-5' },
            h(SearchTerms, { terms: model.terms, canEdit: true }),
            h(YourAccounts, { rows: model.ownAccounts, handles: model.ownHandles, canEdit: true, action: noop }),
          ),
          h('div', { className: 'flex min-w-0 flex-col gap-5' },
            h(BrandsYouTrack, { brands: model.brands, names: model.names, canEdit: true }),
            h(Communities, { communities: model.communities, canEdit: true }),
            h(NotYourMarket, { count: model.notMine }),
          ),
        ),
      })
    },
  },
]

// ---- the shell -----------------------------------------------------------------

const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} }

/** The wordmark as `SidebarWordmark` draws it (components/workspace-switcher-loader.tsx). */
const wordmark = () =>
  h('div', { className: 'px-3 pt-1 pb-[18px]' },
    h('div', { className: 'flex items-center gap-[7px]' },
      h(VerbatimMark, { size: 20, className: 'shrink-0 text-foreground' }),
      h('span', { className: 'text-[18px] leading-[normal] font-bold tracking-[-0.02em] text-foreground', style: { fontFamily: "'Bricolage Grotesque', sans-serif" } }, 'Verbatim'),
    ),
  )

/** app/dashboard/layout.tsx, as a client sees it, with the pane grown to the
 *  page (the harness's one change: `h-dvh` and the inner scroll go). */
const shell = (path: string, page: ReactNode) =>
  h(AppRouterContext.Provider, { value: router as never },
    h(PathnameContext.Provider, { value: path },
      h(SidebarProvider, { style: { '--sidebar-width': '16rem' } as never },
        h(AppSidebar, { header: wordmark() }),
        h('div', { className: 'relative flex flex-col flex-1 min-w-0 min-h-dvh bg-[#F7F6F2]' },
          h('main', { className: 'relative z-10 flex-1 min-h-0 p-6 pt-14 md:px-10 md:pt-7 md:pb-10' }, page),
        ),
      ),
    ),
  )

async function css(): Promise<string> {
  const src = readFileSync('app/globals.css', 'utf8')
  const res = await postcss([tailwind()]).process(src, { from: 'app/globals.css' })
  return res.css
}

const doc = (style: string, body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}"><style>${style}
html,body{margin:0;padding:0}
:root{--font-plex-sans:'IBM Plex Sans',-apple-system,'Segoe UI',sans-serif;--font-plex-serif:'IBM Plex Serif',Georgia,serif;--font-plex-mono:'IBM Plex Mono',ui-monospace,monospace;--font-emoji:'Apple Color Emoji','Segoe UI Emoji',sans-serif;--font-sans:var(--font-plex-sans);--font-serif:var(--font-plex-serif);--font-mono:var(--font-plex-mono)}
body{font-family:var(--font-sans);-webkit-font-smoothing:antialiased}
</style></head><body>${body}</body></html>`

const pair = (artboard: string, built: string, title: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#11110f;font-family:-apple-system,'Segoe UI',sans-serif}
.row{display:flex;gap:24px;padding:24px;align-items:flex-start}
figure{margin:0;flex:none;width:1440px}
figcaption{color:#e8e6df;font-size:22px;padding:0 0 10px;font-weight:600}
img{display:block;width:1440px;border:1px solid #3a382f}
h1{color:#e8e6df;font-size:26px;padding:24px 24px 0;margin:0}
</style></head><body><h1>${title}</h1><div class="row">
<figure><figcaption>the artboard (the spec)</figcaption><img src="file://${artboard}"></figure>
<figure><figcaption>the integration tree (pages/integration), from its fixture</figcaption><img src="file://${built}"></figure>
</div></body></html>`

async function main() {
  mkdirSync(out, { recursive: true })
  const style = await css()
  const pages = PAGES.filter((p) => !only || only.split(',').includes(p.key))
  for (const p of pages) writeFileSync(join(out, `built-${p.key}.html`), doc(style, renderToStaticMarkup(shell(p.path, p.page()))))

  await withBrowser(async (page) => {
    const shoot = async (url: string, file: string) => {
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
      await page.goto(url, { waitUntil: 'networkidle0' })
      await page.evaluate(() => document.fonts.ready)
      const height = await page.evaluate(() => Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)))
      await page.setViewport({ width: 1440, height, deviceScaleFactor: 1 })
      writeFileSync(file, await page.screenshot({ type: 'png' }))
    }
    for (const p of pages) {
      await shoot(`file://${join(out, `built-${p.key}.html`)}`, join(out, `built-${p.key}.png`))
      const art = join(artboards, p.artboard)
      if (!existsSync(art)) { console.log(`no artboard for ${p.key}`); continue }
      await shoot(`file://${art}`, join(out, `artboard-${p.key}.png`))
      const html = join(out, `side-by-side-${p.key}.html`)
      writeFileSync(html, pair(join(out, `artboard-${p.key}.png`), join(out, `built-${p.key}.png`), `${p.key}: the artboard (left) and the build (right)`))
      await page.setViewport({ width: 3000, height: 900, deviceScaleFactor: 1 })
      await page.goto(`file://${html}`, { waitUntil: 'networkidle0' })
      writeFileSync(join(out, `side-by-side-${p.key}.png`), await page.screenshot({ fullPage: true, type: 'png' }))
      console.log(`side-by-side-${p.key}.png`)
    }
  })
}

main().catch((e) => { console.error(e); process.exit(1) })
