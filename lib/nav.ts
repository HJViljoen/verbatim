import { OLD_PAGES_RETIRE_ON } from './config'
import { fullDate } from './format'
import type { PageKey } from './renderables/types'
import type { SessionContext } from './auth'
import { productsCategoryPath, productsProductPath } from './pages/v2/products-address'
import { adviceLanding } from './pages/v2/moves-address'
import { voicesLevelRedirect } from './pages/v2/voices-address'

/**
 * The shell's one table (Phase 1 WP9, items 42 and 38a, decision C).
 *
 * The sidebar, every page bar, the parked pages' banners and the redirect
 * stubs all read from here. They used to agree by copying: the sidebar held a
 * label, the page held its own title, the Guide held a third, and the three
 * drifted — the sidebar has said "Content" for a page routed at
 * `/dashboard/videos` since the day it shipped. One table means the label a
 * reader clicks and the title at the top of the page it opens cannot disagree,
 * and it means the question a page answers is written down once.
 *
 * NAV KEYS ARE NOT PAGE KEYS. A page key is a stored contract (what a snapshot
 * and a built report name). A nav key is an address in the shell. The
 * Dashboard, the Studio and Settings have no renderable module of their own;
 * the Agent's module is keyed `agent`, its nav key is `ask` and its address is
 * `/dashboard/agent`. Where a surface has both,
 * `page` names its page key, and that is the only place the two are joined.
 * The depth redesign (Design v2, Oct 2026) moved every reading page and kept
 * every page key: `PAGE_KEYS`, the registry and the block keys are unchanged,
 * so a stored report or share link renders as it did.
 */

export type NavKey =
  | 'home' | 'market' | 'voices' | 'products' | 'content' | 'moves'
  | 'ask' | 'studio' | 'settings'

/**
 * The sidebar's three groups (Design v2, every `E*.dc.html` sidebar): the six
 * pages, the Agent, and the foot. They are separated by space and a hairline
 * and carry NO label, so these names are addresses in code and never print.
 * The 1 Oct navigation's second group (`steer`: Subjects · Your moves) went
 * with Subjects, whose board is Market's now.
 */
export type NavGroup = 'read' | 'agent' | 'foot'

/** What the page bar at the top of the surface carries. */
export type BarKind =
  /** Title, the month selector and its one line ("as at the {update} update ·
   *  next update {date}"), horizon, Export (25 Sep rulings). */
  | 'reading'
  /** Title, the update and its comment window, Export. Dated by the update,
   *  not by the month, so no horizon: This week's bar, and Content's since
   *  Design v2 (its board opens on the week, and until its own page lands it
   *  draws This week). */
  | 'week'
  /** Title only. Nothing on the Dashboard, the Agent, the Studio or Settings
   *  is a reading of a month. */
  | 'title'

export interface Surface {
  key: NavKey
  href: string
  /** The sidebar label AND the page title — one string, deliberately. */
  label: string
  /** The one question the surface answers. Null where the surface is not a
   *  reading. */
  question: string | null
  group: NavGroup
  bar: BarKind
  /** False where the surface is a reading but not a reading of a WINDOW, so the
   *  horizon control would change nothing on it. Absent means true. */
  horizon?: false
  /** The page key this surface stores under, where it has one. */
  page?: PageKey
}

/**
 * The nine, in the sidebar's order (Design v2, decision 6 of the depth plan):
 * Dashboard · Market · Voices · Your products · Content · Your moves, then the
 * Agent, and at the foot Studio · Settings.
 *
 * WHERE THE 1 OCT PAGES WENT. Your market, This week and Subjects are
 * Market's (the week's news, the subject board, every conversation);
 * Conversation's open theme is Market's (`?conv=`) and its cast is Voices';
 * Competitive's brands are Voices' (`?brand=`); Your moves left
 * `/dashboard/market` for `/dashboard/moves`, and Market took the address.
 * Every old address redirects with its params mapped (`redirectFor`, below).
 *
 * PAGE KEYS DID NOT MOVE. Market stores under `overview` (Your market's key),
 * Voices under `voice`, Content under `content` (the parked Content module's
 * key) and Your moves under `market`, its key since deploy 2. Your products is
 * new and stores under nothing yet. The keys no surface names keep a reader's
 * name in `RETIRED_PAGE_NAMES`.
 *
 * THE DASHBOARD IS NAV KEY `home` WITH NO PAGE KEY. Page key `dashboard` is a
 * stored contract (a sent snapshot, a share link, Össur's digest schedule) and
 * names the legacy module, which stays in the registry and is never a route.
 *
 * NO HORIZON ANYWHERE. Each reading page of Design v2 switches its own period
 * (`?period=week|month|time`, the v2 kit's PeriodSwitch), which is not the
 * 1 Oct horizon pills, so `hasHorizon` stays false on every surface.
 */
