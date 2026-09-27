import type { SupabaseClient } from '@supabase/supabase-js'

import { SEGMENT_RULE_VERSION } from '../segments/rules'
import { selectAll } from '../supabase-admin'
import { chunkByAudienceMonth, denominatorKey, mergeMonthRows, monthStartOf, type MergeResult } from './monthly'
import type { LensRow } from './recheck'
import type { StoredFreeze } from './types'

// The lens table's writer and merge (market-first decisions D and F; plan
// WP3.3). `month_lens_readings` (MF3) holds a month's denominator, subject,
// kind, mood and theme readings over one LENS, a set of the month's videos:
//
//   market                every video (lens_readings with no filter): the
//                         stored month rows, row for row. The parity lens: the
//                         pooled market of this lens equals the pooled main
//                         rows for every filling month (lensParity).
//   buyers                the market's videos the segment reader files as
//                         market (neither maker nor off-topic): the Buyers view.
//   makers                the makers' own videos: the Makers view.
//   all_but_noise         the off-topic videos out: the default count once the
//                         rule is checked (decision F, deploy 5).
//   dense20               the videos with 20 or more comments dated in the
//                         month: the well-read population.
//   same_searches:<prev>  the videos an unchanged search surfaced, for the
//                         pair (<prev>, month) (lib/provenance/searches.ts).
//
// Per audience, as lens_readings returns it; the reader pools (decision E).
// A lens row compares only with a row of the same rule_version (the segment
// rule it was read under), because a change to the segment rule changes a
// lens's membership (plan §4.2: 'segment' refuses nothing, lens rows compare
// at equal rule_version).
//
// FROZEN RULES, the month tables' own (lib/reading/monthly.ts mergeMonthRows):
// a frozen row is never rewritten; the run writes the rows of a month that
// freezes in the same run as frozen BEFORE freeze-months writes the
// denominator marker, which is why the step sits before it; a closed
// audience-month takes each lens once (month_lens_frozen_insert_guard), which
// is the one back-read (scripts/lens-backread.ts).

export const LENS_TABLE = 'month_lens_readings'
export const LENS_ON_CONFLICT = 'client_id,month,audience,lens,object_kind,object_id'
export const LENS_RULE_VERSION = SEGMENT_RULE_VERSION

export type LensName = 'market' | 'buyers' | 'makers' | 'all_but_noise' | 'dense20' | `same_searches:${string}`
export const SEGMENT_LENSES = ['buyers', 'makers', 'all_but_noise'] as const
export const DENSE_LENS_MIN_DATED = 20

/** A month's video, with what decides its lenses. */
export interface LensVideo {
  id: string
  dated: number
  segment: 'maker' | 'noise' | 'market'
  /** Surfaced in the month by a search that ran unchanged through the pair. */
  insideSearches: boolean
}

/** One lens_readings call: which videos (null: every video) and how deep. */
export interface LensCall {
  lens: LensName
  ids: string[] | null
  minDated: number
}

export const sameSearchesLens = (prevMonth: string): LensName => `same_searches:${prevMonth.slice(0, 7)}`

const prevMonthOf = (m: string): string => {
  const d = new Date(`${monthStartOf(m)}T00:00:00.000Z`)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10)
}

/**
 * The lens calls for one month: market with no filter; the three segment
 * lenses and same-searches over the month's market videos (the client's own
 * posts are never the market); dense20 over every video at 20 dated comments.
 * `withSegments` false (a tenant with no segment rule, Össur) leaves the
 * segment lenses out. PURE.
 */
export function lensCalls(month: string, videos: readonly LensVideo[], opts: { withSegments: boolean; withSearches: boolean }): LensCall[] {
  const ids = (f: (v: LensVideo) => boolean) => videos.filter(f).map((v) => v.id)
  const calls: LensCall[] = [{ lens: 'market', ids: null, minDated: 1 }]
  if (opts.withSegments) {
    calls.push(
      { lens: 'buyers', ids: ids((v) => v.segment === 'market'), minDated: 1 },
      { lens: 'makers', ids: ids((v) => v.segment === 'maker'), minDated: 1 },
      { lens: 'all_but_noise', ids: ids((v) => v.segment !== 'noise'), minDated: 1 },
    )
  }
  calls.push({ lens: 'dense20', ids: null, minDated: DENSE_LENS_MIN_DATED })
  if (opts.withSearches) calls.push({ lens: sameSearchesLens(prevMonthOf(month)), ids: ids((v) => v.insideSearches), minDated: 1 })
  return calls
}

