/**
 * THE STEP BUDGET (9 Nov 2026). Inngest ends a function run at its 1,000th
 * step ("InngestErrFunctionOverflowed: The function run exceeded the step
 * limit of 1000 steps"), and a run it ends that way runs nothing after: no
 * themes, no synthesis, no week read, no close-run, no report.
 *
 * Sealand's 8 Nov update (`c5690bb0`) ended that way inside Pass A, after
 * gathering 1,440 videos. Most of its steps were one batch each of a
 * per-video fan-out, and every one of those grows with the week's videos:
 * comment scrapes (3 videos a step, and every kept YouTube video is one, since
 * YouTube has no comment threshold), transcripts (8), cover text (8),
 * classification (25), the transcript backfill, translation (4) and the OCR
 * backfill. Sealand's 11 Oct update, 1,076 videos, was the last to go from
 * start to end in one function run; at 1,440 the run needed about 1,100.
 *
 * ONE STEP A WAVE, NOT ONE A BATCH. Those seven fan-outs already ran their
 * batches in waves of N at once (`*_PARALLEL`), each batch sized to finish
 * well inside Vercel's 300 s on its own. A wave is now ONE step that runs its
 * N batches together, with the same arguments, the same batch numbers and the
 * same concurrency, so it lasts as long as its slowest batch did as a step of
 * its own (the Pass B precedent, `pass-b:${w}-of-${n}`, 4 Oct). What the run
 * writes is the same; what changes is the number of steps, divided by N.
 *
 * A BATCH THAT FAILS OR RUNS LATE INSIDE ITS WAVE GETS ITS OWN STEP AFTER IT,
 * under the id it had as a step of its own, with Inngest's retries and the
 * fallback its `.catch` always had. A wave never throws for one batch and
 * never outlives WAVE_DEADLINE_MS, so a slow batch costs its siblings nothing;
 * a wave that fails as a whole (out of retries) sends every batch of it to its
 * own step. The two batch kinds that spent money again when run again,
 * comments and the transcript backfill, skip what this run already did
 * (`refsStillToScrape`, `backfillStillDue`), as transcribe, OCR, translate and
 * classify already did. So a failing batch has one attempt more than before,
 * and nothing else is different.
 *
 * `pipelineSteps` counts what a run needs from its fan-out widths, the guard
 * `step-budget.test.ts` holds it to every step id in the source, the run counts
 * its own steps (`countSteps`) and warns at STEP_BUDGET_WARN_AT, and Pass A,
 * the one per-video fan-out still one step a batch, is held to the room left
 * (`passABatchRoom`).
 */

import { BACKFILL_PARALLEL, OCR_PARALLEL, PASS_B_PARALLEL, TRANSCRIBE_PARALLEL, TRANSLATE_PARALLEL } from '../config'

/** Inngest's ceiling on the steps of one function run. */
export const INNGEST_STEP_LIMIT = 1000

/** Where a run that finished warns (`step-budget`, a stale-data warning, so
 *  the run's alert goes out). */
export const STEP_BUDGET_WARN_AT = 900

/** Steps a run takes after close-run's own: settle-apify-usage,
 *  write-run-costs, prune-stale-analysis, request-report and alert-partial.
 *  The warning is noted before close-run, which is the step that writes it. */
export const STEPS_AFTER_CLOSE = 5

// ── Fan-out widths. Moved here from inngest/functions/pipeline.ts (9 Nov),
//    unchanged, so the step count and the pipeline read one number each. ──

/** Batch size for the Pass A fan-out. Sized from the 2026-07-03 live failure:
 *  at comment_depth 100 a call runs ~10-20s (batches of 40 timed out at ~15-29
 *  calls, three attempts straight), so 12 ≈ 2-4 min under the 300s cap. */
export const PASS_A_BATCH = 12

/** Videos per comment-scrape batch. Each video is its own Apify actor run
 *  (~20-90s incl. actor startup — slower since comment_depth went 25→100), so
 *  3 stays inside the 300s Hobby cap even when every actor runs slow. */
export const COMMENT_BATCH = 3

/** Keyword-search steps dispatched concurrently per wave. Search actors are
 *  heavier than comment actors (a full hashtag/keyword crawl each), so the
 *  wave stays small; a platform's whole keyword set is 5-10 tasks. */
export const SEARCH_PARALLEL = 3

/** Comment-scrape batches per wave, and since 9 Nov per wave STEP. Each batch
 *  runs its COMMENT_BATCH videos sequentially (one actor at a time), so a wave
 *  holds at most COMMENT_PARALLEL concurrent Apify jobs — far under the
 *  Starter plan's 32-concurrent-jobs cap even stacked on a search or
 *  transcribe wave. */
