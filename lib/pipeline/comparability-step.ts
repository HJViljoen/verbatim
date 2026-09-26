import type { SupabaseClient } from '@supabase/supabase-js'

import {
  isMissingObject, readConfigChanges, readKeywordRows, readMonthComments, readMonthVideos, readProvenanceTable, readRuns,
  readVerdicts, readVideos, type Pages,
} from '../provenance/load'
import {
  CODE_REACH_METHOD, freshCheckRows, freshPairRows, freshReachRows, measureContext, measurePairs, reachRowsOf, recheckPair,
  type ChecksIO, type HeldCheck, type HeldPair, type HeldReach, type MeasureContext,
} from '../provenance/measure'
import type { LensRow, PopulationVideo } from '../reading/recheck'
import { monthEndInstant, monthsToRefresh, monthStartOf } from '../reading/monthly'
import { selectAll } from '../supabase-admin'

// The `comparability` step (market-first decision D kept every week, without
// Heinrich's pastes; plan WP3.4, deploy 4). It sits immediately before
// `freeze-months`, after `segment-videos`, and fans out as
// `plan-comparability` + `comparability:${i}-of-${n}`, one task a step, so no
// step comes near the 300 s limit:
//   pair    recompute month_pair_comparability and config_change_reach for a
//           pair with a filling side, read through THIS run (the run in
//           flight is the pair's latest update: lib/provenance/measure.ts);
//           its gather health is the row's `gather`;
//   checks  comparability_checks for a pair whose later month has ended: the
//           clean same-searches, well-read and all-but-noise populations
//           (WP2.3) and, once both months are read the same number of updates
//           past their ends, equal_age;
//   weeks   keep each week that reached its age on this run (WP3.13's
//           keepWeekPoints, mf/s3-weekline's store; no id of its own).
// Every write is append-only and skips a row identical to the newest held one,
// so a replayed step writes nothing twice. The computation is the scripts' own
// (lib/provenance/measure.ts), so a paste and the run measure one pair one way.
//
// NON-FATAL, and a no-op until its tables exist: a missing MF1 or MF2 object
// reads as "skipped", never a retry loop holding one of the account's five
// slots. The pipeline logs it and does not noteError it (the freeze-months
// precedent): the rows are a record kept beside the report.

export type ComparabilityTask =
  | { kind: 'pair'; prevMonth: string; month: string }
  | { kind: 'checks'; prevMonth: string; month: string }
  | { kind: 'weeks' }

const prevMonthOf = (m: string): string => {
  const d = new Date(`${monthStartOf(m)}T00:00:00.000Z`)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10)
}

/**
 * The step's tasks, in a fixed order: every pair with a filling side (each
 * month the run refreshes, `monthsToRefresh`, against the month before it),
 * then the checks of each such pair whose later month has ended, then the
 * weekly keep. PURE, so the fan-out width is the same on a replay.
 */
export function planComparability(now: string, storedFilling: readonly string[]): ComparabilityTask[] {
  const months = monthsToRefresh(now, storedFilling)
  const pairs = [...new Set(months.map((m) => `${prevMonthOf(m)}|${monthStartOf(m)}`))].sort()
    .map((k) => k.split('|') as [string, string])
  const nowMs = Date.parse(now)
  return [
    ...pairs.map(([prevMonth, month]) => ({ kind: 'pair' as const, prevMonth, month })),
    ...pairs.filter(([, month]) => Date.parse(monthEndInstant(month)) <= nowMs)
      .map(([prevMonth, month]) => ({ kind: 'checks' as const, prevMonth, month })),
    { kind: 'weeks' as const },
  ]
}

export const taskLabel = (t: ComparabilityTask): string =>
  t.kind === 'weeks' ? 'weeks' : `${t.kind} (${t.prevMonth.slice(0, 7)}, ${t.month.slice(0, 7)})`

export interface ComparabilityOutcome {
  task: string
  status: 'written' | 'held' | 'skipped' | 'refused' | 'pending' | 'not_wired'
  pairRows: number
  reachRows: number
  checkRows: number
  note: string
}

/** The weekly keep, handed in by the pipeline once mf/s3-weekline's store is
 *  merged (lib/reading/week-keep.ts); absent, the task says so and writes
 *  nothing. */
export type WeekKeeper = (admin: SupabaseClient, args: { clientId: string; runId: string; now: string }) => Promise<{ inserted: number; held: number; note: string }>

const SEGMENT_CHUNK = 500

