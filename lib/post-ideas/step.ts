import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk, mapWithLimit, READ_CONCURRENCY, UUID_IN_CHUNK } from '../chunk'
import { sendAlertEmail } from '../email'
import { WHAT_THEY_SELL } from '../pages/market-frame'
import type { QuestionPost } from '../pages/own-post-touch'
import { playbookAudience, type PlaybookVideo } from '../pages/playbook'
import { rowWindow, type WindowColumns } from '../pipeline/run-bookkeeping'
import { allowTokens } from '../prose/scrub'
import { prevMonth } from '../reading/month-key'
import { ownedPosts } from '../reading/owned'
import { loadWindowReading } from '../reading/read'
import { INDUSTRY_AUDIENCE } from '../rivals'
import { callBudget, isTransient, WEEK_READ_STEP_BUDGET_MS, type CallBudget } from '../written/deadline'
import { loadDatedEvidence, loadTrackedBrands } from '../written/evidence'
import { readingMonthOf } from '../written/month'
import { judgeTheme, loadPoolThemes, POOL_MIN_VIDEOS } from '../written/pool'
import type { ParseClient } from '../written/write-model'
import { composePostIdeas, postIdeaRows, type HeldIdea, type PostIdeaDraft, type PostIdeaInsert } from './compose'
import type { IdeaScrubCounts } from './scrub'
import {
  choosePlay, isQuestionConversation, POST_IDEA_OWNED_MONTHS, questionComments, rankQuestions, untouchedQuestions, withHandles,
  type CoveredQuestion, type IdeaCandidate, type PlayVideo,
} from './select'
import { isMissingPostIdeas, POST_IDEAS_ON_CONFLICT, TABLE_POST_IDEAS } from './types'
import {
  buildPostIdeaPrompts, generatePostIdeas, POST_IDEAS_MODEL, POST_IDEAS_PROMPT_VERSION, type PostIdeasOutput,
} from './write'

// The week's post ideas, built and stored (depth v2, T13; plan decision 5).
// Two entry points, the week read's shape (lib/written/step.ts):
//
//  · `buildPostIdeas`: the run's question conversations its client's posts
//    have not touched (lib/post-ideas/select.ts), the writer's one call
//    (./write.ts), the scrub and compose (./compose.ts). Writes nothing but
//    the call's `ai_call_log` rows, and not those where `log` is false (the
//    script's dry run). A THIN week (no such conversation) makes no call;
//  · `runPostIdeasStep`: the Inngest step's body (`write-post-ideas`,
//    inngest/functions/pipeline.ts, after `write-week-read` and before
//    `write-longrun-read`). Upserts the run's rows on (run_id, rank).
//
// SILENT WHERE IT SHOULD BE. A TEST run (`isTestRun`: a rehearsal that
// gathered nothing, a capped run, `publish: false`) writes nothing and reads
// nothing: the next real run writes its own ideas, so nobody is told. No
// `post_ideas` table (`isMissingPostIdeas`: the products migration not
// applied) is a no-op that spends nothing, logged and never alerted, because
// it is every run's state until Heinrich applies it. A run that already has
// its ideas (a retry after the write, whose result Inngest did not keep) reads
// one row and spends nothing. A thin week makes no call and stores nothing.
//
// FAIL-SOFT, THE WEEK READ'S CONTRACT. A TRANSIENT failure (`isTransient`: a
// model call that timed out or was aborted, a 408, 429 or 5xx, a dropped
// connection) on any attempt but the step's last is THROWN, so Inngest retries
// the step, with nothing stored and nobody told for that attempt. On the last
// attempt, and on any other failure at once, the body never throws: it
// ALERTS THE OPERATOR ONCE, inside the step (an alert in a `.catch` beside
// `step.run` is sent again on every later step's replay), with the script to
// run. It alerts because the Content page reads the newest run that HAS ideas
// (`loadPostIdeas`), so a failed week would otherwise go on showing last
// week's ideas with nothing said; the table has no status column, so the
// alert is the record. A week whose every written idea the scrub held is the
// same: no rows, one alert naming why. Every model call is capped on the
// step's own clock (`POST_IDEAS_STEP_BUDGET_MS`, lib/written/deadline.ts) with
// no SDK retry.

/** The step's clock for its one model call, the week read's: the call ends
 *  by 250 s, the save and the alert well inside the route's 300 s. */
export const POST_IDEAS_STEP_BUDGET_MS = WEEK_READ_STEP_BUDGET_MS