export const SURFACES: readonly Surface[] = [
  { key: 'home', href: '/dashboard', label: 'Dashboard', question: 'What matters this week, across everything?', group: 'read', bar: 'title' },
  // MARKET (Design v2): the address Your moves held; Your market's page key.
  { key: 'market', href: '/dashboard/market', label: 'Market', question: 'What is the market talking about?', group: 'read', bar: 'reading', horizon: false, page: 'overview' },
  // VOICES: Conversation's cast and Competitive's brands; Conversation's page key.
  { key: 'voices', href: '/dashboard/voices', label: 'Voices', question: 'Who is saying it, and who matters?', group: 'read', bar: 'reading', horizon: false, page: 'voice' },
  // YOUR PRODUCTS is new: nothing has stored under it, so it names no page key.
  { key: 'products', href: '/dashboard/products', label: 'Your products', question: 'What is being said about what you sell?', group: 'read', bar: 'reading', horizon: false },
  // CONTENT takes the label the parked page at /dashboard/videos always had,
  // and its page key.
  { key: 'content', href: '/dashboard/content', label: 'Content', question: 'What should we post, and what works?', group: 'read', bar: 'week', page: 'content' },
  // YOUR MOVES MOVED (Design v2): `/dashboard/moves`, page key `market` unchanged.
  { key: 'moves', href: '/dashboard/moves', label: 'Your moves', question: 'What should we do as a business, and is it working?', group: 'read', bar: 'reading', horizon: false, page: 'market' },
  // THE AGENT (1 Oct): the label was "Ask". Its key stays `ask`, its address
  // `/dashboard/agent` and its page key `agent`.
  { key: 'ask', href: '/dashboard/agent', label: 'Agent', question: 'What does the conversation say about this?', group: 'agent', bar: 'title', page: 'agent' },
  { key: 'studio', href: '/dashboard/studio', label: 'Studio', question: 'Which reports go to whom, and where are the past issues?', group: 'foot', bar: 'title' },
  { key: 'settings', href: '/dashboard/settings', label: 'Settings', question: null, group: 'foot', bar: 'title', page: 'settings' },
]

/**
 * The horizon control appears only where a horizon means something: a reading
 * of calendar months. Not on the Dashboard, the Agent, the Studio or Settings,
 * and not on any reading page today: each one reads its own period
 * (`horizon: false`).
 */
export const hasHorizon = (s: Surface): boolean => s.bar === 'reading' && s.horizon !== false

export function surface(key: NavKey): Surface {
  const s = SURFACES.find((x) => x.key === key)
  if (!s) throw new Error(`no surface: ${key}`)
  return s
}

/** The surfaces in one sidebar group, in table order. */
export const surfacesIn = (group: NavGroup): Surface[] => SURFACES.filter((s) => s.group === group)

/** The anchor of the month's long-run read on Market › This month
 *  (components/pages/v2/market/long-run.tsx; Heinrich, 13 Oct). */
export const MARKET_LONG_RUN_ANCHOR = 'long-run'

// ---- Market's pages (depth as pages, 17 Oct) --------------------------------
//
// Market is a top layer and three kinds of page under it, each its own
// address (Heinrich, 16 Oct: "if for example you go on a subject, it could
// maybe fill the whole page"; the F2 boards, 17 Oct). Nothing opens in place:
//
//   /dashboard/market                         the top layer
//   /dashboard/market/week                    the week's read in full
//   /dashboard/market/subjects/<id>           a tracked subject, by its id
//   /dashboard/market/conversations/<conv>    a conversation, by its registry
//                                             id or an old link's slug
//
// Each level page reads `?period=` and `?month=` as the top page does; the
// table's `?in=` and `?all=1` stay on the top page, and `?at=` (where a panel
// opened) is retired. These are the ONE place the addresses are written:
// Market's own builders (lib/pages/v2/market.ts `convHref`, `subjectHref`),
// the Dashboard's tiles, the weekly email, Voices, Content, Your moves and the
// Agent all write through them, and `redirectFor` sends every older link here.

/** Market's week page: the published read, in full. */
export const MARKET_WEEK_PATH = '/dashboard/market/week'
/** The top page's table, where the week page's "Every conversation" lands. */
export const MARKET_TABLE_ANCHOR = 'conversations'

