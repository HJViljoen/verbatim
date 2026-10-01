import { z } from 'zod'
import { zodResponseFormat } from 'openai/helpers/zod'

import { chunk, mapWithLimit } from '../chunk'
import { ANALYSIS_TEMPERATURE, estimateCost } from '../config'
import { openai } from '../openai'
import { embeddingCoverage } from '../agent/retrieve'
import { logAiCall } from '../pipeline/ai-log'
import { embedTexts } from '../pipeline/cluster'
import { createAdminClient, selectAll } from '../supabase-admin'
import { aboutAudience, aboutVideo, loadAttribution, sortParts, trackedBrands, type TrackedBrands } from '../brands/attribution'
import { loadCompetitors } from '../rivals'
import { nextMonth } from '../reading/month-key'
import { readingMonthOf } from '../written/month'
import { scrubWeekText } from '../written/scrub'
import {
  SubjectJudgeSchema,
  buildJudgeUserPrompt,
  coverageClears,
  planJudgeBatches,
  validateJudgeResponse,
  type JudgeCandidate,
  type SubjectJudgeOutput,
} from '../subjects/membership'
import {
  READING_VERSION,
  RPC_STATEMENT_BAND,
  STANCES,
  STANCE_BATCH,
  STATEMENT_DEADLINE_MS,
  STATEMENT_GLOSS_PROMPT_VERSION,
  STATEMENT_JUDGE_BATCH,
  STATEMENT_JUDGE_PROMPT_VERSION,
  STATEMENT_MATCH_HIGH,
  STATEMENT_MATCH_LOW,
  STATEMENT_MODEL,
  STATEMENT_STANCE_PROMPT_VERSION,
  TABLE_STATEMENTS,
  TABLE_STATEMENT_READINGS,
  isMissingStatements,
  type About,
  type Stance,
  type StatementReading,
  type StatementRow,
} from './types'

// How a market treats one statement (pages build, package MOVES). The shape is
// `lib/subjects/membership.ts`'s, pointed at a sentence the client typed:
//
//   1. EMBED the statement (one embeddings call for all of them).
//   2. BAND: `statement_band()` returns every live insight at or above the
//      subjects' low threshold. At or above the high threshold is a member on
//      the vector alone; between the two the model decides, twenty a call,
//      with the subjects' own judge prompt shape and answer schema.
//   3. DATE: a member counts in the month through its evidence COMMENTS dated
//      in it, on the video they were written under. A market video is one of
//      `market_month_videos` (the month's base); an own video is one of the
//      client's own posts. Nothing else counts.
//   4. STANCE: one call labels the members the reading rests on (backs /
//      doubts / asks / neutral) and writes one sentence; both are counted by
//      DISTINCT VIDEO. The sentence goes through the written read's scrubber
//      (no digits, no direction words, nothing about how it was made).
//
// IT REFUSES RATHER THAN UNDER-COUNTS, as the subjects do: below the embedding
// coverage floor nothing is measured; a judge or stance call that fails keeps
// the previous reading rather than storing a short one; past the deadline the
// statement is left as it was.

type Admin = ReturnType<typeof createAdminClient>

export const STATEMENT_JUDGE_PASS = 'statement_judge'
export const STATEMENT_STANCE_PASS = 'statement_stance'
/** Judge calls in flight at once for one statement. The account's model
 *  concurrency is generous; the step's clock is what binds. */
export const JUDGE_CONCURRENCY = 4
/** The weekly run's whole statements pass, inside `ask-reevaluate`, which
 *  shares the route's 300 s with the plan re-checks before it. A statement
 *  not reached keeps its previous reading. */
export const STATEMENTS_STEP_BUDGET_MS = 150_000

/** What `ask-reevaluate` may spend in all, from its start: the route's 300 s
 *  less the time to write a reading and return. */
export const ASK_REEVALUATE_LIMIT_MS = 270_000

/** The least worth starting the statements pass with: one gloss, one band,
 *  one judge call. Less than this, it is not started. */
export const STATEMENTS_MIN_MS = 30_000

/**
 * THE STATEMENTS PASS'S BUDGET IN THE WEEKLY RUN, from the STEP's start
 * (integration, lead's ruling 10: bounded). The plan re-checks go first and
 * their time is spent; the pass gets what is left of `ASK_REEVALUATE_LIMIT_MS`,
 * at most its own `STATEMENTS_STEP_BUDGET_MS`, and 0 where that is under
 * `STATEMENTS_MIN_MS` (it is then not started and the readings stand). Pure.
 */
export function statementsBudget(stepStartedAt: number, now: number): number {
  const left = Math.min(STATEMENTS_STEP_BUDGET_MS, ASK_REEVALUATE_LIMIT_MS - (now - stepStartedAt))
  return left >= STATEMENTS_MIN_MS ? left : 0
}

