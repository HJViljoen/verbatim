// THE BREADCRUMB AND ITS SWITCHERS (depth as pages, 17 Oct; the F2 boards'
// "Depth as pages", Supabase's top bar as Heinrich's reference): a level page's
// title is its path, "Market / Fit & comfort / How long a liner lasts", and
// every segment that has siblings carries a chevron that opens them.
//
// PLAIN DATA ONLY. The loader builds these on the server and the client
// component (components/shell/crumbs.tsx) draws them, so nothing here may
// import a server module: the client-bundle guard (lib/test/client-chains.ts)
// walks the switcher's imports.

/** The prose slot a label is replayed from, where it is model prose written
 *  elsewhere (a conversation's label is Pass B's; a post idea's title is the
 *  post-ideas writer's). Null for a name a person gave (a subject's) or a
 *  page's own words. */
export type CrumbSlot = 'pass_b_theme' | 'post_idea' | null

/** One entry in a switcher: a sibling page, the period kept in its address. */
export interface CrumbItem {
  key: string
  label: string
  href: string
  /** The page the reader is on: ticked. */
  current: boolean
  /** The state in words ("Little talk so far", "Not measured yet"), never a
   *  figure. */
  note?: string | null
  slot?: CrumbSlot
}

/** A segment's siblings: the parent page's set, in the parent's order. */
export interface CrumbMenu {
  /** The small caps label over the list ("Your subjects"). */
  label: string
  /** The chevron's accessible name ("Switch to another subject"). */
  switchLabel: string
  items: CrumbItem[]
  /** Below a hairline, unranked: the subjects whose check has not passed
   *  (ruling U6). */
  below?: CrumbItem[]
  /** The board's wide menu (460px), for long entries such as a post idea's
   *  title (G5-Content-Idea-Switcher). */
  wide?: boolean
}

/** One segment of the path. The last is the page itself (no `href`). */
export interface Crumb {
  label: string
  href: string | null
  slot?: CrumbSlot
  /** Siblings to switch to; null or absent where the segment has none, which
   *  draws no chevron at all (never a disabled one). */
  menu?: CrumbMenu | null
}

/** Whether a menu holds anything to switch to. */
export const hasSiblings = (m: CrumbMenu | null | undefined): m is CrumbMenu =>
  m != null && m.items.length + (m.below?.length ?? 0) > 0