/** A tracked subject's page on Market. */
export const marketSubjectPath = (id: string): string => `${surface('market').href}/subjects/${encodeURIComponent(id)}`
/** A conversation's page on Market (a registry id, or an old link's slug). */
export const marketConversationPath = (id: string): string => `${surface('market').href}/conversations/${encodeURIComponent(id)}`

/** The period and month a Market address carries: the period left out on the
 *  week (the default), the month only off the week, as `YYYY-MM`. */
export function marketPeriodQuery(p: { period?: string | null; month?: string | null }): string {
  const q = new URLSearchParams()
  if (p.period && p.period !== 'week') q.set('period', p.period)
  if (p.month && p.period && p.period !== 'week') q.set('month', p.month.slice(0, 7))
  const qs = q.toString()
  return qs ? `?${qs}` : ''
}

/** A subject's page with the period and month kept. */
export const marketSubjectHref = (id: string, p: { period?: string | null; month?: string | null } = {}): string =>
  `${marketSubjectPath(id)}${marketPeriodQuery(p)}`
/** A conversation's page with the period and month kept. */
export const marketConversationHref = (id: string, p: { period?: string | null; month?: string | null } = {}): string =>
  `${marketConversationPath(id)}${marketPeriodQuery(p)}`

/** Whether a path is one of Market's pages (the top layer or a level page),
 *  for the redirect table's "an address something serves". */
export function isMarketPage(path: string): boolean {
  const market = surface('market').href
  return path === market || path === MARKET_WEEK_PATH
    || /^\/dashboard\/market\/(subjects|conversations)\/[^/]+$/.test(path)
}

/**
 * Market › This month for one month (`?period=month&month=YYYY-MM`), with an
 * anchor where given: where the operator's review email sends the reader of
 * the month's long-run read. `month` is `YYYY-MM` or a date. The same address
 * Market's own `marketHref({ period: 'month', month })` writes (pinned in
 * lib/pages/v2/market.test.ts).
 */
export function marketMonthHref(month: string, hash?: string): string {
  return `${surface('market').href}?period=month&month=${month.slice(0, 7)}${hash ? `#${hash}` : ''}`
}

/**
 * A READER'S NAME FOR EVERY PAGE KEY NO SURFACE STORES UNDER.
 *
 * The Studio names a stored section by the page a reader knows it as
 * (`catalogueReaderTitle`, lib/reports/catalogue.ts), and that is a surface's
 * label wherever a surface names the key. Design v2 left four keys with no
 * surface: they are the pages a stored section was built from, so they keep
 * the name the reader knew them by rather than falling back to a renderer's
 * heading ("Competitive Intelligence") or to the bare key (`week` has no
 * module to take a heading from).
 */
export const RETIRED_PAGE_NAMES: Readonly<Partial<Record<PageKey, string>>> = {
  subjects: 'Subjects',
  competitive: 'Competitive',
  week: 'This week',
  // The legacy Dashboard module (page key `dashboard`): one sent snapshot, one
  // share link and Össur's weekly schedule name it.
  dashboard: 'Dashboard',
  // Consumer Profile, parked since Phase 1: its module's own title.
  profile: 'Consumer Profile',
}

/** The name a reader knows a page key by: its surface's label, else its
 *  retired page's name. Null only for a key neither names, which
 *  `lib/nav.test.ts` proves is none of them. */
export function pageKeyName(page: PageKey): string | null {
  return SURFACES.find((s) => s.page === page)?.label ?? RETIRED_PAGE_NAMES[page] ?? null
}

/**
 * Live addresses that are not one of the nine but belong under one.
 *
 * Team and Plan & billing are reached from the Settings rail and are Settings
 * as far as a reader is concerned. Reports only redirects into the Studio now,
 * so for the moment it takes to resolve it lights the Studio. A parked page is
 * deliberately NOT here: a page that is going must not light the page that
 * replaced it.
 */
const UNDER: Readonly<Record<string, NavKey>> = {
  '/dashboard/team': 'settings',
  '/dashboard/billing': 'settings',
  '/dashboard/reports': 'studio',
}

/**
 * Which surface a path belongs to, for the active-nav mark.
 *
 * `/dashboard` is exact-matched because every dashboard path starts with it.
 * Longest match otherwise, so `/dashboard/settings/tracking` lights Settings
 * and `/dashboard/market-intel` lights nothing (a parked page is not one of
 * the nine).
 */
export function surfaceForPath(pathname: string): Surface | null {
  let best: Surface | null = null
  for (const s of SURFACES) {
    const hit = s.href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname === s.href || pathname.startsWith(`${s.href}/`)
    if (hit && (!best || s.href.length > best.href.length)) best = s
  }
  if (best) return best
  for (const [href, key] of Object.entries(UNDER)) {
    if (pathname === href || pathname.startsWith(`${href}/`)) return surface(key)
  }
  return null
}