/** A model call's cap, and the least time worth starting one with. */
export const STATEMENT_CALL_CAP_MS = 60_000
export const STATEMENT_CALL_FLOOR_MS = 5_000

/**
 * The SDK's options for one call that must end by `deadline`: its timeout is
 * what is left (at most the cap), and the SDK retries once only where a second
 * attempt still fits; null where too little is left to start one. So no call
 * runs past the pass's clock (the week read's rule, review M4). Pure.
 */
export function callOptionsWithin(
  deadline: number | null | undefined,
  now: number,
  capMs = STATEMENT_CALL_CAP_MS,
): { timeout: number; maxRetries: 0 | 1 } | null {
  if (deadline == null) return { timeout: capMs, maxRetries: 1 }
  const left = deadline - now
  if (left < STATEMENT_CALL_FLOOR_MS) return null
  return { timeout: Math.min(capMs, left), maxRetries: left >= 2 * capMs ? 1 : 0 }
}

// ---- Pure: prompts ---------------------------------------------------------

export const STATEMENT_GLOSS_PASS = 'statement_gloss'

export const GlossSchema = z.object({
  lines: z.array(z.object({ slug: z.string(), description: z.string() })),
})
export type GlossOutput = z.infer<typeof GlossSchema>

export function buildGlossPrompt(brand: string): string {
  return [
    `${brand} makes the claim below about itself. Write exactly three lines in the form a researcher logs what people across its market say about the IDEA behind the claim:`,
    '1. people backing the idea up or praising it;',
    '2. people doubting it, questioning whether it is true, or calling it out;',
    '3. people asking about it.',
    'Each line is a snake_case slug naming the topic (two to four words) and ONE sentence starting with "Viewers", "Commenters" or "People".',
    `Write about the idea as it shows up across the whole category, in concrete everyday terms (the materials, the practice, the place, the certification), never in the claim’s slogan words, and do not name ${brand}. For example, for "Made from 100% recycled nylon": recycled_nylon_bags. Viewers like bags made from recycled nylon and recycled plastic bottles.`,
    'Stay on the claim’s own idea: nothing broader and nothing adjacent.',
  ].join('\n')
}

/** The gloss as one text, in the insight embedding's own register
 *  (`embedInput`: "slug words. description"). */
export function glossText(parsed: GlossOutput): string {
  return parsed.lines
    .slice(0, 3)
    .map((l) => `${l.slug.replace(/_/g, ' ').trim()}. ${l.description.trim()}`)
    .filter((l) => l.length > 2)
    .join(' ')
}

export function buildStatementJudgePrompt(statement: string, brand: string): string {
  return [
    'You decide whether a single piece of customer feedback is about one CLAIM a brand makes about itself.',
    '',
    `THE BRAND: ${brand}`,
    `THE CLAIM: "${statement.trim()}"`,
    '',
    'Each numbered block is one thing people in the brand’s market said, as the product recorded it: a short slug and a sentence describing what people said. For each block, answer whether that feedback is ABOUT the idea in this claim: it agrees with it, doubts or disputes it, asks about it, or talks about the very thing the claim is about.',
    '',
    'Judge the subject matter, not the mood. Feedback that praises the idea and feedback that doubts it are both about it.',
    '',
    'Say no when the feedback is about something adjacent rather than this idea. Naming the brand is not enough on its own, a general compliment is not enough, and two things mentioned in the same breath are not one idea.',
    '',
    'Return exactly one decision per block, using the block’s own ref. Never invent a ref and never skip one.',
  ].join('\n')
}

export const StanceSchema = z.object({
  stances: z.array(z.object({ ref: z.string(), stance: z.enum(STANCES) })),
  says: z.string(),
})
export type StanceOutput = z.infer<typeof StanceSchema>

export function buildStancePrompt(statement: string, brand: string): string {
  return [
    `You read what people in a brand’s market said, and decide how each piece treats one claim ${brand} makes about itself.`,
    '',
    `THE CLAIM: "${statement.trim()}"`,
    '',
    'Each numbered block is one thing people said: a short slug and a sentence describing it. For each block, answer with exactly one stance:',
    '- backs: it agrees with the claim, praises the idea, or bears it out from experience;',
    '- doubts: it questions whether the claim is true, disputes it, or calls it out;',
    '- asks: it asks a question about the claim’s idea (what, where, how, whether);',
    '- neutral: it touches the idea without taking any of those sides.',
    '',
    `Then write "says": ONE plain sentence of at most 35 words for ${brand}’s team on what people say about this idea, in the market’s own terms (for example: "People love upcycling ideas and anti-waste design, but they also ask what materials are used and whether the claim is genuine.").`,
    'In that sentence: no numbers or percentages, no dashes, no advice, no forecast, and no words about change over time (new, growing, rising, falling, more and more). Never mention feedback, comments, data, analysis, searches or how any of this was gathered.',
    '',
    'Return one stance per block, using the block’s own ref. Never invent a ref and never skip one.',
  ].join('\n')
}