async function loadContext(admin: SupabaseClient, clientId: string, runId: string, now: string, withChanges: boolean): Promise<MeasureContext> {
  const pages: Pages = { n: 0 }
  const [changes, videos, verdicts, keywordRows, runs] = await Promise.all([
    withChanges ? readConfigChanges(admin, clientId, pages) : Promise.resolve([]),
    readVideos(admin, clientId, pages),
    readVerdicts(admin, clientId, pages),
    readKeywordRows(admin, clientId, pages),
    readRuns(admin, clientId, pages),
  ])
  const provenance = await readProvenanceTable(admin, clientId, pages)
  return measureContext({ clientId, now, changes, videos, verdicts, keywordRows, runs, provenance, inFlight: { runId } })
}

const outcome = (task: ComparabilityTask, o: Omit<ComparabilityOutcome, 'task' | 'pairRows' | 'reachRows' | 'checkRows'> & Partial<ComparabilityOutcome>): ComparabilityOutcome =>
  ({ task: taskLabel(task), pairRows: 0, reachRows: 0, checkRows: 0, ...o })

/** One task. Throws only on an unexpected failure; the pipeline catches it. */
export async function runComparabilityTask(admin: SupabaseClient, args: {
  clientId: string
  runId: string
  now: string
  task: ComparabilityTask
  keepWeeks?: WeekKeeper | null
  log?: (line: string) => void
}): Promise<ComparabilityOutcome> {
  const { clientId, runId, now, task } = args
  const log = args.log ?? ((line: string) => console.log(`[comparability] ${line}`))
  if (task.kind === 'weeks') {
    if (!args.keepWeeks) return outcome(task, { status: 'not_wired', note: 'the weekly keep store is not in this build (mf/s3-weekline)' })
    const r = await args.keepWeeks(admin, { clientId, runId, now })
    return outcome(task, { status: r.inserted > 0 ? 'written' : 'held', note: r.note })
  }

  if (task.kind === 'pair') {
    // No MF1 table, nothing to write: ask once, cheaply, before any read.
    const probe = await admin.from('month_pair_comparability').select('prev_month').eq('client_id', clientId).limit(1)
    if (probe.error) {
      if (isMissingObject(probe.error, 'month_pair_comparability')) return outcome(task, { status: 'skipped', note: 'month_pair_comparability is not there (MF1 not applied)' })
      throw new Error(`month_pair_comparability: ${probe.error.message}`)
    }
    const ctx = await loadContext(admin, clientId, runId, now, true)
    let missingMonthVideos = false
    const measures = await measurePairs(ctx, {
      monthVideos: async (m) => {
        const set = await readMonthVideos(admin, clientId, m, { n: 0 })
        if (set == null) missingMonthVideos = true
        return set ?? []
      },
      monthComments: (m) => readMonthComments(admin, clientId, m, { n: 0 }),
    }, [[task.prevMonth, task.month]])
    for (const m of measures) for (const line of m.lines) for (const l of line.split('\n')) if (l.trim()) log(l.trimEnd())
    if (missingMonthVideos) return outcome(task, { status: 'skipped', note: 'market_month_videos is not there (MF1 not applied)' })
    const row = measures[0]?.row
    if (!row) return outcome(task, { status: 'refused', note: `no update has read ${task.month.slice(0, 7)} yet` })
    const { rows: reach } = reachRowsOf(measures, ctx.updates)
    const heldPairs = await selectAll<HeldPair>(() => admin.from('month_pair_comparability').select('*')
      .eq('client_id', clientId).eq('prev_month', task.prevMonth).eq('month', task.month).order('computed_at'))
    const heldReach = reach.length === 0 ? [] : await selectAll<HeldReach>(() => admin.from('config_change_reach')
      .select('change_id, month, population, videos_touched, videos_in_month, read_through_run')
      .eq('client_id', clientId).in('month', [task.prevMonth, task.month]).order('computed_at').order('change_id'))
    const pairs = freshPairRows(heldPairs, [row])
    const reachFresh = freshReachRows(heldReach, reach)
    if (pairs.length > 0) {
      const { error } = await admin.from('month_pair_comparability').insert(pairs)
      if (error) throw new Error(`month_pair_comparability insert: ${error.message}`)
    }
    if (reachFresh.length > 0) {
      const { error } = await admin.from('config_change_reach').insert(reachFresh.map((r) => ({ client_id: clientId, ...r, method: CODE_REACH_METHOD })))
      if (error) throw new Error(`config_change_reach insert (the pair row was written): ${error.message}`)
    }
    const g = row.gather.map((h) => `${h.month.slice(0, 7)} ${h.runs} run, ${h.partial} partial or failed, ${h.searches_short} searches short`).join(' · ')
    return outcome(task, {
      status: pairs.length + reachFresh.length > 0 ? 'written' : 'held',
      pairRows: pairs.length, reachRows: reachFresh.length,
      note: `read through ${runId}; outside ${row.search_outside_prev} of ${row.videos_prev} · ${row.search_outside_curr} of ${row.videos_curr}; gather health ${g}`,
    })
  }

  // checks
  const probe = await admin.from('comparability_checks').select('prev_month').eq('client_id', clientId).limit(1)
  if (probe.error) {
    if (isMissingObject(probe.error, 'comparability_checks')) return outcome(task, { status: 'skipped', note: 'comparability_checks is not there (MF2 not applied)' })
    throw new Error(`comparability_checks: ${probe.error.message}`)
  }
  const ctx = await loadContext(admin, clientId, runId, now, false)
  const result = await recheckPair(ctx, stepChecksIO(admin, clientId), task.prevMonth, task.month, { requireReadToEnd: true })
  for (const line of result.lines) for (const l of line.split('\n')) if (l.trim()) log(l.trimEnd())
  if (result.state !== 'measured') {
    return outcome(task, { status: result.state === 'pending' ? 'pending' : 'refused', note: result.state })
  }
  const held = await selectAll<HeldCheck>(() => admin.from('comparability_checks')
    .select('population, object_kind, object_id, k_prev, n_prev, k_curr, n_curr, outcome, read_through_run, method_version, population_makers, population_noise, computed_at')
    .eq('client_id', clientId).eq('prev_month', task.prevMonth).eq('month', task.month).order('computed_at').order('object_id'))
  const fresh = freshCheckRows(held, result.rows)
  for (let i = 0; i < fresh.length; i += 500) {
    const { error } = await admin.from('comparability_checks').insert(fresh.slice(i, i + 500))
    if (error) throw new Error(`comparability_checks insert: ${error.message}`)
  }
  return outcome(task, {
    status: fresh.length > 0 ? 'written' : 'held', checkRows: fresh.length,
    note: `${result.rows.length} rows, ${fresh.length} new${result.equalAge ? `; equal_age at ${result.equalAge.age} update${result.equalAge.age === 1 ? '' : 's'} after each ended` : '; equal_age pending'}`,
  })
}

