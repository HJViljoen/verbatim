import { shortDate } from '../../format'

// "Brands in your market" (market-first WP1.6, plan §2.2 block 9).
//
// ONE LINE AT DEPLOY 2. Brands counted in every video they come up in (the
// mention layer, WP2.6) arrive with deploy 3 and are first read with the
// 4 Oct update; until then the block says so, and points at Competitive,
// which lists what was filed under each brand the client tracks. The name
// line and brand topics replace it at deploy 3.
//
// THE DATE IS A PROMISE, SO IT EXPIRES. The line names the 4 Oct update only
// while that update is still ahead of the page's "as at"; after it, a page
// still on this code says "a coming update" rather than a date that has
// passed (a copy claim must match what the code does).
//
// PURE.

/** The update the mention layer is first read with (plan §3.7: deploy 3 on
 *  Mon 5 Oct, brand-mentions applied that morning on the 4 Oct run). */
export const BRANDS_ARRIVE_WITH = '2026-10-04T04:00:00.000Z'

export interface BrandsBlock {
  /** `arriving`: an update ahead reads them. `paused`: the tenant's updates
   *  are paused, so no update is promised. */
  state: 'arriving' | 'paused'
  /** The update the brand counts arrive with, or null once that date has
   *  passed at the page's "as at". */
  arrivesWith: string | null
}

/** The block, as at the last update (never the wall clock). */
export function brandsBlockFor(asAt: string | null, opts: { paused?: boolean; arrives?: string } = {}): BrandsBlock {
  if (opts.paused) return { state: 'paused', arrivesWith: null }
  const arrives = opts.arrives ?? BRANDS_ARRIVE_WITH
  const at = asAt ? Date.parse(asAt) : Number.NaN
  const ahead = Number.isNaN(at) || at < Date.parse(arrives)
  return { state: 'arriving', arrivesWith: ahead ? arrives : null }
}

/** The one line, naming the Competitive page by its current sidebar label.
 *  Paused, no update is coming, so the pointer has no "until then" to lean
 *  on (deploy 2 review): it says what Competitive lists, plainly. */
export function brandsLine(b: BrandsBlock, competitiveLabel: string): string {
  const until = `Until then, ${competitiveLabel} lists what was filed under each brand you track.`
  if (b.state === 'paused') return `Brands in your market, counted in every video they come up in, are not read for this workspace yet. ${competitiveLabel} lists what was filed under each brand you track.`
  const when = b.arrivesWith ? `the ${shortDate(b.arrivesWith)} update` : 'a coming update'
  return `Brands in your market, counted in every video they come up in, arrive with ${when}. ${until}`
}