/** Map the stance answer onto insight ids by ref; bad refs are dropped, never
 *  guessed, and an unanswered block stays unlabelled. */
export function validateStanceResponse(parsed: StanceOutput, batch: readonly { id: string }[]): Map<string, Stance> {
  const out = new Map<string, Stance>()
  for (const d of parsed.stances) {
    const m = /^i(\d+)$/.exec(d.ref.trim().toLowerCase())
    if (!m) continue
    const idx = Number(m[1]) - 1
    if (idx < 0 || idx >= batch.length) continue
    const id = batch[idx].id
    if (out.has(id)) continue
    out.set(id, d.stance)
  }
  return out
}

/** A sentence longer than this is dropped whole, never cut. */
export const SAYS_MAX_CHARS = 320

/** The one sentence, through the written read's scrubber: a sentence with a
 *  digit, a direction word or a word about how it was made drops whole. */
export function scrubSays(raw: string | null | undefined): string | null {
  const { text } = scrubWeekText(raw ?? '', SAYS_MAX_CHARS, { maxSentences: 1, whole: true })
  return text.trim() || null
}

// ---- Pure: the reading -------------------------------------------------------

/** One member insight, with the month's videos its evidence comments sit on. */
export interface DatedMember {
  id: string
  videos: { id: string; lane: 'market' | 'own'; about: About }[]
}

/** `competitor:<name>` / `industry-other` / the client's own, as `About`:
 *  the audience half of the one rule (`aboutAudience`, lib/brands/
 *  attribution.ts). A tracked brand named in the statement's own comments
 *  overrides it at measure time (`loadDatedMembers` with `brands`). */
export function aboutOf(audience: string | null | undefined, own: boolean): About {
  return own ? 'client' : aboutAudience(audience)
}

/**
 * The stored reading, from the dated members and their stances. Pure: every
 * number in it is a count of distinct videos.
 *
 * THE STANCE BASE is the market's videos when the market talks about it, and
 * the client's own posts when only they do (the design's "Of the 5 videos under
 * your posts"). A video counts towards a stance when ANY of its members holds
 * it, so the three can add to more than the base; each is drawn against it.
 */
export function readingFrom(args: {
  month: string
  complete: boolean
  marketBase: number
  members: readonly DatedMember[]
  stances: ReadonlyMap<string, Stance> | null
  says: string | null
}): StatementReading {
  const marketVideos = new Map<string, About>()
  const ownVideos = new Map<string, About>()
  for (const m of args.members) {
    for (const v of m.videos) (v.lane === 'market' ? marketVideos : ownVideos).set(v.id, v.about)
  }
  const of: 'market' | 'own' | null = marketVideos.size > 0 ? 'market' : ownVideos.size > 0 ? 'own' : null
  let stance: StatementReading['stance'] = null
  const who: StatementReading['who'] = []
  if (of && args.stances) {
    const base = of === 'market' ? marketVideos : ownVideos
    const by: Record<'backs' | 'doubts' | 'asks', Set<string>> = { backs: new Set(), doubts: new Set(), asks: new Set() }
    for (const m of args.members) {
      const s = args.stances.get(m.id)
      if (!s || s === 'neutral') continue
      for (const v of m.videos) if (v.lane === of) by[s].add(v.id)
    }
    stance = { of, base: base.size, backs: by.backs.size, doubts: by.doubts.size, asks: by.asks.size }
    const counts = new Map<About, number>()
    for (const about of base.values()) counts.set(about, (counts.get(about) ?? 0) + 1)
    // The one order (lib/brands/attribution.ts `sortParts`): the client, the
    // rivals by videos, the market last. The client's name is not needed for
    // it (the client sorts by rank, never by name).
    who.push(...sortParts([...counts.entries()].map(([about, videos]) => ({ about, videos })), { client: '' }))
  }
  return {
    version: READING_VERSION,
    month: args.month,
    complete: args.complete,
    market: { videos: marketVideos.size, base: args.marketBase },
    own: { videos: ownVideos.size },
    stance,
    says: of ? args.says : null,
    who,
    members: args.members.filter((m) => m.videos.length > 0).length,
  }
}

/** The month a reading is of, from the latest closed run's frozen window (the
 *  week read's rule: a week crossing a month end reads the month it started
 *  in), and whether that month had ended by `now`. */
export function statementMonth(window: { from: string; to: string } | null, now = new Date()): { month: string; complete: boolean } {
  const month = window ? readingMonthOf(window).month : `${now.toISOString().slice(0, 7)}-01`
  return { month, complete: now.toISOString() >= `${nextMonth(month)}T00:00:00.000Z` }
}

// ---- I/O ---------------------------------------------------------------------

