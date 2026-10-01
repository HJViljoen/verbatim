import { OLD_PAGES_RETIRE_ON } from './config'
import { fullDate } from './format'
import type { PageKey } from './renderables/types'
import type { SessionContext } from './auth'

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
 */

export type NavKey =
  | 'home' | 'overview' | 'week' | 'voice' | 'competitive' | 'subjects' | 'market'
  | 'ask' | 'studio' | 'settings'

/**
 * The sidebar's four groups (the navigation design of 1 Oct, `sidebar2.py`):
 * the pages that read the market, the two the client steers, the Agent, and
 * the foot. They are separated by space and a hairline and carry NO label, so
 * these names are addresses in code and never print.
 */
export type NavGroup = 'read' | 'steer' | 'agent' | 'foot'

/** What the page bar at the top of the surface carries. */
export type BarKind =
  /** Title, the month selector and its one line ("as at the {update} update ·
   *  next update {date}"), horizon, Export (25 Sep rulings). */
  | 'reading'
  /** Title, the update and its comment window, Export. This week is dated by
   *  the update, not by the month, so it takes no horizon. */
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
 * The ten, in the sidebar's order (the navigation design of 1 Oct; page review
 * §4): Dashboard · Your market · This week · Conversation · Competitive, then
 * Subjects · Your moves, then the Agent, and at the foot Studio · Settings.
 *
 * KEYS, ADDRESSES AND PAGE KEYS DO NOT CHANGE WITH A LABEL, so no stored report
 * or link breaks. Two labels changed on 1 Oct: Brands is "Competitive" again and
 * Ask is "Agent". One address moved: Your market left `/dashboard` for
 * `/dashboard/overview`, and the new Dashboard took `/dashboard`.
 *
 * THE DASHBOARD IS NAV KEY `home` WITH NO PAGE KEY. Page key `dashboard` is a
 * stored contract (a sent snapshot, a share link, Össur's digest schedule) and
 * names the legacy module, which stays in the registry and is never a route.
 *
 * Reports is not one of the ten any more: it folded into the Studio, and
 * `/dashboard/reports` redirects there (RETIRED_ADDRESSES). The Studio is one
 * of the ten because it is shown to clients now (STUDIO_TENANT_VISIBLE).
 */
export const SURFACES: readonly Surface[] = [
  { key: 'home', href: '/dashboard', label: 'Dashboard', question: 'What is happening in your market right now?', group: 'read', bar: 'title' },
  // YOUR MARKET MOVED (1 Oct, page review §5.1): `/dashboard/overview`, page
  // key `overview` unchanged. `/dashboard?month=` still lands here (the
  // monthly email's link before it was retargeted), by the Dashboard's own
  // redirect. NO HORIZON: every block reads the reading month.
  { key: 'overview', href: '/dashboard/overview', label: 'Your market', question: 'What is your market saying this month, and what changed?', group: 'read', bar: 'reading', horizon: false, page: 'overview' },
  { key: 'week', href: '/dashboard/week', label: 'This week', question: 'What needs attention this week?', group: 'read', bar: 'week', page: 'week' },
  // CONVERSATION: the key, the address and the page key stay `voice`, so no
  // stored link or report breaks. No horizon: every block reads the month.
  { key: 'voice', href: '/dashboard/voice', label: 'Conversation', question: 'Everything your market talked about, in full', group: 'read', bar: 'reading', horizon: false, page: 'voice' },
  // COMPETITIVE AGAIN (1 Oct): it was "Brands" from deploy 5. The key, the
  // address and the page key stayed `competitive` throughout. No horizon.
  { key: 'competitive', href: '/dashboard/competitive', label: 'Competitive', question: 'Which brands come up in your market, and what is said around them?', group: 'read', bar: 'reading', horizon: false, page: 'competitive' },
  // SUBJECTS: no horizon pills (27 Sep ruling); the page still reads
  // `?horizon=` for its questions pane (lib/pages/subjects.ts).
  { key: 'subjects', href: '/dashboard/subjects', label: 'Subjects', question: 'How big is each subject in your market, month by month?', group: 'steer', bar: 'reading', horizon: false, page: 'subjects' },
  { key: 'market', href: '/dashboard/market', label: 'Your moves', question: 'What should we do, and is it working?', group: 'steer', bar: 'reading', horizon: false, page: 'market' },
  // THE AGENT (1 Oct): the label was "Ask". Its key stays `ask`, its address
  // `/dashboard/agent` and its page key `agent`.
  { key: 'ask', href: '/dashboard/agent', label: 'Agent', question: 'What does the conversation say about this?', group: 'agent', bar: 'title', page: 'agent' },
  { key: 'studio', href: '/dashboard/studio', label: 'Studio', question: 'Which reports go to whom, and where are the past issues?', group: 'foot', bar: 'title' },
  { key: 'settings', href: '/dashboard/settings', label: 'Settings', question: null, group: 'foot', bar: 'title', page: 'settings' },
]

/**
 * The horizon control appears only where a horizon means something: a reading
 * of calendar months. Not on This week (dated by the update), not on the
 * Dashboard, the Agent, the Studio or Settings, and not on any reading page
 * today: each one reads its month in every block (`horizon: false`).
 */
export const hasHorizon = (s: Surface): boolean => s.bar === 'reading' && s.horizon !== false

export function surface(key: NavKey): Surface {
  const s = SURFACES.find((x) => x.key === key)
  if (!s) throw new Error(`no surface: ${key}`)
  return s
}

/** The surfaces in one sidebar group, in table order. */
export const surfacesIn = (group: NavGroup): Surface[] => SURFACES.filter((s) => s.group === group)

/**
 * Live addresses that are not one of the ten but belong under one.
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
 * the ten).
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
 *  key stays repeated). For a redirect that must not drop a deep link. */
export function withQuery(href: string, params: SearchParams = {}): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    for (const x of Array.isArray(v) ? v : [v]) if (x !== undefined) q.append(k, x)
  }
  const qs = q.toString()
  return qs ? `${href}?${qs}` : href
}

