import { AsyncLocalStorage } from 'node:async_hooks'
import { createAdminClient } from '../supabase-admin'

// Per-call Apify attribution (Phase 3, 2026-09-09).
//
// Apify bills per ACCOUNT. Until now the only record of what a pipeline run
// spent was the account's own billing window, summed at close-run — which is
// 'ambiguous' the moment two tenants overlap, i.e. always, and a floor rather
// than a total whenever the listing ran out of pages. runActorWithMeta now
// hands every actor run's id and usage to this module, which writes one
// apify_runs row per call. Summing THOSE rows is exact by construction.
//
// The context is an AsyncLocalStorage store rather than an argument on
// runActor: the call sites are ~8 deep inside gather/owned/transcript code
// that has no idea a pipeline run exists, and threading a context through all
// of them would have been the whole diff. See withApifyRunContext for how the
// pipeline enters it — INSIDE each Inngest step body, so the store never has
// to survive a step boundary.

export interface ApifyRunContext {
  clientId: string
  /** Null for a script or a one-off call: the row is still recorded (the money
   *  was still spent), it just belongs to no pipeline run. */
  runId?: string | null
  /** The Inngest step id, so a row can be read back as "what did
   *  comments:instagram:4 cost". */
  step?: string | null
}

const store = new AsyncLocalStorage<ApifyRunContext>()

/** Run `fn` with every Apify actor call inside it attributed to this run/step. */
export function withApifyRunContext<T>(ctx: ApifyRunContext, fn: () => Promise<T>): Promise<T> {
  return store.run(ctx, fn)
}

export function getApifyRunContext(): ApifyRunContext | undefined {
  return store.getStore()
}

export interface RecordableRun {
  apifyRunId: string
  actorId: string
  status: string
  usageUsd: number | null
  startedAt: string | null
  finishedAt: string | null
}

/**
 * Write one apify_runs row for a finished actor call.
 *
 * Best-effort by contract: no context means no row (a script, a test), and a
 * write failure is logged and swallowed. Bookkeeping must never be able to
 * fail a gather step that already spent the money.
 */
export async function recordApifyRun(run: RecordableRun, items: number): Promise<void> {
  const ctx = store.getStore()
  if (!ctx || !ctx.clientId || !run.apifyRunId) return
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('apify_runs').upsert(
      {
        client_id: ctx.clientId,
        run_id: ctx.runId ?? null,
        step: ctx.step ?? null,
        actor_id: run.actorId,
        apify_run_id: run.apifyRunId,
        status: run.status,
        usage_usd: run.usageUsd,
        items,
        started_at: run.startedAt,
        finished_at: run.finishedAt,
        // Never true at insert: a pay-per-event actor's charges land about a
        // minute after the run ends, so what we just read is a floor.
        settled: false,
      },
      { onConflict: 'apify_run_id' },
    )
    if (error) console.warn(`[apify-runs] record ${run.apifyRunId} failed: ${error.message}`)
  } catch (e) {
    console.warn(`[apify-runs] record ${run.apifyRunId} threw: ${e instanceof Error ? e.message : String(e)}`)
  }
}

// --- Settling -----------------------------------------------------------------
//
// Measured 2026-09-09 (Phase 2): `usageTotalUsd` on a just-finished
// pay-per-event run reports the start fee only; the per-event charges appear
// about a minute later. Reading usage at the moment the actor returns
// therefore UNDER-reports — a $0.0552 transcript run read as $0.005. So the
// close-run settle pass waits for the charges to land and re-reads.

/** How old a finished run must be before its usage figure can be trusted. */
export const SETTLE_MIN_AGE_MS = 60_000
/** Ceiling on how long the settle step will wait. Bounded so the step can
 *  never approach Inngest's cap however recently the last actor finished. */
export const SETTLE_MAX_WAIT_MS = 90_000

/**
 * How long to wait before re-reading a run's usage: enough for its charges to
 * settle, never more than the step's budget, never negative.
 */
export function settleWaitMs(
  finishedAt: string | null | undefined,
  now: number,
  minAgeMs = SETTLE_MIN_AGE_MS,
  maxWaitMs = SETTLE_MAX_WAIT_MS,
): number {
  if (!finishedAt) return 0
  const t = new Date(finishedAt).getTime()
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.min(maxWaitMs, t + minAgeMs - now))
}

export interface UnsettledRow {
  id: string
  apify_run_id: string
  usage_usd: number | string | null
  finished_at: string | null
}

/** The single sleep that covers every row: the youngest run decides. */
export function settleDelayForRows(rows: Pick<UnsettledRow, 'finished_at'>[], now: number): number {
  return rows.reduce((max, r) => Math.max(max, settleWaitMs(r.finished_at, now)), 0)
}

export interface SettleResult {
  checked: number
  settled: number
  failed: number
  waitedMs: number
  beforeUsd: number
  afterUsd: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Re-read every unsettled apify_runs row of a pipeline run and write the
 * final usage figure.
 *
 * Non-fatal throughout: a row that cannot be re-read keeps the figure it has
 * and stays unsettled, which is exactly what run_costs' 'exact_unsettled'
 * label is for — the total is then a floor, and says so.
 */
export async function settleApifyRuns(clientId: string, runId: string): Promise<SettleResult> {
  const empty: SettleResult = { checked: 0, settled: 0, failed: 0, waitedMs: 0, beforeUsd: 0, afterUsd: 0 }
  const token = process.env.APIFY_TOKEN
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('apify_runs')
    .select('id, apify_run_id, usage_usd, finished_at')
    .eq('client_id', clientId)
    .eq('run_id', runId)
    .eq('settled', false)
  if (error) {
    console.warn(`[apify-settle] read failed: ${error.message}`)
    return empty
  }
  const rows = (data ?? []) as UnsettledRow[]
  if (!rows.length || !token) return { ...empty, checked: rows.length }

  const beforeUsd = round4(rows.reduce((s, r) => s + Number(r.usage_usd ?? 0), 0))
  const waitedMs = settleDelayForRows(rows, Date.now())
  if (waitedMs > 0) await sleep(waitedMs)

  let settled = 0
  let failed = 0
  let afterUsd = 0
  for (const row of rows) {
    try {
      const res = await fetch(`https://api.apify.com/v2/actor-runs/${row.apify_run_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const run = ((await res.json()) as { data?: { status?: string; usageTotalUsd?: number | null; finishedAt?: string | null } } | null)?.data ?? {}
      const usage = run.usageTotalUsd
      const usageUsd = usage === null || usage === undefined || !Number.isFinite(Number(usage)) ? Number(row.usage_usd ?? 0) : Number(usage)
      const { error: upErr } = await admin
        .from('apify_runs')
        .update({
          usage_usd: usageUsd,
          status: run.status ?? undefined,
          finished_at: run.finishedAt ?? row.finished_at,
          settled: true,
        })
        .eq('id', row.id)
      if (upErr) throw new Error(upErr.message)
      afterUsd += usageUsd
      settled++
    } catch (e) {
      failed++
      afterUsd += Number(row.usage_usd ?? 0)
      console.warn(`[apify-settle] ${row.apify_run_id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { checked: rows.length, settled, failed, waitedMs, beforeUsd, afterUsd: round4(afterUsd) }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}
