import { MONTHLY_BLOCK_KEYS, type MonthlyBlockKey } from '@/lib/reports/monthly'
import type { MonthlyData } from '@/lib/pages/monthly'
import type { MonthlyBlock } from './adapt'
import { monthlyMonth } from './month'
import { monthlyThemes } from './themes'
import { monthlyArrivals } from './arrivals'
import { monthlyKinds } from './kinds'
import { monthlyAsks } from './asks'
import { monthlySubjects } from './subjects'
import { monthlyYou } from './you'
import { monthlyBrands } from './brands'
import { monthlyChange } from './change'
import { monthlyDecide } from './decide'

/**
 * "September in your market": the monthly's ten sections, by key
 * (market-first WP2.1, plan §2.9).
 *
 * SIX ARE THE FRONT PAGE'S, FOUR ARE SLOTS. The month, the themes, the kinds,
 * the asks, the subjects and the change section are the front page's blocks on
 * the month that has just ended (`fromFrontPage`, `./adapt.tsx`); arrivals,
 * you and brands are slots WP2.7, WP2.5 and WP2.6 fill, and the change
 * section's re-check is WP2.3's. "What to decide" is the monthly's own.
 *
 * `MONTHLY_BLOCKS` is a RECORD and not an array, because a stored arrangement
 * is a list of keys and a build must be able to resolve one without scanning.
 */
export const MONTHLY_BLOCKS: Record<MonthlyBlockKey, MonthlyBlock> = {
  'monthly.month': monthlyMonth,
  'monthly.themes': monthlyThemes,
  'monthly.arrivals': monthlyArrivals,
  'monthly.kinds': monthlyKinds,
  'monthly.asks': monthlyAsks,
  'monthly.subjects': monthlySubjects,
  'monthly.you': monthlyYou,
  'monthly.brands': monthlyBrands,
  'monthly.change': monthlyChange,
  'monthly.decide': monthlyDecide,
}

/**
 * The blocks a stored arrangement names, in its order.
 *
 * A KEY THIS BUILD NO LONGER KNOWS IS DROPPED, exactly as a report section's
 * is. A version 1 row's retired keys (`MONTHLY_RETIRED_KEYS`) are never drawn:
 * that row prints `STALE_ARTEFACT_LINE` before any block is asked for
 * (`staleMonthlySnapshot`).
 */
export function monthlyBlocksFor(keys: readonly string[]): MonthlyBlock[] {
  return keys
    .filter((k): k is MonthlyBlockKey => (MONTHLY_BLOCK_KEYS as readonly string[]).includes(k))
    .map((k) => MONTHLY_BLOCKS[k])
}

/**
 * The sections an artefact PRINTS: the arrangement's blocks less any that are
 * absent from this reading (a slot another package has not filled; plan
 * WP2.1: "the missing sections are absent rather than empty"). The email, the
 * deck and the share page all draw this list, so a section is absent from all
 * three or from none.
 */
export function monthlySections(keys: readonly string[], reading: MonthlyData): MonthlyBlock[] {
  return monthlyBlocksFor(keys).filter((b) => !b.absent?.(reading))
}

/** Every block, in the design's order: what a build with no stored
 *  arrangement renders. */
export const ALL_MONTHLY_BLOCKS: MonthlyBlock[] = monthlyBlocksFor(MONTHLY_BLOCK_KEYS)
