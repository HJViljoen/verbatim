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
  /** Title, question, the month context line, horizon, "how sound is this", Export. */
  | 'reading'
  /** Title, question, `update of {date} · previous {date}`, Export. This week
   *  is dated by the update, not by the month, so it takes no horizon. */
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
  /** The page key this surface stores under, where it has one. */
  page?: PageKey
}

/**
 * The nine, in the mock's order (`spec/artboards.md`: "logo mark, then items in
 * this order — Overview · Subjects · Voice · Market · Competitive · This week ·
 * Ask · Reports · Settings"), split into the two groups the artboards draw.
 */
export const SURFACES: readonly Surface[] = [
  { key: 'overview', href: '/dashboard', label: 'Overview', question: 'What is this month’s reading?', group: 'Intelligence', bar: 'reading', page: 'overview' },
  { key: 'subjects', href: '/dashboard/subjects', label: 'Subjects', question: 'How are we seen on this subject?', group: 'Intelligence', bar: 'reading', page: 'subjects' },
  { key: 'voice', href: '/dashboard/voice', label: 'Voice', question: 'Who is saying what in this category?', group: 'Intelligence', bar: 'reading', page: 'voice' },
  { key: 'market', href: '/dashboard/market', label: 'Market', question: 'What should we do, and is it working?', group: 'Intelligence', bar: 'reading', page: 'market' },
  { key: 'competitive', href: '/dashboard/competitive', label: 'Competitive', question: 'Who else is in this, and are they gaining?', group: 'Intelligence', bar: 'reading', page: 'competitive' },
  { key: 'week', href: '/dashboard/week', label: 'This week', question: 'What needs attention this week?', group: 'Intelligence', bar: 'week', page: 'week' },
  { key: 'ask', href: '/dashboard/agent', label: 'Ask', question: 'What does the conversation say about this?', group: 'Intelligence', bar: 'title', page: 'agent' },
  { key: 'reports', href: '/dashboard/reports', label: 'Reports', question: 'Which document do I need?', group: 'Intelligence', bar: 'title' },
  { key: 'settings', href: '/dashboard/settings', label: 'Settings', question: null, group: 'Account', bar: 'title' },
]

/** The horizon control appears only where a horizon means something: a reading
 *  of calendar months. Not on This week (dated by the update), not on Ask,
 *  Reports or Settings. */
export const hasHorizon = (s: Surface): boolean => s.bar === 'reading'

/** The "how sound is this" band appears wherever the page IS a reading — the
 *  five month surfaces and This week, which reads an update. Ask, Reports and
 *  Settings state no basis because they make no reading; a band on Settings
 *  counting updates is furniture, and furniture that looks like a fact. */
export const hasRecord = (s: Surface): boolean => s.bar !== 'title'

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
    // WK2 (comments worth a reply) is Phase 2 by the design's own boundary, so
    // the inbox is the one thing on this page with nowhere to go yet. A banner
    // that named This week and stopped would be read as "everything moved".
    caveat: 'Comments worth a reply stay here for now.',
  },
]

/** The parked page at exactly this address. Throws rather than returning null:
 *  a page asking for its own banner has to get one. */
export function oldPage(href: string): OldPage {
  const p = OLD_PAGES.find((x) => x.href === href)
  if (!p) throw new Error(`no old page: ${href}`)
  return p
}

export const oldPageFor = (pathname: string): OldPage | null =>
  OLD_PAGES.find((p) => p.href === pathname || pathname.startsWith(`${p.href}/`)) ?? null

/** "30 Nov 2026" — the sidebar group's label and the banners read the same
 *  constant, never the clock: computing it per render would let the sidebar and
 *  the banner on one page disagree across midnight. */
export const retireDate = (): string => fullDate(`${OLD_PAGES_RETIRE_ON}T00:00:00.000Z`)

export const oldPagesGroupLabel = (): string => `Old pages (retiring ${retireDate()})`

/**
 * Settings › Initiatives, parked rather than redirected.
 *
 * It is not in `OLD_PAGES` because `OLD_PAGES` is the sidebar's "Old pages"
 * group and this is a Settings sub-page, reached from the settings rail and
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
  caveat: 'Renaming, finishing and stopping one happens here until Market can do it.',
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
