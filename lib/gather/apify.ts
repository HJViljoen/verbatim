import type { RawItem } from './types'
import { recordApifyRun } from './apify-runs'

// Thin typed Apify client. Replaces the ~6 scattered HTTP-Request nodes the n8n
// gather used. One job: run an actor and hand back its dataset items.

const APIFY_BASE = 'https://api.apify.com/v2'

export class ApifyError extends Error {}

/** True ONLY when Apify says the actor ran on this input and died —
 *  `HTTP 400` with `"type":"run-failed"` / `"run-aborted"` (the run-sync
 *  endpoint's shape for an actor crash). That is the one 4xx that can be a
 *  per-input verdict. Every other 4xx is about US, not the input — 401 token,
 *  402 usage limit (month-end!), 403 rental, 404 actor renamed, 408 run
 *  timeout, 400 memory-limit under fan-out — and must propagate so the step
 *  retries / re-plans instead of stamping healthy videos 'failed'. Transient
 *  5xx/429/network are retried inside runActor and also propagate. */
export function isActorRunFailedError(e: unknown): boolean {
  return e instanceof ApifyError && /^Apify 400\b/.test(e.message) && /"type"\s*:\s*"run-(failed|aborted)"/.test(e.message)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Apify run statuses that never change again. ABORTING / FAILING / TIMING-OUT
 *  and SUCCEEDING are transitions, not verdicts — polling must keep going. */
const TERMINAL_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'])

export function isTerminalStatus(status: string | null | undefined): boolean {
  return !!status && TERMINAL_STATUSES.has(status)
}

/** The run object `POST /v2/acts/{id}/runs` and `GET /v2/actor-runs/{id}`
 *  return (the fields we read; Apify sends many more). */
export interface ApifyRunRecord {
  id?: string
  actId?: string
  status?: string
  defaultDatasetId?: string
  startedAt?: string
  finishedAt?: string | null
  usageTotalUsd?: number | null
  statusMessage?: string | null
}

/** What an actor run cost and when — the per-call facts the old
 *  run-sync-get-dataset-items path threw away (it returns dataset items and
 *  nothing else, so spend could only ever be attributed by time window). */
export interface ApifyRunMeta {
  apifyRunId: string
  actorId: string
  status: string
  /** `usageTotalUsd` AT THE MOMENT THE RUN ENDED. Under-reports on a
   *  pay-per-event actor: those charges settle roughly a minute later, so the
   *  settle pass (lib/gather/apify-runs.ts) re-reads it at close-run. */
  usageUsd: number | null
  startedAt: string | null
  finishedAt: string | null
}

export interface ApifyRunResult extends ApifyRunMeta {
  items: RawItem[]
}

export function shapeRunMeta(run: ApifyRunRecord, fallbackActorId: string): ApifyRunMeta {
  const usage = run.usageTotalUsd
  return {
    apifyRunId: String(run.id ?? ''),
    // actId is the resolved actor id ('moJRLRc85AitArpNN'); the caller's
    // actorId may be the slug form ('clockworks~tiktok-scraper'). Prefer
    // Apify's own id so a row can be looked up in the console directly.
    actorId: run.actId ?? fallbackActorId,
    status: run.status ?? 'UNKNOWN',
    usageUsd: usage === null || usage === undefined || !Number.isFinite(Number(usage)) ? null : Number(usage),
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? null,
  }
}

/**
 * The error the old run-sync endpoint threw for a terminal non-SUCCEEDED run,
 * rebuilt from the run object.
 *
 * The message shape is load-bearing: `isActorRunFailedError` reads it to decide
 * whether a failure is a verdict about THIS input (stamp the video 'failed') or
 * about us (let the step retry). FAILED/ABORTED keep the 400 + `run-failed` /
 * `run-aborted` shape they had; TIMED-OUT deliberately does NOT match — a run
 * that outlived its timeout says nothing about the input, and 408 is what
 * run-sync returned for it.
 */
export function terminalStatusError(run: ApifyRunRecord): ApifyError | null {
  const status = run.status
  if (!status || status === 'SUCCEEDED') return null
  const detail = JSON.stringify(String(run.statusMessage ?? '').slice(0, 200))
  if (status === 'FAILED') return new ApifyError(`Apify 400: {"error":{"type":"run-failed","message":${detail}}}`)
  if (status === 'ABORTED') return new ApifyError(`Apify 400: {"error":{"type":"run-aborted","message":${detail}}}`)
  if (status === 'TIMED-OUT') return new ApifyError(`Apify 408: {"error":{"type":"run-timeout","message":${detail}}}`)
  return new ApifyError(`Apify 500: {"error":{"type":"run-unknown","message":${JSON.stringify(status)}}}`)
}

/** Apify's long-poll cap. `waitForFinish` above this is rejected. */
const WAIT_FOR_FINISH_MAX = 60

/**
 * Seconds to hand Apify's `waitForFinish`: whatever is left of our deadline,
 * capped at the API maximum, never below one second (0 would mean "return
 * immediately" and turn the poll into a busy loop).
 */
export function waitForFinishSecs(msRemaining: number, max = WAIT_FOR_FINISH_MAX): number {
  if (!Number.isFinite(msRemaining) || msRemaining <= 0) return 0
  return Math.max(1, Math.min(max, Math.floor(msRemaining / 1000)))
}

/** Slack past `timeoutSecs` before we give up ourselves. Apify enforces the
 *  actor-side timeout; this only covers the round trips around it. */
const DEADLINE_GRACE_MS = 15_000

/**
 * Run an Apify actor and return its dataset items PLUS what the run cost.
 *
 * Three calls where there used to be one: start the run (`POST /v2/acts/{id}/runs`,
 * which unlike run-sync-get-dataset-items answers with the run object and its
 * id), long-poll `GET /v2/actor-runs/{id}` until the status is terminal, then
 * read `GET /v2/datasets/{defaultDatasetId}/items`. Same deadline as the old
 * single call, same thrown errors (see terminalStatusError), same items.
 *
 * The run id is the whole point: with it, spend is a fact per call instead of
 * a guess from the account's billing window (lib/pipeline/run-costs.ts).
 *
 * `actorId` is the slug form, e.g. 'clockworks~tiktok-scraper'.
 */
export async function runActorWithMeta(
  actorId: string,
  input: RawItem,
  opts: { token?: string; timeoutSecs?: number } = {},
): Promise<ApifyRunResult> {
  const token = opts.token ?? process.env.APIFY_TOKEN
  if (!token) throw new ApifyError('APIFY_TOKEN not set')
  const timeout = opts.timeoutSecs ?? 300
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const deadline = Date.now() + timeout * 1000 + DEADLINE_GRACE_MS

  const startRes = await fetchWithRetry(
    `${APIFY_BASE}/acts/${actorId}/runs?timeout=${timeout}&waitForFinish=${waitForFinishSecs(deadline - Date.now())}`,
    { method: 'POST', headers, body: JSON.stringify(input) },
  )
  let run = ((await startRes.json()) as { data?: ApifyRunRecord } | null)?.data ?? {}
  const apifyRunId = run.id
  if (!apifyRunId) throw new ApifyError('Apify start returned no run id')

  while (!isTerminalStatus(run.status)) {
    const left = deadline - Date.now()
    if (left <= 0) {
      // Our own patience, not the actor's. Same 408 shape as a TIMED-OUT run:
      // not a verdict on the input, so the step retries.
      const meta = shapeRunMeta(run, actorId)
      await recordApifyRun(meta, 0)
      throw new ApifyError(`Apify 408: {"error":{"type":"run-timeout","message":"run ${apifyRunId} still ${run.status ?? 'unknown'} after ${timeout}s"}}`)
    }
    const res = await fetchWithRetry(`${APIFY_BASE}/actor-runs/${apifyRunId}?waitForFinish=${waitForFinishSecs(left)}`, { headers })
    run = ((await res.json()) as { data?: ApifyRunRecord } | null)?.data ?? run
  }

  const meta = shapeRunMeta(run, actorId)
  const failure = terminalStatusError(run)

  let items: RawItem[] = []
  if (!failure && run.defaultDatasetId) {
    const res = await fetchWithRetry(`${APIFY_BASE}/datasets/${run.defaultDatasetId}/items?format=json`, { headers })
    const data = (await res.json()) as unknown
    items = Array.isArray(data) ? (data as RawItem[]) : []
  }

  // Best-effort and non-fatal, and BEFORE the throw: a crashed run still cost
  // money (the transcript actor's start fee lands whether or not it resolved),
  // so the ledger has to see it.
  await recordApifyRun(meta, items.length)
  if (failure) throw failure
  return { ...meta, items }
}

/**
 * Run an Apify actor and return its dataset items.
 *
 * The shape every caller has always had. `runActorWithMeta` is the same call
 * with the run's identity and cost attached; this drops them so nothing had to
 * change to gain the ledger.
 */
export async function runActor(
  actorId: string,
  input: RawItem,
  opts: { token?: string; timeoutSecs?: number } = {},
): Promise<RawItem[]> {
  const { items } = await runActorWithMeta(actorId, input, opts)
  return items
}

/**
 * Retry transient failures (5xx / 429 / network), fail fast on other 4xx.
 * Mirrors the Technical.md retry policy for platform-critical Apify calls.
 */
async function fetchWithRetry(url: string, init: RequestInit, tries = 3): Promise<Response> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, init)
      if (res.ok) return res
      const transient = res.status >= 500 || res.status === 429
      const body = await res.text().catch(() => '')
      if (!transient) throw new ApifyError(`Apify ${res.status}: ${body.slice(0, 300)}`)
      lastErr = new ApifyError(`Apify ${res.status}: ${body.slice(0, 120)}`)
    } catch (e) {
      if (e instanceof ApifyError && !/Apify 5|Apify 429/.test(e.message)) throw e
      lastErr = e
    }
    if (attempt < tries) await sleep(attempt * 2000)
  }
  throw lastErr instanceof Error ? lastErr : new ApifyError(String(lastErr))
}
