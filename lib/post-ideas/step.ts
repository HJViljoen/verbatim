import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk, mapWithLimit, READ_CONCURRENCY, UUID_IN_CHUNK } from '../chunk'
import { sendAlertEmail } from '../email'
import { WHAT_THEY_SELL } from '../pages/market-frame'
import type { QuestionPost } from '../pages/own-post-touch'
import { playbookAudience, type PlaybookVideo } from '../pages/playbook'
import { rowWindow, type WindowColumns } from '../pipeline/run-bookkeeping'
import { POST_IDEAS_BUDGET_USD, POST_IDEAS_RUN_MARGIN_USD, postIdeasEnabled, RUN_MODEL_BUDGET_USD } from '../config'
import { runSpendSoFar } from '../pipeline/run-costs'
import { selectAll } from '../supabase-admin'
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
  choosePlay, clearsEvidenceFloor, ideasReadWindow, isQuestionConversation, POST_IDEA_CANDIDATES, POST_IDEA_OWNED_MONTHS, questionComments, rankQuestions, untouchedQuestions, withHandles,
  type CoveredQuestion, type IdeaCandidate, type PlayVideo,
} from './select'
import { isMissingPostIdeas, POST_IDEAS_ON_CONFLICT, TABLE_POST_IDEAS } from './types'
import {
  buildPostIdeaPrompts, generatePostIdeas, POST_IDEAS_MODEL, POST_IDEAS_PASS, POST_IDEAS_PROMPT_VERSION, PostIdeasBudgetError, PostIdeasWriteError, type PostIdeasOutput,
} from './write'