/** A Next page's search params, as a page receives them. */
export type SearchParams = Record<string, string | string[] | undefined>
/** A page's props when it reads nothing but its search params. */
export type SearchProps = { searchParams?: Promise<SearchParams> }

/** `href` with these params as its query string, every value kept (a repeated
 *  key stays repeated). For a redirect that must not drop a deep link. A
 *  `#fragment` on `href` stays at the end, after the query. */
export function withQuery(href: string, params: SearchParams = {}): string {
  const hash = href.indexOf('#')
  const [path, fragment] = hash === -1 ? [href, ''] : [href.slice(0, hash), href.slice(hash)]
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    for (const x of Array.isArray(v) ? v : [v]) if (x !== undefined) q.append(k, x)
  }
  const qs = q.toString()
  return qs ? `${path}?${qs}${fragment}` : `${path}${fragment}`
}

/**
 * `/dashboard?month=…` WAS YOUR MARKET (page review §5.1). Until 1 Oct the
 * front page was Your market, and the monthly email linked a month there; one
 * already in an inbox still does. The Dashboard reads no month, so a request
 * carrying one lands where Your market's month is now (Market, that month),
 * with its whole query; any other request is the Dashboard's. Null means stay.
 */
export function frontRedirect(params: SearchParams = {}): string | null {
  return redirectFor('/dashboard', params)
}

// ---- The pages that are retiring --------------------------------------------

export interface OldPage {
  /** Where the old page lives during the window. Market and Competitive move
   *  aside because the new pages take their addresses; Content keeps its own,
   *  which it never shared with its label. */
  href: string
  label: string
  /** The surface that reads this material now, and the part of it that does
   *  not move yet — said plainly rather than implied by silence. */
  replacedBy: NavKey
  /** One clause, appended to the banner, when the replacement is partial. */
  caveat?: string
}

/** The three parked reading pages. A tenant no longer reaches them
 *  (TENANT_RETIRED, 1 Oct); the operator still does, under this banner. */
export const OLD_PAGES: readonly OldPage[] = [
  // Its advice and moves are Your moves' (Design v2 moved them to /dashboard/moves).
  { href: '/dashboard/market-intel', label: 'Market Intelligence', replacedBy: 'moves' },
  // Its brands are Voices' (Design v2: Competitive folded into Voices).
  { href: '/dashboard/competitive-intel', label: 'Competitive Intelligence', replacedBy: 'voices' },
  {
    href: '/dashboard/videos',
    // "Old Content", not "Content": Design v2 gave the label to the page that
    // replaces this one, and "Content is being replaced by Content" says
    // nothing. The tab and the banner read this name.
    label: 'Old Content',
    replacedBy: 'content',
    // NO CAVEAT. What worked and the comments worth a reply are Content's
    // (Design v2; This week held them from 1 Oct until then).
  },
]

/** The parked page at exactly this address. Throws rather than returning null:
 *  a page asking for its own banner has to get one. */
export function oldPage(href: string): OldPage {
  const p = OLD_PAGES.find((x) => x.href === href)
  if (!p) throw new Error(`no old page: ${href}`)
  return p
}

/** "30 Nov 2026" — every banner reads the same constant, never the clock:
 *  computing it per render would let two banners disagree across midnight. */
export const retireDate = (): string => fullDate(`${OLD_PAGES_RETIRE_ON}T00:00:00.000Z`)

/**
 * Settings › Initiatives, parked rather than redirected.
 *
 * It is not in `OLD_PAGES` because `OLD_PAGES` is the three parked reading
 * pages and this is a Settings sub-page, reached from the settings rail and
 * from the two "Manage what you track →" tiles. It is parked for the same
 * reason Market Intelligence is: it is the only place a client can rename,
 * finish or stop an initiative, and Market's `moves` panel — the thing that
 * takes the job — is WP14. Redirected, the address landed on a shell that says
 * it is being built, and the capability was gone until WP14 with nothing
 * saying so. The banner, the replacement's name and the date come from the
 * same composer as the other three.
 */
export const PARKED_INITIATIVES: OldPage = {
  href: '/dashboard/settings/initiatives',
  label: 'Initiatives',
  replacedBy: 'moves',
  caveat: 'Renaming, finishing and stopping one happens here until Your moves can do it.',
}

