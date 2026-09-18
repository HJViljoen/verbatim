import { randomUUID } from 'crypto'
import { chunk } from '../../lib/chunk'
import { inngest } from '@/inngest/client'
import { createAdminClient, selectAll } from '@/lib/supabase-admin'
import { planGatherSearches, searchStepId, searchOne, gatePlatform, scrapeCommentsBatch, transcribeBatch, planTranscribeBatches, resolveGatherWindow, inWindow, loadGatherConfig, type SearchResult } from '@/lib/gather/gather'
import { runPassA, passALane, passAPromptVersion } from '@/lib/pipeline/pass-a'
import { decideAnalysis, emptyReasonTally, protectedKeptIds, staleInsightIds, type SelectReason } from '@/lib/pipeline/pass-a-plan'
import { parseRef } from '@/lib/renderables/quotes-freeze'
import { loadGroupedInsights, runStepA2Bucket, type StepA2BucketResult } from '@/lib/pipeline/step-a2'
import { runPassB } from '@/lib/pipeline/pass-b'
import { runPassC } from '@/lib/pipeline/pass-c'
import { runPassD } from '@/lib/pipeline/pass-d'
import { runCrossReference } from '@/lib/pipeline/cross-reference'
import { loadBrandClaims, shapeBrandVoice } from '@/lib/pipeline/claims'
import { compareThemes } from '@/lib/pipeline/step-a2'
import { attributeRunKeywords } from '@/lib/pipeline/keyword-attribution'
import { discoverRunKeywords } from '@/lib/pipeline/keyword-discovery'
import { planClassifyMetaBatches, runClassifyMetaBatch } from '@/lib/pipeline/classify-meta'
import { planTranslateBatches, translateBatch } from '@/lib/pipeline/translate'
import { planQuoteTranslations, translateQuotesBatch } from '@/lib/pipeline/translate-quotes'
import { planOcrBatches, ocrBatch, planOcrBackfill, ocrBackfillBatch, emptyOcrResult, mentionsMissingColumn } from '@/lib/pipeline/ocr'
import { ingestOwnedPosts, supportsOwnedProfile, buildOwnedCensus, entitySlug, type OwnedEntity } from '@/lib/gather/owned'
import { planTranscriptBackfill, backfillTranscriptsBatch, emptyBackfillTally, mergeTallies, formatTally } from '@/lib/gather/transcript-backfill'
import { discoverSubreddits } from '@/lib/gather/subreddit-discovery'
import { activeSubreddits } from '@/lib/gather/subreddits'
import { runStep2c } from '@/lib/pipeline/owned-events'
import { runAnomalyCheck } from '@/lib/pipeline/anomaly-check'
import { runPassE } from '@/lib/pipeline/pass-e'
import { reevaluatePlanChecks } from '@/lib/ask/reevaluate'
import { summariseRunErrors, partialRunAlert, passADegradation, isolatedBatchDegradation, runCloseStatus, RUN_ERROR_CAP } from '@/lib/pipeline/run-errors'
import { writeRunCosts, runSpendSoFar } from '@/lib/pipeline/run-costs'
import { withApifyRunContext, settleApifyRuns } from '@/lib/gather/apify-runs'
import { decideOpenRun, runIdForEvent, RUN_STALE_AFTER_HOURS, PG_UNIQUE_VIOLATION, type RunningRow } from '@/lib/pipeline/run-guard'
import { persistRunNews } from '@/lib/news/persist'
import { persistThemes, loadThemes } from '@/lib/pipeline/themes'
import { writeRunSummary } from '@/lib/pipeline/run-summary'
import { pipelineActor } from '@/lib/config-log'
import { fillingMonths, freezeMonths, isMissingMonthlyReading, monthsToRefresh } from '@/lib/reading/monthly'
import { SLICE } from '@/lib/reading/coverage'
import { subjectFreezeHold, subjectMonthSide, type MembershipOutcome } from '@/lib/subjects/read'
import { embedNullInsights, embedSummary } from '@/lib/pipeline/embed-insights'
import { embeddingCoverage } from '@/lib/agent/retrieve'
import { embedSubjects, judgeSubject, loadActiveSubjects, membershipSummary, subjectBudgetUsd } from '@/lib/subjects/membership'
import { isMissingSubjects } from '@/lib/subjects/types'
import { resolveRunWindow, isStalled, type RunWindow } from '@/lib/pipeline/window'
import { clusteringKey as clusteringKeyOf, currentClusteringRegime } from '@/lib/pipeline/clustering'
import { PROMPT_VERSION as THEME_MERGE_PROMPT_VERSION } from '@/lib/pipeline/theme-merge'
import { buildConfigSnapshot, openRunBookkeeping, isMissingBookkeepingColumn, isMissingClusteringKeyColumn, previousRunEnd, rowWindow, CONFIG_SNAPSHOT_COLUMNS, type TrackingConfigRow, type WindowColumns } from '@/lib/pipeline/run-bookkeeping'
import { computeMetrics, isDiscoveredVideo } from '@/lib/pipeline/metrics'
import { sendAlertEmail } from '@/lib/email'
import { billingAccess, type BillingClient } from '@/lib/billing'
import { CLUSTER_SIMILARITY_THRESHOLD, EVIDENCE_FLOOR, PASS_A_ERROR_RATIO, ISOLATED_BATCH_ERROR_RATIO, RUN_MODEL_BUDGET_USD, TRANSCRIBE_PARALLEL, BACKFILL_PARALLEL, TRANSLATE_PARALLEL, TRANSLATE_QUOTES_PARALLEL, OCR_PARALLEL, OCR_CAP, captureRunFlags, periodSince, effectivePeriod, type RunFlags } from '@/lib/config'
import type { Platform } from '@/lib/gather/types'
import type { CommentRow, SynthesisVideoRow } from '@/lib/pipeline/types'
import { SYNTHESIS_VIDEO_COLUMNS } from '@/lib/pipeline/types'

// The full Verbatim pipeline as one durable Inngest function — the port of the
// scripts/run-*.ts CLI sequence the orchestrator was always meant to own
// (see the notes in run-gather.ts / run-cd.ts). One run_id flows through every
// stage; each stage is a retryable step decoupled via the DB, so a failure
// resumes from the last completed step rather than re-scraping.
//
// Trigger: `pipeline/run.requested` { clientId, options? }. The cron dispatcher
// (scheduler.ts) and the admin trigger-run route both emit this event.
//
// Timeout note: every stage is sized to fit the route's duration cap. Gather is
// fanned out per keyword search + per comment batch (a whole platform in one
// step timed out at 300s on the first cloud run — the per-video Apify comment
// scrape dominates); Pass A runs in batches of PASS_A_BATCH videos (the whole
// corpus in one step was ~264 eligible videos ≈ 15-20 min of GPT calls); the
// back half is a per-bucket themes fan-out + pass-b + persist-themes (split
// 2026-08-09 — the single 'themes' step survived run 2's 300s cap only via
// retry), then one synthesis step decoupled via the themes table.

export interface PipelineRunOptions {
  platforms?: Platform[]
  maxVideos?: number
  videoLimit?: number
  period?: string
  // When set, emit a `report/send.requested` after the run completes so the
  // periodic report goes out. The scheduler sets this; manual "Run now" doesn't.
  sendReport?: boolean
  // The dispatcher slot this run is serving (ISO, the 06:00 SAST slot for the
  // day). Recorded on the run row so "was Sunday's run started?" is a column
  // rather than a recomputation from tracking_configs. Absent on a manual run,
  // which is exactly the distinction worth keeping.
  scheduledFor?: string | null
  // Analysis-only resume: reuse an existing run row (reset to 'running') and
  // skip the gather fan-out entirely — the corpus is already in the DB. The
  // operator lever for finishing a run whose analysis half died, without
  // re-paying a 1-2h Apify gather.
  runId?: string
  skipGather?: boolean
  // Incremental Pass A (2026-08-17): re-read every eligible video this run even
  // when nothing changed — the operator lever after a prompt/model change that
  // did not bump the version string, or to rebuild bookkeeping. No effect when
  // INCREMENTAL_PASS_A is off (everything is re-read anyway).
  forcePassA?: boolean
}

/** open-run step result. `runId: null` = skipped by the single-flight guard.
 *  `flags` is the run's frozen flag snapshot (absent on runs opened before
 *  2026-08-18, which fall back to reading the environment); `period` is the
 *  run's effective period, frozen the same way (absent on runs opened before
 *  2026-09-09); `window` is the run's gather window, frozen the same way
 *  (absent on runs opened before 2026-09-15, which fall back to resolving it
 *  from the clock at each step, i.e. what they started under). */
interface OpenRunResult {
  runId: string | null
  skipped?: string
  flags?: RunFlags
  period?: string
  window?: RunWindow
}

/**
 * What open-run needs from the DB before it can write its bookkeeping: the
 * previous run's end, whether a `run_summary` exists (baseline-vs-flow), and —
 * on a resume — the window the row already carries plus whether it already
 * carries a config snapshot. Read once, inside open-run, so no later step asks
 * again.
 *
 * Two of the three reads name columns the bookkeeping migration adds, and those
 * two swallow THAT error and nothing else: before the migration lands each
 * comes back empty, which lands on the same answers the pre-2026-09-15 code had
 * (no anchor, no stored window), and open-run then writes without the columns
 * at all.
 *
 * Every other failure throws, because once the columns exist "the read failed"
 * and "this client has no previous run" are otherwise the same answer: `closed`
 * is empty, `previousRunEnd` is null, `resolveRunWindow` takes the rolling arm,
 * and the row then asserts `window_basis = 'rolling'` as a deliberate basis
 * rather than as a fallback. For Össur after a missed week that is the
 * difference between gathering the gap — the whole point of D6 — and gathering
 * seven days, with nothing anywhere recording the cause. A throw is the safe
 * direction: open-run is a step, Inngest retries it, and the pre-migration path
 * is named by its own predicate rather than by silence.
 */