// The week's post ideas, built and stored (depth v2, T13; plan decision 5).
// Written on every run, they READ FOUR WEEKS: the question comments of the 28
// days ending at the run's window end (`ideasReadWindow`, lib/post-ideas/
// select.ts; Heinrich, 13 Oct), stored on each row as `read_start` /
// `read_end`. Two entry points, the week read's shape (lib/written/step.ts):
//
//  · `buildPostIdeas`: the question conversations of the ideas' window that
//    the client's posts have not touched (lib/post-ideas/select.ts), the writer's one call
//    (./write.ts), the scrub and compose (./compose.ts). Writes nothing but
//    the call's `ai_call_log` rows, and not those where `log` is false (the
//    script's dry run). A THIN week (no such conversation) makes no call;
//  · `runPostIdeasStep`: the Inngest step's body (`write-post-ideas`,
//    inngest/functions/pipeline.ts, after `write-week-read` and before
//    `write-longrun-read`). Upserts the run's rows on (run_id, rank).
//
// SILENT WHERE IT SHOULD BE. A TEST run (`isTestRun`: a rehearsal that
// gathered nothing, a capped run, `publish: false`) writes nothing and reads
// nothing: the next real run writes its own ideas, so nobody is told. A
// tenant switched off (`postIdeasEnabled`, lib/config.ts: OFF unless
// `POST_IDEAS_ENABLED` turns it on, which it does for Sealand and Össur since
// 13 Oct; and `POST_IDEAS=0` everywhere or its id in `POST_IDEAS_OFF` as
// emergency off-switches) is the same. No
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
//
// A DOLLAR CAP AND THE RUN'S HEADROOM (Phase 4 fix round; the briefs' rule,
// lib/reports/briefs/step.ts `briefHeadroom`). Before anything is called the
// step reads the run's model spend (`runSpendSoFar`) and starts only where the
// run has `POST_IDEAS_BUDGET_USD` plus `POST_IDEAS_RUN_MARGIN_USD` left under
// `RUN_MODEL_BUDGET_USD` (`postIdeasHeadroom`), so it can never trip the run's
// own budget stop; the call is then held to what is left (`postIdeasRoom`, at
// most the cap), attempt by attempt (lib/post-ideas/write.ts). Either refusal
// stops FAIL-SOFT: no call, no rows, status `over_budget`, one alert.
//
// THE CAP IS PER RUN, NOT PER ATTEMPT (the fix round's check): each Inngest
// retry of the step starts a fresh call, so the step also reads what this
// run's earlier attempts already spent on post ideas (`postIdeasSpendSoFar`:
// `ai_call_log`, pass `post_ideas`, every call logged as it returns) and holds
// the call to the cap less that. A refusal reports what the attempt really
// spent (an unparsed answer is paid for), never 0.

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
  /** The window the ideas read their question comments from: the four weeks
   *  ending at `window.to` (`ideasReadWindow`). Every count the candidates
   *  carry is over it. */
  read: { from: string; to: string }
  /** The month the run's window is restated against (`readingMonthOf`):
   *  where the client's own posts are read from (`ownedFrom`). */
  month: string
  candidates: IdeaCandidate[]
  /** The workings: every question conversation on three or more category
   *  videos in the ideas' window (`isQuestionConversation`), and what became
   *  of it. */
  considered: {
    themeId: string; label: string; kind: string | null; dominantKind: string | null; weekVideos: number; lenientVideos: number; eligible: boolean
    /** Its comments that ask, as sent (`questionComments`); null where it was
     *  not read that far (not eligible, or touched by the client's posts). */
    asks?: number | null
  }[]
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
  // THE IDEAS READ FOUR WEEKS, dated by the comment: the 28 days ending at
  // the run's window end, whatever the run's own window spans.
  const read = ideasReadWindow(window)
  const empty: PostIdeaInputs = {
    clientId, runId, company, sells: WHAT_THEY_SELL[clientId] ?? null, window, read, month,
    candidates: [], considered: [], covered: [], ownPosts: null, allow: [],
  }

  // The category's conversations in the ideas' window under this run's
  // clustering (`window_theme_readings`, an arbitrary window, never a sum of
  // weeks); only one on three category videos can reach three gated ones.
  const reading = await loadWindowReading(admin, clientId, { from: read.from, to: read.to, runId, audiences: [INDUSTRY_AUDIENCE] })
  if (!reading.themes) throw new Error('post ideas: the window reads are not applied here')
  // Every conversation, not only those filed as questions: one filed under a
  // topic is a question conversation where its comments in the window mostly
  // ask (`isQuestionConversation`), which only its evidence can say. The week
  // pool reads the same.
  const raw = reading.themes.filter((t) => t.audience === INDUSTRY_AUDIENCE && t.videos >= POOL_MIN_VIDEOS)
  const themes = await loadPoolThemes(admin, clientId, runId, raw)
  if (themes.length === 0) return empty

  const brands = await loadTrackedBrands(admin, clientId)
  const evidence = await loadDatedEvidence(admin, clientId, themes.flatMap((t) => t.memberIds), read, { brands })
  const judged = themes.map((t) => judgeTheme(clientId, t, evidence)).filter(isQuestionConversation)
  const ranked = rankQuestions(judged)
  const eligible = new Set(ranked.map((j) => j.theme.themeId))

  // The client's own posts of the reading month and the two before it, to the
  // run's end (the three months, not the ideas' four weeks). A read that fails
  // leaves nothing out on a guess (`untouchedQuestions`).
  let posts: QuestionPost[] | null = null
  try {
    const own = await ownedPosts({ supabase: admin, clientId }, { from: ownedFrom(month), to: window.to })
    posts = own.posts.map((p) => ({ id: p.id, topics: p.topics, upload_date: p.upload_date, video_url: p.video_url }))
  } catch (e) {
    console.warn(`[post-ideas] the client's own posts could not be read; no conversation is left out for them: ${e instanceof Error ? e.message : String(e)}`)
  }
  const { kept: untouched, covered } = untouchedQuestions(ranked, posts, Number.POSITIVE_INFINITY)
  // A conversation whose comments in the window hold no question (they
  // answer, advise or praise) gives the writer nothing to group: it does not
  // take a writer's slot.
  const asked = new Map(untouched.map(({ judgement: j }) => [j.theme.themeId, questionComments(clientId, j.theme, evidence)]))
  // Nor does one under the evidence floor: compose only takes comments away,
  // so a conversation sent under it could never stand, and costs no call.
  const kept = untouched.filter(({ judgement: j }) => {
    const sent = asked.get(j.theme.themeId) ?? []
    return clearsEvidenceFloor({ comments: sent.length, videos: new Set(sent.map((c) => c.videoId)).size })
  }).slice(0, POST_IDEA_CANDIDATES)

  const videos = await loadQuestionVideos(admin, clientId, new Map(kept.map(({ judgement: j }) => [j.theme.themeId, j.theme.memberIds])))
  const candidates = withHandles(kept.map(({ judgement: j, touch }) => ({
    themeId: j.theme.themeId,
    label: j.theme.label,
    description: j.theme.description,
    weekVideos: j.theme.weekVideos,
    lenientVideos: j.lenientVideos,
    comments: asked.get(j.theme.themeId) ?? [],
    play: choosePlay(videos.get(j.theme.themeId) ?? [], month),
    touch,
  })))
  return {
    ...empty,
    candidates,
    considered: judged.map((j) => ({
      themeId: j.theme.themeId, label: j.theme.label, kind: j.theme.kind, dominantKind: j.dominantKind,
      weekVideos: j.theme.weekVideos, lenientVideos: j.lenientVideos, eligible: eligible.has(j.theme.themeId),
      asks: asked.has(j.theme.themeId) ? (asked.get(j.theme.themeId) ?? []).length : null,
    }))
      .sort((a, b) => b.lenientVideos - a.lenientVideos || b.weekVideos - a.weekVideos || a.themeId.localeCompare(b.themeId)),
    covered,
    ownPosts: posts?.length ?? null,
    allow: allowTokens([
      ...candidates.flatMap((c) => [c.label, c.description ?? '']),
      ...candidates.flatMap((c) => c.comments.map((x) => x.text)),
    ]),
  }
}

