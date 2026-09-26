import type { ArrivalsBlock } from '../pages/overview-market/arrivals'
import type { CheckLine } from '../pages/overview-market/change'
import type { FigureTable } from '../reading/verdicts'

/**
 * The monthly's four slots (market-first WP2.1, the skeleton).
 *
 * FOUR SECTIONS OF "SEPTEMBER IN YOUR MARKET" ARE OTHER PACKAGES' WORK, each
 * built for the front page first and read by the monthly after it:
 *   · `monthly.change` · the re-check on the searches both months ran (WP2.3);
 *   · `monthly.arrivals` · what came in with this update (WP2.7);
 *   · `monthly.you` · what it means for you, and what you published (WP2.5);
 *   · `monthly.brands` · brands in your market and the name line (WP2.6).
 *
 * A SLOT IS TYPED NOW AND FILLED LATER. `MonthlyData.slots` holds each as a
 * stub, which names the package that fills it, or as that package's value, in
 * the shape plan §4.2 pins. The monthly's blocks read the slot and nothing
 * else, so a package that lands changes the loader's one line for its slot
 * (`monthlySlotsFrom`) and the block's filled arm, and no other file.
 *
 * WHAT A STUB PRINTS: NOTHING. Plan WP2.1 ("Depends on"): without its
 * package, the change section prints the refusal only, and a missing section
 * is ABSENT rather than empty. The arrangement drops a section whose slot is a
 * stub (`components/blocks/monthly/index.tsx`), so a stub never reaches a
 * reader in any mode.
 *
 * THE SHAPES ARE §4.2's, COPIED UNTIL THEIR OWNERS EXPORT THEM. WP2.7 adds
 * `ArrivalsBlock` in `lib/pages/overview-market/arrivals.ts`, WP2.5 `ForYouBlock`
 * in `foryou.ts` and WP2.6 grows `brands.ts`; creating those files here would
 * collide with theirs, so the pinned shapes are restated below under monthly
 * names. When a package lands, its slot's type becomes an import of the
 * package's own and the copy here is deleted. `CheckLine` is already exported
 * (WP1.6 pinned it in `change.ts`), so it is imported, not copied.
 *
 * PURE.
 */

/** The package that fills a slot. */
export type SlotOwner = 'WP2.3' | 'WP2.5' | 'WP2.6' | 'WP2.7'

/** A slot: a stub naming its package, or the package's value. */
export type MonthlySlot<T> =
  | { state: 'stub'; owner: SlotOwner }
  | { state: 'filled'; value: T }

/** `monthly.change`'s slot (WP2.3): the check lines the front page prints
 *  (`ChangeBlock.checks`, at most three, "Provisional" on any "moved"). */
export interface MonthlyChecks {
  checks: CheckLine[]
}

/** `monthly.arrivals`'s slot (WP2.7): the front page's `ArrivalsBlock`, now
 *  that WP2.7 exports it. The monthly prints the came-in lines only; it
 *  carries no weekly volume bars. */
export type MonthlyArrivals = ArrivalsBlock

/** §4.2's `ForYouBlock`, verbatim (WP2.5): counted line-ups in sentences code
 *  writes, each listing the posts it matched and on which words. */
export interface MonthlyForYou {
  month: string
  lines: {
    kind: 'followers' | 'unanswered' | 'lead_touch'
    figures: FigureTable
    sentenceKey: string
    matchedPosts: { id: string; words: string[] }[]
  }[]
}

/**
 * What you published (plan §2.2 block 8, WP2.5): the posts census. NOT PINNED
 * in §4.2, so this is the monthly's reading of §2.2's print ("20 posts in
 * September (30 in August) · 10 drew 5 or more comments · 9 carry a reading,
 * 234 comments · your followers talked most about … · Moves: none dated yet");
 * WP2.5 settles the shape and this follows it.
 */
export interface MonthlyPublished {
  month: string
  posts: number
  prevPosts: number | null
  drewFive: number
  withReading: number
  readingComments: number
  followers: { label: string; k: number }[]
  movesDated: number
}

/** `monthly.you`'s slot (WP2.5): both halves in one section, the for-you
 *  lines first (plan §2.9). Either half may be missing. */
export interface MonthlyYou {
  foryou: MonthlyForYou | null
  published: MonthlyPublished | null
}

/** `monthly.brands`'s slot (WP2.6): §4.2's `BrandsBlock` in its D3 form,
 *  verbatim. `window` is the month the topics are read in; the 90-day note is
 *  How to read's text, never printed under the section (25 Sep rulings). */
export interface MonthlyBrands {
  window: string
  nameLine: { month: string; n: number; k: number; ownPosts: number } | null
  topics: { brandKey: string; label: string; kAny: number; kOrganic: number; n: number; nOrganic: number; noise: boolean }[]
  ninetyDayNote: string
}

export interface MonthlySlots {
  change: MonthlySlot<MonthlyChecks>
  arrivals: MonthlySlot<MonthlyArrivals>
  you: MonthlySlot<MonthlyYou>
  brands: MonthlySlot<MonthlyBrands>
}

/**
 * THE STUBS (WP2.1 skeleton). Every slot, unfilled, naming the package that
 * fills it. A section whose slot is a stub is absent from the artefact.
 */
export const MONTHLY_SLOT_STUBS: Readonly<MonthlySlots> = {
  change: { state: 'stub', owner: 'WP2.3' },
  arrivals: { state: 'stub', owner: 'WP2.7' },
  you: { state: 'stub', owner: 'WP2.5' },
  brands: { state: 'stub', owner: 'WP2.6' },
}

/** Is the slot filled? A snapshot missing the field reads as a stub. */
export function isFilled<T>(slot: MonthlySlot<T> | null | undefined): slot is { state: 'filled'; value: T } {
  return slot?.state === 'filled'
}

/**
 * The slots, from what the Overview built. THE ONE PLACE A PACKAGE WIRES ITS
 * SLOT: today every slot is its stub, because none of the four packages has
 * landed. WP2.3 fills `change` from `ChangeBlock.checks` once its check lines
 * are computed (the field is pinned and empty until then, and an empty list is
 * not the same answer as "not built": a check that cannot run reads "checks
 * pending"); WP2.7 `arrivals` from `OverviewData.arrivals`; WP2.5 `you` from
 * `OverviewData.foryou` and the posts census; WP2.6 `brands` from
 * `OverviewData.brands` in its D3 form.
 */
export function monthlySlotsFrom(overview: unknown): MonthlySlots {
  // WP2.7: "With this update" from the front page's own block. The monthly
  // is built on the page's loader, so its arrivals are the latest update's
  // into the month the report reads; a page with none (MF2 not readable, or
  // no update yet) leaves the slot a stub and the section absent.
  const arrivals = (overview as { arrivals?: MonthlyArrivals } | null | undefined)?.arrivals
  return {
    ...MONTHLY_SLOT_STUBS,
    ...(arrivals ? { arrivals: { state: 'filled' as const, value: arrivals } } : {}),
  }
}