/**
 * `/dashboard?month=…` WAS YOUR MARKET (page review §5.1). Until 1 Oct the
 * front page was Your market, and the monthly email linked a month there; one
 * already in an inbox still does. The Dashboard reads no month, so a request
 * carrying one lands on Your market with its whole query; any other request is
 * the Dashboard's. Null means stay.
 */
export function frontRedirect(params: SearchParams = {}): string | null {
  return params.month === undefined ? null : withQuery(surface('overview').href, params)
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
  { href: '/dashboard/market-intel', label: 'Market Intelligence', replacedBy: 'market' },
  { href: '/dashboard/competitive-intel', label: 'Competitive Intelligence', replacedBy: 'competitive' },
  {
    href: '/dashboard/videos',
    label: 'Content',
    replacedBy: 'week',
    // NO CAVEAT NOW. It said "Comments worth a reply stay here for now" while
    // WK2 had nowhere to go; the worth-a-reply block is on This week
    // (components/pages/week/reply.tsx), so everything on this page has moved.
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
  replacedBy: 'market',
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
 *   Competitive Intelligence → Competitive
 *   Content                  → This week    (worth a reply lives there)
 *   Settings › Initiatives   → Your moves   (Date a move and Mark done, U12)
 *   Settings › Readiness, The record, How to read → Settings (operator only
 *     or cut for clients, page review §1 Settings)
 *
 * A target is an address something serves today, which `lib/nav.test.ts` pins.
 */
export const TENANT_RETIRED: Readonly<Record<string, string>> = {
  '/dashboard/market-intel': '/dashboard/market',
  '/dashboard/competitive-intel': '/dashboard/competitive',
  '/dashboard/videos': '/dashboard/week',
  '/dashboard/settings/initiatives': '/dashboard/market',
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
 * The addresses Phase 1 empties, and where each reader should land (refute-06
 * §2.4: the four orphans are exactly the ones nothing stored points at, which
 * is why a redirect can cover them at all). Initiatives left this list again:
 * a redirect is only honest where nothing is lost, and that page is the only
 * place an initiative can be renamed, finished or stopped. See
 * PARKED_INITIATIVES above.
 *
 * A thin `page.tsx` calling `redirect()` per address, not `next.config.ts` —
 * that file's own header forbids adding `redirects()` because config redirects
 * run before `proxy.ts`'s host routing. Five live examples of the house
 * pattern already exist (`app/dashboard/ask/page.tsx` and friends).
 *
 * A TARGET IS AN ADDRESS THAT EXISTS TODAY, not the address it will have when
 * the work package that owns it lands. `/dashboard/settings/how-to-read` was
 * WP16's, and until WP16 built it a reader sent there got Next's bare 404 —
 * there is no `app/not-found.tsx` in this app, so the bare default is what a
 * bookmark and a live legend link reached. It landed on Settings itself for
 * that window, and the Guide now points at the sub-page that replaced it.
 * `lib/nav.test.ts` pins the rule: a target must be an address something
 * actually serves — one of the nine, or one of the settings area's own seven
 * (`lib/settings/rail.ts` SETTINGS_ADDRESSES).
 */
export const RETIRED_ADDRESSES: Readonly<Record<string, string>> = {
  '/dashboard/profile': '/dashboard/voice#cast',
  // How to read is cut for clients (page review §1 Settings), so the Guide
  // lands on Settings itself (page review §4).
  '/dashboard/guide': '/dashboard/settings',
  '/dashboard/settings/connections': '/dashboard/settings',
  // Reports folded into the Studio (1 Oct). The page keeps the query string, so
  // `?group=`, `?item=` and `?view=` reach the Studio's past issues.
  '/dashboard/reports': '/dashboard/studio',
}