export const COMMENT_PARALLEL = 4

/** Pass A batches dispatched concurrently per wave. Step IDs are unchanged by
 *  this (still pass-a:N-of-M over the same memoized plan), so a mid-run deploy
 *  replays completed batches instantly and fans out only the remainder. */
export const PASS_A_PARALLEL = 5

/** Classify-meta batches per wave, and since 9 Nov per wave step — 25-video
 *  metadata-only calls run ~10-30s, so 4 abreast stays far under the step cap. */
export const CLASSIFY_PARALLEL = 4

/** Bucket theme steps dispatched concurrently per wave. Each step carries one
 *  gpt-5.4 reasoning=medium merge call (the heavy part, ~95s total across
 *  buckets at run-1 scale) plus a cheap embeddings call, so the wave stays
 *  small for OpenAI headroom; a run has ~3-6 entity buckets. */
export const THEMES_PARALLEL = 2

// ── The wave ─────────────────────────────────────────────────────────────

/**
 * How long a wave's batches may take inside the wave's step (9 Nov, the fresh
 * review). Past it a batch is left to run as a step of its own, so one slow
 * batch never takes its wave to Vercel's 300 s, where the whole wave would be
 * killed and retried. MEASURED on 8 Nov's two updates (Sealand `c5690bb0`,
 * Össur `0c28ac74`; apify_runs and ai_call_log, the slowest batch of each
 * family): comments 129 s (Reddit; p95 114), transcribe 77 s, cover text 23 s,
 * classify 15 s, translate 18 s, the transcript backfill 227 s (YouTube; p95
 * 191). 240 s clears every one of them and leaves 60 s of the 300 for the
 * replay before the step and the answer after it.
 */
export const WAVE_DEADLINE_MS = 240_000

/** One batch's outcome inside its wave step: its value, or its error's
 *  message (a step's return is JSON, so never the Error itself). `late`: it
 *  had not finished by the wave's deadline. */
export type MemberOutcome<R> = { ok: true; value: R } | { ok: false; error: string; late?: true }

/**
 * The batches of one wave, together, inside the wave's step: each one's value,
 * or the message it failed with, or `late` where it had not finished by
 * `deadlineMs`. NEVER THROWS for a batch, so a wave that one batch failed is
 * not retried and its other batches never run twice; the pipeline gives each
 * failed or late batch a step of its own after the wave. At the deadline the
 * `signal` aborts, so a late batch stops STARTING work (a comment batch
 * starts no further actor); what it already started finishes and is written,
 * and its own step skips it (`refsStillToScrape`, `backfillStillDue`).
 * NOTHING ABORTS A PROMISE: a late batch runs on in the instance after its
 * wave's step returns, alongside its own step. So a writer whose write is not
 * idempotent stops writing at the signal (transcribe, cover text: a late
 * `failed` would land over its own step's `ok`); comments upsert on their key
 * and a backfill write never lands on a settled transcript.
 */
export async function settleMembers<T, R>(
  items: readonly T[],
  run: (item: T, j: number, signal: AbortSignal) => Promise<R>,
  deadlineMs: number = WAVE_DEADLINE_MS,
): Promise<MemberOutcome<R>[]> {
  if (!items.length) return []
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<'late'>((resolve) => {
    timer = setTimeout(() => { controller.abort(); resolve('late') }, deadlineMs)
  })
  try {
    return await Promise.all(items.map(async (item, j): Promise<MemberOutcome<R>> => {
      const settled = Promise.resolve()
        .then(() => run(item, j, controller.signal))
        .then(
          (value): MemberOutcome<R> => ({ ok: true, value }),
          (e: unknown): MemberOutcome<R> => ({ ok: false, error: e instanceof Error ? e.message : String(e) }),
        )
      const first = await Promise.race([settled, late])
      return first === 'late' ? { ok: false, error: `not finished by the wave's ${deadlineMs / 1000} s deadline`, late: true } : first
    }))
  } finally {
    clearTimeout(timer)
  }
}

/** The wave steps `members` batches take, `parallel` to a step. */
export function waveCount(members: number, parallel: number): number {
  return members > 0 ? Math.ceil(members / parallel) : 0
}

/** The one step tool `fanOut` uses (Inngest's `step`, counted). */
export interface StepRunner {
  run(id: string, fn: () => Promise<unknown>): Promise<unknown>
}