/** The re-check's reads, through the admin client. */
export function stepChecksIO(admin: SupabaseClient, clientId: string): ChecksIO {
  return {
    monthVideos: (m) => readMonthVideos(admin, clientId, m, { n: 0 }),
    segments: async (ids) => {
      const out = new Map<string, PopulationVideo['segment']>()
      for (let i = 0; i < ids.length; i += SEGMENT_CHUNK) {
        const { data, error } = await admin.rpc('segments_for_videos', { p_client: clientId, p_video_ids: ids.slice(i, i + SEGMENT_CHUNK) })
        if (error) throw new Error(`segments_for_videos: ${error.message}`)
        for (const r of (data ?? []) as { video_id: string; segment: string }[]) {
          out.set(r.video_id, r.segment === 'maker' || r.segment === 'noise' ? r.segment : 'market')
        }
      }
      return out
    },
    lens: async (_population, month, ids, minDated, capturedBefore, themeRun) => {
      try {
        const rows = await selectAll<LensRow>(() => admin.rpc('lens_readings', {
          p_client: clientId, p_month: month, p_run: themeRun, p_video_ids: ids, p_min_dated_comments: minDated, p_captured_before: capturedBefore,
        }).order('audience').order('object_kind').order('object_id'))
        return rows.map((r) => ({ ...r, k: Number(r.k), n: Number(r.n) }))
      } catch (e) {
        if (isMissingObject(e, 'lens_readings')) return null
        throw e
      }
    },
    subjects: async () => {
      const { data, error } = await admin.from('subjects')
        .select('id, name, status, calibrated_at, calibration_precision, calibration_n, calibration_judge_version').eq('client_id', clientId)
      if (error) {
        if (isMissingObject(error, 'subjects')) return []
        throw new Error(`subjects: ${error.message}`)
      }
      return data ?? []
    },
    themeRun: async () => {
      const { data, error } = await admin.from('theme_observations').select('run_id, run_date').eq('client_id', clientId)
        .order('run_date', { ascending: false }).limit(1)
      if (error) throw new Error(`theme_observations: ${error.message}`)
      return (data?.[0] as { run_id?: string } | undefined)?.run_id ?? null
    },
    labels: async (ids) => {
      const labels = new Map<string, string>()
      const { data, error } = await admin.from('theme_registry').select('id, canonical_label').in('id', [...ids])
      if (error) throw new Error(`theme_registry: ${error.message}`)
      for (const r of (data ?? []) as { id: string; canonical_label: string | null }[]) labels.set(r.id, r.canonical_label ?? r.id)
      return labels
    },
  }
}

export const comparabilitySummary = (o: ComparabilityOutcome): string =>
  `${o.task}: ${o.status}${o.pairRows + o.reachRows + o.checkRows > 0 ? ` (${o.pairRows} pair, ${o.reachRows} reach, ${o.checkRows} check rows)` : ''} · ${o.note}`