export interface MeasureOptions {
  clientId: string
  runId?: string | null
  brand: string
  month: string
  complete: boolean
  /** Read, band and price; no model call and no write. */
  dryRun?: boolean
  /** A band computed elsewhere (the dry run, before `statement_band()` exists
   *  in a database): statement text → its pairs. */
  bandOverride?: ReadonlyMap<string, readonly { audience_insight_id: string; score: number }[]>
  /** The gloss the band was read from, recorded on the reading. */
  gloss?: string | null
  /** The tracked brands, for who the talk is about (the one rule). */
  brands?: TrackedBrands
  deadlineMs?: number
  /** Log each model call to `ai_call_log` (default true). The dry run turns it
   *  off: it writes nothing to the database, the call log included. */
  log?: boolean
}

export interface MeasureResult {
  statementId: string
  text: string
  reading: StatementReading | null
  band: number
  vectorMembers: number
  judged: number
  judgedMembers: number
  calls: number
  costUsd: number
  skipped: 'migration' | 'coverage_short' | 'deadline' | 'gloss_failed' | 'judge_failed' | 'stance_failed' | null
  error?: string
  /** The stance call's sentence before the scrub (operator log only). */
  saysRaw?: string | null
}

/** The latest closed run's frozen window, or null. */
export async function latestRunWindow(admin: Admin, clientId: string): Promise<{ from: string; to: string } | null> {
  const { data } = await admin.from('pipeline_runs')
    .select('window_start, window_end, started_at')
    .eq('client_id', clientId).in('status', ['completed', 'partial'])
    .order('started_at', { ascending: false }).limit(1).maybeSingle()
  const row = data as { window_start: string | null; window_end: string | null } | null
  return row?.window_start && row.window_end ? { from: row.window_start, to: row.window_end } : null
}

/** The month's market videos (the base every page states), by id. */
export async function loadMarketMonth(admin: Admin, clientId: string, month: string): Promise<Map<string, string>> {
  const rows = await selectAll<{ video_id: string; audience: string }>(() =>
    admin.rpc('market_month_videos', { p_client: clientId, p_month: month }).order('video_id', { ascending: true }),
  )
  return new Map(rows.map((r) => [r.video_id, r.audience]))
}

export async function loadLiveStatements(admin: Admin, clientId: string): Promise<StatementRow[]> {
  const { data, error } = await admin.from(TABLE_STATEMENTS)
    .select('id, client_id, text, created_by, created_at, retired_at')
    .eq('client_id', clientId).is('retired_at', null)
    .order('created_at', { ascending: true }).order('id', { ascending: true })
  if (error) throw error
  return (data ?? []) as StatementRow[]
}

async function readBand(admin: Admin, clientId: string, vector: number[]): Promise<{ audience_insight_id: string; score: number }[]> {
  return selectAll<{ audience_insight_id: string; score: number }>(() =>
    admin.rpc(RPC_STATEMENT_BAND, { p_client: clientId, p_query: vector as unknown as string, p_low: STATEMENT_MATCH_LOW })
      .order('audience_insight_id', { ascending: true }),
  )
}

/** Theme and description for an id set, off the base table (the id-set rule). */
async function loadInsightText(admin: Admin, clientId: string, ids: readonly string[]): Promise<Map<string, { theme: string; description: string }>> {
  const out = new Map<string, { theme: string; description: string }>()
  for (const part of chunk([...ids], 200)) {
    const rows = await selectAll<{ id: string; theme: string; description: string }>(() =>
      admin.from('audience_insights').select('id, theme, description').eq('client_id', clientId).in('id', part).order('id'),
    )
    for (const r of rows) out.set(r.id, { theme: r.theme ?? '', description: r.description ?? '' })
  }
  return out
}

/**
 * Each member's videos in the month: its evidence comments dated in it, on the
 * video they were written under, kept only where that video is a market video
 * of the month or one of the client's own posts.
 */
