import { MAX_ANCHOR_DAYS, periodWindowDays } from '../config'
import { RUN_STALE_AFTER_HOURS } from './run-guard'

// A run's window — decided ONCE, at open-run, and carried from there.
//
// Before this, nothing recorded what period a run covered and nothing agreed on
// it either: `resolveGatherWindow` was called three times per run — inside
// `plan-owned`, inside every `gate:<platform>` and inside `synthesize` — and
// each call read `Date.now()` again. On a run that takes hours that is a
// rounding error; on the two multi-day runs in production it was not. Össur
// `f9548a97` gated at `since = 2026-06-26` and synthesised at
// `since = 2026-07-14` — 18 days apart, exactly its own duration — so its
// period_* columns measured a week the gather had never been asked for.
// Sealand `2039968a` did the same at 9 days.
//
// The window is also no longer a rolling "last N days from whenever this step
// happened to run". It ANCHORS on the previous run's end, so a missed week is
// gathered rather than skipped (D6). Anchoring can narrow as well as widen: on
// a healthy weekly cadence the anchor is ~7 days back and nothing changes, and
// after a same-day rerun the window is minutes wide — which is the honest
// answer, since the previous run already covered everything before it.
//
// Pure: no DB and no clock of its own. `now` and the previous run's end are
// arguments; the caller (open-run) does the reading.

/** How `window_start` was decided. Stored on `pipeline_runs.window_basis`. */
export type WindowBasis =
  | 'anchored'
  | 'anchored_capped'
  | 'rolling'
  | 'baseline'
  | 'resume'
  | 'reconstructed'
  /** A resume that kept a window the backfill had reconstructed: the run
   *  itself resumed, but the window it carries is still a label rather than a
   *  record of what was gathered, and must keep saying so. */
  | 'resume_reconstructed'

/** The window a run covers. */
export interface RunWindow {
  /** Inclusive lower bound, ISO instant. NULL on a baseline run — the first
   *  map-building run is unwindowed, and a bound it never applied would be a
   *  lie on the row (and on the search adapters, which fall back to their
   *  period-derived bound when there is none). */
  start: string | null
  /** Upper bound, ISO instant: the moment the run opened. */
  end: string
  basis: WindowBasis
}

export interface RunWindowInput {
  /** The run's open time, ISO. Becomes `end`. */
  now: string
  /** The run's effective period string (`effectivePeriod`). Only used when
   *  there is no previous run to anchor on. */
  period: string
  /** The previous completed/partial run's `window_end`, else its
   *  `completed_at`. Null when the client has neither. */
  prevEnd: string | null
  /** False when no earlier `run_summary` exists for this client — the same
   *  baseline-vs-flow test `resolveGatherWindow` has always used ("the map
   *  exists" is a closed synthesis, not merely an earlier run row). */
  hasSummary: boolean
  /** The window already on the row, on an analysis-only resume. A resume
   *  re-reads a corpus that was gathered under the original window, so
   *  re-deriving one from today would re-label what the run actually covered. */
  stored?: RunWindow | null
}

/** The window a run should cover, from the run before it. */
export function resolveRunWindow(input: RunWindowInput): RunWindow {
  const stored = input.stored
  if (stored && Number.isFinite(Date.parse(stored.end))) {
    // The basis is not simply overwritten. A reconstructed window is the
    // backfill's label — "the window the code of the day would have used" —
    // and nothing may read it as a record of what was gathered. Stamping plain
    // 'resume' over it would delete that warning from the only row carrying
    // it, and the resumed run's period numbers would then be presented as
    // measured against a window no run ever gathered.
    const reconstructed = stored.basis === 'reconstructed' || stored.basis === 'resume_reconstructed'
    return { start: stored.start, end: stored.end, basis: reconstructed ? 'resume_reconstructed' : 'resume' }
  }

  const nowMs = Date.parse(input.now)
  const now = new Date(nowMs).toISOString()
  if (!input.hasSummary) return { start: null, end: now, basis: 'baseline' }

  const capMs = nowMs - MAX_ANCHOR_DAYS * 86_400_000
  const prevMs = input.prevEnd ? Date.parse(input.prevEnd) : NaN
  if (Number.isFinite(prevMs)) {
    // Clamped at both ends: never further back than the cap (a missed month
    // must not buy a month of comment scrapes), never later than now (a clock
    // skew would otherwise produce a window that runs backwards).
    const startMs = Math.min(Math.max(prevMs, capMs), nowMs)
    return {
      start: new Date(startMs).toISOString(),
      end: now,
      basis: prevMs < capMs ? 'anchored_capped' : 'anchored',
    }
  }

  // Nothing to anchor on — a client whose earlier runs all failed before
  // closing. The rolling window is what every run used before Phase 0.
  return {
    start: new Date(nowMs - periodWindowDays(input.period) * 86_400_000).toISOString(),
    end: now,
    basis: 'rolling',
  }
}