/** One month_lens_readings row before its freeze columns. */
export interface LensReadingRow {
  client_id: string
  month: string
  audience: string
  lens: LensName
  object_kind: string
  object_id: string
  k: number
  n: number
  comments: number | null
  rule_version: string
}

/** lens_readings' rows as lens rows. An empty id set reads nothing (no call):
 *  a lens with no videos has no rows, as a month with none has none. */
export function lensRowsOf(clientId: string, month: string, lens: LensName, rows: readonly LensRow[], ruleVersion = LENS_RULE_VERSION): LensReadingRow[] {
  return rows.map((r) => ({
    client_id: clientId, month: monthStartOf(month), audience: r.audience, lens,
    object_kind: r.object_kind, object_id: r.object_id, k: Number(r.k), n: Number(r.n), comments: null, rule_version: ruleVersion,
  }))
}

export const lensRowKey = (r: { month: string; audience: string; lens: string; object_kind: string; object_id: string }): string =>
  `${monthStartOf(r.month)}|${r.audience}|${r.lens}|${r.object_kind}|${r.object_id}`

type StoredLens = { month: string; audience: string; lens: string; object_kind: string; object_id: string; status: 'filling' | 'frozen'; origin: 'live' | 'back_read'; frozen_at: string | null }

export const toStoredLens = (rows: readonly StoredLens[]): (StoredFreeze & { lens: string })[] =>
  rows.map((r) => ({
    key: lensRowKey(r), month: monthStartOf(r.month), audience: r.audience, objectId: `${r.object_kind}|${r.object_id}`,
    status: r.status, origin: r.origin, frozen_at: r.frozen_at ?? null, lens: r.lens,
  }))

/**
 * Fold a fresh lens reading into what is held, ONE LENS AT A TIME: the lens's
 * own held rows decide whether a closed audience-month already holds this
 * lens (the guard's clause (c) is keyed on the lens), so a first reading of a
 * new lens is never mistaken for a late addition to another. The rest is
 * mergeMonthRows: a frozen row is kept, a row of a month that freezes now is
 * written frozen, a filling row the reading no longer produces is stale.
 */
export function mergeLensRows(args: {
  months: readonly string[]
  fresh: readonly LensReadingRow[]
  stored: readonly (StoredFreeze & { lens: string })[]
  now: string
  runId: string | null
  closedAudienceMonths?: readonly string[]
}): MergeResult<LensReadingRow> {
  const lenses = [...new Set([...args.fresh.map((r) => r.lens as string), ...args.stored.map((s) => s.lens)])].sort()
  const out: MergeResult<LensReadingRow> = { writes: [], keptFrozen: 0, stale: [], emptyReading: args.fresh.length === 0, heldStale: 0, refusedLate: [] }
  for (const lens of lenses) {
    const r = mergeMonthRows<LensReadingRow>({
      months: args.months,
      fresh: args.fresh.filter((f) => f.lens === lens),
      stored: args.stored.filter((s) => s.lens === lens),
      keyOf: lensRowKey,
      now: args.now,
      runId: args.runId,
      closedAudienceMonths: args.closedAudienceMonths,
    })
    out.writes.push(...r.writes)
    out.keptFrozen += r.keptFrozen
    out.stale.push(...r.stale)
    out.heldStale += r.heldStale
    out.refusedLate.push(...r.refusedLate)
  }
  return out
}

// ---- I/O --------------------------------------------------------------------

/** The held lens rows' freeze columns for these months, or null when MF3's
 *  table is not there. */
export async function storedLensRows(admin: SupabaseClient, clientId: string, months: readonly string[]): Promise<(StoredFreeze & { lens: string })[] | null> {
  if (months.length === 0) return []
  try {
    const rows = await selectAll<StoredLens>(() => admin.from(LENS_TABLE)
      .select('month, audience, lens, object_kind, object_id, status, origin, frozen_at')
      .eq('client_id', clientId).in('month', [...months])
      .order('month').order('audience').order('lens').order('object_kind').order('object_id'))
    return toStoredLens(rows)
  } catch (e) {
    if (isMissingLens(e)) return null
    throw e
  }
}