/** What is left of the step's per-run cap after this run's earlier post-ideas
 *  calls (`ideasSpent`). Pure. */
export const postIdeasCapLeft = (ideasSpent = 0): number => Math.max(0, POST_IDEAS_BUDGET_USD - ideasSpent)

/** May the step start, with the run having spent `spent` of `budget` and
 *  `ideasSpent` of that on post ideas? It needs what is left of its cap, and
 *  the margin, left under the run's budget, and something left of the cap.
 *  Pure. */
export const postIdeasHeadroom = (spent: number, budget = RUN_MODEL_BUDGET_USD, ideasSpent = 0): boolean =>
  postIdeasCapLeft(ideasSpent) > 0 && budget - spent >= postIdeasCapLeft(ideasSpent) + POST_IDEAS_RUN_MARGIN_USD

/** What the call may spend: what is left of the cap, or what the run's budget
 *  leaves after the margin, whichever is less. Pure. */
export const postIdeasRoom = (spent: number, budget = RUN_MODEL_BUDGET_USD, ideasSpent = 0): number =>
  Math.max(0, Math.min(postIdeasCapLeft(ideasSpent), budget - POST_IDEAS_RUN_MARGIN_USD - spent))

/** What this run has spent on post ideas so far, from the ledger
 *  (`ai_call_log`, pass `post_ideas`; `productSpendSoFar`'s shape). */
export async function postIdeasSpendSoFar(admin: SupabaseClient, clientId: string, runId: string): Promise<number> {
  const rows = await selectAll<{ id: string; cost_usd: number | null }>(() => admin.from('ai_call_log').select('id, cost_usd')
    .eq('client_id', clientId).eq('run_id', runId).eq('pass', POST_IDEAS_PASS).order('id'))
  return Math.round(rows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0) * 10_000) / 10_000
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
    clientId: inputs.clientId, runId: inputs.runId, window: inputs.window, read: inputs.read, ideas: composed.ideas,
    model: POST_IDEAS_MODEL, promptVersion: POST_IDEAS_PROMPT_VERSION,
  })
  return {
    // Every idea held for want of evidence is a thin week (silent, its one
    // line on the page); any other hold is the writer's, and is told.
    status: composed.ideas.length > 0 ? 'ready' : composed.held.length > 0 && composed.held.every((h) => h.reason === 'thin') ? 'thin' : 'held',
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
    /** The most the call may spend (the step's `postIdeasRoom`). Absent (the
     *  script), `POST_IDEAS_BUDGET_USD`. */
    maxUsd?: number
  },
): Promise<BuiltPostIdeas> {
  const inputs = opts.inputs ?? (await loadPostIdeaInputs(admin, opts))
  if (inputs.candidates.length === 0) {
    return { status: 'thin', ideas: [], held: [], rows: [], called: false, costUsd: 0, scrub: null, raw: null, inputs }
  }
  const prompts = buildPostIdeaPrompts({ company: inputs.company, sells: inputs.sells, candidates: inputs.candidates })
  const call = await generatePostIdeas(admin, { clientId: opts.clientId, runId: opts.runId, prompts, log: opts.log, client: opts.client, budget: opts.budget, maxUsd: opts.maxUsd })
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
  status: PostIdeasStatus | 'failed' | 'test_run' | 'disabled' | 'missing_migration' | 'exists' | 'over_budget'
  ideas: number
  held: number
  costUsd: number
  error?: string
}

/** What the step needs from the world, so a test can stand them in. */
export interface PostIdeasStepDeps {
  /** The per-tenant switch (`postIdeasEnabled`, lib/config.ts). */
  enabled: (clientId: string) => boolean
  /** The company's name, for the alert's subject (the week read's). */
  company: (admin: SupabaseClient, clientId: string) => Promise<string>
  existing: (admin: SupabaseClient, clientId: string, runId: string) => Promise<number | null>
  build: typeof buildPostIdeas
  /** The run's model spend so far (`runSpendSoFar`, ai_call_log). */
  spent: (clientId: string, runId: string) => Promise<number>
  /** This run's post-ideas spend so far (`postIdeasSpendSoFar`). */
  ideasSpent: (admin: SupabaseClient, clientId: string, runId: string) => Promise<number>
  save: (admin: SupabaseClient, rows: readonly PostIdeaInsert[]) => Promise<void>
  alert: (subject: string, text: string) => Promise<{ sent: boolean }>
}

