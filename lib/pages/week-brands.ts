import type { SupabaseClient } from '@supabase/supabase-js'

import { monthBrandCounts } from '../brands/mentions'
import { brandCountState, noiseWords, NOT_COUNTED_YET, type BRAND_HAND_CHECKS } from '../brands/precision'
import { marketMonthIds, readBrandLayer, type BrandLayer } from './overview-brands'

// This week's "Videos naming them" (finish-list item 7, 29 Sep): per brand
// you track, the videos this update read that NAME the brand, counted the way
// the Brands page counts "came up in" (the mention layer, `monthBrandCounts`,
// the brand's own posts out, gated by production's hand check). It replaces a
// count of every video the rival searches gathered in the update, before the
// relevance and brand checks, which printed Freitag 149 on This week beside 7
// on Brands.
//
// THE UPDATE'S VIDEOS ARE A PART OF THE MONTH'S MARKET: those this update read
// (`videos.run_id` or `analyzed_run_id`) that are in the month's market
// (`market_month_videos`). So a brand's figure here never exceeds its month
// figure on Brands.
//
// ONE BRAND COUNT, THE BRANDS PAGE'S (T0 ruling U10; T0a review, finding 2).
// The count is the ORGANIC one, "Named unprompted": the videos naming the
// brand, leaving out every video any of our rival searches found, over the one
// base every brand shares (`nOrganic`, printed as "of N"). The count "in all"
// (`kAny`) counted the videos our own per-brand searches fetched, so a brand
// we search harder read bigger ("The North Face 54 in Sep"), and it printed
// here while Brands, Your market, the monthly and Settings printed the organic
// count: one brand, one month, two figures on two pages. It is never printed.

/** One brand's figure for the update, or why it prints none. */
export interface UpdateBrandCount {
  /** The update's organic count. Printed only where the brand's counts may
   *  print. */
  videos: number | null
  /** The same brand's organic count for the month so far ("Named unprompted"),
   *  as Brands prints it (This week states every update count again against
   *  its month). Null where `videos` is. */
  monthVideos: number | null
  /** The month's base for it: the market's videos this month leaving out
   *  every video any of our rival searches found (`nOrganic`), the "of N" the
   *  count is printed over. Null where `monthVideos` is. */
  monthOf: number | null
  /** Why no figure prints: "not counted yet", or "mostly … · not counted". */
  note: string | null
}

/**
 * The update's per-brand counts off a month's mention layer. `updateVideos` is
 * every video row id this update read; only those in the month's market count.
 * PURE.
 */
export function updateBrandCounts(input: {
  clientId: string
  layer: BrandLayer | null
  updateVideos: readonly string[]
  brands: readonly string[]
  checks?: typeof BRAND_HAND_CHECKS
}): Map<string, UpdateBrandCount> {
  const out = new Map<string, UpdateBrandCount>()
  const layer = input.layer
  const market = new Set(layer?.market ?? [])
  const ids = [...new Set(input.updateVideos)].filter((id) => market.has(id))
  const keyed = layer ? layer.rivals : []
  const count = (videos: readonly string[]) => layer
    ? monthBrandCounts(layer.planned, keyed.map((r) => ({ brand: r.name, brandKey: r.brandKey })), {
        markets: new Map([[layer.month, videos]]),
        ownerOf: layer.ownerOf,
        rivalFound: layer.rivalFound ?? new Set<string>(),
      })
    : []
  const counts = count(ids)
  const monthCounts = count(layer?.market ?? [])
  // WITHOUT THE RIVAL SEARCHES' VIDEOS THERE IS NO ORGANIC COUNT: the set
  // unread would make every video organic and the count "in all" again, so
  // the column fails closed ("not counted yet").
  const organicRead = layer?.rivalFound != null
  for (const name of input.brands) {
    const state = brandCountState(input.clientId, name, input.checks)
    const rival = keyed.find((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase())
    const c = rival ? counts.find((x) => x.brandKey === rival.brandKey) : undefined
    const m = rival ? monthCounts.find((x) => x.brandKey === rival.brandKey) : undefined
    const none = { videos: null, monthVideos: null, monthOf: null }
    if (state === 'noise') { out.set(name, { ...none, note: noiseWords(name) }); continue }
    if (!layer || !layer.layerRead || !organicRead || !rival || c == null || m == null) { out.set(name, { ...none, note: NOT_COUNTED_YET }); continue }
    // Production's list held no match of the brand: a zero prints as a zero,
    // and a match found since is not counted until it is read by hand (the
    // Brands page's rule, lib/pages/brands.ts `topicRow`).
    if (state === 'none') { out.set(name, m.kAny === 0 ? { videos: 0, monthVideos: 0, monthOf: m.nOrganic, note: null } : { ...none, note: NOT_COUNTED_YET }); continue }
    // A checked brand with no mention row at all has no count, never a 0 (the
    // Brands page's rule, `topicRow`).
    if (state !== 'counted' || !layer.withRows.has(rival.brandKey)) { out.set(name, { ...none, note: NOT_COUNTED_YET }); continue }
    out.set(name, { videos: c.kOrganic, monthVideos: m.kOrganic, monthOf: m.nOrganic, note: null })
  }
  return out
}

/** The layer for the update's month, or null where it cannot be read (the
 *  column then prints "not counted yet"; never the page).
 *
 *  THE READING CLIENT (`scope.reading.client`, the service role), as Your
 *  market and Brands read it: `market_month_videos` is revoked from
 *  `authenticated`, so on a tenant's own session client the market read fails
 *  and every brand would print "not counted yet". */
export async function loadUpdateBrandLayer(
  client: SupabaseClient,
  clientId: string,
  month: string,
  /** The market's audiences (`marketAudiences`), as Your market and Brands
   *  filter the month's market. */
  audiences: readonly string[],
): Promise<BrandLayer | null> {
  try {
    // THE RIVAL SEARCHES' VIDEOS ARE READ (no `rivalFound: false`; T0 ruling
    // U10): the organic count leaves them out, as Brands and Your market do.
    return await readBrandLayer(client, clientId, month, {
      // Only the market's matched videos need an owner here: the count never
      // reaches outside the month's market (one identity read, not one per
      // 250 videos the whole mention layer names).
      identities: 'market',
      market: marketMonthIds(client, clientId, month, audiences),
    })
  } catch (error) {
    console.error(`[pages] week.brands: ${(error as { message?: string })?.message ?? String(error)}`)
    return null
  }
}
