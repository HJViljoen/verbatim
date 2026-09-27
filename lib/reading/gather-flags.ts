import type { SupabaseClient } from '@supabase/supabase-js'

import type { ConfigChange } from '../config-log'
import { changesFromLog, type OurChange, type PairComparability } from './comparability'
import { memoRead } from './memo'
import { monthStartOf } from './month-key'
import { pairJudge, pairOn, refuseEveryPair, type PairJudge, type PairOn } from './pairs'
import { loadChanges, loadPairRows, loadUpdateRuns, type ReadingHandle } from './read'
import { scheduledUpdateAfter } from './reading-month'

// A SPENDING-CAPPED UPDATE IS A GATHER FLAG, NOT A CHANGE OF OURS (market-first
// decision D; Heinrich's default of 26 Sep, R-c).
//
// Decision D's rule 6 reads run health: "a partial run or a searches shortfall
// in either month flags the pair (`gather`)". It never refuses one. The capped
// update WP1.4's `log-tracking-eras --capped-run` writes is exactly that: an
// update that gathered less than usual because a spending cap was reached. It
// is logged as an `other` row (field `gather_capped`), and `changesFromLog`
// reads every `other` row as a change of ours on every view. Nobody measures a
// capped update's reach (there is nothing it moved into or out of a month), so
// the rule counted it as an unmeasured change at 10% and refused every pair it
// fell in, and `nextComparablePair` moved the first comparison read the same
// way past it: one capped Sunday in October would have pushed October against
// November to November against December.
//
// THE PIPELINE'S OWN RULE IS NOT TOUCHED. `lib/reading/comparability.ts`,
// `pairs.ts` and `read.ts` sit inside `inngest/functions/pipeline.ts`'s import
// closure, where nothing may change behaviour before deploy 4 (plan §7.7,
// §7.11). So this file, which nothing in that closure imports, is the app
// layer's judge: the same `pairJudge` over the change log without its gather
// flags, with each flag added back to the pairs it falls in as rule 6's
// `gather` reason. A gather reason never refuses (`comparabilityOf`'s
// `refuses`), and `pairOnVerdict` adds no verdict flag for it, so a capped
// update on its own leaves a pair as it was, flagged for the surfaces that
// print the pair itself.
//
// EVERY PAGE LOADER TAKES ITS JUDGE FROM HERE (`loadAppPairOn`), never from
// `loadPairOn`, so the front page, the reading pages, Ask and Settings › What
// we changed judge one pair one way.

/** The `other` fields that record an update's health, not a change of ours.
 *  `gather_capped` is WP1.4's (scripts/log-tracking-eras.ts --capped-run). */
export const GATHER_FLAG_FIELDS: readonly string[] = ['gather_capped']

/** Is this change-log row a gather flag (an update that fell short), not a
 *  change of ours? */
export const isGatherFlagRow = (r: Pick<ConfigChange, 'surface' | 'field'>): boolean =>
  r.surface === 'other' && GATHER_FLAG_FIELDS.includes(r.field ?? '')

/** One gather flag: the log row, the update it names and the month it ran in
 *  (the month rule 6's run health counts it in, `gatherHealth`,
 *  lib/provenance/searches.ts). */
export interface GatherFlag {
  id: string
  at: string
  month: string
  runId: string | null
}

/** The log's gather flags, oldest first. A row whose date does not parse
 *  cannot be placed in a month and is left out. */
export function gatherFlagsFromLog(rows: readonly ConfigChange[]): GatherFlag[] {
  return rows
    .filter(isGatherFlagRow)
    .filter((r) => !Number.isNaN(Date.parse(r.changed_at)))
    .map((r) => ({ id: r.id, at: r.changed_at, month: monthStartOf(r.changed_at), runId: r.run_id ?? null }))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id))
}

/** The change log as changes of ours, without its gather flags: what the
 *  judge and the first comparable pair are read from. The flags are taken out
 *  before the rows are grouped, so a flag can never ride along in another
 *  `other` change's group. */