export async function loadDatedMembers(
  admin: Admin,
  clientId: string,
  memberIds: readonly string[],
  month: string,
  market: ReadonlyMap<string, string>,
  /** The tracked brands: given, a brand named in the statement's own comments
   *  files its video (the one rule, lib/brands/attribution.ts). Without them,
   *  or where the namings cannot be read, the audience alone answers. */
  brands?: TrackedBrands,
): Promise<DatedMember[]> {
  if (memberIds.length === 0) return []
  const evidence: { audience_insight_id: string; comment_id: string }[] = []
  for (const part of chunk([...memberIds], 150)) {
    evidence.push(...await selectAll<{ audience_insight_id: string; comment_id: string }>(() =>
      admin.from('insight_evidence').select('audience_insight_id, comment_id')
        .in('audience_insight_id', part).eq('source', 'comment').not('comment_id', 'is', null)
        .order('audience_insight_id').order('comment_id'),
    ))
  }
  const t0 = `${month}T00:00:00.000Z`
  const t1 = `${nextMonth(month)}T00:00:00.000Z`
  const comments = new Map<string, { platform: string; video_id: string }>()
  for (const part of chunk([...new Set(evidence.map((e) => e.comment_id))], 200)) {
    const rows = await selectAll<{ id: string; platform: string; video_id: string }>(() =>
      admin.from('comments').select('id, platform, video_id').eq('client_id', clientId).in('id', part)
        .gte('comment_date', t0).lt('comment_date', t1).order('id'),
    )
    for (const r of rows) comments.set(r.id, { platform: r.platform, video_id: r.video_id })
  }
  const externals = [...new Set([...comments.values()].map((c) => c.video_id))]
  const videos = new Map<string, { id: string; own: boolean }>()
  for (const part of chunk(externals, 200)) {
    const rows = await selectAll<{ id: string; platform: string; video_id: string; is_client: boolean | null }>(() =>
      admin.from('videos').select('id, platform, video_id, is_client').eq('client_id', clientId).in('video_id', part).order('id'),
    )
    for (const r of rows) videos.set(`${r.platform}|${r.video_id}`, { id: r.id, own: r.is_client === true })
  }
  const byMember = new Map<string, Map<string, DatedMember['videos'][number]>>()
  for (const e of evidence) {
    const c = comments.get(e.comment_id)
    if (!c) continue
    const v = videos.get(`${c.platform}|${c.video_id}`)
    if (!v) continue
    const lane: 'market' | 'own' | null = v.own ? 'own' : market.has(v.id) ? 'market' : null
    if (!lane) continue
    const seen = byMember.get(e.audience_insight_id) ?? new Map()
    seen.set(v.id, { id: v.id, lane, about: aboutOf(market.get(v.id), v.own) })
    byMember.set(e.audience_insight_id, seen)
  }
  // WHO THE TALK IS ABOUT, by the one rule: the namings in the statement's own
  // comments of the month (every member's, so a video is filed once).
  if (brands) {
    const videoIds = [...new Set([...byMember.values()].flatMap((m) => [...m.keys()]))]
    const inputs = await loadAttribution(admin, { clientId, videoIds, brands })
    if (inputs) {
      const scope = { comments: new Set(comments.keys()), months: new Set([month]) }
      for (const seen of byMember.values()) for (const v of seen.values()) v.about = aboutVideo(v.id, inputs, scope)
    }
  }
  return memberIds.map((id) => ({ id, videos: [...(byMember.get(id)?.values() ?? [])] }))
}

async function parseCall<T>(
  admin: Admin,
  args: { clientId: string; runId: string | null; pass: string; index: number; promptVersion: string; system: string; user: string; schema: z.ZodType<T>; name: string; log: boolean; deadline?: number },
): Promise<{ parsed: T | null; costUsd: number; error: string | null }> {
  const startedAt = Date.now()
  // Never past the pass's clock: no call is started without time for it.
  const request = callOptionsWithin(args.deadline, startedAt)
  if (!request) return { parsed: null, costUsd: 0, error: 'no time left for the call' }
  let parsed: T | null = null
  let error: string | null = null
  let usage = { prompt_tokens: 0, completion_tokens: 0 }
  try {
    const completion = await openai.chat.completions.parse({
      model: STATEMENT_MODEL,
      temperature: ANALYSIS_TEMPERATURE,
      messages: [{ role: 'system', content: args.system }, { role: 'user', content: args.user }],
      response_format: zodResponseFormat(args.schema, args.name),
    }, request)
    const msg = completion.choices[0]?.message
    parsed = (msg?.parsed ?? null) as T | null
    error = msg?.refusal ?? (parsed ? null : 'no parsed output')
    usage = completion.usage ?? usage
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }
  const costUsd = estimateCost(STATEMENT_MODEL, usage.prompt_tokens, usage.completion_tokens)
  if (args.log) await logAiCall(admin, {
    clientId: args.clientId, runId: args.runId, pass: args.pass, callIndex: args.index, model: STATEMENT_MODEL,
    promptVersion: args.promptVersion, systemPrompt: args.system, userPrompt: args.user, response: parsed, error,
    usage, durationMs: Date.now() - startedAt, validationStatus: parsed ? 'valid' : 'parse_error',
  })
  return { parsed, costUsd, error }
}

/** The statement's gloss: one small call. Null when the call fails, and the
 *  statement is then left as it was. */
export async function glossFor(
  admin: Admin,
  statement: Pick<StatementRow, 'id' | 'text'>,
  brand: string,
  o: { clientId: string; runId: string | null; log: boolean; index: number; deadline?: number },
): Promise<{ gloss: string | null; costUsd: number }> {
  const r = await parseCall<GlossOutput>(admin, {
    clientId: o.clientId, runId: o.runId, pass: STATEMENT_GLOSS_PASS, index: o.index,
    promptVersion: `${STATEMENT_GLOSS_PROMPT_VERSION}:${statement.id}`, system: buildGlossPrompt(brand),
    user: `THE CLAIM: "${statement.text.trim()}"`, schema: GlossSchema, name: 'statement_gloss', log: o.log, deadline: o.deadline,
  })
  const gloss = r.parsed ? glossText(r.parsed) : ''
  return { gloss: gloss || null, costUsd: r.costUsd }
}

