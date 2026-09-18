import type { SupabaseClient } from '@supabase/supabase-js'

import { fmtInt, longMonth } from '../format'
import { DELIVERED_STATUSES } from './delivery'
import { medianOf, readingsCounter } from '../pages/overview'
import { audienceLabel } from '../readiness/types'
import type { UpdateInput } from '../readiness/types'
import { monthStartOf } from '../reading/month-key'
import { loadMonthSeries } from '../reading/read'
import type { DenominatorPoint, Substrate } from '../reading/series'
import { SHARE_BAND } from '../report-bands'

/**
 * The "Monthly readings" strip on Settings › The record (block E wave 2,
 * `record.readings`).
 *
 * The artboard draws four things in a 172px label gutter — "3 so far", "July 4
 * updates · August 5 updates · September 4 so far", "April, May and June were
 * read at setup", and "April is below the floor for your own audience — 22
 * videos" — and the product had exactly one of them, on a different page:
 * `readingsCounter` is composed in `lib/pages/overview.ts` and rendered in
 * OVERVIEW'S page bar. The record page, which is the page a client opens to ask
 * how much has been read, had no such block at all.
 *
 * EVERY FIGURE HERE IS OVERVIEW'S, COMPUTED OVERVIEW'S WAY. The counter, the
 * gathered-era filter and the trailing median are the three numbers Overview's
 * bar already states, and a second construction of any of them is a second
 * answer to one question — which `lib/pages/overview.ts` records production
 * getting wrong twice, in both directions ("449 of an expected ~429" off the
 * axis, "449 of an expected ~15" off the whole history). So `medianOf` and
 * `readingsCounter` are imported rather than re-implemented, and the era gate
 * — a month at or after the tenant's FIRST UPDATE — is applied in the same
 * place for the same reason: a month read back at setup was never gathered, and
 * comparing a gathered month with one is comparing two different things.
 *
 * "READ AT SETUP" IS A STORED FACT, NOT AN INFERENCE. `month_denominators
 * .origin` is `'back_read'` on a row first written after its month had already
 * closed (`lib/reading/types.ts` MONTH_ORIGINS), which is exactly what the
 * artboard's sentence claims. Nothing here derives it from a date.
 *
 * THE FLOOR IS THE BAND'S (`SHARE_BAND.minN` = 100 videos in the audience), the
 * same floor `directionWord` refuses a reading under. A month below it is not a
 * failure and the copy must not read as one — it is a month that has not filled
 * up, and on a back-read month it never will.
 *
 * Pure, plus one loader. `loadReadings` reads the denominator history and
 * NOTHING ELSE: it takes the updates the page has already read off
 * `pipeline_runs` (`loadUpdates`), so the record page does not read that table
 * twice.
 */

/** One month of the strip: how many updates ran in it. */
export interface MonthUpdates {
  month: string
  label: string
  updates: number
  /** The month the page is reading — "September 4 so far". */
  current: boolean
}

/** A month whose audience denominator is under the band's floor. */
export interface FloorMonth {
  month: string
  label: string
  audience: string
  /** The audience in the reader's words. */
  who: string
  videos: number
}

export interface ReadingsRecord {
  /** False where the month tables are not applied here. Every figure below is
   *  then a zero that means nothing, and the strip says so instead. */
  recorded: boolean
  /** Monthly readings so far, counted over the gathered era. */
  readings: number
  counter: string
  /** The last few months of the gathered era, oldest first. */
  months: MonthUpdates[]
  /** Months first written after they had already closed. */
  backRead: string[]
  /** "April, May and June" — null where none was. */
  backReadLabel: string | null
  /** Months under the floor, thinnest first. */
  belowFloor: FloorMonth[]
  /** The floor itself, printed rather than implied. */
  floor: number
  /** The pooled trailing median of the gathered era, Overview's own measure. */
  trailingMedian: number | null
  /** The month the page is reading, pooled across audiences. */
  monthVideos: number | null
  firstRunMonth: string | null
}

export interface ReadingsInput {
  denominators: readonly DenominatorPoint[]
  substrate: Substrate
  /** Delivered updates per month start, off `pipeline_runs`. */
  updatesByMonth: Readonly<Record<string, number>>
  firstRunMonth: string | null
  /** The month the record page is reading, any day inside it. */
  month: string
  /** How many months the strip names. Three is the artboard's. */
  show?: number
  /** How many below-floor months the strip carries. The component names the
   *  remainder rather than dropping it. */
  floorRows?: number
}

/** The audience whose floor the artboard's line is about: the client's own. */
export const OWN_AUDIENCE = 'client'

/** "April, May and June" — an Oxford-free list of month names. */
function listMonths(months: readonly string[]): string | null {
  const labels = months.map((m) => longMonth(`${m}-01`))
  if (labels.length === 0) return null
  if (labels.length === 1) return labels[0]
  if (labels.length <= 4) return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
  return `${labels.slice(0, 3).join(', ')} and ${labels.length - 3} other months`
}

/** The strip, from the denominator history and the updates the page holds.
 *  Pure. */