/** Everything the writer is handed, read from the database: what a dry run
 *  may save and a later run reuse, so a prompt can be read before it is paid
 *  for without reading production twice. Holds comment words (the writer
 *  reads them): a saved file stays on the operator's machine, never in the
 *  repository. */
export interface PostIdeaInputs {
  clientId: string
  runId: string
  company: string
  sells: string | null
  /** The run's frozen window. */
  window: { from: string; to: string }
  /** The month the window is restated against (`readingMonthOf`). */
  month: string
  candidates: IdeaCandidate[]
  /** The workings: every question conversation on three or more category
   *  videos in the window (`isQuestionConversation`), and what became of it. */
  considered: { themeId: string; label: string; kind: string | null; dominantKind: string | null; weekVideos: number; lenientVideos: number; eligible: boolean }[]
  /** Conversations left out because the client's own posts touched them. */
  covered: CoveredQuestion[]
  /** The client's own posts the touch test read, or null where unread. */
  ownPosts: number | null
  /** The run's digit-bearing names (`allowTokens`). */
  allow: string[]
}

async function companyOf(admin: SupabaseClient, clientId: string): Promise<string> {
  const res = await admin.from('clients').select('company_name').eq('id', clientId).maybeSingle()
  if (res.error) throw new Error(`post ideas client: ${res.error.message}`)
  return ((res.data as { company_name: string | null } | null)?.company_name ?? '').trim() || 'the company'
}

/** The run's frozen window, from its row. Throws where it carries none. */
async function windowOf(admin: SupabaseClient, clientId: string, runId: string): Promise<{ from: string; to: string }> {
  const res = await admin.from('pipeline_runs').select('*').eq('client_id', clientId).eq('id', runId).maybeSingle()
  if (res.error) throw new Error(`post ideas run: ${res.error.message}`)
  if (!res.data) throw new Error(`post ideas: no run ${runId} for this client`)
  const stored = rowWindow(res.data as WindowColumns)
  if (!stored?.start || !stored.end) throw new Error(`post ideas: run ${runId} carries no window`)
  return { from: stored.start, to: stored.end }
}

const VIDEO_COLUMNS =
  'id, upload_date, platform, classified_type, hook_style, engagement_rate, duration_seconds, is_client, is_competitor, competitor_name, source, sentiment, sentiment_source, analyzed_lane'

/**
 * The market's videos on each conversation: its member insights' own videos
 * (`source_video_id`, insights belong to videos), the playbook's category
 * column only (`playbookAudience`, `owned`: never the client's posts or a
 * video naming the client, never a rival's). Id-set reads on the base tables,
 * never an embedding.
 */
async function loadQuestionVideos(admin: SupabaseClient, clientId: string, membersByTheme: ReadonlyMap<string, readonly string[]>): Promise<Map<string, PlayVideo[]>> {
  const out = new Map<string, PlayVideo[]>([...membersByTheme.keys()].map((k) => [k, []]))
  const insightIds = [...new Set([...membersByTheme.values()].flat())]
  if (insightIds.length === 0) return out
  const insightPages = await mapWithLimit(chunk(insightIds, UUID_IN_CHUNK), READ_CONCURRENCY, async (part) => {
    const res = await admin.from('audience_insights').select('id, source_video_id').eq('client_id', clientId).in('id', part)
    if (res.error) throw new Error(`post ideas insights: ${res.error.message}`)
    return (res.data ?? []) as { id: string; source_video_id: string | null }[]
  })
  const videoOf = new Map(insightPages.flat().filter((r) => r.source_video_id).map((r) => [String(r.id), String(r.source_video_id)]))
  const videoIds = [...new Set(videoOf.values())]
  const videoPages = await mapWithLimit(chunk(videoIds, UUID_IN_CHUNK), READ_CONCURRENCY, async (part) => {
    const res = await admin.from('videos').select(VIDEO_COLUMNS).eq('client_id', clientId).in('id', part)
    if (res.error) throw new Error(`post ideas videos: ${res.error.message}`)
    return (res.data ?? []) as unknown as (PlaybookVideo & PlayVideo)[]
  })
  const byId = new Map(videoPages.flat().filter((v) => playbookAudience(v, 'owned') === INDUSTRY_AUDIENCE).map((v) => [String(v.id), v]))
  for (const [themeId, members] of membersByTheme) {
    const ids = new Set(members.map((m) => videoOf.get(m)).filter((v): v is string => v != null))
    out.set(themeId, [...ids].sort().map((id) => byId.get(id)).filter((v): v is PlaybookVideo & PlayVideo => v != null))
  }
  return out
}