export function ourChangesWithoutGatherFlags(rows: readonly ConfigChange[]): OurChange[] {
  return changesFromLog(rows.filter((r) => !isGatherFlagRow(r)))
}

/** Is this change of ours (as `changesFromLog` grouped it) only gather flags?
 *  For a page that lists the whole log and prints a flag's line differently. */
export function isGatherFlagChange(change: Pick<OurChange, 'id' | 'rowIds' | 'surface'>, rows: readonly ConfigChange[]): boolean {
  if (change.surface !== 'other') return false
  const ids = new Set(change.rowIds && change.rowIds.length > 0 ? change.rowIds : [change.id])
  const mine = rows.filter((r) => ids.has(r.id))
  return mine.length > 0 && mine.every(isGatherFlagRow)
}

/**
 * A judge with the gather flags added back as rule 6: a flag dated in either
 * month of a pair adds one `gather` reason (naming the first such flag), unless
 * the measured row already flags the pair's run health. A comparable pair
 * becomes flagged; a flagged or refused pair keeps its mode, because a gather
 * reason never refuses.
 */
export function withGatherFlags(judge: PairJudge, flags: readonly GatherFlag[]): PairJudge {
  if (flags.length === 0) return judge
  return (prevMonth, month, view) => {
    const pair = judge(prevMonth, month, view)
    const hit = flags.find((f) => f.month === pair.prevMonth || f.month === pair.month)
    if (!hit || pair.reasons.some((r) => r.kind === 'gather')) return pair
    const flagged: PairComparability = {
      ...pair,
      mode: pair.mode === 'comparable' ? 'flag' : pair.mode,
      reasons: [...pair.reasons, { kind: 'gather', changeId: hit.id, share: null, changedAt: hit.at, surface: 'other' }],
    }
    return flagged
  }
}

/** The tenant's update schedule as `nextUpdateAfter`, or null when none is
 *  set. The same read, key and shape as read.ts's own (memoised per request),
 *  so a page that asks both makes it once. */
async function loadScheduleAfter(client: SupabaseClient, clientId: string): Promise<((instant: string) => string | null) | null> {
  const cfg = await memoRead(client, `reading:schedule:${clientId}`, async () => {
    const { data, error } = await client
      .from('tracking_configs')
      .select('report_period, report_day')
      .eq('client_id', clientId)
      .maybeSingle()
    if (error) throw new Error(`tracking_configs schedule: ${error.message}`)
    return (data ?? null) as { report_period?: string | null; report_day?: string | null } | null
  })
  return cfg?.report_period ? scheduledUpdateAfter(cfg) : null
}

/**
 * The app layer's month-pair judge: `loadPairJudge` (lib/reading/read.ts) with
 * the change log's gather flags read as rule 6, not as changes of ours. The
 * same four memoised reads.
 */
export async function loadAppPairJudge(handle: ReadingHandle, now: string): Promise<PairJudge> {
  const { client, clientId } = handle
  const [log, rows, updates, nextUpdateAfter] = await Promise.all([
    loadChanges(client, clientId),
    loadPairRows(client, clientId, null),
    loadUpdateRuns(client, clientId),
    loadScheduleAfter(client, clientId),
  ])
  const judge = pairJudge({ now, changes: ourChangesWithoutGatherFlags(log), rows, updates, nextUpdateAfter })
  return withGatherFlags(judge, gatherFlagsFromLog(log))
}

/**
 * The page's judge on audiences, FAILING CLOSED as `loadPairOn` does: when any
 * of its reads fails, every pair is refused as unmeasured and the page still
 * renders. It never rejects.
 */
export function loadAppPairOn(handle: ReadingHandle, now: string): Promise<PairOn> {
  return loadAppPairJudge(handle, now).then(
    (judge) => pairOn(judge),
    (error: unknown): PairOn => {
      console.error(`[reading] month-pair judge: ${(error as { message?: string })?.message ?? String(error)}; every pair refused`)
      return refuseEveryPair
    },
  )
}