async function loadRunWindowInput(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  runId: string,
  resumeRunId: string | undefined,
): Promise<{ prevEnd: string | null; hasSummary: boolean; stored: RunWindow | null; hasConfigSnapshot: boolean }> {
  const mine = new Set([runId, resumeRunId].filter(Boolean) as string[])
  const [prevRes, summaryRes, storedRes] = await Promise.all([
    // The previous run's own window_end, falling back to when it closed — the
    // rule lib/pipeline/owned-events.ts has always used for account events, now
    // the rule for content too. Ordered by window_end (the index this migration
    // creates) and then by completed_at, which is what a row without a window
    // sorts on; `previousRunEnd` then takes the latest of the two per row,
    // because a resume moves completed_at without moving window_end. Five rows,
    // not one: this run's own row (and a resume's target) can sit at the top of
    // the ordering and must not anchor the window on itself.
    admin.from('pipeline_runs')
      .select('id, window_end, completed_at')
      .eq('client_id', clientId)
      .in('status', ['completed', 'partial'])
      .order('window_end', { ascending: false, nullsFirst: false })
      .order('completed_at', { ascending: false, nullsFirst: false })
      .limit(5),
    // "The map exists" — the same existence check resolveGatherWindow has
    // always made: a closed synthesis, not merely an earlier run row.
    admin.from('run_summary').select('run_id').eq('client_id', clientId).neq('run_id', runId).limit(1).maybeSingle(),
    resumeRunId
      ? admin.from('pipeline_runs').select('window_start, window_end, window_basis, config_snapshot')
          .eq('id', resumeRunId).eq('client_id', clientId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  // The narrow guard, on the two reads that can legitimately hit it, and a
  // throw on everything else — see this function's comment.
  if (prevRes.error && !isMissingBookkeepingColumn(prevRes.error)) throw prevRes.error
  if (storedRes.error && !isMissingBookkeepingColumn(storedRes.error)) throw storedRes.error
  // run_summary names no new column, so any failure of it is a real one: a
  // swallowed error here reads as "this client has never been synthesised" and
  // opens the run on the `baseline` arm.
  if (summaryRes.error) throw summaryRes.error
  const closed = (prevRes.data ?? []) as ({ id: string } & WindowColumns & { completed_at?: string | null })[]
  const storedRow = storedRes.data as (WindowColumns & { config_snapshot?: unknown }) | null
  return {
    prevEnd: previousRunEnd(closed, mine),
    hasSummary: Boolean(summaryRes.data),
    stored: rowWindow(storedRow),
    hasConfigSnapshot: Boolean(storedRow?.config_snapshot),
  }
}

export const runPipeline = inngest.createFunction(
  {
    id: 'run-pipeline',
    triggers: [{ event: 'pipeline/run.requested' }],
    // Step-concurrency ceiling per client. NOT the single-flight mechanism:
    // Inngest's `concurrency` limits concurrent STEPS, and `limit: 1` (until
    // 2026-08-18) serialised every "parallel" wave in this function for its
    // whole life — an ai_call_log sweep found zero overlapping calls in any run.
    //
    // 5, because that is the Inngest Hobby plan's account-wide cap and Inngest
    // REJECTS the whole app registration if a function asks for more: the first
    // attempt at 8 came back {"modified":false, "...higher concurrency limits
    // (8) than your plan limit of 5"}, which would have left the old limit:1
    // config live and silently undone this entire change. It also happens to be
    // exactly the largest wave (PASS_A_PARALLEL). The 5 is shared with the
    // scheduler, report, owned-snapshot and retention functions, so raising the
    // real ceiling means a paid plan or the container worker (Tier 5).
    //
    // "One run per client at a time" lives in open-run (lib/pipeline/run-guard)
    // plus the unique index pipeline_runs_one_running_per_client.
    concurrency: { limit: 5, key: 'event.data.clientId' },
    retries: 2,
    // A function-level failure (a step out of retries) would otherwise strand
    // the run row at 'running' forever — pages and monitors need a terminal
    // state (found live: the first cloud run's gather timeouts did exactly this).
    onFailure: async ({ event }) => {
      const original = (event.data as { event?: { data?: { clientId?: string } } }).event
      const clientId = original?.data?.clientId
      if (!clientId) return
      const message = (event.data as { error?: { message?: string } }).error?.message ?? 'pipeline function failed'
      const admin = createAdminClient()
      await admin.from('pipeline_runs')
        .update({ status: 'failed', error_message: message, completed_at: new Date().toISOString() })
        .eq('client_id', clientId).eq('status', 'running')
      // Operator alert — before this, a dead run was only ever a DB row
      // nobody was looking at (scheduled runs are unattended).
      const { data: client } = await admin.from('clients')
        .select('company_name').eq('id', clientId).maybeSingle()
      await sendAlertEmail(
        `Verbatim run FAILED — ${client?.company_name ?? clientId}`,
        `Pipeline run failed after retries.\n\nClient: ${client?.company_name ?? '?'} (${clientId})\nError: ${message}\n\nResume lever: POST /api/admin/trigger-run with options {runId, skipGather:true}.`,
      )
    },
  },
  async ({ event, step }) => {
    const clientId = (event.data as { clientId?: string }).clientId
    if (!clientId) throw new Error('pipeline/run.requested missing clientId')
    const options = ((event.data as { options?: PipelineRunOptions }).options) ?? {}

    // 1. Open the run row (the orchestrator owns the lifecycle the CLI used to).
    //    An analysis-only resume reuses the existing row instead.
    //    Single-flight guard (2026-08-18): a second event for a client whose
    //    run is still in flight is SKIPPED here — returned, not thrown, so
    //    onFailure never fires and never marks the live run failed. Abandoned
    //    'running' rows past RUN_STALE_AFTER_HOURS are closed as failed on the
    //    way through instead of blocking the client forever. The step keeps its
    //    id and tolerates the pre-2026-08-18 memoised shape (a bare run id
    //    string) so a run in flight across the deploy replays cleanly.
    // Derived from the event, not random: a retry of this step must recognise
    // the row its own previous attempt inserted, or it reads its own side
    // effect as "someone else is running" and skips the run for good.
    //
    // No event id (should not happen; every sent event carries one) falls back
    // to a random id — i.e. the pre-2026-08-18 behaviour, losing only retry
    // idempotency. Deriving one from clientId+options instead would be far
    // worse: two scheduled runs carry identical options, so they would collide
    // on the primary key and the second would reopen the first's run row.
    const eventId = (event as { id?: string }).id
    const newRunId = eventId ? runIdForEvent(eventId) : randomUUID()

    const opened = await step.run('open-run', async (): Promise<OpenRunResult> => {
      const admin = createAdminClient()
      const running = await admin
        .from('pipeline_runs')
        .select('id, started_at')
        .eq('client_id', clientId)
        .eq('status', 'running')
      if (running.error) throw new Error(`open run (guard): ${running.error.message}`)
      const all = (running.data ?? []) as RunningRow[]
      // Our own row (a retry's insert, or the row an analysis-only resume is
      // reopening while it is still marked running) is not competition.
      const mine = new Set([newRunId, options.runId].filter(Boolean) as string[])
      const rows = all.filter((r) => !mine.has(r.id))
      const decision = decideOpenRun(rows)
      if (decision.action === 'skip') {
        console.warn(`[open-run] skipped: client ${clientId} already has run ${decision.blockingRunId} in flight`)
        return { runId: null, skipped: `run ${decision.blockingRunId} already in flight` }
      }
      // A resume whose target row is STILL running is a duplicate resume, not a
      // resume: two invocations on one run_id race persistThemes, writeRunSummary
      // (delete-then-insert) and prune, and double the GPT spend. Before T0-1 the
      // step-concurrency limit accidentally serialised them; now they would
      // genuinely overlap, so this has to be refused explicitly.
      if (options.runId) {
        const target = all.find((r) => r.id === options.runId)
        if (target && decideOpenRun([target]).action === 'skip') {
          console.warn(`[open-run] skipped: run ${options.runId} is still in flight; not resuming it twice`)
          return { runId: null, skipped: `run ${options.runId} is already running` }
        }
      }
      if (decision.staleRunIds.length) {
        console.warn(`[open-run] closing ${decision.staleRunIds.length} abandoned running row(s): ${decision.staleRunIds.join(', ')}`)
        await admin.from('pipeline_runs')
          .update({ status: 'failed', error_message: `abandoned: still 'running' after ${RUN_STALE_AFTER_HOURS}h when a new run opened`, completed_at: new Date().toISOString() })
          .in('id', decision.staleRunIds)
      }
      // Frozen here, inside the memoised step: every later step replays these
      // values instead of re-reading an environment (or a tenant config) that
      // may have moved.
      const flags = captureRunFlags()
      // The run's effective period — the trigger's override, else the tenant's
      // configured cadence. Resolved ONCE, here, so gather, the owned window,
      // the synthesis slice, the census and run_summary.period cannot disagree
      // and a retry cannot see a different answer.
      const { data: tcRow } = await admin.from('tracking_configs')
        .select(CONFIG_SNAPSHOT_COLUMNS).eq('client_id', clientId).maybeSingle()
      const tc = tcRow as TrackingConfigRow | null
      const period = effectivePeriod(options.period, tc?.report_period ?? null)
      // The run's gather window, frozen here for the same reason and for a
      // sharper one: it used to be recomputed from Date.now() inside plan-owned,
      // inside every gate:<platform> and inside synthesize, so a run that took
      // days gathered one window and reported another (Össur f9548a97: 18 days
      // apart). Anchored on the previous run's end, so a missed week is
      // gathered rather than skipped — see lib/pipeline/window.ts.
      const windowInput = await loadRunWindowInput(admin, clientId, options.runId ?? newRunId, options.runId)
      const window = resolveRunWindow({
        now: new Date().toISOString(),
        period,
        prevEnd: windowInput.prevEnd,
        hasSummary: windowInput.hasSummary,
        stored: windowInput.stored,
      })
      const snapshot = buildConfigSnapshot(tc)
      // The regime this invocation will cluster under, frozen beside the window
      // and the flags for the same reason: a month row's run_id says WHICH run
      // produced it and nothing about whether two runs grouped themes the same
      // way, and one run id can span a change (Össur 29a56395 → d346b0f7 moved
      // the Pass A flags with nothing but a JSON blob recording it).
      const clusteringKey = clusteringKeyOf(currentClusteringRegime({
        promptVersion: passAPromptVersion(flags.transcripts),
        // The flags themselves, not just the version they select: flipping
        // translation or OCR re-reads the corpus a video at a time (the
        // 'translated' and 'ocr' SelectReasons) without moving
        // passAPromptVersion, which is exactly what happened between 29a56395
        // and d346b0f7.
        passAInputs: { transcripts: flags.transcripts, translation: flags.translation, ocr: flags.ocr },
        mergePromptVersion: THEME_MERGE_PROMPT_VERSION,
      }))
      // The bookkeeping migration is applied by hand (a schema change on a live
      // pipeline is not a deploy side effect), so the code CAN reach production
      // first. Every one of these columns is additive, so a write that names
      // them before they exist comes back 42703/PGRST204 and the same write
      // without them is exactly what every run did before this shipped —
      // whereas failing here would fail the first step of every run for every
      // tenant until someone applied the migration. The run then carries no
      // frozen window and every reader falls back to the clock, as a
      // pre-2026-09-15 row does. Same guard as ocr.ts and Pass D-b's lineage.
      //
      // `clustering_key` is retried on its OWN before that blanket drop. It
      // came three migrations later, so it can be the only column missing, and
      // it is one nullable text column nothing reads yet — while dropping the
      // group costs the frozen window, which is the 18-days-apart failure
      // AGENTS.md names. So: full write, then the same write minus the key,
      // then (only for the seven) the bare row.
      let recorded = true
      const resumeRunId = options.runId
      if (resumeRunId) {
        // started_at moves to NOW. It is set only at insert, and a resumed run
        // is by definition hours old, so leaving it would make every resumed
        // run instantly "abandoned" to the next open-run — which would stamp a
        // live run failed and open a second one alongside it.
        //
        // The bookkeeping is NOT simply rewritten: the slot the original run
        // served and the config it gathered under are its facts, not this
        // invocation's (lib/pipeline/run-bookkeeping.ts).
        const bookkeeping = (withClusteringKey: boolean) => openRunBookkeeping({
          period, window, snapshot,
          ...(withClusteringKey ? { clusteringKey } : {}),
          scheduledFor: options.scheduledFor,
          resume: { hasConfigSnapshot: windowInput.hasConfigSnapshot },
        })
        const reopen = (extra: Record<string, unknown>) =>
          admin
            .from('pipeline_runs')
            .update({ status: 'running', error_message: null, completed_at: null, started_at: new Date().toISOString(), flags, options, ...extra })
            .eq('id', resumeRunId).eq('client_id', clientId)
        let { error } = await reopen({ stalled: false, ...bookkeeping(true) })
        if (error && isMissingClusteringKeyColumn(error)) {
          console.warn('[open-run] pipeline_runs.clustering_key is not in the database yet; reopening without it (the window is still frozen)')
          ;({ error } = await reopen({ stalled: false, ...bookkeeping(false) }))
        }
        if (error && isMissingBookkeepingColumn(error)) {
          console.warn('[open-run] run bookkeeping columns are not in the database yet; reopening without them')
          recorded = false
          ;({ error } = await reopen({}))
        }
        if (error?.code === PG_UNIQUE_VIOLATION) return { runId: null, skipped: 'another run opened first (unique index)' }
        if (error) throw new Error(`reopen run: ${error.message}`)
        return { runId: resumeRunId, flags, period, ...(recorded ? { window } : {}) }
      }
      const open = (extra: Record<string, unknown>) =>
        admin
          .from('pipeline_runs')
          .insert({ id: newRunId, client_id: clientId, status: 'running', flags, options, ...extra })
      const opening = (withClusteringKey: boolean) => openRunBookkeeping({
        period, window, snapshot,
        ...(withClusteringKey ? { clusteringKey } : {}),
        scheduledFor: options.scheduledFor,
      })
      let { error } = await open(opening(true))
      if (error && isMissingClusteringKeyColumn(error)) {
        console.warn('[open-run] pipeline_runs.clustering_key is not in the database yet; opening without it (the window is still frozen)')
        ;({ error } = await open(opening(false)))
      }
      if (error && isMissingBookkeepingColumn(error)) {
        console.warn('[open-run] run bookkeeping columns are not in the database yet; opening without them')
        recorded = false
        ;({ error } = await open({}))
      }
      if (error?.code === PG_UNIQUE_VIOLATION) {
        // Either our own previous attempt's row (same id), or another run won
        // the race for this client (different id).
        const { data: ours } = await admin.from('pipeline_runs')
          .select(recorded ? 'id, window_start, window_end, window_basis' : 'id')
          .eq('id', newRunId).eq('client_id', clientId).maybeSingle()
        if (ours) {
          console.warn(`[open-run] reusing run ${newRunId} from a previous attempt of this step`)
          // The row's own window, not the one just computed: the previous
          // attempt gathered against what it wrote, and a second clock reading
          // is exactly what this work exists to stop.
          return { runId: newRunId, flags, period, ...(recorded ? { window: rowWindow(ours as WindowColumns) ?? window } : {}) }
        }
        return { runId: null, skipped: 'another run opened first (unique index)' }
      }
      if (error) throw new Error(`open run: ${error.message}`)
      return { runId: newRunId, flags, period, ...(recorded ? { window } : {}) }
    })
    // Pre-2026-08-18 memoised shape: the step returned the run id itself.
    const runId: string | null = typeof opened === 'string' ? opened : opened.runId
    // A run opened before this shipped has no snapshot; read the environment,
    // which is exactly what it was doing anyway.
    const flags: RunFlags = (typeof opened === 'string' ? undefined : opened.flags) ?? captureRunFlags()
    // The run's effective period (options.period ?? tracking_configs.report_period),
    // frozen by open-run. A run opened before 2026-09-09 has no frozen value:
    // it falls back to its own options and then, at each use site, to reading
    // tracking_configs — i.e. exactly the behaviour it started under.
    const runPeriod: string | null =
      (typeof opened === 'string' ? undefined : opened.period) ?? options.period ?? null
    // The run's frozen gather window. Null on a run opened before 2026-09-15
    // (including one in flight across the deploy): every reader then falls back
    // to resolving the window from the clock, which is what that run started
    // under and must keep doing.
    const runWindow: RunWindow | null = (typeof opened === 'string' ? undefined : opened.window) ?? null
    if (!runId) {
      const reason = typeof opened === 'string' ? '' : opened.skipped ?? ''
      // A skipped SCHEDULED run would otherwise cost the client their whole
      // update: the report is emitted at the end of a run that never happens,
      // and the only trace is a log line that ages out within the hour. Alert
      // instead, so a skipped Sunday is something the operator finds out about.
      if (options.sendReport) {
        await step
          .run('alert-skipped', async () => {
            const admin = createAdminClient()
            const { data: client } = await admin.from('clients')
              .select('company_name').eq('id', clientId).maybeSingle()
            return sendAlertEmail(
              `Verbatim run SKIPPED — ${client?.company_name ?? clientId}`,
              `A scheduled run was skipped because another run is already in flight.\n\nClient: ${client?.company_name ?? '?'} (${clientId})\nReason: ${reason}\n\nNo report was sent for this period. Resume lever: POST /api/admin/trigger-run once the in-flight run closes.`,
            )
          })
          .catch(() => ({ sent: false }))
      }
      return { runId: null, status: 'skipped', reason }
    }

    // News context layer (Wave 2): free RSS fetch + ring-assign + store for
    // the Trends panel. Zero corpus dependency, so it runs right after
    // open-run. Non-fatal AND uncounted: a context-feed hiccup neither fails
    // the run nor marks the intelligence 'partial' — the panel just stays on
    // last week's items.
    await step
      .run('gather-news', () => persistRunNews(clientId, runId))
      .catch((e) => {
        console.error(`[gather-news] out of retries: ${e instanceof Error ? e.message : String(e)}`)
        return { fetched: 0, stored: 0 }
      })

    // Declared HERE, not with the gather counters below: the discovery step's
    // .catch() increments it while this function is still suspended at that
    // await, so a later `let` would be in the temporal dead zone and the catch
    // would throw a ReferenceError — turning a non-fatal step into a run-killer.
    // noteError/runErrors ride along for exactly the same reason.
    let totalErrors = 0
    // WHY a run ends 'partial'. Before this, a degraded run wrote the status and
    // nothing else: the reason lived only in a console line that ages out of the
    // platform's log retention within the hour. The first scheduled run
    // (2026-08-16) closed 'partial' and its cause had to be reconstructed from
    // third-party billing history. close-run persists this list so the next one
    // explains itself.
    const runErrors: string[] = []
    const noteError = (where: string, detail?: unknown) => {
      totalErrors++
      if (runErrors.length >= RUN_ERROR_CAP) return
      const message = detail instanceof Error ? detail.message : detail == null ? '' : String(detail)
      runErrors.push(message ? `${where}: ${message.slice(0, 300)}` : where)
    }

    // Reddit subreddit discovery (Wave 3): propose communities, probe each
    // against the live relevance gate, persist the survivors. Runs before
    // plan-gather so a newly-promoted community is available to this run.
    //
    // Non-fatal but COUNTED. Unlike gather-news (a free RSS fetch), this step
    // spends real Apify and OpenAI money BEFORE it can fail, and its most likely
    // failure is a timeout after several completed paid probes. A run that
    // quietly burned money and produced nothing is exactly what 'partial' is
    // for. Skipped entirely on an analysis-only resume.
    if (!options.skipGather && flags.redditDiscovery) {
      await step
        .run('discover-subreddits', async () => {
          const config = await loadGatherConfig(clientId)
          if (!config.platforms.includes('reddit')) return { skipped: 'reddit not enabled for tenant' }
          const merged = await discoverSubreddits({
            clientId,
            runId,
            config,
            today: new Date().toISOString().slice(0, 10),
          })
          return { subreddits: merged.length, active: activeSubreddits(merged).length }
        })
        .catch((e) => {
          console.error(`[discover-subreddits] out of retries: ${e instanceof Error ? e.message : String(e)}`)
          noteError('discover-subreddits', e)
          return { skipped: 'failed' }
        })
    }

    // Operator abort switch + spend stop — checked on every replay, before any
    // paid work. The function body re-executes at each step boundary, so these
    // are re-read within seconds of a flip rather than once per run.
    await assertRunActive(clientId)
    await assertWithinBudget(clientId, runId)

    // 2. Plan the gather fan-out: one task per platform × keyword. An
    //    analysis-only resume skips gather — the corpus is already in the DB.
    const plan = options.skipGather
      ? []
      : await step.run('plan-gather', () =>
          planGatherSearches(clientId, options.platforms?.length ? options.platforms : undefined),
        )
    const gatherPlatforms = [...new Set(plan.map((t) => t.platform))]

    // Owned layer inputs (Wave 2): the accounts to read — the client's own
    // handles and each tracked competitor's — plus the report window start,
    // which scopes both the census and which posts earn a comment scrape.
    // Analysis-only resumes skip gather AND owned ingestion together.
    const ownedPlan = plan.length
      ? await step
          .run('plan-owned', async () => {
            const admin = createAdminClient()
            const { data } = await admin
              .from('tracking_configs')
              .select('own_handles, competitor_handles, report_period')
              .eq('client_id', clientId)
              .maybeSingle()
            // The run's frozen period, not a fresh read of the config: a
            // manual {period:'monthly'} run must widen the owned window the
            // same way it widens the gather.
            const period = runPeriod ?? effectivePeriod(options.period, data?.report_period as string | null)
            const window = await resolveGatherWindow(clientId, runId, period, runWindow)
            return {
              handles: (data?.own_handles ?? {}) as Record<string, string>,
              competitorHandles: (data?.competitor_handles ?? {}) as Record<string, Record<string, string>>,
              windowStart: window.since,
            }
          })
          .catch(() => EMPTY_OWNED_PLAN)
      : EMPTY_OWNED_PLAN
    const ownedHandles = ownedPlan.handles

    // 3. Gather, fanned out: per-keyword search steps → one gate step per
    //    platform (merge + relevance/attribution + video upsert) → comment
    //    scrapes in batches of COMMENT_BATCH (each video is its own Apify actor
    //    run — the single-step-per-platform version timed out at 300s on the
    //    first attempt, 2026-07-03). One platform failing must not stop the
    //    others; one search failing must not stop its platform.
    let totalVideos = 0 // totalErrors/noteError are declared above — the discovery catch uses them first
    // On-screen text tallies, accumulated across the per-platform gather-time
    // waves inside the loop and the YouTube backfill wave after it, so the run
    // summary carries one number per verdict rather than one per platform.
    const ocr = {
      ok: 0, none: 0, noImage: 0, failed: 0, cost: 0, rateLimited: false, batchesFailed: 0,
      backfilled: 0, backfillNeeding: 0, backfillDeferred: 0, planned: 0,
      firstError: undefined as string | undefined,
    }
    // OCR_CAP is a PER-RUN budget shared by the platforms, not one each (H2):
    // plan-ocr runs inside this loop, so a per-platform cap would have made the
    // real ceiling 3x the documented number. Each plan step is handed what is
    // left. Derived only from memoised step results, so a replay recomputes the
    // same remainder.
    let ocrRemaining = OCR_CAP
    for (const platform of gatherPlatforms) {
      try {
        // Searches dispatch in parallel waves (transcribe-fan-out precedent):
        // searchOne is self-contained per keyword (own config load, one actor
        // run, no cross-keyword writes) and the gate consumes the full set
        // after the barrier, so only determinism needs the original order —
        // Promise.all preserves it. Step IDs unchanged (search:P:keyword).
        const tasks = plan.filter((t) => t.platform === platform)
        const searches: SearchResult[] = []
        for (let w = 0; w < tasks.length; w += SEARCH_PARALLEL) {
          const wave = await Promise.all(
            tasks.slice(w, w + SEARCH_PARALLEL).map(async (task): Promise<SearchResult> => {
              try {
                return await step.run(searchStepId(task), () =>
                  withApifyRunContext({ clientId, runId, step: searchStepId(task) }, () =>
                    searchOne({
                      clientId, runId, platform, keyword: task.keyword, bucket: task.bucket,
                      community: task.community, variant: task.variant,
                      maxVideos: options.maxVideos, period: runPeriod ?? undefined,
                      window: runWindow,
                    }),
                  ),
                )
              } catch (e) {
                noteError(searchStepId(task), e)
                return { keyword: task.keyword, bucket: task.bucket, videos: [] }
              }
            }),
          )
          searches.push(...wave)
        }
        const gate = await step.run(`gate:${platform}`, () =>
          withApifyRunContext({ clientId, runId, step: `gate:${platform}` }, () =>
            gatePlatform({ clientId, runId, platform, searches, videoLimit: options.videoLimit, period: runPeriod ?? undefined, window: runWindow }),
          ),
        )
        totalVideos += gate.videosKept
        for (const err of gate.errors) noteError(`gate:${platform}`, err)
        // Comment batches dispatch in parallel waves — this loop is the run's
        // wall-clock dominator (each video is its own Apify actor run, and the
        // sequential version drove run 1's ~2.5h). Batches are disjoint video
        // sets and scrapeCommentsBatch writes only its own refs' rows, so
        // waves are safe. Step IDs unchanged (comments:P:N over the same
        // batch numbering), so a mid-run replay skips completed batches.
        const commentBatches = Array.from(
          { length: Math.ceil(gate.eligible.length / COMMENT_BATCH) },
          (_, i) => gate.eligible.slice(i * COMMENT_BATCH, (i + 1) * COMMENT_BATCH),
        )
        for (let w = 0; w < commentBatches.length; w += COMMENT_PARALLEL) {
          await Promise.all(
            commentBatches.slice(w, w + COMMENT_PARALLEL).map(async (refs, j) => {
              try {
                const r = await step.run(`comments:${platform}:${w + j + 1}`, () =>
                  withApifyRunContext({ clientId, runId, step: `comments:${platform}:${w + j + 1}` }, () =>
                    scrapeCommentsBatch({ clientId, runId, platform, refs }),
                  ),
                )
                for (const err of r.errors) noteError(`comments:${platform}:${w + j + 1}`, err)
              } catch (e) {
                noteError(`comments:${platform}:${w + j + 1}`, e)
              }
            }),
          )
        }
        // Owned layer (Wave 2): an ACCOUNT's own recent posts + their comments.
        // The client's, stamped source:'owned', and since 2026-09-09 each
        // tracked competitor's, stamped 'competitor_owned' — same read, same
        // window, different name on the rows. Both feed share of tracked
        // conversation, which counts a brand's own posts alongside what the
        // market posted about it (share rule, 2026-09-10); the competitor rows
        // also let a competitor page quote what that brand actually claims
        // instead of saying nothing was captured from their own videos.
        // Non-fatal: catch on the step promise.
        // Runs BEFORE the transcribe steps (moved 2026-08-16, Brand Voice) so
        // the own posts' video_raw rows are in this run's transcribe plan —
        // order only.
        // supportsOwnedProfile: Reddit has no owned-account concept, so an
        // own_handles.reddit entry is skipped rather than thrown (Wave 3).
        //
        // Step ids gained an entity segment here (`owned-posts:instagram:client`).
        // Renaming a step id strands an in-flight run across a deploy, so this
        // shipped between runs, with pipeline_runs.status='running' at zero.
        if (supportsOwnedProfile(platform)) {
          const reads: { entity: OwnedEntity; handle: string }[] = []
          if (ownedHandles[platform]) reads.push({ entity: { kind: 'client' }, handle: ownedHandles[platform] })
          for (const [name, handles] of Object.entries(ownedPlan.competitorHandles)) {
            const handle = handles?.[platform]
            if (handle) reads.push({ entity: { kind: 'competitor', name }, handle })
          }
          for (const { entity, handle } of reads) {
            const who = `${platform}:${entitySlug(entity)}`
            const owned = await step
              .run(`owned-posts:${who}`, () =>
                withApifyRunContext({ clientId, runId, step: `owned-posts:${who}` }, () =>
                  ingestOwnedPosts({ clientId, runId, platform, handle, windowStart: ownedPlan.windowStart, entity }),
                ),
              )
              .catch((e) => {
                console.error(`[owned-posts:${who}] out of retries: ${e instanceof Error ? e.message : String(e)}`)
                noteError(`owned-posts:${who}`, e)
                return { refs: [] as { video_id: string; video_url: string; comments_count: number }[], posts: 0, warnings: [] as string[] }
              })
            // Best-effort degradations (the IG census fallback, the video_raw
            // write) count as run errors: the week's own-voice claims are
            // missing, and a run that says so is the point of 'partial'.
            for (const w of owned.warnings) noteError(`owned-posts:${who}`, w)
            const ownedRefs = owned.refs
            const source = entity.kind === 'client' ? 'owned' as const : 'competitor_owned' as const
            for (let w = 0; w < ownedRefs.length; w += COMMENT_BATCH) {
              await step
                .run(`owned-comments:${who}:${Math.floor(w / COMMENT_BATCH) + 1}`, () =>
                  withApifyRunContext({ clientId, runId, step: `owned-comments:${who}:${Math.floor(w / COMMENT_BATCH) + 1}` }, () =>
                    scrapeCommentsBatch({ clientId, runId, platform: platform as Platform, refs: ownedRefs.slice(w, w + COMMENT_BATCH), source }),
                  ),
                )
                .catch((e) => {
                  noteError(`owned-comments:${who}`, e)
                  return { comments: 0, errors: ['owned comment scrape failed'] }
                })
            }
          }
        }
        // Transcripts (flag-gated), fanned out like Pass A: a plan step chunks
        // this run's pending candidates signal-first (TRANSCRIBE_BATCH per
        // step), then batches dispatch in parallel waves. One sequential
        // whole-platform step measured out at ~10s/video — 60 videos would
        // blow the 300s cap, and a real run has hundreds (readiness 2026-08-08).
        // Step retries are free: the in-batch status re-check skips done videos.
        if (flags.transcripts) {
          try {
            const txBatches = await step.run(`plan-transcribe:${platform}`, () =>
              planTranscribeBatches(clientId, runId, platform),
            )
            let isolatedBatches = 0
            for (let w = 0; w < txBatches.length; w += TRANSCRIBE_PARALLEL) {
              const wave = await Promise.all(
                txBatches.slice(w, w + TRANSCRIBE_PARALLEL).map((videoIds, j) =>
                  step
                    .run(`transcribe:${platform}:${w + j + 1}-of-${txBatches.length}`, () =>
                      withApifyRunContext({ clientId, runId, step: `transcribe:${platform}:${w + j + 1}-of-${txBatches.length}` }, () =>
                        transcribeBatch({ clientId, runId, platform, videoIds, batchNo: w + j + 1 }),
                      ),
                    )
                    // Per-step catch (comments-fan-out precedent): one batch
                    // exhausting its retries must not abandon the remaining
                    // waves — hundreds of this run's videos would silently
                    // stay untranscribed and are never re-planned.
                    .catch((e: unknown) => ({ transcribed: 0, skipped: 0, isolatedBatches: 0, errors: [`transcribe step failed: ${e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200)}`] })),
                ),
              )
              for (const t of wave) {
                isolatedBatches += t.isolatedBatches
                for (const err of t.errors) noteError(`transcribe:${platform}`, err)
              }
            }
            // Run-failed caption batches that the isolation pass recovered are
            // ratio-gated, as per-video translate/OCR failures are — on their own
            // (looser) constant, because a recovered batch lost no data: 3 of 37
            // on run d346b0f7 (8%) is an Apify day, not a thinner update. Past
            // the ratio the actor itself is suspect and the run says so once.
            const txDegraded = isolatedBatchDegradation(isolatedBatches, txBatches.length, ISOLATED_BATCH_ERROR_RATIO)
            if (txDegraded) noteError(`transcribe:${platform}`, txDegraded)
            else if (isolatedBatches > 0) console.warn(`[transcript] ${platform}: ${isolatedBatches} of ${txBatches.length} batches run-failed and were recovered id-by-id, under the ${ISOLATED_BATCH_ERROR_RATIO * 100}% ratio`)
          } catch (e) {
            noteError(`plan-transcribe:${platform}`, e)
          }
        }

        // On-screen text from the COVER FRAME (WP7b, 2026-09-12), fanned out
        // exactly like transcripts and for the same reason: the cover URL in a
        // raw item is a signed CDN link that expires within days, so this is the
        // only moment TikTok's and Instagram's covers are reachable at all.
        // Reddit has no cover and is skipped by canOcr.
        //
        // Runs after the transcribe wave rather than beside it so a slow
        // transcription never delays it past the expiry — both are within the
        // same run, and transcripts are the expensive one.
        //
        // Non-fatal throughout: a video without on-screen text is analysed
        // without it, exactly as before this existed.
        // Gated on BOTH flags, like the translation wave. Pass A reads the
        // on-screen text only on the v4 (transcripts) prompt, so with transcripts
        // off this would pay for up to OCR_CAP vision calls producing text
        // nothing reads — the off-switch has to switch this off too.
        if (flags.ocr && flags.transcripts) {
          try {
            const ocrBatches = await step.run(`plan-ocr:${platform}`, () =>
              planOcrBatches(clientId, runId, platform as Platform, ocrRemaining),
            )
            ocr.planned += ocrBatches.flat().length
            ocrRemaining = Math.max(0, ocrRemaining - ocrBatches.flat().length)
            for (let w = 0; w < ocrBatches.length; w += OCR_PARALLEL) {
              const wave = await Promise.all(
                ocrBatches.slice(w, w + OCR_PARALLEL).map((videoIds, j) =>
                  step
                    .run(`ocr:${platform}:${w + j + 1}-of-${ocrBatches.length}`, () =>
                      ocrBatch({ clientId, runId, platform: platform as Platform, videoIds, batchNo: w + j + 1 }),
                    )
                    // Per-step catch (the transcribe fan-out's precedent): one
                    // batch out of retries must not abandon the remaining waves.
                    // Its videos keep a NULL ocr_status and re-plan — but only
                    // on a platform whose cover survives (YouTube); elsewhere the
                    // frame is simply gone, which is the honest outcome.
                    .catch((e: unknown) => ({
                      ...emptyOcrResult(),
                      errors: [`ocr step failed: ${e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200)}`],
                      stepFailed: true,
                    })),
                ),
              )
              for (const r of wave) {
                ocr.ok += r.ok
                ocr.none += r.none
                ocr.noImage += r.noImage
                ocr.failed += r.failed
                ocr.cost += r.costUsd
                if (r.rateLimited) ocr.rateLimited = true
                // A batch out of retries IS a run error: its videos got no
                // attempt and nothing recorded why. Per-VIDEO failures are
                // ratio-gated below instead (the translate wave's rule) — a
                // handful of unreachable covers across a whole gather must not
                // close an otherwise clean run 'partial'.
                if ('stepFailed' in r) {
                  ocr.batchesFailed++
                  for (const err of r.errors) noteError(`ocr:${platform}`, err)
                } else if (r.errors.length && !ocr.firstError) {
                  ocr.firstError = r.errors[0]
                }
              }
            }
          } catch (e) {
            noteError(`plan-ocr:${platform}`, e)
          }
        }

      } catch (e) {
        noteError(`platform:${platform}`, e)
      }
    }

    // Analysis-only resume: the corpus check runs against what's already in the DB.
    if (options.skipGather) {
      totalVideos = await step.run('count-corpus', async () => {
        const admin = createAdminClient()
        const { count } = await admin
          .from('videos').select('id', { head: true, count: 'exact' })
          .eq('client_id', clientId)
        return count ?? 0
      })
    }

    // No corpus → close as failed, stop (nothing for the analysis passes to chew on).
    if (totalVideos === 0) {
      await step.run('mark-failed', async () => {
        const admin = createAdminClient()
        await admin.from('pipeline_runs').update({
          status: 'failed', videos_scraped: 0,
          error_message: 'gather produced no videos', completed_at: new Date().toISOString(),
        }).eq('id', runId)
        await sendAlertEmail(
          `Verbatim run FAILED — gather produced no videos`,
          `Run ${runId} (client ${clientId}) closed as failed: gather produced no videos.`,
        )
      })
      return { runId, status: 'failed', totalVideos: 0 }
    }

    // 4. Metadata classification — format/hook/topics + a framing sentiment
    //    from caption + transcript for every still-unclassified video of this
    //    run, so the Content page's per-entity stats rest on the whole gather.
    //    Runs BEFORE Pass A (moved 2026-08-16): Pass A overwrites the
    //    classification for the videos it analyses (its comment-informed read
    //    is better), but the claims lane leaves `sentiment` alone — so a
    //    below-floor DISCOVERED brand video keeps THIS pass's framing sentiment
    //    instead of ending up with none (owned posts stay outside this pass and
    //    outside every sentiment consumer). Costs ~$0.10/run more than
    //    classifying only the Pass A leftovers; the run_summary sentiment
    //    shares stay whole.
    //    Non-fatal per batch: a failed batch leaves its rows unclassified and
    //    the page reports coverage honestly; it must never take down a run.
    const classifyBatches = await step
      .run('plan-classify', () => planClassifyMetaBatches(clientId, runId))
      // Plan failure out of retries → skip classification, never the run
      // (the ship-live decision rests on this contract).
      .catch((e) => {
        console.error(`[classify-meta] plan failed, skipping: ${e instanceof Error ? e.message : String(e)}`)
        noteError('plan-classify', e)
        return [] as string[][]
      })
    const classify = { classified: 0, nulls: 0, cost: 0, errors: 0 }
    for (let w = 0; w < classifyBatches.length; w += CLASSIFY_PARALLEL) {
      const wave = await Promise.all(
        classifyBatches.slice(w, w + CLASSIFY_PARALLEL).map((videoIds, j) =>
          step
            .run(`classify:${w + j + 1}-of-${classifyBatches.length}`, () =>
              runClassifyMetaBatch(clientId, runId, videoIds, w + j + 1),
            )
            // Catch on the step promise (transcribe precedent): Inngest's
            // retries run first; only an out-of-retries batch goes non-fatal,
            // leaving its rows unclassified and the run status 'partial'.
            .catch((e) => {
              const message = e instanceof Error ? e.message : String(e)
              console.error(`[classify-meta] batch out of retries: ${message}`)
              return { requested: videoIds.length, classified: 0, nulls: 0, costUsd: 0, error: message }
            }),
        ),
      )
      for (const r of wave) {
        classify.classified += r.classified
        classify.nulls += r.nulls
        classify.cost += r.costUsd
        if (r.error) {
          classify.errors++
          noteError('classify-meta', r.error)
        }
      }
    }

    // 4b. Pass A — per-video GPT analysis, fanned out so no batch outlives the
    //    step cap. The plan step pre-filters on RAW comment count (the spam
    //    filter only shrinks a video's count, so raw < min are guaranteed
    //    skips) and chunks richest-first, mirroring runPassA's own ordering.
    //    Incremental Pass A (2026-08-17): with INCREMENTAL_PASS_A on, the plan
    //    selects only videos whose prompt input changed since their last read
    //    (videos.analyzed_* bookkeeping, lib/pipeline/pass-a-plan.ts); off, it
    //    selects every eligible video exactly as before. The step result keeps
    //    the per-reason tally so a run log shows what drove the re-reads.
    let passAPlan = await step.run('plan-pass-a', () => planPassABatches(clientId, runId, !!options.forcePassA, flags))

    // 4c. The transcript PRECONDITION (Phase 2, 2026-09-09). Everything above
    //     transcribes from THIS run's media urls, which are signed and expire —
    //     so a video gathered weeks ago reaches Pass A with no transcript and no
    //     way to get one, and a single 'failed' used to be permanent. Here, the
    //     videos Pass A actually selected get one more attempt, from their
    //     PLATFORM url (which never expires) via a different provider
    //     (lib/gather/transcript-url.ts). The rule being enforced is
    //     transcriptPreconditionMet: a video enters analysis only with a usable
    //     transcript, after an attempt this run, or when no attempt is possible.
    //     Runs AFTER plan-pass-a because the selection is the candidate set, and
    //     BEFORE the waves because the wave reads the row it writes.
    //     Non-fatal throughout: a video without a transcript is analysed without
    //     one, exactly as before this existed.
    const backfill = { tally: emptyBackfillTally(), estUsd: 0, batches: 0, unmet: 0, deferred: 0, exhausted: 0, errors: 0 }
    if (flags.transcripts && passAPlan.batches.length) {
      const selectedIds = passAPlan.batches.flat()
      const plan = await step
        .run('plan-transcript-backfill', () => planTranscriptBackfill(clientId, selectedIds))
        .catch((e) => {
          noteError('plan-transcript-backfill', e)
          return { batches: [], selected: selectedIds.length, needing: 0, planned: 0, exhausted: 0 }
        })
      backfill.batches = plan.batches.length
      backfill.exhausted = plan.exhausted
      for (let w = 0; w < plan.batches.length; w += BACKFILL_PARALLEL) {
        const wave = await Promise.all(
          plan.batches.slice(w, w + BACKFILL_PARALLEL).map((b, j) =>
            step
              .run(`transcript-backfill:${w + j + 1}-of-${plan.batches.length}`, () =>
                withApifyRunContext({ clientId, runId, step: `transcript-backfill:${w + j + 1}-of-${plan.batches.length}` }, () =>
                  backfillTranscriptsBatch({ clientId, runId, platform: b.platform, videos: b.videos, batchNo: w + j + 1 }),
                ),
              )
              // Per-step catch (the transcribe fan-out's precedent): one batch
              // out of retries must not abandon the rest, and its videos simply
              // keep the status they had.
              .catch((e: unknown) => ({
                tally: emptyBackfillTally(), newlyUsable: 0, estUsd: 0,
                errors: [`transcript-backfill step failed: ${e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200)}`],
              })),
          ),
        )
        for (const r of wave) {
          backfill.tally = mergeTallies(backfill.tally, r.tally)
          backfill.estUsd += r.estUsd
          for (const err of r.errors) { backfill.errors++; noteError('transcript-backfill', err) }
        }
      }
      // Videos that needed an attempt and did not get one (a batch out of
      // retries): the precondition is unmet for exactly these, and the run says
      // so rather than pretending the corpus is complete.
      backfill.unmet = Math.max(0, plan.planned - backfill.tally.attempted)
      backfill.deferred = plan.needing - plan.planned
      if (plan.needing) {
        console.log(
          `[transcript-precondition] ${plan.selected} selected · ${plan.needing} needed an attempt · ${formatTally(backfill.tally)} · ${backfill.exhausted} out of attempts · ${backfill.deferred} deferred by the cap · ${backfill.unmet} unmet · ~$${backfill.estUsd.toFixed(3)} apify (est)`,
        )
      }
      // A new transcript changes what Pass A sees (and, for brand-side videos,
      // which lane they belong in), so the selection is re-taken on the fresh
      // rows. Only worth a step when something actually landed.
      if (backfill.tally.ok > 0) {
        passAPlan = await step
          .run('replan-pass-a', () => planPassABatches(clientId, runId, !!options.forcePassA, flags))
          .catch((e) => {
            noteError('replan-pass-a', e)
            return passAPlan
          })
      }
    }

    // 4d. TRANSLATION (WP6, 2026-09-11). Every transcript that exists by now —
    //     this run's, the backfill's, and the whole historical corpus — in a
    //     language that is not English gets an English rendering, so Pass A
    //     reasons from a text it reads reliably instead of "as-is". Its own
    //     wave rather than part of transcription, precisely so it reaches the
    //     videos transcribed before it existed.
    //
    //     Placed AFTER the backfill (a transcript that lands there is
    //     translatable in the same run) rather than before plan-pass-a, which
    //     is where the plan described it: plan-pass-a runs FIRST in this
    //     function — its selection is what the backfill attempts — so "before
    //     plan-pass-a" would have meant translating before the run's own
    //     transcripts existed. The selection is re-taken afterwards instead,
    //     which is what the backfill already does for the same reason.
    //
    //     Non-fatal throughout: a video without a translation is analysed
    //     without one, exactly as before this existed.
    const translate = { batches: 0, needing: 0, deferred: 0, translated: 0, english: 0, failed: 0, skipped: 0, cost: 0, rateLimited: false, batchesFailed: 0 }
    // Gated on BOTH flags, like the backfill above it. With transcripts off,
    // Pass A cannot read a transcript at all (`useTranscripts ? … : null`), so
    // translating would pay for up to TRANSLATE_CAP gpt-4.1 calls producing
    // text nothing reads — the off-switch has to switch this off too.
    if (flags.translation && flags.transcripts) {
      let firstTranslateError: string | undefined
      const plan = await step
        .run('plan-translate', () => planTranslateBatches(clientId))
        .catch((e) => {
          noteError('plan-translate', e)
          return { batches: [] as string[][], needing: 0, deferred: 0, retrying: 0, byLang: {} as Record<string, number> }
        })
      translate.batches = plan.batches.length
      translate.needing = plan.needing
      translate.deferred = plan.deferred
      for (let w = 0; w < plan.batches.length; w += TRANSLATE_PARALLEL) {
        const wave = await Promise.all(
          plan.batches.slice(w, w + TRANSLATE_PARALLEL).map((videoIds, j) =>
            step
              .run(`translate:${w + j + 1}-of-${plan.batches.length}`, () =>
                translateBatch({ clientId, runId, videoIds, batchNo: w + j + 1 }),
              )
              // Per-step catch (the transcribe fan-out's precedent): one batch
              // out of retries must not abandon the rest, and its videos simply
              // stay untranslated and re-plan next run.
              .catch((e: unknown) => ({
                translated: 0, english: 0, skipped: 0, failed: 0, costUsd: 0, rateLimited: false,
                errors: [`translate step failed: ${e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200)}`],
                stepFailed: true,
              })),
          ),
        )
        for (const r of wave) {
          translate.translated += r.translated
          translate.english += r.english
          translate.failed += r.failed
          translate.skipped += r.skipped
          translate.cost += r.costUsd
          if (r.rateLimited) translate.rateLimited = true
          if ('stepFailed' in r) {
            // A batch out of retries IS a run error: its videos got no attempt
            // at all and nothing recorded why (the per-video path tombstones).
            translate.batchesFailed++
            for (const err of r.errors) noteError('translate', err)
          } else if (r.errors.length && !firstTranslateError) {
            firstTranslateError = r.errors[0]
          }
        }
      }
      // Per-video failures are ratio-gated, exactly as Pass A's are (Tier 0,
      // 2026-08-18): a handful of content-filter refusals across a 400-video
      // backlog must not close an otherwise clean run 'partial' and fire the
      // alert email. Each one is already tombstoned on its own row, so nothing
      // is lost by not shouting. A 429 still degrades the run — that is a fact
      // about the account, not about a video.
      const translateDegraded = passADegradation(
        { attempted: translate.translated + translate.english + translate.failed, errored: translate.failed, rateLimited: translate.rateLimited, firstError: firstTranslateError },
        PASS_A_ERROR_RATIO,
      )
      if (translateDegraded && translate.batchesFailed === 0) noteError('translate', translateDegraded)
      else if (translate.failed > 0) console.warn(`[translate] ${translate.failed} translation(s) failed${translate.batchesFailed ? ' (batch steps already recorded)' : ` under the ${PASS_A_ERROR_RATIO * 100}% ratio`}. First: ${firstTranslateError ?? ''}`)
      if (plan.needing) {
        const langs = Object.entries(plan.byLang).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l}:${n}`).join(' ')
        console.log(
          `[translate] ${plan.needing} needed (${plan.retrying} re-attempts of a recorded failure) · ${translate.translated} translated · ${translate.english} already English · ${translate.failed} failed · ${plan.deferred} deferred by the cap · ~$${translate.cost.toFixed(3)} · ${langs}`,
        )
      }
      // A translation changes what Pass A sees on exactly those videos, and the
      // 'translated' SelectReason is how they get re-read without a
      // corpus-wide prompt bump — so the selection has to be re-taken on the
      // rows this wave just wrote. Only worth a step when something landed.
      if (translate.translated > 0) {
        passAPlan = await step
          .run('replan-pass-a-translated', () => planPassABatches(clientId, runId, !!options.forcePassA, flags))
          .catch((e) => {
            noteError('replan-pass-a-translated', e)
            return passAPlan
          })
      }
    }

    // 4e. The YouTube OCR BACKFILL (WP7b, 2026-09-12). The gather-time waves
    //     above read this run's covers; this one pays down the historical
    //     corpus, and it is YouTube-only because YouTube's cover is derived from
    //     the video id and never expires. TikTok's and Instagram's covers are
    //     signed links inside raw items that expired days after the run that
    //     fetched them — reaching those would mean re-fetching every video
    //     through Apify at ~$0.05 a head, a separate costed decision, not
    //     something a weekly run should quietly start doing.
    //
    //     Placed after the translation wave rather than immediately after the
    //     transcript backfill so the existing `replan-pass-a-translated` step id
    //     is untouched (AGENTS.md: step ids are a stability contract) and at
    //     most one extra replan is ever dispatched.
    //
    //     Bounded by OCR_BACKFILL_CAP: a few hundred a run clears the backlog
    //     over a handful of weeks without any single run noticing.
    if (flags.ocr && flags.transcripts) {
      const plan = await step
        .run('plan-ocr-backfill', () => planOcrBackfill(clientId))
        .catch((e) => {
          noteError('plan-ocr-backfill', e)
          return { batches: [] as string[][], needing: 0, deferred: 0 }
        })
      ocr.backfillNeeding = plan.needing
      ocr.backfillDeferred = plan.deferred
      for (let w = 0; w < plan.batches.length; w += OCR_PARALLEL) {
        const wave = await Promise.all(
          plan.batches.slice(w, w + OCR_PARALLEL).map((videoIds, j) =>
            step
              .run(`ocr-backfill:${w + j + 1}-of-${plan.batches.length}`, () =>
                ocrBackfillBatch({ clientId, runId, videoIds, batchNo: w + j + 1 }),
              )
              .catch((e: unknown) => ({
                ...emptyOcrResult(),
                errors: [`ocr-backfill step failed: ${e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200)}`],
                stepFailed: true,
              })),
          ),
        )
        for (const r of wave) {
          ocr.ok += r.ok
          ocr.backfilled += r.ok
          ocr.none += r.none
          ocr.noImage += r.noImage
          ocr.failed += r.failed
          ocr.cost += r.costUsd
          if (r.rateLimited) ocr.rateLimited = true
          if ('stepFailed' in r) {
            ocr.batchesFailed++
            for (const err of r.errors) noteError('ocr-backfill', err)
          } else if (r.errors.length && !ocr.firstError) {
            ocr.firstError = r.errors[0]
          }
        }
      }
      if (plan.needing) {
        console.log(
          `[ocr-backfill] ${plan.needing} youtube covers unread · ${ocr.backfilled} read · ${plan.deferred} deferred by the cap · ~$${ocr.cost.toFixed(3)} (whole run)`,
        )
      }
    }

    // Per-video OCR failures are ratio-gated, exactly as Pass A's and the
    // translation wave's are (Tier 0, 2026-08-18): a run whose cover CDN was
    // flaky for a handful of videos is not a degraded run — each of those rows
    // carries its own tombstone. A 429 still degrades: that is a fact about the
    // account, not about a frame.
    if (flags.ocr && flags.transcripts) {
      const ocrDegraded = passADegradation(
        { attempted: ocr.ok + ocr.none + ocr.noImage + ocr.failed, errored: ocr.failed, rateLimited: ocr.rateLimited, firstError: ocr.firstError },
        PASS_A_ERROR_RATIO,
      )
      if (ocrDegraded && ocr.batchesFailed === 0) noteError('ocr', ocrDegraded)
      else if (ocr.failed > 0) console.warn(`[ocr] ${ocr.failed} cover read(s) failed${ocr.batchesFailed ? ' (batch steps already recorded)' : ` under the ${PASS_A_ERROR_RATIO * 100}% ratio`}. First: ${ocr.firstError ?? ''}`)
      if (ocr.ok + ocr.none + ocr.noImage + ocr.failed > 0) {
        console.log(
          `[ocr] ${ocr.ok} with text · ${ocr.none} no legible text · ${ocr.noImage} no cover · ${ocr.failed} failed · ~$${ocr.cost.toFixed(3)}`,
        )
      }
      // On-screen text changes what Pass A sees on exactly the videos that
      // gained it, and the 'ocr' SelectReason is how they get re-read without a
      // corpus-wide prompt bump — so the selection is re-taken on the rows these
      // waves just wrote. Only worth a step when something actually landed.
      if (ocr.ok > 0) {
        passAPlan = await step
          .run('replan-pass-a-ocr', () => planPassABatches(clientId, runId, !!options.forcePassA, flags))
          .catch((e) => {
            noteError('replan-pass-a-ocr', e)
            return passAPlan
          })
      }
    }

    const batches = passAPlan.batches
    const passA = { analyzed: 0, claimsOnly: 0, skipped: 0, errored: 0, refused: 0, alreadyDone: 0, rateLimited: false, errors: [] as string[], batchesFailed: 0, insights: 0, languageSamples: 0, cost: 0, planned: passAPlan.selected, considered: passAPlan.considered, unchanged: passAPlan.reasons.unchanged, planReasons: passAPlan.reasons }
    // Batches dispatch in parallel waves — batches are disjoint video sets, so
    // ordering is irrelevant to output; this is purely wall-time (a serial
    // pass over a depth-100 corpus measured ~3 videos/min). Wave size stays
    // modest for OpenAI/Inngest concurrency headroom.
    //
    // Pass A errors are errors (Tier 0, 2026-08-18). runPassA absorbs a
    // per-video OpenAI failure into its summary (the video keeps its old
    // pointer and is re-read next run); the counts come back here and the
    // run closes 'partial' + alerts past PASS_A_ERROR_RATIO or on any 429 —
    // run ef1e28a3 had 340 calls fail on "no credits" and closed 'completed'.
    // A batch step out of retries is caught (classify/transcribe precedent):
    // its videos stay unstamped, so nothing stale is pruned and the next run
    // re-reads them; the run records the batch and closes 'partial'.
    for (let w = 0; w < batches.length; w += PASS_A_PARALLEL) {
      const wave = await Promise.all(
        batches.slice(w, w + PASS_A_PARALLEL).map((videoIds, j) =>
          step
            .run(`pass-a:${w + j + 1}-of-${batches.length}`, async () => {
              // transcripts comes from the run's snapshot, not the env: it
              // decides passAPromptVersion, and a flip between the plan step
              // and this one would stamp half the corpus with the other
              // version and force a full re-read next run.
              const s = await runPassA({ clientId, runId, videoIds, persist: true, transcripts: flags.transcripts })
              return { analyzed: s.videosAnalyzed, claimsOnly: s.videosClaimsOnly, skipped: s.videosSkipped, errored: s.videosErrored, refused: s.videosRefused, alreadyDone: s.videosAlreadyAnalyzed, rateLimited: s.rateLimited, errors: s.errors, insights: s.insightsKept, languageSamples: s.languageSamples, cost: s.costUsd, stepFailed: false }
            })
            .catch((e: unknown) => {
              const message = e instanceof Error ? e.message : String(e)
              console.error(`[pass-a] batch ${w + j + 1}-of-${batches.length} out of retries: ${message}`)
              noteError(`pass-a:${w + j + 1}-of-${batches.length}`, e)
              return { analyzed: 0, claimsOnly: 0, skipped: 0, errored: videoIds.length, refused: 0, alreadyDone: 0, rateLimited: false, errors: [message.slice(0, 200)], insights: 0, languageSamples: 0, cost: 0, stepFailed: true }
            }),
        ),
      )
      for (const r of wave) {
        passA.analyzed += r.analyzed
        passA.claimsOnly += r.claimsOnly ?? 0
        passA.skipped += r.skipped
        passA.errored += r.errored ?? 0
        passA.refused += r.refused ?? 0
        passA.alreadyDone += r.alreadyDone ?? 0
        passA.rateLimited = passA.rateLimited || Boolean(r.rateLimited)
        if (r.stepFailed) passA.batchesFailed++
        for (const m of r.errors ?? []) if (passA.errors.length < 5 && !passA.errors.includes(m)) passA.errors.push(m)
        passA.insights += r.insights
        passA.languageSamples += r.languageSamples
        passA.cost += r.cost
      }
    }
    // Per-video failures: degrade the run past the ratio or on any 429;
    // otherwise log and let the next run's plan re-read those videos. (A
    // failed batch step counts its whole video set as errored, above.)
    // Refusals are NOT in the denominator: a call that returned nothing usable
    // is not evidence the run went well, and counting it as an attempt let
    // 10 errors beside 190 refusals read as a 5% failure rate and close
    // 'completed' with zero insights — the exact shape of run ef1e28a3 that
    // this item exists to prevent. They are counted as failures instead.
    const passAFailed = passA.errored + passA.refused
    const passADegraded = passADegradation(
      { attempted: passA.analyzed + passAFailed, errored: passAFailed, rateLimited: passA.rateLimited, firstError: passA.errors[0] },
      PASS_A_ERROR_RATIO,
    )
    // A batch step that died already went through noteError; don't count it twice.
    if (passADegraded && passA.batchesFailed === 0) noteError('pass-a', passADegraded)
    else if (passADegraded) console.warn(`[pass-a] ${passADegraded} (already recorded as failed batch steps)`)
    else if (passA.errored > 0) console.warn(`[pass-a] ${passA.errored} video call(s) failed under the ${PASS_A_ERROR_RATIO * 100}% ratio; re-read next run. First: ${passA.errors[0] ?? ''}`)

    // 4g. QUOTE TRANSLATION (Phase 1 WP6, design item 8, 2026-09-18). Every
    //     comment this tenant's CURRENT analysis cites gets a detected language
    //     and, where it is not English, an English rendering — cached on
    //     (comment, exact text) so a comment is paid for once and an edited one
    //     is re-read.
    //
    //     Here, right after the Pass A wave and before embed-insights, for the
    //     same reason that one sits where it does: every videos.analyzed_run_id
    //     pointer has moved by now, so audience_insights_current means what it
    //     says and the read reaches the whole cited corpus rather than only
    //     what this run re-analysed. It cannot live inside pass-a:N-of-M — a
    //     video whose analysis is already current never enters a batch again,
    //     and its comments would never be translated.
    //
    //     Logged, NOT noteError'd — the embed-insights and keyword-discovery
    //     precedent. A reading aid kept alongside the report must not make a
    //     clean run read 'partial'; an uncached comment is simply offered again
    //     next run, which is the retry. It is also a step that can run before
    //     its migration is applied: until then it is a logged no-op that has
    //     read nothing and spent nothing.
    const quoteTranslation = { needing: 0, deferred: 0, translated: 0, english: 0, cached: 0, failed: 0, cost: 0, rateLimited: false }
    {
      const plan = await step
        .run('plan-translate-quotes', () => planQuoteTranslations(clientId))
        .catch((e) => {
          console.error(`[translate-quotes] plan out of retries: ${e instanceof Error ? e.message : String(e)}`)
          return { batches: [] as string[][], needing: 0, deferred: 0, comments: 0 }
        })
      quoteTranslation.needing = plan.needing
      quoteTranslation.deferred = plan.deferred
      for (let w = 0; w < plan.batches.length; w += TRANSLATE_QUOTES_PARALLEL) {
        const wave = await Promise.all(
          plan.batches.slice(w, w + TRANSLATE_QUOTES_PARALLEL).map((commentIds, j) =>
            step
              .run(`translate-quotes:${w + j + 1}-of-${plan.batches.length}`, () =>
                translateQuotesBatch({ clientId, runId, commentIds, batchNo: w + j + 1 }),
              )
              // Per-step catch (the transcribe fan-out's precedent): one batch
              // out of retries must not abandon the rest, and its comments stay
              // uncached and are re-planned next run.
              .catch((e: unknown) => ({
                translated: 0, english: 0, cached: 0, failed: commentIds.length, costUsd: 0, rateLimited: false,
                errors: [`translate-quotes step failed: ${e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200)}`],
              })),
          ),
        )
        for (const r of wave) {
          quoteTranslation.translated += r.translated
          quoteTranslation.english += r.english
          quoteTranslation.cached += r.cached
          quoteTranslation.failed += r.failed
          quoteTranslation.cost += r.costUsd
          if (r.rateLimited) quoteTranslation.rateLimited = true
          for (const err of r.errors) console.warn(`[translate-quotes] ${err}`)
        }
      }
      if (plan.needing) {
        console.log(
          `[translate-quotes] ${plan.needing} texts needed across ${plan.comments} comments · ${quoteTranslation.translated} translated · ${quoteTranslation.english} already English · ${quoteTranslation.cached} already cached · ${quoteTranslation.failed} not placed · ${quoteTranslation.deferred} deferred by the cap${quoteTranslation.rateLimited ? ' · RATE LIMITED' : ''} · ~$${quoteTranslation.cost.toFixed(3)}`,
        )
      }
    }

    // Keep the agent's retrieval index current (Phase 0, design item 36). Here,
    // right after the Pass A wave: every videos.analyzed_run_id pointer has
    // moved by now, so audience_insights_current means what it says and the
    // read reaches the WHOLE backlog, not just what this run wrote. It cannot
    // live inside pass-a:N-of-M — decideAnalysis never re-selects a video whose
    // analysis is already current, so those rows never enter a batch again and
    // the 3,536 already sitting NULL would stay NULL forever.
    //
    // Before cross-reference and long before themes:<bucket>, which is the one
    // step that must not take on more work: its merge call alone spent 183 s of
    // a 300 s cap on Össur's 2026-09-13 run and it has no per-step catch, so a
    // write failure there fails the run.
    //
    // Logged, NOT noteError'd — the keyword-discovery precedent. A searchable
    // index is something the run maintains alongside the report, not part of
    // producing it, and a clean run must not read 'partial' because an index
    // pass had a bad day; the rows are still NULL next run, which is the retry.
    // It is also a step that can run before its migration is applied: until
    // then it is a logged no-op that has read nothing and spent nothing.
    await step
      .run('embed-insights', async () => {
        const admin = createAdminClient()
        const r = await embedNullInsights(admin, { clientId, runId })
        console.log(`[embed-insights] ${embedSummary(r)}`)
        return r
      })
      .catch((e) => {
        console.error(`[embed-insights] out of retries: ${e instanceof Error ? e.message : String(e)}`)
        return null
      })

    // 4c. Subject membership (Phase 1, design item 4). Directly after
    //     embed-insights, because it reads the vectors that step writes; well
    //     before themes:<bucket>, the step that cannot afford more work.
    //
    //     TWO ADDITIVE IDS, each in its own position, never a rename or a
    //     reorder: `plan-subject-membership` and `subject-membership:N-of-M`.
    //     The plan step exists for the same reason plan-classify, plan-pass-a
    //     and plan-themes do — Inngest needs the fan-out width before it can
    //     create the steps, and a read outside a step would re-run at every
    //     step boundary for the rest of the function.
    //
    //     M is the number of ACTIVE SUBJECTS, not a batch count: 5-8, bounded,
    //     and the same on a retry because loadActiveSubjects orders by
    //     (named_at, id). Each step reads its own band with one RPC call and
    //     judges it in batches of twenty inside the step, so a subject's whole
    //     decision is one retryable unit and one bad subject does not cost the
    //     other seven.
    //
    //     Logged, NOT noteError'd — the keyword-discovery precedent, the same
    //     one embed-insights and freeze-months take. A subject reading is a
    //     record the run maintains alongside the report, and a clean run must
    //     not close `partial` because a judgement pass had a bad day; the pairs
    //     are still undecided next run, which IS the retry.
    //
    //     No-op when M4 is not applied, and a REFUSAL rather than a low number
    //     when insight embedding coverage is short — see lib/subjects/membership.ts.
    const subjectPlan = await step
      .run('plan-subject-membership', async () => {
        const admin = createAdminClient()
        try {
          const named = await loadActiveSubjects(admin, clientId)
          // Counted once here rather than once inside each fan-out step: it is
          // two count=exact queries over the whole insight population and it is
          // a property of the PASS, not of a subject.
          const coverage = named.length > 0 ? await embeddingCoverage(admin, clientId) : null
          // The phrase vectors, here rather than in each batch step: 5-8 texts
          // is one embeddings request and about half a millionth of a dollar,
          // and every band read below is meaningless without them. Re-read
          // afterwards so each step carries its subject's real embedding state
          // — a subject that has just been given a vector must not arrive at
          // its step still looking like one that never had one.
          if (await embedSubjects(admin, named) > 0) {
            return { subjects: await loadActiveSubjects(admin, clientId), coverage }
          }
          return { subjects: named, coverage }
        } catch (e) {
          if (!isMissingSubjects(e)) throw e
          console.log('[subject-membership] skipped: supabase/migrations/20260918093000_subjects.sql has not been applied yet')
          return { subjects: [], coverage: null }
        }
      })
      .catch((e) => {
        console.error(`[subject-membership] plan failed, skipping: ${e instanceof Error ? e.message : String(e)}`)
        return { subjects: [], coverage: null }
      })
    const subjects = subjectPlan.subjects
    const subjectCoverage = subjectPlan.coverage ?? undefined
    //
    //     THE CEILING IS THE PASS'S, NOT EACH SUBJECT'S. subjectBudgetUsd() is
    //     5% of RUN_MODEL_BUDGET_USD — $3 at the default $60 — and it is a
    //     ceiling on the whole membership pass, which measures $0.17. Handing
    //     every fan-out step the full $3 would make the real ceiling $24 at
    //     eight subjects, eight times what SUBJECT_BUDGET_SHARE documents, and
    //     assertWithinBudget would not catch it: it only trips at $60, by
    //     which point the run fails and emails. So each step is given what is
    //     LEFT of the pass, summed off the previous steps' own results. The
    //     arithmetic is deterministic on a replay, because a memoised step
    //     returns the same costUsd it returned the first time.
    const passBudget = subjectBudgetUsd()
    let subjectSpend = 0
    const subjectOutcomes: MembershipOutcome[] = []
    for (let i = 0; i < subjects.length; i++) {
      const subject = subjects[i]
      const budgetUsd = Math.max(0, passBudget - subjectSpend)
      const r = await step
        .run(`subject-membership:${i + 1}-of-${subjects.length}`, async () => {
          const admin = createAdminClient()
          const r = await judgeSubject(admin, subject, { clientId, runId, budgetUsd, coverage: subjectCoverage })
          console.log(`[subject-membership] ${membershipSummary(r)}`)
          return r
        })
        .catch((e) => {
          console.error(`[subject-membership] ${subject.name} out of retries: ${e instanceof Error ? e.message : String(e)}`)
          return null
        })
      subjectSpend += r?.costUsd ?? 0
      subjectOutcomes.push(r)
    }
    if (subjectSpend > 0) {
      console.log(`[subject-membership] pass spent $${subjectSpend.toFixed(4)} of its $${passBudget.toFixed(2)} ceiling`)
    }

    // 5. Cross-reference detection — client-brand mentions under competitor /
    //    industry videos (deterministic regex, no GPT).
    const crossRef = await step.run('cross-reference', () => runCrossReference(clientId))

    // 6. Back half. The themes stage fans out per entity bucket (the single
    //    'themes' step — A2 + per-bucket gpt-5.4 merge + Pass B + persist —
    //    measured ~112s for A2+merge alone at run-1 scale and survived run 2's
    //    300s cap only via retry). Each bucket step reloads its own slice from
    //    the DB; only aggregated theme rollups travel as step output. A bucket
    //    step exhausting its retries fails the run (no per-step catch, unlike
    //    transcribe): synthesis over a silently missing bucket would present
    //    partial intelligence as complete — the analysis-only resume lever is
    //    the recovery path, exactly as with the old single step.
    const themePlan = await step.run('plan-themes', async () => {
      const { groups, distinctVideoCount } = await loadGroupedInsights(clientId, runId)
      return { buckets: groups.map((g) => g.bucket), distinctVideoCount }
    })
    const bucketResults: StepA2BucketResult[] = []
    for (let w = 0; w < themePlan.buckets.length; w += THEMES_PARALLEL) {
      const wave = await Promise.all(
        themePlan.buckets.slice(w, w + THEMES_PARALLEL).map((bucket, j) =>
          step.run(`themes:${bucket}`, () =>
            runStepA2Bucket({
              clientId, runId, bucket, callIndex: w + j + 1,
              method: 'embedding', threshold: CLUSTER_SIMILARITY_THRESHOLD,
              evidenceFloor: EVIDENCE_FLOOR, logCalls: true,
            }),
          ),
        ),
      )
      bucketResults.push(...wave)
    }

    // Pass B labels BOTH tiers (early signals surface on the pages too); the
    // cross-bucket strength sort happens here, where the buckets recombine.
    const themed = await step.run('pass-b', async () => {
      const admin = createAdminClient()
      const { data: client } = await admin.from('clients')
        .select('company_name').eq('id', clientId).maybeSingle()
      const allThemes = bucketResults.flatMap((r) => r.themes)
      // Rank, not strongest-member (Tier 1). This sort survives into
      // persist-themes and is the order Pass C/D-a read the theme index in.
      allThemes.sort(compareThemes)
      console.log(`[themes] ${allThemes.length} themes from ${bucketResults.length} buckets, step payload ${JSON.stringify(allThemes).length} bytes`)
      const b = await runPassB({ clientId, runId, themes: allThemes, brandName: client?.company_name ?? undefined, persist: true })
      const mergeCostUsd = bucketResults.reduce((s, r) => s + r.mergeCostUsd, 0)
      return {
        allThemes,
        summary: {
          themes: allThemes.filter((t) => !t.singleSource).length,
          earlySignals: allThemes.filter((t) => t.singleSource).length,
          themeMerges: bucketResults.reduce((s, r) => s + r.mergesApplied.length, 0),
          labelCost: b.costUsd + mergeCostUsd,
        },
      }
    })

    // Persist with first_seen from mini theme-matching — the themes table is
    // the boundary the synthesis step reads back across.
    const persisted = await step.run('persist-themes', () =>
      // The RUN's Pass A version, off its frozen flags — not the environment's.
      // A flag flipped mid-run would otherwise stamp observations with a regime
      // the corpus was never read under, which is the one thing the stamp is
      // for (the same reason flags.themeRegistry travels rather than being
      // re-read here).
      persistThemes(clientId, runId, themed.allThemes, {
        themeRegistry: flags.themeRegistry,
        promptVersion: passAPromptVersion(flags.transcripts),
      }),
    )
    // COUNTED, though the step itself succeeded. The registry block inside
    // persistThemes catches its own failures so a client's update never dies on
    // identity bookkeeping — but the `theme_observations` write is inside that
    // catch, so a run could close 'completed' having written zero observations
    // and nothing anywhere said so. The trend series, the initiatives
    // measurement and the report delta all read that table; a silently empty
    // week reads to a client as "nothing changed" rather than "we lost the
    // record". The degrade stays; the silence does not.
    if (persisted.registryFailed) noteError('persist-themes:registry', persisted.registryFailed)
    const themedSummary = {
      ...themed.summary,
      newThemes: persisted.hadPreviousRun ? persisted.firstSeen : 0,
    }

    // The comment-dated monthly reading (Phase 0, design items 1–2). Here,
    // right after persist-themes, because it reads THIS run's observations:
    // the months are the months of one clustering, and the next run's
    // clustering is a different one. Only the months still open are touched —
    // the current one, the previous one until its 30-day line passes, and any
    // month whose stored row is still filling (that visit is what freezes it).
    //
    // Logged, NOT noteError'd — the keyword-discovery precedent. The reading is
    // a record kept alongside the report, not part of producing it, and a clean
    // run must not read 'partial' because a bookkeeping pass had a bad day. It
    // is also the step that can run before its migration has been applied:
    // until then it is a logged no-op rather than a retry loop holding a slot.
    const subjectHold = subjectFreezeHold(subjectOutcomes)
    await step
      .run('freeze-months', async () => {
        const admin = createAdminClient()
        try {
          const months = monthsToRefresh(new Date().toISOString(), await fillingMonths(admin, clientId))
          // The subject side rides in the SAME visit, not beside it: the
          // denominator's freeze is what closes an audience-month to new rows,
          // so every numerator has to be written before it. A separate subject
          // freeze running afterwards would be refused by the insert guard,
          // correctly and permanently. The same is true of M5's kinds and
          // audience stats, which freezeMonths builds itself because they need
          // the attention panel it resolves.
          //
          // Unless the judgement that feeds it said it was short. A membership
          // refusal protects its own table and nothing else — memberships
          // persist between runs, so the reading here is not empty but SHORT,
          // and a short month frozen by this visit can never be corrected.
          // Better no subject row: a month that closes without one keeps
          // decision K's single later chance.
          //
          // The actor lets this visit freeze the tenant's first attention panel
          // (WP5). It is a configuration write and every configuration write
          // carries one; without it an existing panel is still read and none is
          // ever created.
          if (subjectHold) console.warn(`[freeze-months] subject months NOT written — ${subjectHold}`)
          const r = await freezeMonths(admin, {
            clientId, runId, months,
            sides: subjectHold ? [] : [subjectMonthSide(admin, clientId)],
            actor: pipelineActor(runId, 'freeze-months'),
          })
          const sideCounts = Object.entries(r.sides)
            .map(([table, side]) => `${table} ${side.written} written (${side.frozen} now frozen, ${side.keptFrozen} already frozen and left alone, ${side.deleted} dropped)`)
            .join(' · ')
          console.log(
            `[freeze-months] ${r.months.join(' ')} · denominators ${r.denominators.written} written ` +
            `(${r.denominators.frozen} now frozen, ${r.denominators.keptFrozen} already frozen and left alone, ` +
            `${r.denominators.deleted} dropped) · ${sideCounts}` +
            `${r.panelFrozen ? ' · attention panel frozen' : ''}` +
            `${r.skippedKindMoodAttention ? ' · kinds/mood/attention skipped: M5 not applied' : ''}`,
          )
          const all = [r.denominators, ...Object.values(r.sides)]
          // The ids behind those numbers, said separately (item 31a). An
          // operator reading this log is the only person who will ever see
          // whether "which videos was this read on" was answerable for these
          // months, and `refusedLate` is the number that says the record
          // declined to take a point.
          const refs = r.evidenceRefs
          // A FAILURE IS NOT A ZERO, AND THIS BRANCH READ IT AS ONE. `freezeMonths`
          // returns `{...emptyEvidenceRefSummary(), failed: why}` when the refs
          // freeze throws — so `missing` is false and every counter is 0, and
          // the Sunday run that closes real months printed "evidence ids 0
          // written (0 now frozen, … )", indistinguishable from "there was
          // nothing to write". scripts/monthly-reading.ts shouts about exactly
          // this (Block A's fix 67d8f67); this visit was never taught to.
          //
          // It is the one shot: a month that closes without its ids can never
          // be given them later. `stillFilling` is the script's other warning
          // and is said here for the same reason — nothing revisits those rows.
          console.log(
            refs === undefined
              ? '[freeze-months] evidence ids: not attempted — this visit has no run to attribute a clustering to'
              : refs.failed
                ? `[freeze-months] evidence ids: THE FREEZE FAILED — ${refs.failed} · the months are frozen and their ids are not, and a month that closes without its ids cannot be given them later. Fix the cause and re-run scripts/monthly-reading.ts --write BEFORE any further month freezes.`
                : refs.missing
                  ? '[freeze-months] evidence ids: skipped — 20260918095000_quote_translations.sql has not been applied yet'
                  : `[freeze-months] evidence ids ${refs.written} written (${refs.frozen} now frozen, ` +
                    `${refs.keptFrozen} already frozen and left alone, ${refs.deleted} dropped, ` +
                    `${refs.refusedLate} refused because their months have closed) · ` +
                    `${refs.videoIds} videos and ${refs.commentIds} comments named`,
          )
          if (refs && !refs.failed && refs.stillFilling > 0) {
            console.log(
              `[freeze-months] WARNING: ${refs.stillFilling} evidence-id rows are still 'filling' in audience-months that have already closed. ` +
              'Nothing revisits them — month_evidence_refs is not in MONTH_TABLES. Re-run scripts/monthly-reading.ts over those months to repair them.',
            )
          }
          return {
            months: r.months.length,
            denominators: r.denominators.written,
            themes: r.themes.written,
            kinds: r.kinds.written,
            stats: r.stats.written,
            panelFrozen: r.panelFrozen,
            frozen: all.reduce((n, s) => n + s.frozen, 0),
            keptFrozen: all.reduce((n, s) => n + s.keptFrozen, 0),
            heldStale: all.reduce((n, s) => n + s.heldStale, 0),
            refusedLate: all.reduce((n, s) => n + s.refusedLate, 0),
            // `failed` and `stillFilling` ride on the RETURN as well as in the
            // log, because the return object is what an operator sees in the
            // Inngest UI — and without them the step read green while the log
            // two lines up said the record was lost.
            evidenceRefs: refs
              ? {
                  written: refs.written, frozen: refs.frozen, refusedLate: refs.refusedLate,
                  videoIds: refs.videoIds, commentIds: refs.commentIds, missing: refs.missing,
                  stillFilling: refs.stillFilling, failed: refs.failed ?? null,
                }
              : null,
          }
        } catch (e) {
          // Its tables and functions do not exist yet: a no-op, not a failure.
          // Retrying would burn the step's whole budget with backoff between
          // attempts while holding one of the account's five shared slots, for
          // a record it cannot write until the migration is applied by hand.
          if (!isMissingMonthlyReading(e)) throw e
          console.log('[freeze-months] skipped: 20260915092000_monthly_reading.sql has not been applied yet')
          return null
        }
      })
      .catch((e) => {
        console.error(`[freeze-months] out of retries: ${e instanceof Error ? e.message : String(e)}`)
        return null
      })

    // The anomaly check (design item 40, decision S). HERE, between
    // freeze-months and owned-events, for two reasons and not by taste: it
    // reads the month rows freeze-months has just written, and it wants this
    // run's themes exactly as owned-events does. An ADDITIVE id in its own
    // position — never a rename, a renumber or a reorder (AGENTS.md).
    //
    // Logged, NOT noteError'd — the freeze-months and keyword-discovery
    // precedent. The flags are a record kept alongside the report, and a clean
    // update must not read 'partial' because a bookkeeping pass had a bad day.
    // A no-op, not a retry loop, until its migration is applied.
    //
    // THE ORDER IS ALSO WHAT GUARANTEES THE WEEKLY REPORT SEES THE FLAGS.
    // `report/send.requested` is emitted after close-run, which is after this;
    // so the rows are on disk before the report function starts.
    //
    // ONE MODEL CALL, AND ONLY IF SOMETHING FIRED. gpt-4.1-mini, ~$0.0014 on a
    // week that flags and $0 on the ~21 of 22 tenant-weeks that do not.
    //
    // AND ONE ROW EVERY TIME, flagged or not, compared or not
    // (`anomaly_checks`): a week the check refused to read has a reason, and a
    // reason that only reaches this log is a reason nobody has.
    await step
      .run('anomaly-check', async () => {
        const r = await runAnomalyCheck({
          clientId,
          runId,
          window: runWindow,
          // The videos this update held. `pipeline_runs.videos_scraped` is the
          // same measure on the trailing runs — and is not written until
          // close-run, which is why it is passed in rather than read.
          updateVideos: totalVideos,
        })
        console.log(`[anomaly-check] ${r.status} — ${r.note}`)
        if (r.registration) {
          console.log(
            `[anomaly-check] set: ${r.registration.counts.kind} kinds · ${r.registration.counts.rival} rivals · ` +
            `${r.registration.counts.subject} subjects · ${r.registration.counts.theme} themes ` +
            `(${r.registration.trimmed.length} of ${r.registration.ranked} ranked themes could not reach ` +
            `${r.registration.minWeekVideos} videos in a typical week of ${Math.round(r.registration.medianWeekVideos[SLICE] ?? 0)})`,
          )
        }
        return { status: r.status, written: r.written, flagged: r.reading?.flaggedCount ?? 0, costUsd: r.costUsd }
      })
      .catch((e) => {
        console.error(`[anomaly-check] out of retries: ${e instanceof Error ? e.message : String(e)}`)
        return null
      })

    // Step 2c — account-event detection + explanation on the owned layer
    // (Wave 2: first pipeline wiring; previously script-only). After themes so
    // explanations can ground in this run's theme set. Non-fatal.
    await step
      .run('owned-events', () => runStep2c({ clientId, runId }))
      .catch((e) => {
        console.error(`[owned-events] out of retries: ${e instanceof Error ? e.message : String(e)}`)
        noteError('owned-events', e)
        return null
      })

    const synth = await step.run('synthesize', () => runSynthesisHalf(clientId, runId, runPeriod, runWindow))

    // Keyword ROI bookkeeping — fills keyword_performance.insights_contributed
    // for this run. Catch on the step promise (transcribe precedent): retries
    // first, then non-fatal — a bookkeeping failure marks the run 'partial'
    // and is repairable via scripts/backfill-keyword-insights.ts.
    await step
      .run('keyword-attribution', () => attributeRunKeywords(createAdminClient(), clientId, runId))
      .catch((e) => {
        console.error(`[keyword-attribution] out of retries: ${e instanceof Error ? e.message : String(e)}`)
        noteError('keyword-attribution', e)
        return null
      })

    // The other half of keyword value: terms the corpus keeps handing us that
    // nobody configured (classifier topics + hashtags on this run's gate-kept
    // videos, minus everything already tracked). Pure aggregation, no model
    // call. Logged, NOT noteError'd — the consumer-profile precedent: discovery
    // is additive operator input, and a clean run must not read 'partial'
    // because a suggestion pass had a bad day. Repairable via
    // scripts/backfill-keyword-candidates.ts.
    await step
      .run('keyword-discovery', async () => {
        const r = await discoverRunKeywords(createAdminClient(), clientId, runId)
        console.log(`[discovery] ${r.candidates.length} candidates (${r.topics}/${r.hashtags})`)
        return { candidates: r.candidates.length, topics: r.topics, hashtags: r.hashtags }
      })
      .catch((e) => {
        console.error(`[keyword-discovery] out of retries: ${e instanceof Error ? e.message : String(e)}`)
        return null
      })

    // Pass E — the consumer profile (who is talking), from the insight
    // population this run leaves behind. Its own step, after synthesis, reading
    // from the DB like owned-events: a brand-new GPT call must never be able to
    // fail a client's report, and .catch() gives that for free.
    if (flags.consumerProfile) {
      await step
        .run('consumer-profile', async () => {
          const admin = createAdminClient()
          const { data: client } = await admin
            .from('clients')
            .select('company_name').eq('id', clientId).maybeSingle()
          const { data: run } = await admin
            .from('pipeline_runs')
            .select('started_at').eq('id', runId).maybeSingle()
          // The run's own date, not today's: a run that crosses UTC midnight
          // would otherwise be stamped a day late, and the drift layer orders
          // profiles on this column.
          const stamp = (run?.started_at as string | null) ?? new Date().toISOString()
          const r = await runPassE(admin, {
            clientId,
            runId,
            runDate: stamp.slice(0, 10),
            companyName: client?.company_name ?? 'the client',
          })
          return { kept: r.personas.length, dropped: r.dropped.length, costUsd: r.costUsd }
        })
        .catch((e) => {
          // Logged, NOT noteError'd. Every other non-fatal step is pipeline
          // essential, so downgrading the run to 'partial' and paging the
          // operator is right for them. The profile is additive: a run whose
          // report is complete must not read 'partial' — and must not burn the
          // clean-run gate — because a new pass had a bad day.
          console.error(`[consumer-profile] out of retries: ${e instanceof Error ? e.message : String(e)}`)
          return null
        })
    }

    // Re-test stored plan checks against this run's conversation. Same
    // non-fatal shape as the profile: additive, and a client's report must not
    // depend on it. Rides the same flag — the Ask surface and its weekly
    // re-read are one feature.
    if (flags.consumerProfile) {
      await step
        .run('ask-reevaluate', async () => {
          const admin = createAdminClient()
          const [{ data: client }, { data: run }] = await Promise.all([
            admin.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
            admin.from('pipeline_runs').select('started_at').eq('id', runId).maybeSingle(),
          ])
          const results = await reevaluatePlanChecks(admin, {
            clientId,
            runId,
            runDate: ((run?.started_at as string | null) ?? new Date().toISOString()).slice(0, 10),
            companyName: (client?.company_name as string) ?? 'the client',
          })
          return { checks: results.length, moved: results.reduce((n, r) => n + r.moved.length, 0) }
        })
        .catch((e) => {
          console.error(`[ask-reevaluate] out of retries: ${e instanceof Error ? e.message : String(e)}`)
          return null
        })
    }

    // 7. Close the run.
    await step.run('close-run', async () => {
      const admin = createAdminClient()
      const completedAt = new Date().toISOString()
      // Did the run take longer than the window it covered, or than the six
      // hours anything takes to be called abandoned? A fact on the row, not a
      // finding: nothing alerts on it yet. The floor is what keeps it a fact —
      // without it a same-day rerun, whose anchored window is minutes wide,
      // reads as stalled for finishing in thirteen. The two runs that made this
      // worth recording took 18.1 and 8.9 days to close a week.
      const { data: row } = await admin.from('pipeline_runs')
        .select('started_at').eq('id', runId).maybeSingle()
      const startedAt = (row?.started_at as string | undefined) ?? completedAt
      const close = (extra: Record<string, unknown>) =>
        admin.from('pipeline_runs').update({
          status: runCloseStatus(totalErrors),
          videos_scraped: totalVideos,
          completed_at: completedAt,
          errors: runErrors,
          error_message: summariseRunErrors(totalErrors, runErrors),
          ...extra,
        }).eq('id', runId)
      // Same "the migration has not landed yet" tolerance as open-run, and it
      // matters more here: this update's error was never read, so a missing
      // `stalled` column would have left the run at 'running' for ever with
      // nothing said about it.
      const { error } = await close({ stalled: isStalled({ startedAt, completedAt, window: runWindow }) })
      if (error && isMissingBookkeepingColumn(error)) {
        console.warn('[close-run] `stalled` is not in the database yet; closing without it')
        await close({})
      } else if (error) {
        // Any other failure keeps the behaviour it has always had (the error
        // was never read) — but says so, rather than leaving a run at
        // 'running' with no line anywhere. WP9 weighed making it fatal and
        // decided against: a throw retries and then fails the function, which
        // stamps the run 'failed' and skips request-report, so the client loses
        // the week's update over a bookkeeping write that did not change a
        // single number. A row left at 'running' is caught twice as it is — the
        // next run's open sweep closes it after six hours, and the ops check
        // raises run_stuck the following morning.
        console.error(`[close-run] ${error.message}`)
      }
    })

    // 7a-i. Settle the Apify ledger BEFORE reading it. `usageTotalUsd` on a
    //     just-finished run under-reports: a pay-per-event actor's charges land
    //     about a minute after the run ends. Measured live 2026-09-09 — an
    //     Instagram run read $0 at the moment it returned and $0.0023 sixty
    //     seconds later, chargedEventCounts going 0 → 1 — so reading usage at
    //     the moment the actor returns does not under-report by a little, it
    //     can report nothing at all. The step waits out the youngest run's
    //     settling minute (bounded, SETTLE_MAX_WAIT_MS) and re-reads each row.
    //     Non-fatal: an unsettled row still counts, and run_costs says
    //     'exact_unsettled' rather than presenting a floor as a total.
    const settled = await step
      .run('settle-apify-usage', () => settleApifyRuns(clientId, runId))
      .catch((e) => {
        console.error(`[apify-settle] out of retries: ${e instanceof Error ? e.message : String(e)}`)
        return null
      })
    if (settled?.checked) {
      console.log(`[apify-settle] ${settled.settled}/${settled.checked} settled (${settled.failed} failed) after ${Math.round(settled.waitedMs / 1000)}s · $${settled.beforeUsd} → $${settled.afterUsd}`)
    }

    // 7a. Cost ledger. After close-run so the run's own status write is never
    //     at risk from bookkeeping, and non-fatal for the same reason: what a
    //     run cost must never change whether it succeeded.
    const costs = await step
      .run('write-run-costs', () => writeRunCosts(clientId, runId))
      .catch((e) => {
        console.error(`[run-costs] out of retries: ${e instanceof Error ? e.message : String(e)}`)
        return null
      })
    if (costs) {
      console.log(`[run-costs] openai $${costs.openaiUsd} · transcribe $${costs.transcribeUsd} · apify ${costs.apifyUsd === null ? 'unavailable' : `$${costs.apifyUsd} (${costs.apifyAttribution})`}`)
    }

    // 7b. Prune stale analysis rows (incremental Pass A, 2026-08-17): insight
    //    and language-sample rows no video's analyzed_run_id names any more —
    //    superseded by this run's re-reads, or left by older runs. AFTER
    //    close-run on purpose: the dashboard flips to this run on that status
    //    write, so the previous run's quotes resolve right up to the flip. Only
    //    completed/partial runs reach here (a failed run's stale rows wait for
    //    the next successful close). Non-fatal and uncounted — a leftover is
    //    just storage.
    //
    //    IT DOES NOT TAKE CITED EVIDENCE (2026-09-18). The "leftovers are
    //    harmless" this comment used to end on was true when nothing pointed at
    //    a superseded row. Recommendations, plan checks, saved Ask answers and
    //    frozen exports all do now, so citedEvidenceIds resolves what still
    //    cites what and staleInsightIds never returns one of those rows. Same
    //    step id, same position, one function body — see the note in
    //    citedEvidenceIds for the four classes it protects, the two it
    //    deliberately does not, and why each is resolved the way it is.
    //
    //    ITS FAILURE SURFACE GREW WITH THAT, AND THE FAILURE IS QUIET. The step
    //    now does seven table reads before it deletes anything, and any one of
    //    them throwing — a schema-cache miss, a malformed stored id, a
    //    PostgREST hiccup — takes it here. Non-fatal and uncounted is still the
    //    right trade (fail-closed costs storage; the alternative costs
    //    evidence, which is unrecoverable), but the shape of the failure is
    //    "prunes nothing, on this run and every later one, until someone reads
    //    the log". Deliberately not noteError'd — the keyword-discovery
    //    precedent: a record kept alongside the report must not make a clean
    //    run read 'partial'. The log line below is the only surface that says
    //    so, so it says it plainly.
    const pruned = await step
      .run('prune-stale-analysis', () => pruneStaleAnalysis(clientId))
      .catch((e) => {
        console.error(
          `[prune-stale-analysis] out of retries — NOTHING was pruned this run, and nothing will be ` +
          `on any later run until this succeeds: ${e instanceof Error ? e.message : String(e)}`,
        )
        return { insights: 0, languageSamples: 0, keptInsights: 0, keptSamples: 0, failed: true }
      })

    // 8. Periodic report — only when requested (the scheduler sets this), so a
    //    manual "Run now" refreshes data without emailing the client.
    if (options.sendReport) {
      await step.sendEvent('request-report', {
        name: 'report/send.requested',
        data: { clientId, runId },
      })
    }

    // 9. Operator alert for a degraded run. Only 'failed' and zero-video runs
    //    alerted before 2026-08-16, so a 'partial' run — report delivered,
    //    side-layer silently dead — was indistinguishable from a clean one in
    //    the inbox. Non-fatal: an alert hiccup must never demote a completed
    //    run to 'failed' via onFailure.
    if (totalErrors > 0) {
      await step
        .run('alert-partial', async () => {
          const admin = createAdminClient()
          const { data: client } = await admin.from('clients')
            .select('company_name').eq('id', clientId).maybeSingle()
          const { subject, text } = partialRunAlert({
            runId,
            clientName: client?.company_name ?? clientId,
            total: totalErrors,
            recorded: runErrors,
            reportSent: Boolean(options.sendReport),
          })
          return sendAlertEmail(subject, text)
        })
        .catch((e) => {
          console.error(`[alert-partial] out of retries: ${e instanceof Error ? e.message : String(e)}`)
          return { sent: false }
        })
    }

    return { runId, status: runCloseStatus(totalErrors), totalVideos, ...passA, transcriptBackfill: backfill, translation: translate, onScreenText: ocr, classifyMeta: classify, brandMentions: crossRef.mentionsFlagged, ...themedSummary, ...synth, pruned }
  },
)

/** What plan-owned reports when a tenant has no handles configured, or the
 *  step itself failed — no accounts to read, no window to read them over. */
const EMPTY_OWNED_PLAN = {
  handles: {} as Record<string, string>,
  competitorHandles: {} as Record<string, Record<string, string>>,
  windowStart: null as string | null,
}

/** Batch size for the Pass A fan-out. Sized from the 2026-07-03 live failure:
 *  at comment_depth 100 a call runs ~10-20s (batches of 40 timed out at ~15-29
 *  calls, three attempts straight), so 12 ≈ 2-4 min under the 300s cap. */
const PASS_A_BATCH = 12

/** Videos per comment-scrape step. Each video is its own Apify actor run
 *  (~20-90s incl. actor startup — slower since comment_depth went 25→100), so
 *  3 stays inside the 300s Hobby cap even when every actor runs slow. */
const COMMENT_BATCH = 3

/** Keyword-search steps dispatched concurrently per wave. Search actors are
 *  heavier than comment actors (a full hashtag/keyword crawl each), so the
 *  wave stays small; a platform's whole keyword set is 5-10 tasks. */
const SEARCH_PARALLEL = 3

/** Comment-scrape steps dispatched concurrently per wave. Each step runs its
 *  COMMENT_BATCH videos sequentially (one actor at a time), so a wave holds at
 *  most COMMENT_PARALLEL concurrent Apify jobs — far under the Starter plan's
 *  32-concurrent-jobs cap even stacked on a search or transcribe wave. */
const COMMENT_PARALLEL = 4

/** Pass A batches dispatched concurrently per wave. Step IDs are unchanged by
 *  this (still pass-a:N-of-M over the same memoized plan), so a mid-run deploy
 *  replays completed batches instantly and fans out only the remainder. */
const PASS_A_PARALLEL = 5

/** Classify-meta batches per wave — 25-video metadata-only calls run ~10-30s,
 *  so 4 abreast stays far under the step cap. */
const CLASSIFY_PARALLEL = 4

/** Bucket theme steps dispatched concurrently per wave. Each step carries one
 *  gpt-5.4 reasoning=medium merge call (the heavy part, ~95s total across
 *  buckets at run-1 scale) plus a cheap embeddings call, so the wave stays
 *  small for OpenAI headroom; a run has ~3-6 entity buckets. */
const THEMES_PARALLEL = 2

// Eligible video ids (raw comment count >= 5, richest first), chunked into
// batches. Comments are scanned once and joined in memory — same URL-overflow
// avoidance as everywhere else.
/** Operator abort switch (2026-08-17). Set `clients.is_active = false` and the
 *  run dies at its next step boundary instead of spending another cent on
 *  Apify/OpenAI. Deliberately NOT inside a step.run: Inngest replays the
 *  function body on every step invocation, so an un-memoised check is re-read
 *  each time and takes effect within seconds. The scheduler already refuses to
 *  dispatch inactive tenants; this makes the same flag stop a run already in
 *  flight — the lever the product lacked when a run had to be killed mid-gather
 *  and neither the Inngest API (signing key is a sensitive env var) nor the
 *  dashboard was reachable. */
async function assertRunActive(clientId: string): Promise<void> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('clients')
    .select('is_active, is_comped, trial_ends_at, subscription_status, approved_at')
    .eq('id', clientId).maybeSingle()
  // Fail CLOSED. The error was discarded before, so any transient Supabase
  // failure read as "active" and the run kept spending — and once the billing
  // gate moved in here, a failure silently disabled that too.
  if (error) throw new Error(`abort check failed for client ${clientId}: ${error.message}`)
  if (!data) return
  const client = data as BillingClient & { is_active: boolean | null }
  if (client.is_active === false) {
    throw new Error(`run aborted: client ${clientId} is inactive (operator abort switch)`)
  }
  // Billing gate (T0-2): the abort switch only ever asked "is this tenant
  // switched on", so an expired trial or a cancelled subscription still bought
  // a full run. Comped tenants pass. Checked here, outside step.run, so it is
  // re-read at every step boundary like the abort switch itself.
  const access = billingAccess(client)
  if (!access.hasAccess) {
    throw new Error(`run aborted: client ${clientId} has no access (${access.reason})`)
  }
}

/** Hard spend stop (Tier 1). The abort switch needed a human to notice; this
 *  stops a run that is burning money on its own. Checked at the same step
 *  boundary as the abort switch, so it is one extra cheap query on a path that
 *  already makes one. Throwing here lands in onFailure, which marks the run
 *  failed and emails — the loud outcome a runaway deserves. */
async function assertWithinBudget(clientId: string, runId: string): Promise<void> {
  const spent = await runSpendSoFar(clientId, runId)
  if (spent > RUN_MODEL_BUDGET_USD) {
    throw new Error(
      `run aborted: model spend $${spent.toFixed(2)} exceeded the $${RUN_MODEL_BUDGET_USD} per-run budget ` +
      `(raise RUN_MODEL_BUDGET_USD if this run is legitimately larger)`,
    )
  }
}

export interface PassAPlan {
  batches: string[][]
  /** Videos that qualified for a lane (full / claims_only) before the change check. */
  considered: number
  selected: number
  reasons: Record<SelectReason, number>
}

async function planPassABatches(clientId: string, runId: string, force: boolean, flags: RunFlags): Promise<PassAPlan> {
  const admin = createAdminClient()
  // Discovered corpus + the client's OWN posts. Owned posts never take the
  // full lane (their fans' comments would contaminate audience themes; Step 2c
  // is their consumer) — passALane admits them to the claims lane only, when
  // they carry a usable transcript (Brand Voice, 2026-08-16).
  type PlanVideo = {
    id: string; platform: string; video_id: string; is_client: boolean | null; is_competitor: boolean | null
    transcript_status: string | null; source: string | null; run_id: string | null
    analyzed_run_id: string | null; analyzed_comment_count: number | null; analyzed_prompt_version: string | null
    analyzed_lane: string | null; analyzed_with_transcript: boolean | null
    analyzed_with_translation: boolean | null; analyzed_with_ocr: boolean | null
  }
  const PLAN_COLS = 'id, platform, video_id, is_client, is_competitor, transcript_status, source, run_id, analyzed_run_id, analyzed_comment_count, analyzed_prompt_version, analyzed_lane, analyzed_with_transcript, analyzed_with_translation'
  // analyzed_with_ocr is asked for separately so a deploy that lands before the
  // migration degrades instead of taking the run down: this select failing is
  // plan-pass-a failing, which is the whole run, for every tenant.
  let videos: PlanVideo[]
  try {
    videos = await selectAll<PlanVideo>(() =>
      admin.from('videos')
        .select(`${PLAN_COLS}, analyzed_with_ocr`)
        .eq('client_id', clientId).in('source', ['discovered', 'owned', 'competitor_owned']).order('id', { ascending: true }),
    )
  } catch (e) {
    if (!mentionsMissingColumn(e, 'analyzed_with_ocr')) throw e
    console.warn('[plan-pass-a] videos.analyzed_with_ocr does not exist — apply supabase/migrations/20260912100000_ocr_text.sql. Planning without it.')
    videos = (await selectAll<Omit<PlanVideo, 'analyzed_with_ocr'>>(() =>
      admin.from('videos')
        .select(PLAN_COLS)
        .eq('client_id', clientId).in('source', ['discovered', 'owned', 'competitor_owned']).order('id', { ascending: true }),
    )).map((v) => ({ ...v, analyzed_with_ocr: true }))
    // `true`, not null: with no column there is no on-screen text either, and
    // reading it as false would make the 'ocr' rule fire on every video the
    // moment ocrUsableNow could be true. It cannot be — withOcrText is empty on
    // this path — but the two must not depend on each other to stay safe.
  }
  // WHICH videos carry a translation, as an id set — deliberately NOT a
  // `transcript_en` column in the read above. That column is transcript-sized,
  // and a corpus-wide read of transcript text once hung Postgres for eight
  // hours (lib/pipeline/types.ts SYNTHESIS_VIDEO_COLUMNS); the plan only needs
  // the null-ness, which PostgREST can answer without sending the text.
  const translated = new Set(
    (await selectAll<{ id: string }>(() =>
      admin.from('videos').select('id')
        .eq('client_id', clientId).eq('transcript_status', 'ok')
        // .neq('') as well as .not(is null): usableTranslation reads a
        // whitespace-only column as "no translation", so a row this query
        // called translated and Pass A did not would book
        // analyzed_with_translation false and re-select as 'translated' every
        // run forever. The wave cannot create such a row; a hand-edit can.
        .not('transcript_en', 'is', null).neq('transcript_en', '')
        .order('id', { ascending: true }),
    )).map((r) => r.id),
  )
  // WHICH videos carry usable on-screen text, as an id set, for the same reason
  // the translation is one: ocr_text is prompt-sized and the plan only needs its
  // null-ness. usableOcr's exact rule — status 'ok' AND non-blank text — so a
  // row this query calls read and Pass A does not cannot re-select forever.
  //
  // Wrapped: a deploy that lands before the migration makes this raise 42703,
  // and plan-pass-a failing takes the WHOLE RUN down, for every tenant. An
  // empty set is the correct degraded answer — no video is re-read for
  // on-screen text it cannot have yet.
  //
  // NOTE the one way this differs from usableOcr: that helper trims before
  // deciding, this query cannot. A whitespace-only ocr_text would be called
  // "read" here and "not read" by Pass A, and the video would re-select as
  // 'ocr' every run forever. normaliseOcrLines cannot produce such a row (it
  // trims and stores null for empty), so this is unreachable through the wave —
  // a hand-edit is the only way in.
  let withOcrText = new Set<string>()
  try {
    withOcrText = new Set(
      (await selectAll<{ id: string }>(() =>
        admin.from('videos').select('id')
          .eq('client_id', clientId).eq('ocr_status', 'ok')
          .not('ocr_text', 'is', null).neq('ocr_text', '')
          .order('id', { ascending: true }),
      )).map((r) => r.id),
    )
  } catch (e) {
    if (!mentionsMissingColumn(e, 'ocr_status')) throw e
    console.warn('[plan-pass-a] videos.ocr_status does not exist — apply supabase/migrations/20260912100000_ocr_text.sql. Planning without on-screen text.')
  }
  const counts = new Map<string, number>()
  const comments = await selectAll<{ platform: string; video_id: string }>(() =>
    admin.from('comments').select('platform, video_id').eq('client_id', clientId).order('id', { ascending: true }),
  )
  for (const c of comments) {
    const key = `${c.platform}::${c.video_id}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  // Per-platform floor: Reddit threads run short but dense, so a single global
  // 5 would skip most of the platform (lib/config.ts passAMinComments). Below
  // the floor, brand-side videos with a usable transcript still enter via the
  // claims lane (Wave 4) — same rule as runPassA's second gate, via passALane.
  //
  // Incremental Pass A (2026-08-17): a video is re-read only when its prompt
  // input changed since videos.analyzed_run_id produced its current rows —
  // new / grew / transcript landed / lane changed / prompt bumped / forced
  // (decideAnalysis). With the flag OFF the decision is always "select", i.e.
  // the pre-2026-08-17 behaviour: full lane corpus-wide, claims lane RUN-SCOPED
  // (only videos stamped with this run — otherwise every brand-side transcript
  // ever captured re-entered Pass A weekly, unbounded, +103 videos on
  // 2026-08-16 alone). With the flag ON, "changed" is that bound for both lanes.
  const withTranscripts = flags.transcripts
  const incremental = flags.incrementalPassA
  const promptVersion = passAPromptVersion(withTranscripts)
  const reasons = emptyReasonTally()
  let considered = 0
  const eligible: { id: string; n: number }[] = []
  for (const v of videos) {
    const n = counts.get(`${v.platform}::${v.video_id}`) ?? 0
    const transcriptUsableNow = withTranscripts && v.transcript_status === 'ok'
    // A translation is only ever read alongside a transcript (it is the same
    // text in English), so it cannot re-select a video the transcripts flag has
    // already taken the transcript away from.
    const translationUsableNow = transcriptUsableNow && translated.has(v.id)
    // On-screen text needs no transcript — a silent video whose whole argument
    // is a title card is the case this exists for — but it IS read only on the
    // v4 prompt, so the transcripts flag still governs whether Pass A sees it.
    const ocrUsableNow = withTranscripts && withOcrText.has(v.id)
    const lane = passALane({ ...v, transcript_status: withTranscripts ? v.transcript_status : null }, n)
    if (lane === 'skip') continue
    considered++
    if (!incremental && lane === 'claims_only' && v.run_id !== runId) { reasons.unchanged++; continue }
    const d = decideAnalysis({
      state: v, laneNow: lane, storedComments: n, transcriptUsableNow, translationUsableNow, ocrUsableNow, promptVersion, incremental, force, runId,
    })
    reasons[d.reason]++
    if (d.select) eligible.push({ id: v.id, n })
  }
  eligible.sort((a, b) => b.n - a.n)
  const batches = chunk(eligible, PASS_A_BATCH).map((part) => part.map((v) => v.id))
  return { batches, considered, selected: eligible.length, reasons }
}

/**
 * What a prune MAY NOT TAKE: the `audience_insights` / `language_samples` rows
 * something stored still points at.
 *
 * THE DEFECT THIS CLOSES (2026-09-18). `prune-stale-analysis` removes every row
 * a later re-read superseded, and its own comment called the leftovers
 * "harmless, just storage" — true when nothing cited them. Things cite them
 * now: all twelve of Sealand's oldest recommendations, every row its advice
 * ledger actually draws, had lost every `audience_insights` row beneath them,
 * so "Grounded in" resolved to zero live videos down the whole page.
 *
 * FAIL CLOSED. Everything here is loaded BEFORE the first delete, so a read
 * that fails takes the step to its retry and then to its non-fatal catch with
 * nothing deleted. Deleting less than we could is a storage cost; deleting a
 * cited row is unrecoverable.
 *
 * THE FOUR CITATION CLASSES, and why each is resolved the way it is:
 *
 *  1. RECOMMENDATIONS, a two-link chain. `recommendations.based_on.insight_ids`
 *     names insight rows, and it MIXES `market_insights` (M#) and
 *     `competitive_insights` (C#) ids — the resolution lib/pipeline/pass-d.ts
 *     writes, and the same reason app/api/cron/ops-check/route.ts unions both
 *     tables. Their `evidence.supporting_theme_ids` then holds the
 *     `audience_insights` ids (scripts/citation-floor.ts states that mapping).
 *     ONLY THE SECOND LINK IS PROTECTED HERE, and the first needs no protecting
 *     by this step: it deletes `audience_insights` and `language_samples` and
 *     nothing else, so no `market_insights` / `competitive_insights` row is at
 *     risk from a prune. Those two tables ACCUMULATE across runs — lib/pipeline/
 *     pass-d.ts:695 and lib/pipeline/pass-c.ts:285 delete only THEIR OWN run's
 *     rows before re-inserting — which is why 329 of 334 stored refs still
 *     resolved when this was measured. The one way the first link breaks is
 *     documented at lib/pipeline/pass-d.ts:878-895: a D-b retry that fails
 *     after `market_insights` was re-inserted with fresh ids leaves the
 *     surviving recommendations' `based_on` pointing at rows that are gone.
 *     That hole is real, it is deliberate ("degraded beats empty"), and it is
 *     not this step's to close — a row whose market insight is itself gone
 *     reaches lib/reading/afterwards.ts as an empty `based_on`, which is what
 *     `GroundingInput.cited` exists to tell from the other absence.
 *
 *  2. PLAN CHECKS, both tables. `plan_checks.claims[].insightIds` is the
 *     upload's reading and `plan_check_evaluations.claims[].insightIds` each
 *     re-check's; `currentReading` (lib/ask/plan-cards.ts) prints the newest
 *     evaluation that has claims and FALLS BACK to the upload's, so protecting
 *     only one of the two leaves the other printing a card with no voices.
 *
 *  3. SAVED ASK ANSWERS. `agent_messages.result.grounded[].insightIds` stores
 *     the ids an answer was grounded on and stores NO quote text — the column's
 *     own comment says so in as many words, and lib/pages/agent-thread.ts
 *     resolves the words live by comment id through `insight_evidence`, which
 *     cascades from `audience_insights`. The quotes under a grounded point come
 *     only from THAT point's own live insight ids (lib/agent/enforce.ts builds
 *     them from `insights = live.map(...)`, its dedup fallback included), so
 *     protecting `insightIds` is exactly what keeps a reopened thread's quotes
 *     resolving. Id-exact like classes 1 and 2, on the surface a client reopens
 *     most often — NOT the `c:`/`v:`/`m:` case below, which stores no row id.
 *     Only role='agent' rows carry a `result`; a user's message is the question
 *     they typed.
 *
 *  4. FROZEN SNAPSHOT QUOTES. `report_snapshots.evidence_ids` repeats the refs
 *     in the stored artefact (lib/renderables/quotes-freeze.ts). Two of the ref
 *     kinds name a row this prune can delete, and both are id-exact:
 *     `e:<insight_evidence.id>`, which cascades from `audience_insights` and so
 *     resolves back through it, and `p:<language_samples.id>`, which IS one of
 *     these rows. The brief listed snapshots as a named non-goal to be measured
 *     rather than fixed, "unless the count says it is the same one-line set
 *     union". It is the same set union — `p:` needs no resolution at all and
 *     `e:` needs one chunked select — so it is done here rather than left as a
 *     second defect of the same shape. This is also why `language_samples` is
 *     protected at all: it carries no OTHER citation path, but a stored export
 *     names its rows by id.
 *
 *     "REPEATS THE REFS" IS TRUE SINCE 2026-08-31, AND THE DATE IS
 *     LOAD-BEARING. Before T11 `createSnapshot` froze the workings' quotes and
 *     threw their refs away, so a pre-T11 snapshot's `evidence_ids` carries only
 *     what its PAGES cite — this class is therefore exactly as complete as
 *     scripts/backfill-evidence-ids.ts --apply left it. The write path is fixed,
 *     so every new snapshot is whole. The alternative, `collectQuoteRefs` over
 *     `data` / `workings`, means selecting every snapshot's entire jsonb on
 *     every run and is not worth it for a repaired window. Named here so the
 *     dependency is not rediscovered as a bug.
 *
 * WHAT IS DELIBERATELY NOT PROTECTED — read this before treating the four above
 * as all of them. Each exclusion is a judgement, and an unrecorded judgement
 * reads as an oversight to whoever finds the path next:
 *
 *  a. THEME MEMBERS. `theme_observations.member_insight_ids` is a fifth
 *     id-exact path into `audience_insights`: `monthly_theme_readings` walks it
 *     to `insight_evidence` to `comments`
 *     (supabase/migrations/20260915092000_monthly_reading.sql). It is NOT
 *     protected and should not be — a run's themes name most of that run's
 *     corpus, so protecting members would retain nearly everything and the
 *     prune would stop being a prune. The monthly reading is built for this
 *     already: its own header measures 18.2% of stored member references
 *     dangling, 20260918091000_theme_key.sql:87 measures 20.2% at one run old,
 *     and that is the stated reason `member_video_ids` became the PRIMARY
 *     matching key — a video id survives a re-read, an insight id does not.
 *
 *  b. `c:` / `v:` / `m:` SNAPSHOT REFS, and the comment ids stored beside a
 *     saved answer's insight ids. These name no row at all: they resolve by
 *     SEARCHING `insight_evidence` for a live excerpt on that comment or video.
 *     So they keep resolving IF the re-read produced evidence on that comment —
 *     a Pass A re-read is free to quote different comments entirely, and
 *     nothing guarantees it did. The honest reading is "usually still resolves,
 *     possibly to a DIFFERENT excerpt, sometimes to nothing", and whether a
 *     frozen export may change its quoted words is a real and separate
 *     question. They cannot be added to the protected set by id; they have no
 *     id. What class 3 protects is the insight ids stored ALONGSIDE them, which
 *     is what makes a saved answer's quotes hold.
 *
 *  c. `k:` / `h:` / `b:` refs read `video_claims`, a hero row and `run_summary`,
 *     none of which this step touches.
 *
 * A FIFTH protected class means re-opening this list and AGENTS.md, not
 * appending a set union to the code.
 */
async function citedEvidenceIds(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
): Promise<{ insights: Set<string>; languageSamples: Set<string>; from: Record<string, number> }> {
  // COUNTED ONE WAY, AND THIS IS WHICH: each class gets its OWN set, counted on
  // its own, and the protected set is their union at the end. The classes
  // OVERLAP heavily — one insight is routinely cited by a recommendation and by
  // a plan check — so the per-class figures do not add up to the union and the
  // log line says so. The first shape of this function counted FIRST
  // ATTRIBUTION instead ("new to the set when this class reached it"), which is
  // order-dependent and reads as a class total: on the two measured tenants
  // 5,445 + 1,750 + 6 first-attribution ids stood against a distinct union of
  // 6,107, so ~1,094 ids would have changed class if these blocks were
  // reordered. Repo rule, verbatim: count them one way and say which.
  const cls = {
    recommendations: new Set<string>(),
    planChecks: new Set<string>(),
    savedAnswers: new Set<string>(),
    snapshots: new Set<string>(),
  }
  const languageSamples = new Set<string>()

  // 1. Recommendations → market/competitive insights → audience insights.
  const recs = await selectAll<{ id: string; based_on: { insight_ids?: string[] } | null }>(() =>
    admin.from('recommendations').select('id, based_on').eq('client_id', clientId).order('id', { ascending: true }),
  )
  const containers = new Set<string>()
  for (const r of recs) for (const id of r.based_on?.insight_ids ?? []) if (typeof id === 'string' && id) containers.add(id)
  for (const table of ['market_insights', 'competitive_insights'] as const) {
    // Chunk 200 for the same PostgREST URL-length reason as the deletes below.
    // A 200-id chunk can return at most 200 rows (`id` is the primary key), so
    // the 1000-row default cap on a bare `.select()` is never in play here.
    for (const part of chunk([...containers], 200)) {
      const { data, error } = await admin.from(table).select('id, evidence').eq('client_id', clientId).in('id', part)
      if (error) throw new Error(`cited ${table}: ${error.message}`)
      for (const row of (data ?? []) as { evidence: { supporting_theme_ids?: string[] } | null }[]) {
        for (const id of row.evidence?.supporting_theme_ids ?? []) {
          if (typeof id === 'string' && id) cls.recommendations.add(id)
        }
      }
    }
  }

  // 2. Plan checks — the upload's claims and every re-evaluation's.
  for (const table of ['plan_checks', 'plan_check_evaluations'] as const) {
    const rows = await selectAll<{ id: string; claims: unknown }>(() =>
      admin.from(table).select('id, claims').eq('client_id', clientId).order('id', { ascending: true }),
    )
    for (const row of rows) {
      if (!Array.isArray(row.claims)) continue
      for (const claim of row.claims as { insightIds?: unknown }[]) {
        if (!claim || !Array.isArray(claim.insightIds)) continue
        for (const id of claim.insightIds) {
          if (typeof id === 'string' && id) cls.planChecks.add(id)
        }
      }
    }
  }

  // 3. Saved Ask answers — the ids each grounded point rests on.
  const answers = await selectAll<{ id: string; result: unknown }>(() =>
    admin.from('agent_messages').select('id, result')
      .eq('client_id', clientId).eq('role', 'agent').not('result', 'is', null)
      .order('id', { ascending: true }),
  )
  for (const a of answers) {
    const grounded = (a.result as { grounded?: unknown } | null)?.grounded
    if (!Array.isArray(grounded)) continue
    for (const point of grounded as { insightIds?: unknown }[]) {
      if (!point || !Array.isArray(point.insightIds)) continue
      for (const id of point.insightIds) {
        if (typeof id === 'string' && id) cls.savedAnswers.add(id)
      }
    }
  }

  // 4. Frozen snapshot quotes.
  const snapshots = await selectAll<{ id: string; evidence_ids: string[] | null }>(() =>
    admin.from('report_snapshots').select('id, evidence_ids').eq('client_id', clientId).order('id', { ascending: true }),
  )
  const evidenceRowIds = new Set<string>()
  for (const s of snapshots) {
    for (const ref of s.evidence_ids ?? []) {
      const parsed = typeof ref === 'string' ? parseRef(ref) : null
      if (!parsed) continue
      if (parsed.kind === 'e') evidenceRowIds.add(parsed.id)
      else if (parsed.kind === 'p') languageSamples.add(parsed.id)
    }
  }
  for (const part of chunk([...evidenceRowIds], 200)) {
    const { data, error } = await admin.from('insight_evidence').select('id, audience_insight_id').in('id', part)
    if (error) throw new Error(`cited insight_evidence: ${error.message}`)
    for (const row of (data ?? []) as { audience_insight_id: string | null }[]) {
      const id = row.audience_insight_id
      if (id) cls.snapshots.add(id)
    }
  }

  // The union is what protects; the class sizes are what the operator reads.
  // `snapshots` and `snapshotSamples` are kept apart because they count rows in
  // two different tables — one figure spanning both would be meaningless.
  const insights = new Set<string>([
    ...cls.recommendations, ...cls.planChecks, ...cls.savedAnswers, ...cls.snapshots,
  ])
  const from: Record<string, number> = {
    recommendations: cls.recommendations.size,
    planChecks: cls.planChecks.size,
    savedAnswers: cls.savedAnswers.size,
    snapshots: cls.snapshots.size,
    snapshotSamples: languageSamples.size,
    insights: insights.size,
  }
  return { insights, languageSamples, from }
}

/** Delete every audience_insights / language_samples row that is not the
 *  current analysis of its video (staleInsightIds, lib/pipeline/pass-a-plan.ts)
 *  AND that nothing stored still cites (citedEvidenceIds, above).
 *  Chunked deletes; insight_evidence cascades. video_claims is left alone —
 *  its reader is already newest-run-wins (lib/pipeline/claims.ts). */
async function pruneStaleAnalysis(clientId: string): Promise<{ insights: number; languageSamples: number; keptInsights: number; keptSamples: number }> {
  const admin = createAdminClient()
  // Loaded first, and a failure here throws before anything is deleted.
  const cited = await citedEvidenceIds(admin, clientId)
  const videos = await selectAll<{ id: string; analyzed_run_id: string | null }>(() =>
    admin.from('videos').select('id, analyzed_run_id').eq('client_id', clientId).order('id', { ascending: true }),
  )
  const out = { insights: 0, languageSamples: 0, keptInsights: 0, keptSamples: 0 }
  for (const table of ['audience_insights', 'language_samples'] as const) {
    const rows = await selectAll<{ id: string; run_id: string | null; source_video_id: string | null }>(() =>
      admin.from(table).select('id, run_id, source_video_id').eq('client_id', clientId).order('id', { ascending: true }),
    )
    const protectedIds = table === 'audience_insights' ? cited.insights : cited.languageSamples
    const stale = staleInsightIds(videos, rows, protectedIds)
    // What protection actually cost, counted against this tenant's own rows
    // rather than against the size of the cited set (protectedKeptIds, same
    // file as the rule, where its tests are): an id cited by a recommendation
    // may name a row that is current anyway, or one this tenant no longer has
    // at all. It walks the protected rows alone, not the table a second time.
    const kept = protectedKeptIds(videos, rows, protectedIds).length
    // Chunk 200, not 500: ~500 uuids in an `in.()` filter overflows the
    // PostgREST URL cap ("fetch failed" — the lesson behind every other chunked
    // .in() in this repo). A first prune on a real tenant is thousands of rows.
    for (const part of chunk(stale, 200)) {
      const { error } = await admin.from(table).delete().in('id', part)
      if (error) throw new Error(`prune ${table}: ${error.message}`)
    }
    if (table === 'audience_insights') { out.insights = stale.length; out.keptInsights = kept }
    else { out.languageSamples = stale.length; out.keptSamples = kept }
  }
  console.log(
    `[prune-stale-analysis] deleted ${out.insights} insight(s) · ${out.languageSamples} language sample(s); ` +
    `kept ${out.keptInsights} + ${out.keptSamples} superseded row(s) because something still cites them ` +
    `(cited ids PER CLASS, and the classes overlap: recommendations ${cited.from.recommendations} · ` +
    `plan checks ${cited.from.planChecks} · saved answers ${cited.from.savedAnswers} · ` +
    `snapshots ${cited.from.snapshots}; distinct union ${cited.from.insights} insight id(s) ` +
    `+ ${cited.from.snapshotSamples} language sample id(s))`,
  )
  return out
}

// Back half, synthesis step: metrics → Pass C → Pass D (a+b) → run_summary,
// over the themes persisted by the persist-themes step. Mirrors scripts/run-cd.ts.
async function runSynthesisHalf(
  clientId: string,
  runId: string,
  runPeriod: string | null = null,
  runWindow: RunWindow | null = null,
) {
  const admin = createAdminClient()

  // Share rule (Heinrich, 2026-09-10). "Share of tracked conversation" counts
  // EVERYTHING relating to a brand: videos the market posted ABOUT it and the
  // brand's OWN account posts, for the client and every tracked competitor
  // alike. That replaces the old SoV guard, which held source 'owned' and
  // 'competitor_owned' out of these metrics — narrow, and asymmetric on top of
  // it: a competitor's own post that keyword search happened to surface counts
  // already (it lands on source 'discovered'), while the identical post read
  // off their profile did not. So the corpus is every row now.
  // Bucketing is by IDENTITY, not source — is_client → client, is_competitor +
  // competitor_name → competitor:<name> (lib/pipeline/metrics.ts) — and
  // lib/gather/owned.ts stamps that identity onto census rows, so an own post
  // lands under its own brand. Their comments ride along via wantedVideos
  // below, deliberately: they are conversation about the brand too.
  // Anything in this half that must stay market-only filters at its own call
  // site with isDiscoveredVideo (today: the sentiment distribution).
  // Columns, never `*`: a video row carries its transcript, and reading the
  // whole table hung Postgres for eight hours on 2026-09-09 (~3,043 Sealand
  // rows, 224MB shared_buffers). SYNTHESIS_VIDEO_COLUMNS is exactly what the
  // consumers below read — see lib/pipeline/types.ts.
  const videos = await selectAll<SynthesisVideoRow>(() =>
    admin.from('videos').select(SYNTHESIS_VIDEO_COLUMNS).eq('client_id', clientId)
      .order('id', { ascending: true }),
  )
  // Load the client's comments in one paginated scan and filter to the corpus
  // videos IN MEMORY — a `.in('video_id', [all ids])` filter blows the URL length
  // limit once the corpus grows to ~1k+ videos ("fetch failed"). Mirrors run-cd.ts.
  const wantedVideos = new Set(videos.map((v) => `${v.platform}::${v.video_id}`))
  const allComments = await selectAll<CommentRow>(() =>
    admin.from('comments')
      .select('id, client_id, run_id, platform, video_id, comment_id, author, text, likes, comment_date')
      .eq('client_id', clientId)
      .order('id', { ascending: true }),
  )
  const comments = allComments.filter((c) => wantedVideos.has(`${c.platform}::${c.video_id}`))

  // Which videos actually produced an insight. Share of voice then carries what
  // a finding can REST on, not only what we scraped: on a live Sealand run
  // Freitag was 22 gathered / 2 analysed, so a coverage claim built on the
  // gathered count overstated by 11x and a floor set against it never fired.
  const analysedRows = await selectAll<{ source_video_id: string | null }>(() =>
    admin.from('audience_insights_current').select('source_video_id')
      .eq('client_id', clientId).order('id', { ascending: true }),
  )
  const analysedVideoIds = new Set(
    analysedRows.map((r) => r.source_video_id).filter((id): id is string => Boolean(id)),
  )
  const metrics = computeMetrics(videos, comments, analysedVideoIds)

  const { data: tc } = await admin.from('tracking_configs')
    .select('brand_keywords, competitor_names, industry_keywords, report_period, own_handles, competitor_handles')
    .eq('client_id', clientId).maybeSingle()

  // Period slice — only what THIS run gathered, minus rows KNOWN to be older
  // than the report window (upserts re-stamp re-found videos/comments with the
  // current run_id, so run_id alone lets an old-viral re-scrape pollute the
  // week's numbers; comment_date/upload_date is the honest cut). Null dates
  // stay — only content known old is dropped. Baseline runs (window.since =
  // null) keep the full run slice: the first run IS the map, not a period.
  // Feeds run_summary's period_* columns; the full-corpus metrics above stay
  // the market-map state. (Teardown 2026-07-09 — cumulative-metrics fix.)
  // The run's effective period — the trigger's override if it had one, else
  // the tenant's cadence. Read from the run, NOT from tracking_configs: a
  // manual {period:'monthly'} on a 'paused' tenant gathered 30 days and then
  // measured the week against it (run cb0d97b2, 2026-09-09).
  // The window is the RUN's, frozen at open-run — not a fresh reading of the
  // clock. On the two multi-day runs in production this step cut the period at
  // a date the gather had never been asked for (18 days later on f9548a97).
  const period = runPeriod ?? effectivePeriod(null, tc?.report_period as string | null)
  const window = await resolveGatherWindow(clientId, runId, period, runWindow)
  const periodVideos = videos.filter((v) => v.run_id === runId && inWindow(v.upload_date, window.since))
  const periodComments = comments.filter((c) => c.run_id === runId && inWindow(c.comment_date, window.since))
  const periodMetrics = computeMetrics(periodVideos, periodComments, analysedVideoIds)
  // Census fact: how many posts the CLIENT published in this window, exactly —
  // read off the owned rows rather than inferred from the corpus, and frozen
  // with the window it is true for. The share tile sets it against how many
  // videos by and about the client were tracked in total — share counts both,
  // so the census is where "what you published" is still said on its own.
  // BOTH bounds come from the run's frozen window when it has one. Taking the
  // upper bound from the clock instead was the same gather-vs-synthesis
  // divergence this work removed, on the same run: f9548a97 opened 3 Jul and
  // synthesised 21 Jul, so a clock-read `until` counted 18 days of the client's
  // posts into a window that ends on the 3rd — in the one number on the summary
  // that is meant to be exact. Only the pre-Phase-0 fallback path (no frozen
  // window) still reads the clock, which is what it started under.
  const ownedCensus = buildOwnedCensus(videos, {
    handles: (tc?.own_handles ?? {}) as Record<string, string>,
    competitorHandles: (tc?.competitor_handles ?? {}) as Record<string, Record<string, string>>,
    since: window.since ?? periodSince(period),
    until: (runWindow?.end ?? new Date().toISOString()).slice(0, 10),
  })

  const { data: client } = await admin.from('clients')
    .select('company_name').eq('id', clientId).maybeSingle()
  const brandName = client?.company_name ?? undefined

  // Brand claims (Step 2b) — all-time accumulation, newest-run-per-video,
  // tracked competitors only; empty for tenants that never ran Pass A v4.
  // EVERY side is split by voice (2026-09-15): `client` = the brand speaking
  // (own posts + own accounts) → say-vs-hear; `about` = third parties → the
  // About-you block; `competitorsOwn` = a rival speaking in its own videos →
  // Pass C's own-videos block and the document's pitch; `competitorsAbout` =
  // creators and reviewers talking about that rival, which used to be printed
  // as the rival's own marketing.
  const claims = await loadBrandClaims(
    admin,
    clientId,
    tc?.competitor_names ?? [],
    tc?.brand_keywords ?? [],
    (tc?.own_handles ?? {}) as Record<string, string>,
    (tc?.competitor_handles ?? {}) as Record<string, Record<string, string>>,
  )

  // Floor-passing themes only — early signals surface on pages, not in C/D.
  const themes = (await loadThemes(clientId, runId)).filter((t) => !t.singleSource)

  const c = await runPassC({
    clientId, runId, themes,
    trackingConfig: tc ?? undefined, brandName, sov: metrics.share_of_voice,
    competitorClaims: claims.competitorsOwn, competitorAboutClaims: claims.competitorsAbout, persist: true,
  })
  const d = await runPassD({
    clientId, runId, themes,
    competitiveInsights: c.competitiveInsights, brandName, sov: metrics.share_of_voice,
    clientClaims: claims.client, persist: true,
  })

  // The sentiment distribution stays MARKET-ONLY. It answers "how did the
  // audience receive videos about this brand", and a census row carries either
  // no audience sentiment at all (own posts never take Pass A's full lane) or a
  // framing sentiment read off the brand's own caption — the brand rating
  // itself. Widening share did not widen this, so the filter is explicit here
  // rather than inherited from the corpus.
  const marketVideos = videos.filter(isDiscoveredVideo)
  const marketPeriodVideos = periodVideos.filter(isDiscoveredVideo)

  await writeRunSummary({
    clientId, runId, metrics, videos: marketVideos,
    periodMetrics, periodVideos: marketPeriodVideos,
    ciSummary: d.ciSummary, executiveBrief: d.executiveBrief, sayVsHear: d.sayVsHear,
    brandVoice: shapeBrandVoice(claims, tc?.brand_keywords ?? []), period,
    ownedCensus,
  })

  return {
    competitiveInsights: c.inserted,
    marketInsights: d.marketInsights.length,
    recommendations: d.recommendations.length,
    synthesisCost: c.costUsd + d.costUsd,
  }
}