/** A fan-out, as `fanOut` runs it. */
export interface FanOut<T, R> {
  /** The wave's step id: its number (from 1) and the wave count. */
  waveId: (wave: number, waves: number) => string
  /** A batch's own step id, as it was written before the waves: `w` is its
   *  wave's first batch index (from 0) and `j` its place in the wave, so
   *  `${w + j + 1}` is the batch number it always had. */
  memberId: (w: number, j: number) => string
  items: readonly T[]
  parallel: number
  /** One batch. `signal` is its wave's deadline; a batch run on its own has none. */
  run: (item: T, i: number, signal?: AbortSignal) => Promise<R>
  /** The batch's own step out of retries: its old `.catch`. */
  fallback: (item: T, i: number, e: unknown) => R
  deadlineMs?: number
}

/**
 * ONE STEP A WAVE (9 Nov). A fan-out's wave of batches is ONE step, `waveId`,
 * and each batch in it runs with the arguments, the batch number and the
 * concurrency it had as a step of its own, so the wave lasts as long as its
 * slowest batch did, and no longer than `WAVE_DEADLINE_MS`. A wave never throws
 * for one batch: a batch that failed or ran late inside its wave, or every
 * batch of a wave that failed as a whole, then runs as a step of its own under
 * its old id, `memberId`, with Inngest's retries and the fallback its old
 * `.catch` gave. The results come back in batch order.
 */
export async function fanOut<T, R>(step: StepRunner, f: FanOut<T, R>): Promise<R[]> {
  const out: R[] = []
  const waves = waveCount(f.items.length, f.parallel)
  for (let w = 0; w < waves; w++) {
    const first = w * f.parallel
    const slice = f.items.slice(first, first + f.parallel)
    const id = f.waveId(w + 1, waves)
    const outcomes = await step
      .run(id, () => settleMembers(slice, (item, j, signal) => f.run(item, first + j, signal), f.deadlineMs))
      .then((r) => r as MemberOutcome<R>[])
      .catch((e: unknown) => {
        console.error(`[${id}] out of retries, so each of its batches runs as a step of its own: ${e instanceof Error ? e.message : String(e)}`)
        return null
      })
    out.push(...await Promise.all(slice.map((item, j): Promise<R> => {
      const i = first + j
      const outcome = outcomes?.[j]
      if (outcome?.ok) return Promise.resolve(outcome.value)
      if (outcome) console.warn(`[${f.memberId(first, j)}] ${outcome.late ? 'ran late' : 'failed'} inside ${id}, so it runs as a step of its own: ${outcome.error}`)
      return step.run(f.memberId(first, j), () => f.run(item, i))
        .then((r) => r as R)
        .catch((e: unknown) => f.fallback(item, i, e))
    })))
  }
  return out
}

// ── Pass A's room ────────────────────────────────────────────────────────

/**
 * The steps the run can take after Pass A, at most: translate-quotes (its cap,
 * 15 batches, and its plan), embed-insights, subject membership (8 subjects
 * and its plan), cross-reference, themes (15 buckets and its plan), Pass B
 * (60 chunks in waves of 6, the join, persist-themes), the trim, segments (10
 * batches), comparability (10 tasks), lens, brand and product readings (4
 * months each and their plans), the twelve close-out reads, the briefs on a
 * month-closing run (its plan, 4 research waves, ideas, 4 writers, compose)
 * and close-run with the five after it: 122, held at 150.
 */
export const STEPS_AFTER_PASS_A = 150

/**
 * How many Pass A batches the run can still take, counted where Pass A
 * starts (9 Nov). PASS A IS STILL ONE STEP A BATCH: a batch takes 2 to 4
 * minutes, so a wave of five would run into the wave's deadline and cut
 * analyses in half. It is the one per-video fan-out with no cap, and a Pass A
 * prompt bump or `forcePassA` reads the whole corpus (Sealand at most 4,762
 * eligible videos on 9 Nov, 397 batches). So the step budget bounds it here:
 * the batches past the room wait for the next update (a stale-data warning,
 * `pass-a-deferred`), richest first kept, rather than the run dying at its
 * 1,000th step with nothing published. PURE.
 */
export function passABatchRoom(stepsSoFar: number): number {
  return Math.max(0, INNGEST_STEP_LIMIT - stepsSoFar - STEPS_AFTER_PASS_A)
}

// ── The run's own count ──────────────────────────────────────────────────

/** The step tools that make a step (the ones the pipeline uses, and the rest
 *  of Inngest's that would). */
const STEP_TOOLS = new Set(['run', 'sendEvent', 'sleep', 'sleepUntil', 'waitForEvent', 'invoke'])