/** The first month the "already touched" test reads the client's posts from. */
export function ownedFrom(month: string): string {
  let m = month
  for (let i = 1; i < POST_IDEA_OWNED_MONTHS; i++) m = prevMonth(m)
  return m
}

/**
 * Everything the writer is handed, for one run. READ-ONLY. A read that fails
 * throws; the step decides what that costs.
 */
export async function loadPostIdeaInputs(admin: SupabaseClient, opts: { clientId: string; runId: string }): Promise<PostIdeaInputs> {
  const { clientId, runId } = opts
  const [company, window] = await Promise.all([companyOf(admin, clientId), windowOf(admin, clientId, runId)])
  const month = readingMonthOf(window).month
  const empty: PostIdeaInputs = {
    clientId, runId, company, sells: WHAT_THEY_SELL[clientId] ?? null, window, month,
    candidates: [], considered: [], covered: [], ownPosts: null, allow: [],
  }

  // The category's conversations in the window under this run's clustering;
  // only one on three category videos can reach three gated ones.
  const week = await loadWindowReading(admin, clientId, { from: window.from, to: window.to, runId, audiences: [INDUSTRY_AUDIENCE] })
  if (!week.themes) throw new Error('post ideas: the window reads are not applied here')
  // Every conversation, not only those filed as questions: one filed under a
  // topic is a question conversation where its comments this week mostly ask
  // (`isQuestionConversation`), which only its evidence can say. The week
  // pool reads the same.
  const raw = week.themes.filter((t) => t.audience === INDUSTRY_AUDIENCE && t.videos >= POOL_MIN_VIDEOS)
  const themes = await loadPoolThemes(admin, clientId, runId, raw)
  if (themes.length === 0) return empty

  const brands = await loadTrackedBrands(admin, clientId)
  const evidence = await loadDatedEvidence(admin, clientId, themes.flatMap((t) => t.memberIds), window, { brands })
  const judged = themes.map((t) => judgeTheme(clientId, t, evidence)).filter(isQuestionConversation)
  const ranked = rankQuestions(judged)
  const eligible = new Set(ranked.map((j) => j.theme.themeId))

  // The client's own posts of the reading month and the two before it. A read
  // that fails leaves nothing out on a guess (`untouchedQuestions`).
  let posts: QuestionPost[] | null = null
  try {
    const own = await ownedPosts({ supabase: admin, clientId }, { from: ownedFrom(month), to: window.to })
    posts = own.posts.map((p) => ({ id: p.id, topics: p.topics, upload_date: p.upload_date, video_url: p.video_url }))
  } catch (e) {
    console.warn(`[post-ideas] the client's own posts could not be read; no conversation is left out for them: ${e instanceof Error ? e.message : String(e)}`)
  }
  const { kept, covered } = untouchedQuestions(ranked, posts)

  const videos = await loadQuestionVideos(admin, clientId, new Map(kept.map(({ judgement: j }) => [j.theme.themeId, j.theme.memberIds])))
  const candidates = withHandles(kept.map(({ judgement: j, touch }) => ({
    themeId: j.theme.themeId,
    label: j.theme.label,
    description: j.theme.description,
    weekVideos: j.theme.weekVideos,
    lenientVideos: j.lenientVideos,
    comments: questionComments(clientId, j.theme, evidence),
    play: choosePlay(videos.get(j.theme.themeId) ?? [], month),
    touch,
  })))
  return {
    ...empty,
    candidates,
    considered: judged.map((j) => ({ themeId: j.theme.themeId, label: j.theme.label, kind: j.theme.kind, dominantKind: j.dominantKind, weekVideos: j.theme.weekVideos, lenientVideos: j.lenientVideos, eligible: eligible.has(j.theme.themeId) }))
      .sort((a, b) => b.lenientVideos - a.lenientVideos || b.weekVideos - a.weekVideos || a.themeId.localeCompare(b.themeId)),
    covered,
    ownPosts: posts?.length ?? null,
    allow: allowTokens([
      ...candidates.flatMap((c) => [c.label, c.description ?? '']),
      ...candidates.flatMap((c) => c.comments.map((x) => x.text)),
    ]),
  }
}