export function isMissingLens(e: unknown): boolean {
  const text = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)
  return text.includes(LENS_TABLE) && /schema cache|does not exist|Could not find/i.test(text)
}

/** Upsert the merged rows, one audience-month a statement at most (the
 *  decision K rule: a first reading of a closed audience-month is one
 *  statement), and drop the stale filling rows. */
export async function writeLensRows(admin: SupabaseClient, clientId: string, merged: MergeResult<LensReadingRow>): Promise<{ written: number; deleted: number }> {
  let written = 0
  for (const part of chunkByAudienceMonth(merged.writes, 500)) {
    const { error } = await admin.from(LENS_TABLE).upsert(part, { onConflict: LENS_ON_CONFLICT })
    if (error) throw new Error(`${LENS_TABLE} upsert: ${(error as { message?: string }).message ?? String(error)}`)
    written += part.length
  }
  let deleted = 0
  for (const s of merged.stale) {
    const [kind, ...id] = (s.objectId ?? '').split('|')
    const { error } = await admin.from(LENS_TABLE).delete()
      .eq('client_id', clientId).eq('month', s.month).eq('audience', s.audience).eq('lens', (s as StoredFreeze & { lens: string }).lens)
      .eq('object_kind', kind).eq('object_id', id.join('|')).eq('status', 'filling')
    if (error) throw new Error(`${LENS_TABLE} stale delete: ${error.message}`)
    deleted++
  }
  return { written, deleted }
}

// ---- Parity and printing -------------------------------------------------------

/** A main-table reading, per audience, as the parity check compares it. */
export interface MainReading { audience: string; object_kind: string; object_id: string; k: number; n: number }

/**
 * The market lens (no filter) against the stored month rows: every
 * (audience, object) the one holds, the other holds with the same k and n.
 * The client's own audience is left out of both (decision E: never the
 * market). Mismatches, as lines; empty is parity.
 */
export function lensParity(lens: readonly Pick<LensReadingRow, 'audience' | 'object_kind' | 'object_id' | 'k' | 'n'>[], main: readonly MainReading[]): string[] {
  const key = (r: { audience: string; object_kind: string; object_id: string }) => `${r.audience}|${r.object_kind}|${r.object_id}`
  const market = (r: { audience: string }) => r.audience !== 'client'
  const a = new Map(lens.filter(market).map((r) => [key(r), r]))
  const b = new Map(main.filter(market).map((r) => [key(r), r]))
  const out: string[] = []
  for (const k of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const x = a.get(k)
    const y = b.get(k)
    if (!x || !y) out.push(`${k}: ${x ? `lens ${x.k} of ${x.n}` : 'no lens row'} · ${y ? `main ${y.k} of ${y.n}` : 'no main row'}`)
    else if (x.k !== y.k || x.n !== y.n) out.push(`${k}: lens ${x.k} of ${x.n} · main ${y.k} of ${y.n}`)
  }
  return out
}

/** The market's pooled videos in one lens-month (every audience but the
 *  client's). */
export function pooledLensVideos(rows: readonly Pick<LensReadingRow, 'audience' | 'object_kind' | 'object_id' | 'n'>[]): number {
  return rows.filter((r) => r.audience !== 'client' && r.object_kind === 'denominator' && r.object_id === 'videos')
    .reduce((s, r) => s + r.n, 0)
}

/** A lens-month's size as the scripts print it: under the floor of 100 a
 *  count, never a share ("the August buyer lens prints a count when it is
 *  under 100", plan WP3.3). */
export function lensSizeLine(lens: string, month: string, videos: number): string {
  const name = new Date(`${monthStartOf(month)}T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return videos < 100
    ? `${name} · ${lens}: ${videos} videos, too few to read (a count, no share)`
    : `${name} · ${lens}: ${videos} videos`
}

/** The audience-months a set of stored main rows holds (denominator keys). */
export const heldAudienceMonths = (rows: readonly { month: string; audience: string }[]): Set<string> => new Set(rows.map(denominatorKey))