/**
 * The function's `step`, counting every step it makes. The body runs again
 * from the top at every step boundary and makes the same calls in the same
 * order, memoised or not, so at any line `count()` is the number of steps the
 * run has made by then, the same on every replay.
 */
export function countSteps<S extends object>(step: S): { step: S; count: () => number } {
  let made = 0
  const counted = new Proxy(step, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown
      if (typeof prop !== 'string' || !STEP_TOOLS.has(prop) || typeof value !== 'function') return value
      return (...args: unknown[]) => {
        made++
        return (value as (...a: unknown[]) => unknown).apply(target, args)
      }
    },
  })
  return { step: counted, count: () => made }
}

/** The warning's cause when a finished run came within STEP_BUDGET_WARN_AT
 *  of the limit; null under it. PURE. */
export function stepBudgetCause(stepsBeforeClose: number): string | null {
  const total = stepsBeforeClose + 1 + STEPS_AFTER_CLOSE
  if (total < STEP_BUDGET_WARN_AT) return null
  return `${total} of the ${INNGEST_STEP_LIMIT} steps a run may take, the warning at ${STEP_BUDGET_WARN_AT}`
}

// ── The count from the widths ────────────────────────────────────────────

/** One platform's widths in the gather loop. */
export interface PlatformWidths {
  /** Keyword searches planned (one step each). */
  searches: number
  /** The gate's comment refs (fresh eligible videos and growth re-checks). */
  commentRefs: number
  /** Own and rival accounts read on this platform (one owned-posts step each). */
  ownedAccounts: number
  /** owned-comments steps across those accounts (COMMENT_BATCH refs each). */
  ownedCommentSteps: number
  /** Transcribe batches (TRANSCRIBE_BATCH videos each). */
  transcribeBatches: number
  /** Gather-time cover-text batches (OCR_BATCH videos each). */
  ocrBatches: number
}

/** What a run fans out to: the widths every loop of steps runs over. */
export interface RunWidths {
  /** An analysis-only resume: no search, no gather, no own-posts census. */
  skipGather?: boolean
  platforms: PlatformWidths[]
  classifyBatches: number
  transcriptBackfillBatches: number
  translateBatches: number
  ocrBackfillBatches: number
  passABatches: number
  quoteBatches: number
  subjects: number
  themeBuckets: number
  passBChunks: number
  segmentBatches: number
  comparabilityTasks: number
  lensMonths: number
  brandMonths: number
  productMonths: number
  /** Research waves on a run that closes a month; null on any other run,
   *  which runs plan-briefs alone. */
  briefWaves: number | null
  /** Batches that failed inside their wave and took a step of their own. */
  recoveredBatches?: number
}

/** 'waves' is the pipeline since 9 Nov; 'batches' is one step a batch, the
 *  pipeline Sealand's 8 Nov update ran on. */
export type StepShape = 'waves' | 'batches'

export interface StepCount {
  total: number
  /** Each stage's steps, in source order. */
  stages: { stage: string; steps: number }[]
}

/**
 * The steps a run takes, from its widths. AN UPPER BOUND: every conditional
 * step is counted as though its condition held (discover-subreddits, the
 * replans, consumer-profile, ask-reevaluate, alert-partial). Mirrors
 * inngest/functions/pipeline.ts stage by stage; `STEP_FAMILIES` names every id
 * it counts and the guard test holds that list to the source. PURE.
 */