const DEFAULT_DEPS: PostIdeasStepDeps = {
  enabled: (clientId) => postIdeasEnabled(clientId), company: companyOf, existing: existingPostIdeas, build: buildPostIdeas, spent: runSpendSoFar, ideasSpent: postIdeasSpendSoFar, save: savePostIdeas, alert: sendAlertEmail,
}

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
  // The per-tenant switch (lib/config.ts `postIdeasEnabled`): off, nothing is
  // read, spent or written, and nobody is told, as for a test run.
  if (!d.enabled(opts.clientId)) {
    console.log('[write-post-ideas] post ideas are switched off for this tenant (POST_IDEAS_ENABLED, or POST_IDEAS / POST_IDEAS_OFF)')
    return { status: 'disabled', ideas: 0, held: 0, costUsd: 0 }
  }
  // THE STEP'S CLOCK STARTS HERE: its one call is capped and done by 250 s.
  const startedAt = Date.now()
  // The alert names the company, as the week read's does; a failed read of
  // the name never fails the step.
  const who = opts.company ?? (await d.company(admin, opts.clientId).catch(() => opts.clientId))
  // A stop for money: nothing called or stored, the operator told once, and
  // never a throw (a retry would meet the same cap).
  const overBudget = async (why: string, costUsd = 0): Promise<PostIdeasStepResult> => {
    console.warn(`[write-post-ideas] over budget ($${costUsd} spent by this attempt): ${why}`)
    await d.alert(
      `Verbatim post ideas not written: ${who}`,
      `The week's post ideas for run ${opts.runId} were not written: ${why}. The run itself is unaffected; the Content page goes on showing the last ideas stored.\n\nClient: ${who} (${opts.clientId})\n\n${FALLBACK(opts.clientId, opts.runId)}`,
    ).catch(() => ({ sent: false }))
    return { status: 'over_budget', ideas: 0, held: 0, costUsd: Math.round(costUsd * 10_000) / 10_000, error: why }
  }
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
    // THE RUN'S HEADROOM, read before anything is called: the step starts
    // only where the run can afford its whole cap and the margin.
    // And what this run's earlier attempts of the step spent on post ideas:
    // the cap is the run's, not each retry's.
    const [spent, ideasSpent] = await Promise.all([d.spent(opts.clientId, opts.runId), d.ideasSpent(admin, opts.clientId, opts.runId)])
    if (postIdeasCapLeft(ideasSpent) <= 0) {
      return await overBudget(`this run's earlier attempts already spent $${ideasSpent.toFixed(2)} of the post ideas' $${POST_IDEAS_BUDGET_USD.toFixed(2)} cap`)
    }
    if (!postIdeasHeadroom(spent, RUN_MODEL_BUDGET_USD, ideasSpent)) {
      return await overBudget(`the run has spent $${spent.toFixed(2)} of its $${RUN_MODEL_BUDGET_USD} model budget, and the post ideas may cost up to $${postIdeasCapLeft(ideasSpent).toFixed(2)} more with $${POST_IDEAS_RUN_MARGIN_USD.toFixed(2)} kept spare; they were not started, so the run could not trip its budget`)
    }
    const built = await d.build(admin, { clientId: opts.clientId, runId: opts.runId, log: true, budget: callBudget({ startedAt, budgetMs: POST_IDEAS_STEP_BUDGET_MS }), maxUsd: postIdeasRoom(spent, RUN_MODEL_BUDGET_USD, ideasSpent) })
    if (built.status === 'thin') {
      console.log(`[write-post-ideas] thin: no question conversation clears the evidence floor; ${built.called ? `the call held every idea as thin ($${built.costUsd})` : 'no call'}, nothing stored`)
      return { status: 'thin', ideas: 0, held: built.held.length, costUsd: built.costUsd }
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
    if (e instanceof PostIdeasBudgetError) return await overBudget(message, e.spentUsd)
    if (!lastAttempt && isTransient(e)) {
      console.warn(`[write-post-ideas] transient failure, the step is retried: ${message}`)
      throw e
    }
    console.error(`[write-post-ideas] failed: ${message}`)
    await d.alert(
      `Verbatim post ideas failed: ${who}`,
      `The week's post ideas for run ${opts.runId} could not be written. The run itself is unaffected; the Content page goes on showing the last ideas stored.\n\nError: ${message}\n\nClient: ${who} (${opts.clientId})\n\n${FALLBACK(opts.clientId, opts.runId)}`,
    ).catch(() => ({ sent: false }))
    // What the attempts really cost: an answer that would not parse is paid for.
    const paid = e instanceof PostIdeasWriteError ? Math.round(e.spentUsd * 10_000) / 10_000 : 0
    return { status: 'failed', ideas: 0, held: 0, costUsd: paid, error: message }
  }
}