/** One statement's month, end to end. Never throws for a model failure: the
 *  result says what happened and the caller keeps the previous reading. */
export async function measureStatement(
  admin: Admin,
  statement: Pick<StatementRow, 'id' | 'text'>,
  vector: number[] | null,
  market: ReadonlyMap<string, string>,
  opts: MeasureOptions,
): Promise<MeasureResult> {
  const out: MeasureResult = {
    statementId: statement.id, text: statement.text, reading: null,
    band: 0, vectorMembers: 0, judged: 0, judgedMembers: 0, calls: 0, costUsd: 0, skipped: null,
  }
  const deadline = Date.now() + (opts.deadlineMs ?? STATEMENT_DEADLINE_MS)
  const runId = opts.runId ?? null

  const band = opts.bandOverride?.get(statement.text) ?? (vector ? await readBand(admin, opts.clientId, vector) : [])
  out.band = band.length
  const scores = new Map(band.map((p) => [p.audience_insight_id, p.score]))
  const members = new Set(band.filter((p) => p.score >= STATEMENT_MATCH_HIGH).map((p) => p.audience_insight_id))
  out.vectorMembers = members.size
  const toJudge = band.filter((p) => p.score < STATEMENT_MATCH_HIGH).map((p) => p.audience_insight_id)
  const text = await loadInsightText(admin, opts.clientId, [...new Set([...members, ...toJudge])])
  const candidates: JudgeCandidate[] = toJudge
    .filter((id) => text.has(id))
    .map((id) => ({ id, theme: text.get(id)!.theme, description: text.get(id)!.description, score: scores.get(id) ?? 0 }))
  const batches = planJudgeBatches(candidates, STATEMENT_JUDGE_BATCH)
  out.judged = candidates.length

  if (opts.dryRun) {
    out.calls = batches.length + 1
    out.costUsd = estimateCost(STATEMENT_MODEL, batches.length * 1900 + 4000, batches.length * 500 + 1500)
    return out
  }

  const system = buildStatementJudgePrompt(statement.text, opts.brand)
  let failed = false
  await mapWithLimit(batches, JUDGE_CONCURRENCY, async (batch, i) => {
    if (failed || Date.now() > deadline) { failed = true; return }
    const r = await parseCall<SubjectJudgeOutput>(admin, {
      clientId: opts.clientId, runId, pass: STATEMENT_JUDGE_PASS, index: i + 1,
      promptVersion: `${STATEMENT_JUDGE_PROMPT_VERSION}:${statement.id}`, system, user: buildJudgeUserPrompt(batch),
      schema: SubjectJudgeSchema, name: 'statement_membership', log: opts.log !== false, deadline,
    })
    out.calls++
    out.costUsd += r.costUsd
    if (!r.parsed) { failed = true; out.error = r.error ?? 'no parsed output'; return }
    const decisions = validateJudgeResponse(r.parsed, batch)
    // An unanswered block is a hole in the count, so the measurement stops
    // rather than storing a reading that is short by it.
    if (decisions.size < batch.length) { failed = true; out.error = 'judge left blocks unanswered'; return }
    for (const [id, belongs] of decisions) if (belongs) { members.add(id); out.judgedMembers++ }
  })
  if (failed) {
    out.skipped = Date.now() > deadline ? 'deadline' : 'judge_failed'
    return out
  }

  const dated = await loadDatedMembers(admin, opts.clientId, [...members].sort(), opts.month, market, opts.brands)
  const lane: 'market' | 'own' | null = dated.some((m) => m.videos.some((v) => v.lane === 'market'))
    ? 'market'
    : dated.some((m) => m.videos.some((v) => v.lane === 'own')) ? 'own' : null
  // The members the reading rests on: those with a video in the stance's lane,
  // most on-topic first so the sentence is written from the clearest ones.
  const labelled = lane
    ? dated.filter((m) => m.videos.some((v) => v.lane === lane)).sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
    : []

  let stances: Map<string, Stance> | null = lane ? new Map() : null
  let says: string | null = null
  if (lane) {
    const stanceSystem = buildStancePrompt(statement.text, opts.brand)
    const parts = chunk(labelled, STANCE_BATCH)
    for (let i = 0; i < parts.length; i++) {
      if (Date.now() > deadline) { out.skipped = 'deadline'; return out }
      const part = parts[i].map((m) => ({ id: m.id, theme: text.get(m.id)?.theme ?? '', description: text.get(m.id)?.description ?? '', score: 0 }))
      const r = await parseCall<StanceOutput>(admin, {
        clientId: opts.clientId, runId, pass: STATEMENT_STANCE_PASS, index: i + 1,
        promptVersion: `${STATEMENT_STANCE_PROMPT_VERSION}:${statement.id}`, system: stanceSystem, user: buildJudgeUserPrompt(part),
        schema: StanceSchema, name: 'statement_stance', log: opts.log !== false, deadline,
      })
      out.calls++
      out.costUsd += r.costUsd
      if (!r.parsed) { out.skipped = 'stance_failed'; out.error = r.error ?? 'no parsed output'; return out }
      for (const [id, s] of validateStanceResponse(r.parsed, part)) stances!.set(id, s)
      // The first sentence that survives the scrub; the raw one is kept for
      // the operator's log, never stored.
      out.saysRaw = out.saysRaw ?? r.parsed.says
      says = says ?? scrubSays(r.parsed.says)
    }
    if (stances!.size < labelled.length) { out.skipped = 'stance_failed'; out.error = 'stance left blocks unanswered'; stances = null; return out }
  }

  out.reading = { ...readingFrom({ month: opts.month, complete: opts.complete, marketBase: market.size, members: dated, stances, says }), ...(opts.gloss ? { gloss: opts.gloss } : {}) }
  return out
}