export type PostIdeasStatus = 'ready' | 'thin' | 'held'

export interface BuiltPostIdeas {
  /** `ready`: ideas to store. `thin`: no conversation to write about, no call.
   *  `held`: the writer ran and the scrub held every idea. */
  status: PostIdeasStatus
  ideas: PostIdeaDraft[]
  held: HeldIdea[]
  rows: PostIdeaInsert[]
  called: boolean
  costUsd: number
  scrub: IdeaScrubCounts | null
  /** The writer's output before the scrub, for the script's workings. */
  raw: PostIdeasOutput | null
  inputs: PostIdeaInputs
}

/**
 * Everything after the call, from the writer's own output: scrub, compose and
 * the rows. Pure and deterministic, so a saved dry run composes again under
 * changed code with no call (scripts/post-ideas.ts --recompose).
 */
export function finishPostIdeas(inputs: PostIdeaInputs, raw: PostIdeasOutput, costUsd: number): BuiltPostIdeas {
  const composed = composePostIdeas(inputs.candidates, raw, { allow: inputs.allow })
  const rows = postIdeaRows({
    clientId: inputs.clientId, runId: inputs.runId, window: inputs.window, ideas: composed.ideas,
    model: POST_IDEAS_MODEL, promptVersion: POST_IDEAS_PROMPT_VERSION,
  })
  return {
    status: composed.ideas.length > 0 ? 'ready' : 'held',
    ideas: composed.ideas, held: composed.held, rows, called: true,
    costUsd: Math.round(costUsd * 10_000) / 10_000, scrub: composed.scrub, raw, inputs,
  }
}

export async function buildPostIdeas(
  admin: SupabaseClient,
  opts: {
    clientId: string; runId: string; log: boolean; client?: ParseClient; inputs?: PostIdeaInputs
    /** The step's time for its call (lib/written/deadline.ts). Absent (the
     *  script), the call keeps its cap and no SDK retry. */
    budget?: CallBudget
  },
): Promise<BuiltPostIdeas> {
  const inputs = opts.inputs ?? (await loadPostIdeaInputs(admin, opts))
  if (inputs.candidates.length === 0) {
    return { status: 'thin', ideas: [], held: [], rows: [], called: false, costUsd: 0, scrub: null, raw: null, inputs }
  }
  const prompts = buildPostIdeaPrompts({ company: inputs.company, sells: inputs.sells, candidates: inputs.candidates })
  const call = await generatePostIdeas(admin, { clientId: opts.clientId, runId: opts.runId, prompts, log: opts.log, client: opts.client, budget: opts.budget })
  return finishPostIdeas(inputs, call.output, call.costUsd)
}

// ---- The store -------------------------------------------------------------------------

/** How many ideas the run already has; null where the table is not there. */
export async function existingPostIdeas(admin: SupabaseClient, clientId: string, runId: string): Promise<number | null> {
  // Rows, not a HEAD count: a HEAD request's error carries no body, and
  // `isMissingPostIdeas` reads the table's name in the message.
  const { data, error } = await admin.from(TABLE_POST_IDEAS).select('id').eq('client_id', clientId).eq('run_id', runId).limit(3)
  if (error) {
    if (isMissingPostIdeas(error)) return null
    throw new Error(`${TABLE_POST_IDEAS}: ${error.message}`)
  }
  return (data ?? []).length
}

/** The run's ideas, upserted on (run_id, rank) in one statement. */
export async function savePostIdeas(admin: SupabaseClient, rows: readonly PostIdeaInsert[]): Promise<void> {
  if (rows.length === 0) return
  const { error } = await admin.from(TABLE_POST_IDEAS).upsert(rows as PostIdeaInsert[], { onConflict: POST_IDEAS_ON_CONFLICT })
  if (error) throw new Error(`${TABLE_POST_IDEAS}: ${error.message}`)
}

// ---- The step --------------------------------------------------------------------------

export interface PostIdeasStepResult {
  status: PostIdeasStatus | 'failed' | 'test_run' | 'missing_migration' | 'exists'
  ideas: number
  held: number
  costUsd: number
  error?: string
}

/** What the step needs from the world, so a test can stand them in. */
export interface PostIdeasStepDeps {
  existing: (admin: SupabaseClient, clientId: string, runId: string) => Promise<number | null>
  build: typeof buildPostIdeas
  save: (admin: SupabaseClient, rows: readonly PostIdeaInsert[]) => Promise<void>
  alert: (subject: string, text: string) => Promise<{ sent: boolean }>
}