/** What a parked page says at the top of itself. */
export function oldPageBanner(page: OldPage): { title: string; body: string; cta: string; href: string } {
  const to = surface(page.replacedBy)
  return {
    title: `${page.label} is being replaced by ${to.label}`,
    body: `This page stays available until ${retireDate()}${page.caveat ? `. ${page.caveat}` : '.'}`,
    cta: `Go to ${to.label}`,
    href: to.href,
  }
}

// ---- Addresses a tenant no longer reaches -----------------------------------

/**
 * The parked pages and the Settings sub-pages that RETIRE FOR TENANTS (U12 and
 * U7; page review §4; the pages build of 1 Oct), and where a tenant lands
 * instead. The operator keeps every one of them: each still serves, with its
 * banner where it has one, for a session `getSessionContext().operator` names.
 *
 *   Market Intelligence      → Your moves   (its advice and moves live there)
 *   Competitive Intelligence → Voices       (the brands live there, Design v2)
 *   Content (old)            → Content      (what works and worth a reply)
 *   Settings › Initiatives   → Your moves   (Date a move and Mark done, U12)
 *   Settings › Readiness, The record, How to read → Settings (operator only
 *     or cut for clients, page review §1 Settings)
 *
 * A target is an address something serves today, which `lib/nav.test.ts` pins.
 */
export const TENANT_RETIRED: Readonly<Record<string, string>> = {
  '/dashboard/market-intel': '/dashboard/moves',
  '/dashboard/competitive-intel': '/dashboard/voices',
  '/dashboard/videos': '/dashboard/content',
  '/dashboard/settings/initiatives': '/dashboard/moves',
  '/dashboard/settings/readiness': '/dashboard/settings',
  '/dashboard/settings/record': '/dashboard/settings',
  '/dashboard/settings/how-to-read': '/dashboard/settings',
}

/**
 * Where a session is sent from an address that retired for tenants: the
 * replacement for a tenant user, null for the operator (who keeps the page).
 * Pure, so both answers are tested; each page asks it before it reads
 * anything and redirects on a non-null. Throws on an address that is not in
 * the table: a page asking for its own way out has to have one.
 */
export function tenantAway(session: Pick<SessionContext, 'operator'>, href: string): string | null {
  const to = TENANT_RETIRED[href]
  if (to === undefined) throw new Error(`not retired for tenants: ${href}`)
  return session.operator === null ? to : null
}

// ---- Addresses that lose their page -----------------------------------------

/**
 * The addresses that no longer have a page of their own, and where a reader
 * lands. Every one is a thin `page.tsx` calling `redirect()` with
 * `redirectFor` (below), never `next.config.ts` — that file's own header
 * forbids `redirects()` because config redirects run before `proxy.ts`'s host
 * routing. And none has a `loading.tsx` above it: a Suspense boundary streams
 * the shell first and turns the 307 into a client-side hop
 * (`lib/dashboard-loading.test.ts` INHERITS).
 *
 * Phase 1 emptied four (refute-06 §2.4: the orphans nothing stored points at).
 * Design v2 empties five reading pages that stored snapshots, sent emails and
 * share links DO point at, which is why each keeps its params: the value here
 * is the landing with no params, and `redirectFor` maps the ones that name
 * something (`?theme=`, `?vs=`, `?item=`, `?month=`). Initiatives is not
 * here: a redirect is only honest where nothing is lost, and that page is the
 * only place an initiative can be renamed, finished or stopped. See
 * PARKED_INITIATIVES above.
 *
 * A TARGET IS AN ADDRESS THAT EXISTS TODAY, not the address it will have when
 * the work package that owns it lands. `/dashboard/settings/how-to-read` was
 * WP16's, and until WP16 built it a reader sent there got Next's bare 404 —
 * there is no `app/not-found.tsx` in this app, so the bare default is what a
 * bookmark and a live legend link reached. It landed on Settings itself for
 * that window, and the Guide now points at the sub-page that replaced it.
 * `lib/nav.test.ts` pins the rule: a target must be an address something
 * actually serves — one of the nine, or one of the settings area's own nine
 * (`lib/settings/rail.ts` SETTINGS_ADDRESSES).
 */