export async function writeReading(admin: Admin, clientId: string, r: MeasureResult): Promise<void> {
  if (!r.reading) return
  const { error } = await admin.from(TABLE_STATEMENT_READINGS).upsert({
    statement_id: r.statementId,
    client_id: clientId,
    month: r.reading.month,
    data: r.reading,
    version: r.reading.version,
    cost_usd: Number(r.costUsd.toFixed(6)),
    measured_at: new Date().toISOString(),
  }, { onConflict: 'statement_id,month' })
  if (error) throw new Error(`${TABLE_STATEMENT_READINGS} upsert: ${error.message}`)
}

export interface MeasureAllOptions {
  clientId: string
  runId?: string | null
  /** Only these statements; absent, every live one. */
  statementIds?: readonly string[]
  /** Statements that are not rows (the dry run, before the table exists). */
  texts?: readonly string[]
  month?: { month: string; complete: boolean }
  dryRun?: boolean
  write?: boolean
  bandOverride?: MeasureOptions['bandOverride']
  /** Glosses made elsewhere (the dry run's, so the band and the reading rest
   *  on the same words): statement text → gloss. */
  glossOverride?: ReadonlyMap<string, string>
  /** The whole pass's clock; each statement gets what is left. */
  deadlineMs?: number
  log?: boolean
}

export interface MeasureAllResult {
  month: string | null
  skipped: 'migration' | 'coverage_short' | 'no_statements' | null
  results: MeasureResult[]
  costUsd: number
}

/**
 * Every live statement of a workspace (or the ones named), on the month of
 * the latest closed run. The operator script, the add action and the weekly
 * run all come through here. Never throws for a missing table: it says so.
 */