export function pipelineSteps(w: RunWidths, shape: StepShape = 'waves'): StepCount {
  const parallel = {
    comments: COMMENT_PARALLEL, transcribe: TRANSCRIBE_PARALLEL, ocr: OCR_PARALLEL, classify: CLASSIFY_PARALLEL,
    backfill: BACKFILL_PARALLEL, translate: TRANSLATE_PARALLEL,
  }
  const fan = (members: number, p: number) => (shape === 'waves' ? waveCount(members, p) : members)
  const stages: { stage: string; steps: number }[] = []
  const add = (stage: string, steps: number) => stages.push({ stage, steps })
  const gather = !w.skipGather

  add('open', 1 + 1 + (gather ? 1 + 1 + 1 : 0)) // open-run, gather-news, discover-subreddits, plan-gather, plan-owned
  if (gather) {
    for (const p of w.platforms) {
      add('search', p.searches)
      add('gate', 1)
      add('comments', fan(Math.ceil(p.commentRefs / COMMENT_BATCH), parallel.comments))
      add('owned', p.ownedAccounts + p.ownedCommentSteps)
      add('transcribe', 1 + fan(p.transcribeBatches, parallel.transcribe))
      add('ocr', 1 + fan(p.ocrBatches, parallel.ocr))
    }
  } else {
    add('count-corpus', 1)
  }
  add('classify', 1 + fan(w.classifyBatches, parallel.classify))
  add('plan-pass-a', 1)
  add('transcript-backfill', 1 + fan(w.transcriptBackfillBatches, parallel.backfill) + 1)
  add('translate', 1 + fan(w.translateBatches, parallel.translate) + 1)
  add('ocr-backfill', 1 + fan(w.ocrBackfillBatches, parallel.ocr) + 1)
  add('pass-a', w.passABatches)
  add('translate-quotes', 1 + w.quoteBatches)
  add('embed-insights', 1)
  add('subject-membership', 1 + w.subjects)
  add('cross-reference', 1)
  add('themes', 1 + w.themeBuckets)
  add('pass-b', Math.ceil(w.passBChunks / PASS_B_PARALLEL) + 1 + 1) // waves, pass-b, persist-themes
  add('trim-stale-memberships', 1)
  add('segment-videos', 1 + w.segmentBatches)
  add('comparability', 1 + w.comparabilityTasks)
  add('lens-readings', 1 + w.lensMonths)
  add('brand-readings', 1 + w.brandMonths)
  add('product-readings', 1 + w.productMonths)
  // freeze-months, anomaly-check, owned-events, synthesize, keyword-attribution,
  // keyword-discovery, consumer-profile, ask-reevaluate, write-week-read,
  // write-subject-reads, write-post-ideas, write-longrun-read
  add('close-out reads', 12)
  add('briefs', 1 + (w.briefWaves == null ? 0 : w.briefWaves + 1 + 4 + 1))
  add('close', 1 + STEPS_AFTER_CLOSE)
  if (w.recoveredBatches) add('recovered batches', w.recoveredBatches)
  return { total: stages.reduce((n, s) => n + s.steps, 0), stages }
}

/**
 * Every step-id family of inngest/functions/pipeline.ts, as the guard test
 * reads them from the source (the id with each `${…}` and searchStepId(task)
 * read as `*`), each one counted above. A new id fails the guard until it is
 * counted here and in `pipelineSteps`.
 */
export const STEP_FAMILIES: readonly string[] = [
  'open-run', 'alert-skipped', 'gather-news', 'discover-subreddits', 'plan-gather', 'plan-owned',
  'search', 'gate:*', 'comments-wave:*:*-of-*', 'comments:*:*', 'owned-posts:*', 'owned-comments:*:*',
  'plan-transcribe:*', 'transcribe-wave:*:*-of-*', 'transcribe:*:*-of-*', 'plan-ocr:*', 'ocr-wave:*:*-of-*', 'ocr:*:*-of-*',
  'count-corpus', 'mark-failed',
  'plan-classify', 'classify-wave:*-of-*', 'classify:*-of-*',
  'plan-pass-a',
  'plan-transcript-backfill', 'transcript-backfill-wave:*-of-*', 'transcript-backfill:*-of-*', 'replan-pass-a',
  'plan-translate', 'translate-wave:*-of-*', 'translate:*-of-*', 'replan-pass-a-translated',
  'plan-ocr-backfill', 'ocr-backfill-wave:*-of-*', 'ocr-backfill:*-of-*', 'replan-pass-a-ocr',
  'pass-a:*-of-*',
  'plan-translate-quotes', 'translate-quotes:*-of-*',
  'embed-insights', 'plan-subject-membership', 'subject-membership:*-of-*', 'cross-reference',
  'plan-themes', 'themes:*', 'pass-b:*-of-*', 'pass-b', 'persist-themes', 'trim-stale-memberships',
  'plan-segment-videos', 'segment-videos:*-of-*', 'plan-comparability', 'comparability:*-of-*',
  'plan-lens-readings', 'lens-readings:*-of-*', 'plan-brand-readings', 'brand-readings:*-of-*',
  'plan-product-readings', 'product-readings:*-of-*',
  'freeze-months', 'anomaly-check', 'owned-events', 'synthesize', 'keyword-attribution', 'keyword-discovery',
  'consumer-profile', 'ask-reevaluate', 'write-week-read', 'write-subject-reads', 'write-post-ideas', 'write-longrun-read',
  'plan-briefs', 'briefs:research-*-of-*', 'briefs:ideas', 'briefs:write-*', 'briefs:compose',
  'close-run', 'settle-apify-usage', 'write-run-costs', 'prune-stale-analysis', 'request-report', 'alert-partial',
]