const DEFAULT_DEPS: PostIdeasStepDeps = { existing: existingPostIdeas, build: buildPostIdeas, save: savePostIdeas, alert: sendAlertEmail }

const FALLBACK = (clientId: string, runId: string) =>
  `Fallback, once the cause is fixed: node --env-file=.env.local --import tsx scripts/post-ideas.ts --client ${clientId} --run ${runId} --dry-run, then again with --write.`

/**
 * The `write-post-ideas` step's body. Every outcome is a result; a failure
 * and a week whose every idea was held are each told to the operator once.
 * A transient failure before the step's last attempt (`lastAttempt: false`)
 * is thrown instead, so Inngest retries the step. `lastAttempt` absent is the
 * last attempt: never throws.
 */
export async function runPostIdeasStep(
  admin: SupabaseClient,
  opts: {
    clientId: string; runId: string; company?: string
    /** `isTestRun` of the run (lib/schedules/due.ts): writes nothing. */
    testRun: boolean
    /** Is this the step's last attempt? The pipeline passes `attempt >=
     *  maxAttempts - 1`, as the week read does. */
    lastAttempt?: boolean
  },
  deps: Partial<PostIdeasStepDeps> = {},
): Promise<PostIdeasStepResult> {
  const d = { ...DEFAULT_DEPS, ...deps }
  const lastAttempt = opts.lastAttempt ?? true
  if (opts.testRun) {
    console.log('[write-post-ideas] a test run: no post ideas are written')
    return { status: 'test_run', ideas: 0, held: 0, costUsd: 0 }
  }
  // THE STEP'S CLOCK STARTS HERE: its one call is capped and done by 250 s.
  const startedAt = Date.now()
  let who = opts.company ?? opts.clientId
  try {
    const existing = await d.existing(admin, opts.clientId, opts.runId)
    if (existing === null) {
      console.warn('[write-post-ideas] post_ideas is not in this database yet; nothing was written or spent')
      return { status: 'missing_migration', ideas: 0, held: 0, costUsd: 0 }
    }
    if (existing > 0) {
      console.log(`[write-post-ideas] run ${opts.runId} already has its ${existing} idea(s); nothing was written or spent`)
      return { status: 'exists', ideas: existing, held: 0, costUsd: 0 }
    }
    const built = await d.build(admin, { clientId: opts.clientId, runId: opts.runId, log: true, budget: callBudget({ startedAt, budgetMs: POST_IDEAS_STEP_BUDGET_MS }) })
    who = opts.company ?? built.inputs.company
    if (built.status === 'thin') {
      console.log('[write-post-ideas] thin: no question conversation the client has not answered; no call, nothing stored')
      return { status: 'thin', ideas: 0, held: 0, costUsd: 0 }
    }
    await d.save(admin, built.rows)
    const result: PostIdeasStepResult = { status: built.status, ideas: built.ideas.length, held: built.held.length, costUsd: built.costUsd }
    console.log(`[write-post-ideas] ${built.status}: ${result.ideas} idea(s), ${result.held} held, $${result.costUsd}`)
    if (built.status === 'held') {
      await d.alert(
        `Verbatim post ideas empty: ${who}`,
        `The writer ran on run ${opts.runId} and every idea it wrote was held, so no post ideas are stored for this week and the Content page goes on showing the last ones.\n\nHeld:\n${built.held.map((h) => `- ${h.question} (${h.label}): ${h.reason}`).join('\n') || '- nothing written'}\n\nClient: ${who} (${opts.clientId})\n\n${FALLBACK(opts.clientId, opts.runId)}`,
      ).catch(() => ({ sent: false }))
    }
    return result
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (!lastAttempt && isTransient(e)) {
      console.warn(`[write-post-ideas] transient failure, the step is retried: ${message}`)
      throw e
    }
    console.error(`[write-post-ideas] failed: ${message}`)
    await d.alert(
      `Verbatim post ideas failed: ${who}`,
      `The week's post ideas for run ${opts.runId} could not be written. The run itself is unaffected; the Content page goes on showing the last ideas stored.\n\nError: ${message}\n\nClient: ${who} (${opts.clientId})\n\n${FALLBACK(opts.clientId, opts.runId)}`,
    ).catch(() => ({ sent: false }))
    return { status: 'failed', ideas: 0, held: 0, costUsd: 0, error: message }
  }
}