export const RETIRED_ADDRESSES: Readonly<Record<string, string>> = {
  // Design v2 (decision 6). Your market's month, This week's news and the
  // subject board are Market's; Conversation's open theme is Market's too
  // (`redirectFor`), and the rest of it, the cast and a brand's videos, is
  // Voices'; Competitive's brands are Voices'.
  '/dashboard/overview': '/dashboard/market',
  '/dashboard/week': '/dashboard/market',
  '/dashboard/voice': '/dashboard/voices',
  '/dashboard/competitive': '/dashboard/voices',
  '/dashboard/subjects': '/dashboard/market',
  // Consumer Profile's personas are Voices' groups now (they were
  // Conversation's cast, `/dashboard/voice#cast`).
  '/dashboard/profile': '/dashboard/voices',
  // How to read is cut for clients (page review §1 Settings), so the Guide
  // lands on Settings itself (page review §4).
  '/dashboard/guide': '/dashboard/settings',
  '/dashboard/settings/connections': '/dashboard/settings',
  // Reports folded into the Studio (1 Oct). The page keeps the query string, so
  // `?group=`, `?item=` and `?view=` reach the Studio's past issues.
  '/dashboard/reports': '/dashboard/studio',
}

/** What a redirect may need that its address does not carry, read by the
 *  page that asks (Your products: a product's category, from the catalogue). */
export interface RedirectKnown {
  /** The category a product sits in; null for one the catalogue does not hold. */
  productGroup?: (productId: string) => string | null
}

// ---- YOUR MOVES (levels as pages, 17 Oct; the G6 boards) -------------------
//
// A piece of advice, the advice record and a dated move are pages now
// (lib/pages/v2/moves-address.ts). Every older selection lands on its page
// in ONE hop, every other param kept: Your moves' own `?advice=` (a lineage,
// a recommendation id, or `all` for the record), the three it answered to
// before Design v2 (`?item=`, `?rec=`, `?ledger=`), and the same three on
// Market's address, where Your moves lived until Design v2.

/** Your moves' legacy deep links on `/dashboard/market`, in the order one wins
 *  over another: `?item=<lineage>` (the ledger's row), `?rec=<id>` (the
 *  digest's, four sent emails), `?ledger=all` (Show all). */
const MOVES_PARAMS = ['item', 'rec', 'ledger'] as const
/** Your moves' selection on its own address: `?advice=` first, then the
 *  three above. */
const MOVES_OWN_PARAMS = ['advice', ...MOVES_PARAMS] as const

/** The first of `keys` a link carries, landed on its page (`all`, the record;
 *  else that piece of advice), those keys dropped and the rest kept; null
 *  where it carries none. */
function movesRedirect(params: SearchParams, keys: readonly string[]): string | null {
  const advice = keys.map((k) => value(params[k])).find((v) => v !== undefined)
  return advice === undefined ? null : withQuery(adviceLanding(advice), remap(params, keys))
}
// ---- (end of Your moves) ----------------------------------------------------

/** A param's value, a repeated key's first; an empty one is no value. */
function value(v: string | string[] | undefined): string | undefined {
  const x = (Array.isArray(v) ? v[0] : v)?.trim()
  return x ? x : undefined
}

/** These params without the named keys, and with `over` written first, in
 *  its order: the landing's own params lead the query, the rest follow as
 *  they came. An `over` value that is undefined is not written. */
function remap(params: SearchParams, drop: readonly string[], over: Record<string, string | undefined> = {}): SearchParams {
  const out: SearchParams = {}
  for (const [k, v] of Object.entries(over)) if (v !== undefined) out[k] = v
  for (const [k, v] of Object.entries(params)) if (!drop.includes(k) && !(k in out)) out[k] = v
  return out
}

/** `?month=` on a page that read one month lands on Market's month view: the
 *  period says which view, the month which month (`?period=month&month=`).
 *  A `?period=` the link already carries wins, and its month travels as it
 *  came. */
function marketMonth(params: SearchParams): Record<string, string | undefined> {
  const month = value(params.month)
  return month !== undefined && params.period === undefined ? { period: 'month', month } : {}
}

// ---- Content's pages (depth as pages, 17 Oct; the G5 boards) ---------------
//
// Content is a root page and three kinds of page under it, each its own
// address; nothing opens in place:
//
//   /dashboard/content                  the root
//   /dashboard/content/ideas/<id>       a post idea, by `post_ideas.id`
//   /dashboard/content/replies          the comments worth a reply
//   /dashboard/content/posts            your own posts this month
//
// The pages' own builders are lib/pages/v2/content-address.ts; the two paths
// below are here because `redirectFor` sends the root's old panel params to
// them. An old `?idea=<rank>` names a place in a week's set, not an idea, so
// only the page, which reads the set, can resolve it: `contentRedirect`
// leaves it to the page (`ideaLanding`, content-address.ts).

