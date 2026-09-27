import { brandsHoldAReading, isBrandsRead, type BrandsBlock, type BrandsRead } from '../pages/overview-market/brands'
import type { ArrivalsBlock } from '../pages/overview-market/arrivals'
import type { ChangeBlock } from '../pages/overview-market/change'
import type { ForYouBlock, PublishedCensus } from '../pages/overview-market/foryou'

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
 * THE SHAPES ARE THE PACKAGES' OWN (deploy 3). The four packages have
 * landed, so every slot's type is an import of the front page's, never a
 * copy: WP2.3's `ChangeBlock` fields, WP2.7's `ArrivalsBlock`, WP2.5's
 * `ForYouBlock` and `PublishedCensus`, and WP2.6's `BrandsRead`.
 *
 * PURE.
 */

/** The package that fills a slot. */
export type SlotOwner = 'WP2.3' | 'WP2.5' | 'WP2.6' | 'WP2.7'

/** A slot: a stub naming its package, or the package's value. */
export type MonthlySlot<T> =
  | { state: 'stub'; owner: SlotOwner }
  | { state: 'filled'; value: T }

/** `monthly.change`'s slot (WP2.3): the re-check the front page prints,
 *  in `ChangeBlock`'s own fields: the check lines (at most three,
 *  "Provisional" on any "moved"), whether it was read or is pending, and the
 *  buyers-only counts. The section prints them through `recheckLines`, as the
 *  page does, so the two print one sentence each. */
export type MonthlyChecks = Pick<ChangeBlock, 'checks'> & Partial<Pick<ChangeBlock, 'recheck' | 'buyers'>>

/** `monthly.arrivals`'s slot (WP2.7): the front page's `ArrivalsBlock`, now
 *  that WP2.7 exports it. The monthly prints the came-in lines only; it
 *  carries no weekly volume bars. */
export type MonthlyArrivals = ArrivalsBlock

/** §4.2's `ForYouBlock` (WP2.5): counted line-ups in sentences code writes,
 *  each listing the posts it matched and on which words. WP2.5 has landed, so
 *  the slot's type is the package's own (`lib/pages/overview-market/foryou.ts`). */
export type MonthlyForYou = ForYouBlock

/** What you published (plan §2.2 block 8, WP2.5): the posts census, the
 *  package's own shape (`PublishedCensus`). */
export type MonthlyPublished = PublishedCensus

/** `monthly.you`'s slot (WP2.5): both halves in one section, the for-you
 *  lines first (plan §2.9). Either half may be missing. */
export interface MonthlyYou {
  foryou: MonthlyForYou | null
  published: MonthlyPublished | null
}

/** `monthly.brands`'s slot (WP2.6): the front page's block in its D3 form,
 *  imported (`BrandsRead`). `window` is the month the topics are read in; the
 *  90-day note is How to read's text, never printed under the section (25 Sep
 *  rulings). */
export type MonthlyBrands = BrandsRead

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

/** What `monthlySlotsFrom` reads off the Overview it is handed. */
export interface SlotSources {
  change?: (Pick<ChangeBlock, 'checks'> & Partial<Pick<ChangeBlock, 'recheck' | 'buyers'>>) | null
  arrivals?: ArrivalsBlock | null
  brands?: BrandsBlock | null
  foryou?: ForYouBlock | null
  published?: PublishedCensus | null
}

/**
 * The slots, from what the Overview built. THE ONE PLACE A PACKAGE WIRES ITS
 * SLOT, so the monthly prints the page's own reading of the month and the two
 * print one sentence each:
 *   · WP2.3 fills `change` from the page's change block: its check lines,
 *     whether the re-check was read or is pending, and the buyers-only counts.
 *     A block that prints no re-check still fills the slot, with no lines: an
 *     empty re-check is an answer, not a package missing;
 *   · WP2.6 fills `brands` from `OverviewData.brands` in its D3 form, and
 *     leaves it a stub where the page kept deploy 2's one line (no brand
 *     rules, or the market not read), so the section is absent, never a
 *     promise sent to a client. It leaves it a stub as well where the block
 *     reads no brand: none counted, none "none found" and no name line (the
 *     lead's ruling of 27 Sep, fast track), so the monthly never sends a
 *     section that is all "not counted yet";
 *   · WP2.7 fills `arrivals` from `OverviewData.arrivals` (the came-in lines
 *     only; the monthly carries no weekly volume bars);
 *   · WP2.5 fills `you` from `OverviewData.foryou` and `.published`, either
 *     half alone where the other is missing.
 * A page that built none of a block (MF2 not readable, the market not read)
 * leaves that slot a stub, and the section is absent from the artefact.
 */
export function monthlySlotsFrom(overview: SlotSources | null | undefined): MonthlySlots {
  const slots: MonthlySlots = { ...MONTHLY_SLOT_STUBS }
  const change = overview?.change
  if (change) {
    slots.change = { state: 'filled', value: { checks: change.checks ?? [], recheck: change.recheck ?? null, buyers: change.buyers ?? null } }
  }
  // WP2.7: "With this update" from the front page's own block. The monthly
  // is built on the page's loader, so its arrivals are the latest update's
  // into the month the report reads; a page with none (MF2 not readable, or
  // no update yet) leaves the slot a stub and the section absent.
  const arrivals = overview?.arrivals
  if (arrivals) slots.arrivals = { state: 'filled', value: arrivals }
  const brands = overview?.brands
  if (isBrandsRead(brands) && brandsHoldAReading(brands)) slots.brands = { state: 'filled', value: brands }
  // WP2.5: what it means for you and what you published, off the front page's
  // two blocks (`OverviewData.foryou`, `.published`). A page built without the
  // market (no field) keeps the stub, and the section stays absent.
  const foryou = overview?.foryou ?? null
  const published = overview?.published ?? null
  if (foryou || published) slots.you = { state: 'filled', value: { foryou, published } }
  return slots
}