export function readingsRecord(input: ReadingsInput): ReadingsRecord {
  const month = monthStartOf(input.month)
  const show = input.show ?? 3
  const floorRows = input.floorRows ?? 3
  const from = input.firstRunMonth ? monthStartOf(input.firstRunMonth) : null

  // POOLED ACROSS AUDIENCES, which is what Overview's bar counts and what the
  // coverage grid's "videos analysed" states. Audience denominators do not add
  // to a SHARE — that is why a window read is its own table — but they do add
  // to a count of videos read, and this is a count.
  const pooled = new Map<string, number>()
  const own = new Map<string, number>()
  const backRead = new Set<string>()
  const live = new Set<string>()
  for (const d of input.denominators) {
    pooled.set(d.month, (pooled.get(d.month) ?? 0) + d.videos)
    if (d.audience === OWN_AUDIENCE) own.set(d.month, (own.get(d.month) ?? 0) + d.videos)
    if (d.origin === 'back_read') backRead.add(d.month)
    else live.add(d.month)
  }

  const historyMonths = [...pooled.keys()].sort()
  const readings = from == null ? 0 : historyMonths.filter((m) => m >= from && m <= month).length

  // The strip's months are the union of months with a row and months an update
  // ran in: a month whose gather produced nothing is still a month we worked.
  const era = [...new Set([...historyMonths, ...Object.keys(input.updatesByMonth).map(monthStartOf)])]
    .filter((m) => (from == null || m >= from) && m <= month)
    .sort()
  const months: MonthUpdates[] = era.slice(-show).map((m) => ({
    month: m,
    label: longMonth(`${m}-01`),
    updates: input.updatesByMonth[m] ?? 0,
    current: m === month,
  }))

  const trailing = historyMonths
    .filter((m) => m < month && (from == null || m >= from))
    .slice(-12)
    .map((m) => pooled.get(m) ?? null)
  // One month is not a median — Overview's own rule, and the same threshold.
  const trailingMedian = trailing.length >= 2 ? medianOf(trailing) : null

  // A month is "read at setup" only if NOTHING in it was written live: a month
  // half back-read and half gathered is a gathered month with a back-read
  // audience in it, and calling the whole month setup would be the stronger
  // claim of the two.
  const setup = [...backRead].filter((m) => !live.has(m)).sort()

  const floor = SHARE_BAND.minN ?? 0
  const belowFloor: FloorMonth[] = [...own.entries()]
    .filter(([, videos]) => videos < floor)
    .map(([m, videos]) => ({
      month: m,
      label: longMonth(`${m}-01`),
      audience: OWN_AUDIENCE,
      who: audienceLabel(OWN_AUDIENCE),
      videos,
    }))
    .sort((a, b) => a.videos - b.videos || a.month.localeCompare(b.month))

  return {
    recorded: input.substrate !== 'missing',
    readings,
    counter: readingsCounter(readings),
    months,
    backRead: setup,
    backReadLabel: listMonths(setup),
    belowFloor: belowFloor.slice(0, floorRows),
    floor,
    trailingMedian,
    monthVideos: pooled.get(month) ?? null,
    firstRunMonth: from,
  }
}

/** "July 4 updates · August 5 updates · September 4 so far" — the artboard's
 *  one line, with the current month marked as still filling. */
export function monthsLine(months: readonly MonthUpdates[]): string | null {
  if (months.length === 0) return null
  return months
    .map((m) => `${m.label} ${fmtInt(m.updates)} ${m.current ? 'so far' : m.updates === 1 ? 'update' : 'updates'}`)
    .join(' · ')
}

/**
 * The denominator history behind the strip.
 *
 * ONE READ, over the whole history, on the reading handle — the same call
 * Overview makes for its axis (`loadMonthSeries` from 2019 to now with no
 * audiences named), and it is cheap for the reason stated there: a hundred-odd
 * denominator rows. `updatesByMonth` and `firstRunMonth` are passed IN, which
 * is what stops `loadMonthSeries` reading `pipeline_runs` a second time — the
 * record page has already read it in full for the delivery record.
 */
export async function loadReadings(
  client: SupabaseClient,
  clientId: string,
  args: { updates: readonly UpdateInput[]; month: string; now: string },
): Promise<ReadingsRecord> {
  // DELIVERED UPDATES, NOT EVERY RUN. `deliveryRecord` counts every update that
  // settled — a failed one still happened and is still in the record — and this
  // strip counts the ones that produced a reading, because that is what
  // Overview's counter and `thinMonth`'s updates arm count. Both are printed on
  // this page and both say which they are.
  const updatesByMonth: Record<string, number> = {}
  let firstStartedAt: string | null = null
  for (const u of args.updates) {
    if (!DELIVERED_STATUSES.has(u.status)) continue
    const m = monthStartOf(u.startedAt)
    updatesByMonth[m] = (updatesByMonth[m] ?? 0) + 1
    if (firstStartedAt == null || u.startedAt < firstStartedAt) firstStartedAt = u.startedAt
  }
  const firstRunMonth = firstStartedAt ? monthStartOf(firstStartedAt) : null

  const set = await loadMonthSeries(client, clientId, {
    from: '2019-01-01',
    to: args.now,
    updatesByMonth,
    firstRunMonth,
  })
  return readingsRecord({
    denominators: set.denominators,
    substrate: set.substrate,
    updatesByMonth,
    firstRunMonth,
    month: args.month,
  })
}