export async function measureStatements(admin: Admin, opts: MeasureAllOptions): Promise<MeasureAllResult> {
  const started = Date.now()
  let statements: Pick<StatementRow, 'id' | 'text'>[]
  if (opts.texts) {
    statements = opts.texts.map((text, i) => ({ id: `text-${i + 1}`, text }))
  } else {
    try {
      statements = await loadLiveStatements(admin, opts.clientId)
    } catch (e) {
      if (isMissingStatements(e as { code?: string; message?: string })) return { month: null, skipped: 'migration', results: [], costUsd: 0 }
      throw e
    }
    if (opts.statementIds) statements = statements.filter((s) => opts.statementIds!.includes(s.id))
  }
  if (statements.length === 0) return { month: null, skipped: 'no_statements', results: [], costUsd: 0 }

  const coverage = await embeddingCoverage(admin, opts.clientId)
  if (!coverageClears(coverage)) return { month: null, skipped: 'coverage_short', results: [], costUsd: 0 }

  const month = opts.month ?? statementMonth(await latestRunWindow(admin, opts.clientId))
  const [{ data: client }, market] = await Promise.all([
    admin.from('clients').select('company_name').eq('id', opts.clientId).maybeSingle(),
    loadMarketMonth(admin, opts.clientId, month.month),
  ])
  const brand = ((client as { company_name?: string | null } | null)?.company_name ?? '').trim() || 'the brand'
  // The tracked brands, once a pass, for who each statement's talk is about.
  // A failed read leaves the audience to answer (lib/brands/attribution.ts).
  const brands = await loadCompetitors(admin, opts.clientId)
    .then((rivals) => trackedBrands(opts.clientId, brand, rivals))
    .catch((e: unknown) => {
      console.error(`[statements] rivals not read; who the talk is about falls back to the audience: ${e instanceof Error ? e.message : String(e)}`)
      return undefined
    })
  // ONE CLOCK for the whole pass, the glosses and the embeddings included:
  // every call below ends by it (`callOptionsWithin`).
  const budget = opts.deadlineMs ?? STATEMENT_DEADLINE_MS * statements.length
  const passDeadline = started + budget
  // THE GLOSS, then its vector: one small call a statement (none for a band
  // computed elsewhere, which brings its own gloss), then one embeddings call.
  const glosses: (string | null)[] = []
  let glossCost = 0
  for (let i = 0; i < statements.length; i++) {
    const given = opts.glossOverride?.get(statements[i].text) ?? null
    if (given || opts.bandOverride) { glosses.push(given); continue }
    if (opts.dryRun) { glosses.push(null); continue }
    const g = await glossFor(admin, statements[i], brand, { clientId: opts.clientId, runId: opts.runId ?? null, log: opts.log !== false, index: i + 1, deadline: passDeadline })
    glossCost += g.costUsd
    glosses.push(g.gloss)
  }
  const toEmbed = glosses.map((g, i) => g ?? (opts.dryRun && !opts.bandOverride ? statements[i].text.trim() : null))
  const embedIdx = toEmbed.map((t, i) => (t && !opts.bandOverride ? i : -1)).filter((i) => i >= 0)
  const embedRequest = callOptionsWithin(passDeadline, Date.now(), 20_000)
  const embedded = embedIdx.length > 0 && embedRequest ? await embedTexts(embedIdx.map((i) => toEmbed[i] as string), embedRequest) : []
  const vectors: (number[] | null)[] = statements.map(() => null)
  embedIdx.forEach((i, k) => { vectors[i] = embedded[k] ?? null })

  const results: MeasureResult[] = []
  for (let i = 0; i < statements.length; i++) {
    const left = budget - (Date.now() - started)
    if (left <= 0) {
      results.push({ statementId: statements[i].id, text: statements[i].text, reading: null, band: 0, vectorMembers: 0, judged: 0, judgedMembers: 0, calls: 0, costUsd: 0, skipped: 'deadline' })
      continue
    }
    if (!opts.dryRun && !opts.bandOverride && !glosses[i]) {
      results.push({ statementId: statements[i].id, text: statements[i].text, reading: null, band: 0, vectorMembers: 0, judged: 0, judgedMembers: 0, calls: 1, costUsd: 0, skipped: 'gloss_failed' })
      continue
    }
    // No vector (no time was left to embed it): never measured against an
    // empty band, which would store "nobody raised it". The reading stands.
    if (!opts.bandOverride && glosses[i] && !vectors[i]) {
      results.push({ statementId: statements[i].id, text: statements[i].text, reading: null, band: 0, vectorMembers: 0, judged: 0, judgedMembers: 0, calls: 0, costUsd: 0, skipped: 'deadline' })
      continue
    }
    let r: MeasureResult
    try {
      r = await measureStatement(admin, statements[i], vectors[i], market, {
        clientId: opts.clientId, runId: opts.runId, brand, month: month.month, complete: month.complete,
        dryRun: opts.dryRun, bandOverride: opts.bandOverride, gloss: glosses[i], brands, deadlineMs: Math.min(left, STATEMENT_DEADLINE_MS), log: opts.log,
      })
    } catch (e) {
      if (isMissingStatements(e as { code?: string; message?: string })) return { month: month.month, skipped: 'migration', results, costUsd: results.reduce((n, x) => n + x.costUsd, 0) }
      throw e
    }
    if (opts.write && !opts.dryRun && r.reading) await writeReading(admin, opts.clientId, r)
    results.push(r)
  }
  return { month: month.month, skipped: null, results, costUsd: glossCost + results.reduce((n, x) => n + x.costUsd, 0) }
}

/** What the script and the step print. An operator log, never client copy. */
export function measureSummary(r: MeasureResult): string {
  const head = `"${r.text.slice(0, 60)}${r.text.length > 60 ? '…' : ''}"`
  const base = `${head}: band ${r.band} · ${r.vectorMembers} by vector · ${r.judgedMembers}/${r.judged} by judge · ${r.calls} call(s) · ~$${r.costUsd.toFixed(4)}`
  if (r.skipped) return `${base} · SKIPPED ${r.skipped}${r.error ? ` (${r.error})` : ''}`
  const said = r.saysRaw != null ? ` · says(raw): ${JSON.stringify(r.saysRaw)}` : ''
  if (!r.reading) return base + said
  const x = r.reading
  const st = x.stance ? ` · of ${x.stance.base} ${x.stance.of}: back ${x.stance.backs} · doubt ${x.stance.doubts} · ask ${x.stance.asks}` : ''
  return `${base} · market ${x.market.videos}/${x.market.base} · own ${x.own.videos}${st} · says ${x.says ? 'kept' : 'DROPPED'}${said}`
}
