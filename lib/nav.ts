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

export function surface(key: NavKey): Surface {
  const s = SURFACES.find((x) => x.key === key)
  if (!s) throw new Error(`no surface: ${key}`)
  return s
}

/** The surfaces in one sidebar group, in table order. */
export const surfacesIn = (group: NavGroup): Surface[] => SURFACES.filter((s) => s.group === group)

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
  return best
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

export const oldPageFor = (pathname: string): OldPage | null =>
  OLD_PAGES.find((p) => p.href === pathname || pathname.startsWith(`${p.href}/`)) ?? null

/** "30 Nov 2026" — the sidebar group's label and the banners read the same
 *  constant, never the clock: computing it per render would let the sidebar and
 *  the banner on one page disagree across midnight. */
export const retireDate = (): string => fullDate(`${OLD_PAGES_RETIRE_ON}T00:00:00.000Z`)

export const oldPagesGroupLabel = (): string => `Old pages (retiring ${retireDate()})`

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
 * The four addresses Phase 1 empties, and where each reader should land
 * (refute-06 §2.4: these four are exactly the ones nothing stored points at,
 * which is why a redirect can cover them at all).
 *
 * A thin `page.tsx` calling `redirect()` per address, not `next.config.ts` —
 * that file's own header forbids adding `redirects()` because config redirects
 * run before `proxy.ts`'s host routing. Five live examples of the house
 * pattern already exist (`app/dashboard/ask/page.tsx` and friends).
 */
export const RETIRED_ADDRESSES: Readonly<Record<string, string>> = {
  '/dashboard/profile': '/dashboard/voice#cast',
  '/dashboard/guide': '/dashboard/settings/how-to-read',
  '/dashboard/settings/connections': '/dashboard/settings/tracking',
  '/dashboard/settings/initiatives': '/dashboard/market#moves',
}
