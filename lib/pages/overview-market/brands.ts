import { shortDate } from '../../format'

// "Brands in your market" (market-first WP1.6, plan §2.2 block 9).
//
// ONE LINE AT DEPLOY 2. Brands counted in every video they come up in (the
// mention layer, WP2.6) arrive with deploy 3 and are first read with the
// 11 Oct update; until then the block says so, and points at Competitive,
// which lists what was filed under each brand the client tracks. The name
// line and brand topics replace it at deploy 3.
//
// THE DATE IS A PROMISE, SO IT EXPIRES. The line names the 11 Oct update only
// while that update is still ahead of the page's "as at"; after it, a page
// still on this code says "a coming update" rather than a date that has
// passed (a copy claim must match what the code does).
//
// PURE.

/** The update the mention layer is first read with (plan §3.3: deploy 3 by
 *  Sat 10 Oct, the 11 Oct run). */
export const BRANDS_ARRIVE_WITH = '2026-10-11T04:00:00.000Z'

export interface BrandsBlock {
  state: 'arriving'
  /** The update the brand counts arrive with, or null once that date has
   *  passed at the page's "as at". */
  arrivesWith: string | null
}

/** The block, as at the last update (never the wall clock). */
export function brandsBlockFor(asAt: string | null, arrives: string = BRANDS_ARRIVE_WITH): BrandsBlock {
  const at = asAt ? Date.parse(asAt) : Number.NaN
  const ahead = Number.isNaN(at) || at < Date.parse(arrives)
  return { state: 'arriving', arrivesWith: ahead ? arrives : null }
}

/** The one line, naming the Competitive page by its current sidebar label. */
export function brandsLine(b: BrandsBlock, competitiveLabel: string): string {
  const when = b.arrivesWith ? `the ${shortDate(b.arrivesWith)} update` : 'a coming update'
  return `Brands in your market, counted in every video they come up in, arrive with ${when}. Until then, ${competitiveLabel} lists what was filed under each brand you track.`
}