/** The window's span in days, or null when it has no lower bound. */
export function windowSpanDays(w: RunWindow): number | null {
  if (!w.start) return null
  const ms = Date.parse(w.end) - Date.parse(w.start)
  return Number.isFinite(ms) ? ms / 86_400_000 : null
}

/** Where the week/month enum boundary sits. TikTok (`TODAY|THIS_WEEK|
 *  THIS_MONTH`) and Reddit (`day|week|month`) take enums, not dates, so an
 *  anchored window has to round to one of two buckets. 8 days rather than 7: a
 *  weekly cadence anchors on the previous run's end, which on a slot that
 *  drifts by a few hours is a hair over 7 days, and rounding that up to a month
 *  would buy three extra weeks of comment scrapes every week. Past 8 days the
 *  run is catching up on a miss and the month bucket is what it needs — the
 *  `inWindow` post-filter trims whatever the wider bucket over-returns.
 *
 *  Two buckets, not three (D6): there is deliberately no day arm, so once a
 *  window is frozen the TODAY / 'day' bucket is retired. A manual daily run
 *  asks both actors for the week and `inWindow` trims the surplus before the
 *  comment scrape, which costs a wider search and nothing else. Only the
 *  unwindowed callers — the CLI scripts and a baseline run — still map a
 *  `daily` period straight onto TODAY / 'day'. */
export const ENUM_WEEK_MAX_DAYS = 8

/** Which enum bucket a frozen window falls in, or null when it has no lower
 *  bound (a baseline run) — the caller then keeps its period-derived bound,
 *  exactly as before. */
function enumBucketFor(w?: RunWindow | null): 'week' | 'month' | null {
  const days = w ? windowSpanDays(w) : null
  if (days === null) return null
  return days <= ENUM_WEEK_MAX_DAYS ? 'week' : 'month'
}

/** TikTok's actor `dateRange` for a frozen window. Null = no frozen bound. */
export function tiktokRangeFor(w?: RunWindow | null): 'THIS_WEEK' | 'THIS_MONTH' | null {
  const bucket = enumBucketFor(w)
  return bucket === null ? null : bucket === 'week' ? 'THIS_WEEK' : 'THIS_MONTH'
}

/** Reddit's actor `searchTime` for a frozen window. Null = no frozen bound. */
export function redditTimeFor(w?: RunWindow | null): 'week' | 'month' | null {
  return enumBucketFor(w)
}

/**
 * Did the run take longer than it had any business taking? Recorded at
 * close-run on `pipeline_runs.stalled`; nothing alerts on it yet.
 *
 * Two bounds, whichever is wider. The window it covered is the first: a run
 * that spends longer gathering a week than the week it gathered is behind its
 * own cadence, which is what the column is for (Össur `f9548a97` took 18 days
 * over a 7-day window). The FLOOR is the second, and it is there because
 * anchoring made the first bound meaningless at the short end: a same-day rerun
 * anchors on a window minutes wide, so every rerun of ordinary length — the 13
 * minutes of `29a56395`, the 22 of `093acddb` — would be marked stalled by the
 * span alone. Below the floor a run is simply a run; `RUN_STALE_AFTER_HOURS` is
 * the same six hours the single-flight sweep and the health check already use
 * for "this is not coming back", so the product holds one number for it.
 */
export function isStalled(run: {
  startedAt: string
  completedAt: string
  window?: RunWindow | null
}): boolean {
  const span = run.window ? windowSpanDays(run.window) : null
  if (span === null) return false
  const ranMs = Date.parse(run.completedAt) - Date.parse(run.startedAt)
  if (!Number.isFinite(ranMs)) return false
  return ranMs > Math.max(span * 86_400_000, RUN_STALE_AFTER_HOURS * 3600_000)
}