/** The reply list's page. */
export const CONTENT_REPLIES_PATH = '/dashboard/content/replies'
/** Your posts' page. */
export const CONTENT_POSTS_PATH = '/dashboard/content/posts'
/** The reply list's sections, by the old list's tab (`?reply=<intent>`). */
export const REPLY_SECTION_ANCHORS: Readonly<Record<string, string>> = { buying: 'buy', question: 'questions', objection: 'objections', misinformation: 'wrong' }
/** The root's own params, which no level page reads. */
export const CONTENT_ROOT_PARAMS = ['idea', 'replies', 'reply', 'posts', 'asked'] as const

/** Where an old Content link lands: `?replies=1` and `?reply=<intent>` on the
 *  reply list's page (the intent its section's anchor, the period kept),
 *  `?posts=1` on your posts' page. Null for the root itself and for a rank
 *  (`?idea=1` to `3`), which the page resolves. Pure. */
export function contentRedirect(params: SearchParams = {}): string | null {
  const rank = value(params.idea)
  if (rank === '1' || rank === '2' || rank === '3') return null
  if (params.replies !== undefined || params.reply !== undefined) {
    const anchor = REPLY_SECTION_ANCHORS[value(params.reply) ?? '']
    return withQuery(`${CONTENT_REPLIES_PATH}${anchor ? `#${anchor}` : ''}`, remap(params, CONTENT_ROOT_PARAMS))
  }
  if (params.posts !== undefined) return withQuery(CONTENT_POSTS_PATH, remap(params, [...CONTENT_ROOT_PARAMS, 'period']))
  return null
}

/**
 * WHERE AN OLD ADDRESS LANDS NOW, its params mapped (Design v2, decision 6).
 * The ONE place the mapping is written: every redirect stub, the Dashboard's
 * month redirect and Market's legacy-param redirect ask it, and
 * `lib/nav-redirects.test.ts` holds it to a table of old links.
 *
 *   /dashboard?month=M          → /dashboard/market?period=month&month=M
 *   /dashboard/market?item=L    → /dashboard/moves/advice/L   (also ?rec=; ?ledger=all → /dashboard/moves/advice)
 *   /dashboard/moves?advice=L   → /dashboard/moves/advice/L   (also ?item=, ?rec=; `all` → /dashboard/moves/advice)
 *   /dashboard/market?conv=C    → /dashboard/market/conversations/C   (17 Oct)
 *   /dashboard/market?subject=S → /dashboard/market/subjects/S        (17 Oct)
 *   /dashboard/overview?month=M → /dashboard/market?period=month&month=M
 *   /dashboard/week             → /dashboard/market
 *   /dashboard/voice?theme=T    → /dashboard/market/conversations/T   (or ?themes=T,…: the first)
 *   /dashboard/voice            → /dashboard/voices           (the cast; ?persona=, ?brand=: Voices' pages)
 *   /dashboard/competitive?vs=B → /dashboard/voices/brands/B   (Voices' block, below)
 *   /dashboard/subjects?item=S  → /dashboard/market/subjects/S
 *   /dashboard/products?group=G → /dashboard/products/G           (17 Oct; ?unclear=all kept)
 *   /dashboard/products?product=P → /dashboard/products/<its category>/P
 *   /dashboard/voices?group=G   → /dashboard/voices/groups/G   (17 Oct; ?persona=, ?brand=, ?creator=: Voices' block)
 *   /dashboard/content?replies=1 → /dashboard/content/replies  (17 Oct; ?reply=I its section, ?posts=1 → /dashboard/content/posts)
 *   /dashboard/content?idea=N   → the idea's page, resolved by the page (`ideaLanding`)
 *   the other RETIRED_ADDRESSES → their target, query kept
 *
 * Every param the mapping does not name travels as it came (a repeated key
 * stays repeated). A `?month=` landing on Market from a page that read one
 * month (Your market, Conversation, Subjects, the Dashboard's old link) gets
 * `period=month` with it. Null means the address still serves its own page:
 * the Dashboard without a month, Market without Your moves' params or an open
 * panel's, Your moves without an old selection, and any address this table
 * does not know. The panel redirects are
 * permanent: stored snapshots, emails and share pages carry `?conv=` and
 * `?subject=`, and a stored link is never rewritten.
 *
 * A `#fragment` never reaches the server, so nothing here can read one. The
 * browser carries the old one onto a Location that has none (RFC 9110
 * §10.2.2): `/dashboard/voice#cast` lands on `/dashboard/voices#cast`, and a
 * fragment the new page has no id for scrolls nowhere.
 */
export function redirectFor(path: string, params: SearchParams = {}, known: RedirectKnown = {}): string | null {
  // ---- VOICES' LEVELS ARE PAGES (17 Oct, the G3 boards) ----------------------
  // `?group=` / `?persona=`, `?brand=` and `?creator=` opened a panel in place
  // on Voices (and on the old Conversation page, `/dashboard/voice`), and
  // Competitive's `?vs=` named a brand: each lands on its level page in one
  // hop, every other param kept (lib/pages/v2/voices-address.ts, where the
  // addresses are written once). `undefined` is "not Voices' to answer".
  const voices = voicesLevelRedirect(path, params)
  if (voices !== undefined) return voices
  // ---- end of Voices' block ----------------------------------------------------
  switch (path) {
    case '/dashboard':
      return value(params.month) === undefined ? null : redirectFor('/dashboard/overview', params)
    case '/dashboard/market': {
      // Your moves' old deep links, straight to their page (one hop).
      const moves = movesRedirect(params, MOVES_PARAMS)
      if (moves) return moves
      // MARKET'S OPEN PANELS ARE PAGES (17 Oct): `?conv=` and `?subject=`
      // opened a panel in place, and stored snapshots, sent emails and share
      // pages carry them, so they redirect for good, every other param kept
      // and the retired `?at=` dropped. A conversation wins where a link
      // carried both, as the panel's did.
      const conv = value(params.conv)
      if (conv !== undefined) return withQuery(marketConversationPath(conv), remap(params, ['conv', 'subject', 'at']))
      const subject = value(params.subject)
      if (subject !== undefined) return withQuery(marketSubjectPath(subject), remap(params, ['subject', 'at']))
      return null
    }
    // YOUR MOVES' LEVELS ARE PAGES (17 Oct): `?advice=` (and `?item=`,
    // `?rec=`, `?ledger=`) opened in place; each lands on its page for good.
    case '/dashboard/moves':
      return movesRedirect(params, MOVES_OWN_PARAMS)
    case '/dashboard/overview':
      return withQuery(RETIRED_ADDRESSES[path], remap(params, [], marketMonth(params)))
    case '/dashboard/subjects': {
      const item = value(params.item)
      return item === undefined
        ? withQuery(RETIRED_ADDRESSES[path], remap(params, ['item'], marketMonth(params)))
        : withQuery(marketSubjectPath(item), remap(params, ['item'], marketMonth(params)))
    }
    case '/dashboard/voice': {
      // `?theme=` is a registry id (the Conversation board's own links);
      // `?themes=` is a stored link's comma list of theme slugs, and the page
      // opened the biggest it named, so the first stands in for it here.
      const theme = value(params.theme) ?? value(params.themes)?.split(',').map((s) => s.trim()).find(Boolean)
      return theme === undefined
        ? withQuery(RETIRED_ADDRESSES[path], remap(params, ['theme', 'themes']))
        : withQuery(marketConversationPath(theme), remap(params, ['theme', 'themes'], marketMonth(params)))
    }
    case '/dashboard/competitive':
      return withQuery(RETIRED_ADDRESSES[path], remap(params, ['vs'], { brand: value(params.vs) }))
    // ---- YOUR PRODUCTS' PANELS ARE PAGES (17 Oct; the G4 boards) ----------
    // `?group=` opened a category's panel in place, `?product=` a product's,
    // and `?unclear=all` the category's whole couldn't-tell-which list.
    // Settings' "Tag them", the Dashboard's tile, Voices and sent weekly
    // emails carry them, so they redirect for good, `?month=` and every other
    // param kept. A product's page nests under its category, which the
    // address does not name: the root page reads its catalogue and passes
    // `known.productGroup`. A product wins where a link carried both, as the
    // panel did; one the catalogue does not hold falls back to the category,
    // else stays on the root (which reads neither param now).
    case '/dashboard/products': {
      const product = value(params.product)
      const group = value(params.group)
      const home = product !== undefined ? known.productGroup?.(product) ?? null : null
      if (product !== undefined && home) return withQuery(productsProductPath(home, product), remap(params, ['group', 'product', 'unclear']))
      if (group !== undefined) return withQuery(productsCategoryPath(group), remap(params, ['group', 'product']))
      return null
    }
    // Content's open panels are pages (17 Oct): `contentRedirect` above.
    case '/dashboard/content':
      return contentRedirect(params)
    default: {
      const to = RETIRED_ADDRESSES[path]
      return to === undefined ? null : withQuery(to, params)
    }
  }
}

/**
 * The landing for an address in RETIRED_ADDRESSES, for its redirect stub.
 * Throws on any other address: a stub asking for its own way out has to have
 * one.
 */
export function retiredTo(path: string, params: SearchParams = {}): string {
  const to = RETIRED_ADDRESSES[path] === undefined ? null : redirectFor(path, params)
  if (to === null) throw new Error(`not a retired address: ${path}`)
  return to
}
