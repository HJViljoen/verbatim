import type { SupabaseClient } from '@supabase/supabase-js'

import { loadCheck, loadFlags, weekFlagRows, type CheckRow, type FlagRow } from '../pages/week'
import { anomalyVerdict, type AnomalyObjectKind, type AnomalyRow, type AnomalyVerdictInput } from '../reading/anomaly'
import { nextMonth } from '../reading/month-key'
import type { WeekReadFlag, WeekReadUnusual } from './types'

// The update's anomaly check, frozen into the week's read (depth v2, T11b).
//
// WHY IT IS FROZEN HERE. The level-1 weekly email leads with "Unusual this
// week" when the run's check flagged something (decision 1), and an artefact
// freezes its numbers when it is written, never re-reading a live figure at
// send or render. `anomaly-check` runs before `write-week-read` in the same
// run, so the step reads the check's rows for its own run and keeps them with
// the read: inside the existing step, with no new step id.
//
// NO SECOND RULE. Which flags are the week's, and in what order, is
// `weekFlagRows` (lib/pages/week.ts), the rule This week's "Unusual this week"
// prints by, over the same two readers (`loadCheck`, `loadFlags`). Each flag's
// verdict is `anomalyVerdict` (lib/reading/anomaly.ts), the check's own
// adapter, so the chip's word is read off a Verdict like every other chip.
// No quote ref is kept: the email prints no quote at level 1.

const KINDS: readonly AnomalyObjectKind[] = ['subject', 'kind', 'rival', 'theme']
const REGIMES = ['one', 'mixed', 'unknown', 'not_grouped'] as const

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}
const pct = (k: number, n: number): number => (n > 0 ? (k / n) * 100 : 0)

/** `[first baseline month, the month after the last)`, or undefined. */
function basisOf(months: readonly string[]): { from: string; to: string } | undefined {
  const sorted = [...months].map((m) => `${m.slice(0, 7)}-01`).sort()
  if (sorted.length === 0) return undefined
  return { from: `${sorted[0]}T00:00:00.000Z`, to: `${nextMonth(sorted[sorted.length - 1])}T00:00:00.000Z` }
}

/** One stored flag, frozen with its verdict. Null for a row this code does
 *  not read (an object kind it does not know). Pure. */
export function frozenFlag(f: FlagRow, window: { from: string; to: string }): WeekReadFlag | null {
  const kind = f.object_kind as AnomalyObjectKind
  if (!KINDS.includes(kind)) return null
  const week = { k: num(f.week_k), n: num(f.week_n) }
  const baseline = { k: num(f.baseline_k), n: num(f.baseline_n) }
  const months = [...(f.baseline_months ?? [])].map((m) => `${String(m).slice(0, 7)}-01`).sort()
  // The stored row, in the check's own shape: a flag cleared both gates, so
  // its state is `flagged` and its band verdict `moved`.
  const row: AnomalyRow = {
    kind,
    id: f.object_id,
    label: f.label,
    denominator: f.denominator,
    weekVideos: week.k,
    weekTotal: week.n,
    weekPct: pct(week.k, week.n),
    baselineVideos: baseline.k,
    baselineTotal: baseline.n,
    baselinePct: pct(baseline.k, baseline.n),
    baselineMonthsClearing: months.length,
    verdict: { state: 'moved', change: num(f.change_pts), band: num(f.band_pts) },
    p: null,
    holmThreshold: null,
    state: 'flagged',
  }
  const regime = (REGIMES as readonly string[]).includes(f.baseline_regime ?? '') ? (f.baseline_regime as AnomalyVerdictInput['regime']) : undefined
  return {
    objectKind: kind,
    objectId: f.object_id,
    label: (f.label ?? '').trim(),
    denominator: f.denominator,
    week,
    baseline,
    baselineMonths: months,
    changePts: num(f.change_pts),
    bandPts: num(f.band_pts),
    rank: num(f.rank),
    verdict: anomalyVerdict(row, window, basisOf(months), { regime, baselineFillingMonths: (f.baseline_filling_months ?? []).length }),
  }
}

/** The check's answer for one update, as the read keeps it. Pure. */
export function unusualOf(
  check: CheckRow | null | undefined,
  flags: FlagRow[] | null,
  window: { from: string; to: string },
): WeekReadUnusual {
  const rows = weekFlagRows(check, flags)
  const outcome = check?.outcome ?? null
  if (rows == null) return { outcome, flags: [], flaggedCount: num(check?.flagged_count), unread: true }
  const frozen = rows.map((f) => frozenFlag(f, window)).filter((f): f is WeekReadFlag => f != null)
  const flaggedCount = frozen.length > 0 ? Math.max(num(rows[0].flagged_count), frozen.length) : 0
  return { outcome, flags: frozen, flaggedCount }
}

/**
 * Read the run's check and flags and freeze them. Never throws: the two
 * readers already answer a missing table and a failed read with "none" and
 * "unread", and anything else is logged and kept off the read, because the
 * week's read must not fail for its lead.
 */
export async function loadWeekUnusual(
  admin: SupabaseClient,
  a: { clientId: string; runId: string; window: { from: string; to: string } },
): Promise<WeekReadUnusual | null> {
  try {
    const [check, flags] = await Promise.all([loadCheck(admin, a.clientId, a.runId), loadFlags(admin, a.clientId, a.runId)])
    return unusualOf(check, flags, a.window)
  } catch (e) {
    console.error(`[write-week-read] the update's anomaly check could not be read: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}
