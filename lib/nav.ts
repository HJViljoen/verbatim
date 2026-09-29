import { OLD_PAGES_RETIRE_ON } from './config'
import { fullDate } from './format'
import type { PageKey } from './renderables/types'

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
 * and a built report name). A nav key is an address in the shell. Reports and
 * Settings have no renderable module and never will; Ask's module is keyed
 * `agent` and its address is `/dashboard/agent`. Where a surface has both,
 * `page` names its page key, and that is the only place the two are joined.
 */

export type NavKey =
  | 'overview' | 'subjects' | 'voice' | 'market' | 'competitive' | 'week'
  | 'ask' | 'reports' | 'settings'

export type NavGroup = 'Intelligence' | 'Account'

/** What the page bar at the top of the surface carries. */
export type BarKind =
  /** Title, the month selector and its one line ("as at the {update} update ·
   *  next update {date}"), horizon, Export (25 Sep rulings). */
  | 'reading'
  /** Title, the update and its comment window, Export. This week is dated by
   *  the update, not by the month, so it takes no horizon. */
  | 'week'
  /** Title only. Nothing on Ask, Reports or Settings is a reading of a month. */
  | 'title'

export interface Surface {
  key: NavKey
  href: string
  /** The sidebar label AND the page title — one string, deliberately. */
  label: string
  /** The one question the surface answers, from the mock's page bars
   *  (`mock-spec.md` §5, verbatim). Null where the surface is not a reading. */
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
 * The nine, in market-first's order (decision K, plan §2.1): "Your market ·
 * Subjects · Conversation · Brands · Your moves · This week · Ask · Reports ·
 * Settings", split into the two groups the artboards draw. The mock's order
 * (`spec/artboards.md`) put Market before Competitive; decision K puts the
 * brands before your own moves, and the preview draws it that way.
 *
 * EACH LABEL CHANGES WITH THE DEPLOY THAT REBUILDS ITS PAGE (§2.1). Deploy 2
 * (WP1.6) renames two: "Overview" becomes "Your market", the new front page,
 * and "Market" becomes "Your moves", because its content is already the
 * decision page and the sidebar must never show "Your market" beside
 * "Market". Voice became Conversation with deploy 3 (WP2.4); Competitive
 * became Brands with deploy 5 (WP3.5). Keys and page keys do not change, so no stored report
 * breaks. Your moves keeps its question until deploy 5 rebuilds the page.
 */
export const SURFACES: readonly Surface[] = [
  // NO HORIZON ON YOUR MARKET (WP1.6): every block reads the reading month
  // and its month before, so the four pills would return a byte-identical
  // page, and the approved preview's bar is the month selector and one line.
  { key: 'overview', href: '/dashboard', label: 'Your market', question: 'What is your market saying this month, and what changed?', group: 'Intelligence', bar: 'reading', horizon: false, page: 'overview' },
  // SUBJECTS ON THE MARKET (WP2.2, deploy 3; §2.1): the question is the
  // market's. NO HORIZON PILLS (the lead's ruling of 27 Sep, following the
  // approved preview and §5.12: the bar is the month selector and one line).
  // So the page reads the month whatever `?horizon=` says, and the month
  // selector drops it; the questions pane's "Asked most, last 3 months" links
  // (§2.3 S4) ask for their period in the pane's own `?questions=`
  // (lib/pages/subjects.ts `subjectsHorizons`).
  { key: 'subjects', href: '/dashboard/subjects', label: 'Subjects', question: 'How big is each subject in your market, month by month?', group: 'Intelligence', bar: 'reading', horizon: false, page: 'subjects' },
  // CONVERSATION WITH DEPLOY 3 (WP2.4, plan §2.1): the page is rebuilt as
  // every theme at 10 videos or more, so the label changes with it. The key,
  // the address and the page key stay `voice`, so no stored link or report
  // breaks.
  // No horizon either: every block reads the reading month, as on Your market.
  { key: 'voice', href: '/dashboard/voice', label: 'Conversation', question: 'Everything your market talked about, in full', group: 'Intelligence', bar: 'reading', horizon: false, page: 'voice' },
  // BRANDS WITH DEPLOY 5 (WP3.5, plan §2.1): the page is rebuilt as the brands
  // that come up in your market, so the label and the question change with
  // it. The key, the address and the page key stay `competitive`, so no stored
  // link or report breaks. NO HORIZON (the approved preview's bar is the month
  // selector and one line): its brand counts read the reading month and its
  // "in full" blocks the ninety days ending at the reading month's last update.
  { key: 'competitive', href: '/dashboard/competitive', label: 'Brands', question: 'Which brands come up in your market, and what is said around them?', group: 'Intelligence', bar: 'reading', horizon: false, page: 'competitive' },
  { key: 'market', href: '/dashboard/market', label: 'Your moves', question: 'What should we do, and is it working?', group: 'Intelligence', bar: 'reading', horizon: false, page: 'market' },
  { key: 'week', href: '/dashboard/week', label: 'This week', question: 'What needs attention this week?', group: 'Intelligence', bar: 'week', page: 'week' },
  { key: 'ask', href: '/dashboard/agent', label: 'Ask', question: 'What does the conversation say about this?', group: 'Intelligence', bar: 'title', page: 'agent' },
  { key: 'reports', href: '/dashboard/reports', label: 'Reports', question: 'Which document do I need?', group: 'Intelligence', bar: 'title' },
  { key: 'settings', href: '/dashboard/settings', label: 'Settings', question: null, group: 'Account', bar: 'title', page: 'settings' },
]

/**
 * The horizon control appears only where a horizon means something: a reading
 * of calendar months. Not on This week (dated by the update), not on Ask,
 * Reports or Settings.
 *
 * AND NOT ON MARKET, which is the one reading surface that is not a reading of
 * a WINDOW (Phase 1 WP14). Its conclusions are the latest update's, its ledger
 * is deliberately all-time ("every piece of advice this product has ever given
 * you"), its moves are all moves and its claims are the latest update's. The
 * bar drew the four-link control anyway, and a client pressing "Last 12 months"
 * got a byte-identical page. A control that changes nothing is worse than an
 * absent one: it teaches a reader that the other four do nothing either. Its
 * month selector and line stay, because Market IS a reading — the two
 * questions are separate and the flag says so rather than `bar` answering both.
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
 * Live addresses that are not one of the nine but belong under one.
 *
 * Team and Plan & billing are reached from the Settings rail and are Settings
 * as far as a reader is concerned; the Studio is where a report is edited, and
 * a reader gets to it from Reports. Without this they were three live pages
 * outside the active-nav rule: a reader inside them saw no mark anywhere and
 * the shell stopped saying where they were. A parked page is deliberately NOT
 * here — a page that is going must not light the page that replaced it.
 */
const UNDER: Readonly<Record<string, NavKey>> = {
  '/dashboard/team': 'settings',
  '/dashboard/billing': 'settings',
  '/dashboard/studio': 'reports',
}

/**
 * Which surface a path belongs to, for the active-nav mark.
 *
 * `/dashboard` is exact-matched because every dashboard path starts with it —
 * the rule the Phase 0 sidebar carried, kept. Longest match otherwise, so
 * `/dashboard/settings/tracking` lights Settings and `/dashboard/market-intel`
 * lights nothing (a parked page is not one of the nine).
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
  '/dashboard/guide': '/dashboard/settings/how-to-read',
  '/dashboard/settings/connections': '/dashboard/settings',
}
