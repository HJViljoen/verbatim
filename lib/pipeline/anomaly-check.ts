import { zodResponseFormat } from 'openai/helpers/zod'
import { z } from 'zod'

import { CALIBRATED_PROSE_RULE } from './prose-rules'
import { estimateCost } from '../config'
import { logAiCall } from './ai-log'
import { openai, samplingParams } from '../openai'
import { sameRegime } from './clustering'
import { composeInterpretation, verdictBlock, type Interpretation, type QuoteRef } from '../prose/interpret'
import { proseFigures } from '../prose/figures'
import { allowTokens } from '../prose/scrub'
import { isMissingKindMoodAttention } from '../reading/attention'
import {
  BASELINE_MONTHS,
  KIND_SET,
  MAX_FLAGS,
  anomalyVerdict,
  preRegisteredSet,
  thinUpdate,
  weekVsBaseline,
  type AnomalyReading,
  type AnomalyRow,
  type DenominatorMonth,
  type PreRegisteredObject,
  type PreRegistration,
  type ThinUpdateVerdict,
  type UpdateSize,
} from '../reading/anomaly'
import { SLICE } from '../reading/coverage'
import { kindLabel } from '../reading/kinds'
import { isMissingMonthTable, monthStartOf, trailingCompleteMonths } from '../reading/monthly'
import {
  RPC_WINDOW_DENOMINATORS,
  RPC_WINDOW_KIND_READINGS,
  RPC_WINDOW_SUBJECT_READINGS,
  RPC_WINDOW_THEME_READINGS,
  TABLE_DENOMINATORS,
  TABLE_KIND_READINGS,
  TABLE_SUBJECT_READINGS,
  TABLE_THEME_READINGS,
} from '../reading/types'
import type { FigureTable as ReadingFigures } from '../reading/verdicts'
import { fetchQuoteCitationsByAudience } from '../quotes'
import { RIVAL_PREFIX, loadCompetitors, isMissingCompetitors } from '../rivals'
import { createAdminClient, selectAll } from '../supabase-admin'

// The anomaly check as a step of the update (Phase 1 WP8, design item 40,
// decision S, 2026-09-18).
//
// WHAT RUNS HERE, IN ORDER. The week this update covered is read through the
// window functions; the trailing three complete months are read off the stored
// month rows; the pre-registered set is built and trimmed by a rule that looks
// only at that baseline; `weekVsBaseline` does the arithmetic; the at-most-three
// flags are written to `anomaly_flags`; and only if something fired does one
// small model call try to say why. Everything before the model call is pure
// arithmetic over rows, which is the property that lets "nothing was unusual
// this week" — the answer most weeks give — cost nothing at all.
//
// WHY THE WEEK IS READ THROUGH THE WINDOW FUNCTIONS AND NEVER SUMMED FROM
// MONTHS. `videos` is a count of DISTINCT videos and a video whose comment
// thread spans a month boundary is a member of both months' sets. Phase 0's
// replay had to skip 3 of 11 weeks for this — Össur's week 36 is 290 distinct
// videos and 372 added up, 28% high on the denominator every share in that week
// divides by — which is about 3 of every 13 updates lost. The window functions
// (20260918092000, and M4/M5's siblings) group by the window instead of the
// month and hand back the distinct count, so a crossing week reads correctly
// and no week is skipped.
//
// WHY THE BASELINE IS *NOT* READ THAT WAY. It could be: one window call over
// three months would give an exact distinct count. It is read off the stored
// month rows on purpose, because those rows ARE the record — frozen, dated,
// with the clustering they were read under stamped on them — and a baseline
// recomputed live would quietly disagree with the chart drawn from the same
// months. The cost is stated in `weekVsBaseline`'s own docblock: the pooled
// baseline n is video-months rather than distinct videos, the week dominates
// the variance on this shape, and that trade is the month tables' whole point.
//
// THE DENOMINATOR IS POOLED, AND POOLING IS EXACT. Decision S keeps one
// denominator per tenant-week — every audience together — because it is the n
// the design's arithmetic uses and, on both tenants, the only series that ever
// clears 100 videos a month. Summing audiences is a distinct count and not an
// approximation of one: a video sits in exactly one audience and a comment
// hangs off exactly one video (lib/reading/coverage.ts). What a reader has to
// carry is the consequence: a rival's attention is a share of the whole update,
// not of its own audience, so the flag row stores the denominator's NAME and
// every surface prints it.
//
// NON-FATAL, AND A NO-OP BEFORE ITS MIGRATION LANDS. The keyword-discovery and
// freeze-months precedent: a record kept alongside the report must not make a
// clean run read `partial`, and a step whose table does not exist yet logs one
// line rather than burning its retry budget holding one of five shared slots.

/** The explainer's model. Decision S names it: a flag is three numbers, a label
 *  and a handful of comments, and `gpt-4.1-mini` at ~$0.0014 a fired update is
 *  the design's own choice. The owned-events precedent uses SYNTHESIS_MODEL and
 *  would cost 7.6× that — both are invisible against a $5–17 run, and the
 *  cheaper one is chosen deliberately rather than inherited. */
export const ANOMALY_EXPLAINER_MODEL = 'gpt-4.1-mini'

export const ANOMALY_PROMPT_VERSION = 'anomaly_explainer_v1'

/** Comments handed to the explainer. The design's bound: the verdicts, the
 *  figure tokens, and no more than eight candidate quotes. */
export const MAX_EXPLAINER_QUOTES = 8

/** Comments of the week read to find those eight, most-engaged first. A cap,
 *  not a sample of the week: the explainer needs material to ground in, not a
 *  representative read, and the counts it is explaining were computed by the
 *  window functions over everything. */
export const WEEK_COMMENT_CAP = 400

export const ANOMALY_FLAGS_TABLE = 'anomaly_flags'

/** Whether a pooled baseline was read under one clustering. `not_grouped` is
 *  the answer for an object that has no grouping to be like-for-like about —
 *  a kind is the enum Pass A wrote, and a re-grouping cannot move an insight
 *  from one kind to another (lib/reading/types.ts `KindReadingRow`). */
export type BaselineRegime = 'one' | 'mixed' | 'unknown' | 'not_grouped'

export interface AnomalyWindow {
  from: string
  to: string
}

export type AnomalyCheckStatus =
  | 'flagged'
  | 'nothing_unusual'
  | 'suppressed'
  | 'no_window'
  | 'missing_migration'

export interface AnomalyCheckResult {
  status: AnomalyCheckStatus
  /** One line for the run log. Always present. */
  note: string
  reading: AnomalyReading | null
  registration: PreRegistration | null
  suppression: ThinUpdateVerdict | null
  /** Rows written to `anomaly_flags`. Zero on a clean week, and zero on a
   *  re-run of a week whose rows are already there. */
  written: number
  explanation: Interpretation | null
  costUsd: number
}

// ---- Pooling -----------------------------------------------------------------

/** A stored month row, in the shape every one of the four tables shares. */
interface StoredMonthRow {
  month: string
  audience: string
  videos: number
  run_id?: string | null
  clustering_key?: string | null
  judge_version?: string | null
}

/**
 * The pooled denominator: every audience together, one entry per month asked
 * for, in the order asked for.
 *
 * A month with no row at all is a zero here and not an omission — the baseline
 * has to be able to say "that month carried nothing", and `baselineStateOf`
 * counts the months that clear the floor off exactly this list.
 */
export function pooledMonths(rows: readonly StoredMonthRow[], months: readonly string[]): DenominatorMonth[] {
  const byMonth = new Map<string, number>()
  for (const r of rows) {
    const key = monthStartOf(r.month)
    byMonth.set(key, (byMonth.get(key) ?? 0) + (r.videos ?? 0))
  }
  return months.map((month) => ({ month, videos: byMonth.get(month) ?? 0 }))
}

/** The same pooling, per object: `id → months`. Audiences are summed for the
 *  same reason the denominator's are, and a month an object is absent from is
 *  simply missing from its list (`weekVsBaseline` reads that as zero). */
export function pooledByObject(
  rows: readonly StoredMonthRow[],
  idOf: (row: StoredMonthRow) => string | null,
  months: readonly string[],
): Map<string, DenominatorMonth[]> {
  const within = new Set(months)
  const perId = new Map<string, Map<string, number>>()
  for (const r of rows) {
    const id = idOf(r)
    if (!id) continue
    const month = monthStartOf(r.month)
    if (!within.has(month)) continue
    const per = perId.get(id) ?? new Map<string, number>()
    per.set(month, (per.get(month) ?? 0) + (r.videos ?? 0))
    perId.set(id, per)
  }
  const out = new Map<string, DenominatorMonth[]>()
  for (const [id, per] of perId) {
    out.set(id, months.filter((m) => per.has(m)).map((month) => ({ month, videos: per.get(month) ?? 0 })))
  }
  return out
}

/**
 * Were these months read under one grouping?
 *
 * `sameRegime` is the rule and it is deliberately strict: two unknowns are NOT
 * the same regime, because every row frozen before 2026-09-18 carries no key
 * and reading two absences as agreement would let the seeded back-read — five
 * months frozen in one visit — claim a regime it never recorded.
 *
 * THE CHECK MARKS THIS AND STILL REPORTS THE FLAG, which is decision L's
 * posture ("plot, mark, and refuse the word") rather than decision L's refusal.
 * It can afford to, because the one thing decision L reserves for a single
 * regime is the direction word, and an anomaly reading never speaks one — it
 * states a level, a difference and a band, all of which are true of whatever
 * grouping produced them. Refusing instead would empty the theme arm outright
 * on today's corpus, where every seeded month predates the fingerprint.
 */
export function baselineRegime(keys: readonly (string | null | undefined)[]): BaselineRegime {
  if (keys.length === 0) return 'unknown'
  if (keys.some((k) => !k)) return 'unknown'
  const [first, ...rest] = keys
  return rest.every((k) => sameRegime(first, k)) ? 'one' : 'mixed'
}

/** Each object's comparability key per month, folded to one answer. */
export function regimesByObject(
  rows: readonly StoredMonthRow[],
  idOf: (row: StoredMonthRow) => string | null,
  keyOf: (row: StoredMonthRow) => string | null | undefined,
  months: readonly string[],
): Map<string, BaselineRegime> {
  const within = new Set(months)
  const perId = new Map<string, Map<string, string | null | undefined>>()
  for (const r of rows) {
    const id = idOf(r)
    if (!id) continue
    const month = monthStartOf(r.month)
    if (!within.has(month)) continue
    const per = perId.get(id) ?? new Map<string, string | null | undefined>()
    // One month, one answer: the rows of one audience-month were written by one
    // visit, so any of them names that month's regime.
    if (!per.has(month)) per.set(month, keyOf(r))
    perId.set(id, per)
  }
  const out = new Map<string, BaselineRegime>()
  for (const [id, per] of perId) out.set(id, baselineRegime([...per.values()]))
  return out
}

// ---- The flag row ------------------------------------------------------------

export interface FlagRowInput {
  clientId: string
  runId: string
  window: AnomalyWindow
  reading: AnomalyReading
  baselineMonths: readonly string[]
  regimes: ReadonlyMap<string, BaselineRegime>
  readAt: string
  explanation?: Interpretation | null
  explanationModel?: string | null
  quoteRefs?: ReadonlyMap<string, QuoteRef[]>
}

/** The rows `anomaly_flags` takes, in rank order. Pure so the shape is tested
 *  without a database, and so a replay can print exactly what a run would have
 *  written. */
export function flagRows(input: FlagRowInput): Record<string, unknown>[] {
  return input.reading.flags.map((flag, i) => ({
    client_id: input.clientId,
    run_id: input.runId,
    week_start: input.window.from,
    week_end: input.window.to,
    object_kind: flag.kind,
    object_id: flag.id,
    label: flag.label,
    denominator: flag.denominator,
    week_k: flag.weekVideos,
    week_n: flag.weekTotal,
    baseline_k: flag.baselineVideos,
    baseline_n: flag.baselineTotal,
    baseline_months: [...input.baselineMonths],
    baseline_regime: input.regimes.get(regimeKey(flag)) ?? 'not_grouped',
    change_pts: flag.verdict?.change ?? 0,
    band_pts: flag.verdict?.band ?? 0,
    p: flag.p ?? 1,
    holm_threshold: flag.holmThreshold ?? 0,
    set_size: input.reading.setSize,
    tested: input.reading.tested,
    rank: i + 1,
    flagged_count: input.reading.flaggedCount,
    // One explanation covers the week's flags — it is written about all of
    // them together, as the design's paragraph is — so every row carries it and
    // a reader of one row is never handed half a sentence.
    explanation: input.explanation ? explanationJson(input.explanation) : null,
    explanation_model: input.explanation && !input.explanation.fallback ? input.explanationModel ?? null : null,
    quote_refs: (input.quoteRefs?.get(`${flag.kind} ${flag.id}`) ?? input.explanation?.quotes ?? []).map((q) => ({
      ref: q.ref,
      ...(q.context ? { context: q.context } : {}),
    })),
    read_at: input.readAt,
  }))
}

const regimeKey = (flag: AnomalyRow): string => `${flag.kind} ${flag.id}`

/** The interpretation as it is stored: the sentences with their figure tokens
 *  intact, who wrote them, and what the scrubbers took out. Never a comment's
 *  words — the quotes travel as refs in their own column. */
function explanationJson(i: Interpretation): Record<string, unknown> {
  return {
    label: i.label,
    sentences: i.sentences,
    fallback: i.fallback,
    ...(i.reason ? { reason: i.reason } : {}),
    ...(i.note ? { note: i.note } : {}),
    scrub: {
      dropped: i.scrub.dropped,
      dropped_digits: i.scrub.droppedDigits,
      dropped_direction: i.scrub.droppedDirection,
      flagged_direction: i.scrub.flaggedDirection,
    },
  }
}

// ---- The figures the explainer may cite --------------------------------------

/**
 * The week's flags as figure KEYS.
 *
 * The model never sees a value (`verdictBlock`), and the digit scrubber deletes
 * any sentence it types a number into, so these keys are the only way a
 * measured figure reaches the page. One per flag, plus the week's own n — which
 * is the figure the design's copy rule demands beside every level ("3 of the 28
 * videos in your audience").
 */
export function anomalyFigures(reading: AnomalyReading): ReadingFigures {
  const figures: ReadingFigures = {}
  reading.flags.forEach((flag, i) => {
    const n = i + 1
    figures[`flag_${n}_week_share`] = { value: flag.weekPct, unit: 'pct', label: `${flag.label} — share of the week` }
    figures[`flag_${n}_week_videos`] = { value: flag.weekVideos, unit: 'videos', label: `${flag.label} — videos this week` }
    figures[`flag_${n}_baseline_share`] = { value: flag.baselinePct, unit: 'pct', label: `${flag.label} — share across the three months behind it` }
    figures[`flag_${n}_change`] = { value: flag.verdict?.change ?? 0, unit: 'pts', label: `${flag.label} — the movement` }
    figures[`flag_${n}_band`] = { value: flag.verdict?.band ?? 0, unit: 'pts', label: `${flag.label} — the band it had to clear` }
  })
  if (reading.flags[0]) {
    figures.week_videos = { value: reading.flags[0].weekTotal, unit: 'videos', label: 'videos in the week, every audience together' }
  }
  return figures
}

// ---- The prompt --------------------------------------------------------------

const ExplainerSchema = z.object({
  explanation: z
    .string()
    .describe('One short paragraph saying what the flagged movements look like in the comments, or an empty string.'),
  quotes: z.array(z.string()).describe('The [Q#] tags of the comments drawn on, in order. Empty when none was used.'),
})
type ExplainerOutput = z.infer<typeof ExplainerSchema>

export function explainerSystemPrompt(): string {
  return [
    'You are a media-based consumer intelligence analyst working for a brand.',
    '',
    'Code has already measured something unusual about the week just read: the',
    'VERDICTS below are the movements, and they are facts, not estimates. Your',
    'ONLY job is to say what those movements look like in the comments provided —',
    'what people were actually talking about — in one short paragraph.',
    '',
    'Rules:',
    '- Ground every clause in the COMMENTS below. If they do not account for the',
    '  movement, say so plainly and stop. "The comments this week do not show a',
    '  clear reason" is a valid, expected answer; an invented cause is not.',
    '- Do NOT invent counts, percentages or metrics. Cite a figure only by its',
    '  [[placeholder]], copied exactly. A digit you type deletes the sentence',
    '  it is in.',
    '- Do NOT say which WAY anything is going — no growing, fading, rising,',
    '  declining, trending, momentum. One week against the months behind it can',
    '  say a thing moved; it can never say where it is headed.',
    '- List in `quotes` the [Q#] tags of the comments you drew on, most telling',
    '  first. Do not copy their text into the paragraph; the quotes are printed',
    '  beside it by code.',
    CALIBRATED_PROSE_RULE,
  ].join('\n')
}

export function explainerUserPrompt(args: {
  verdicts: string
  comments: readonly { tag: string; text: string; context: string }[]
  window: AnomalyWindow
}): string {
  const lines: string[] = []
  lines.push(`THE WEEK: ${args.window.from.slice(0, 10)} to ${args.window.to.slice(0, 10)}.`)
  lines.push('')
  lines.push(args.verdicts)
  lines.push('')
  lines.push(`COMMENTS from that week on the flagged material (${args.comments.length}, most-engaged first)`)
  if (args.comments.length === 0) lines.push('- none survived the week. Say that the comments do not account for it.')
  for (const c of args.comments) lines.push(`[${c.tag}] (${c.context}) "${c.text}"`)
  return lines.join('\n')
}

// ---- I/O ---------------------------------------------------------------------

type Admin = ReturnType<typeof createAdminClient>

/** Is this the error this step gets before 20260918096000 is applied? Narrow
 *  and named, the `isMissingMonthlyReading` shape. */
export function isMissingAnomalyFlags(error: unknown): boolean {
  if (!error) return false
  const { code, message } = (typeof error === 'object' ? error : {}) as { code?: string; message?: string }
  const text = message ?? (error instanceof Error ? error.message : String(error))
  if (!text.includes(ANOMALY_FLAGS_TABLE)) return false
  if (code && ['PGRST202', 'PGRST205', '42883', '42P01'].includes(code)) return true
  return /in the schema cache/i.test(text) || /does not exist/i.test(text)
}

/** Every stored month row of one table over a month range. */
async function readMonths(admin: Admin, table: string, clientId: string, months: readonly string[]): Promise<StoredMonthRow[]> {
  if (months.length === 0) return []
  return selectAll<StoredMonthRow>(() =>
    admin
      .from(table)
      .select('*')
      .eq('client_id', clientId)
      .gte('month', months[0])
      .lte('month', months[months.length - 1])
      .order('month', { ascending: true })
      .order('audience', { ascending: true }),
  )
}

interface WindowRow {
  audience: string
  videos: number
  kind?: string
  subject_id?: string
  theme_id?: string
}

async function readWindow(
  admin: Admin,
  fn: string,
  params: Record<string, unknown>,
  order: readonly string[],
): Promise<WindowRow[]> {
  return selectAll<WindowRow>(() => {
    let q = admin.rpc(fn, params)
    for (const column of order) q = q.order(column, { ascending: true })
    return q
  })
}

/** Sum a window read's per-audience rows into the pooled slice, per object. */
const poolWindow = (rows: readonly WindowRow[], idOf: (r: WindowRow) => string | undefined): Map<string, number> => {
  const out = new Map<string, number>()
  for (const r of rows) {
    const id = idOf(r)
    if (!id) continue
    out.set(id, (out.get(id) ?? 0) + (r.videos ?? 0))
  }
  return out
}

/**
 * The comments the explainer is allowed to see.
 *
 * Bounded twice over: the week's most-engaged `WEEK_COMMENT_CAP` comments are
 * read, only those cited by an insight belonging to a flagged object survive,
 * and at most `MAX_EXPLAINER_QUOTES` of those are shown. The text comes back
 * through `insight_evidence` rather than `comments` on purpose — that is where
 * the `redacted = false` rule lives and what an erasure deletes, so an erased
 * comment stops being quotable everywhere at once (lib/quotes.ts).
 */
async function candidateQuotes(
  admin: Admin,
  clientId: string,
  window: AnomalyWindow,
  flags: readonly AnomalyRow[],
  runId: string,
): Promise<{ tag: string; text: string; context: string; ref: string; objectKey: string }[]> {
  if (flags.length === 0) return []

  // A plain capped read, not `selectAll`: the cap IS the point, and paging past
  // it would defeat it.
  const { data: commentData, error: commentError } = await admin
    .from('comments')
    .select('id, likes, platform')
    .eq('client_id', clientId)
    .gte('comment_date', window.from)
    .lt('comment_date', window.to)
    .order('likes', { ascending: false, nullsFirst: false })
    .order('id', { ascending: true })
    .limit(WEEK_COMMENT_CAP)
  if (commentError) throw new Error(`anomaly-check comments: ${commentError.message}`)
  const commentRows = (commentData ?? []) as { id: string; likes: number | null; platform: string | null }[]
  if (commentRows.length === 0) return []
  const commentIds = new Set(commentRows.map((c) => c.id))
  const platformOf = new Map(commentRows.map((c) => [c.id, c.platform ?? 'unknown']))
  const rank = new Map(commentRows.map((c, i) => [c.id, i]))

  // Which insights belong to each flagged object. Every arm is an id set over
  // `audience_insights`, so one evidence read serves all of them.
  const insightToObjects = new Map<string, Set<string>>()
  const attach = (insightId: string, objectKey: string) => {
    const held = insightToObjects.get(insightId) ?? new Set<string>()
    held.add(objectKey)
    insightToObjects.set(insightId, held)
  }

  const kinds = flags.filter((f) => f.kind === 'kind').map((f) => f.id)
  const rivals = flags.filter((f) => f.kind === 'rival').map((f) => f.id)
  const subjects = flags.filter((f) => f.kind === 'subject').map((f) => f.id)
  const themes = flags.filter((f) => f.kind === 'theme').map((f) => f.id)

  if (kinds.length > 0 || rivals.length > 0) {
    const insights = await selectAll<{ id: string; category: string | null; source_video_id: string | null }>(() =>
      admin
        .from('audience_insights_current')
        .select('id, category, source_video_id')
        .eq('client_id', clientId)
        .order('id', { ascending: true }),
    )
    const rivalVideos = new Map<string, string>()
    if (rivals.length > 0) {
      const names = rivals.map((a) => a.slice(RIVAL_PREFIX.length))
      const videos = await selectAll<{ id: string; competitor_name: string | null; is_competitor: boolean | null }>(() =>
        admin
          .from('videos')
          .select('id, competitor_name, is_competitor')
          .eq('client_id', clientId)
          .eq('is_competitor', true)
          .in('competitor_name', names)
          .order('id', { ascending: true }),
      )
      for (const v of videos) if (v.competitor_name) rivalVideos.set(v.id, `${RIVAL_PREFIX}${v.competitor_name}`)
    }
    const wantedKinds = new Set(kinds)
    for (const i of insights) {
      if (i.category && wantedKinds.has(i.category)) attach(i.id, `kind ${i.category}`)
      const audience = i.source_video_id ? rivalVideos.get(i.source_video_id) : undefined
      if (audience) attach(i.id, `rival ${audience}`)
    }
  }

  if (subjects.length > 0) {
    const members = await selectAll<{ subject_id: string; audience_insight_id: string }>(() =>
      admin
        .from('subject_memberships')
        .select('subject_id, audience_insight_id')
        .eq('client_id', clientId)
        .eq('is_member', true)
        .in('subject_id', subjects)
        .order('audience_insight_id', { ascending: true }),
    )
    for (const m of members) attach(m.audience_insight_id, `subject ${m.subject_id}`)
  }

  if (themes.length > 0) {
    const observations = await selectAll<{ registry_id: string; member_insight_ids: string[] | null }>(() =>
      admin
        .from('theme_observations')
        .select('registry_id, member_insight_ids')
        .eq('client_id', clientId)
        .eq('run_id', runId)
        .in('registry_id', themes)
        .order('registry_id', { ascending: true }),
    )
    for (const o of observations) for (const id of o.member_insight_ids ?? []) attach(id, `theme ${o.registry_id}`)
  }

  const insightIds = [...insightToObjects.keys()]
  if (insightIds.length === 0) return []
  const citations = await fetchQuoteCitationsByAudience(admin, insightIds)

  const best = new Map<string, { text: string; context: string; ref: string; objectKey: string; order: number }>()
  for (const [insightId, quotes] of citations) {
    const objects = insightToObjects.get(insightId)
    if (!objects) continue
    for (const q of quotes) {
      if (!q.commentId || !commentIds.has(q.commentId)) continue
      const order = rank.get(q.commentId) ?? Number.MAX_SAFE_INTEGER
      const objectKey = [...objects][0]
      const held = best.get(q.commentId)
      if (!held || order < held.order) {
        best.set(q.commentId, {
          text: q.quote.replace(/\s+/g, ' ').trim(),
          context: platformOf.get(q.commentId) ?? 'unknown',
          ref: q.commentId,
          objectKey,
          order,
        })
      }
    }
  }

  return [...best.values()]
    .filter((q) => q.text.length > 0)
    .sort((a, b) => a.order - b.order)
    .slice(0, MAX_EXPLAINER_QUOTES)
    .map((q, i) => ({ tag: `Q${i + 1}`, text: q.text, context: q.context, ref: q.ref, objectKey: q.objectKey }))
}

/** What the explainer call returns, so a test can drive the path without a
 *  model and without a network. */
export interface ExplainerCall {
  draft: string | null
  usedTags: string[]
  costUsd: number
  model: string | null
}

export type Explainer = (args: {
  system: string
  user: string
}) => Promise<ExplainerCall>

/** The real one. Absent key, a refusal or a parse failure all end the same way:
 *  no draft, and the product composes the slot itself and says so. */
function openAiExplainer(admin: Admin, clientId: string, runId: string, persist: boolean): Explainer {
  return async ({ system, user }) => {
    if (!process.env.OPENAI_API_KEY) return { draft: null, usedTags: [], costUsd: 0, model: null }
    const startedAt = Date.now()
    let usage = { prompt_tokens: 0, completion_tokens: 0 }
    let parsed: ExplainerOutput | null = null
    let error: string | null = null
    try {
      const completion = await openai.chat.completions.parse({
        model: ANOMALY_EXPLAINER_MODEL,
        ...samplingParams(ANOMALY_EXPLAINER_MODEL),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: zodResponseFormat(ExplainerSchema, 'anomaly_explanation'),
      })
      parsed = completion.choices[0]?.message?.parsed ?? null
      if (completion.usage) {
        usage = { prompt_tokens: completion.usage.prompt_tokens, completion_tokens: completion.usage.completion_tokens }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
    const costUsd = estimateCost(ANOMALY_EXPLAINER_MODEL, usage.prompt_tokens, usage.completion_tokens)
    if (persist) {
      await logAiCall(admin, {
        clientId,
        runId,
        pass: 'anomaly_explainer',
        callIndex: 1,
        model: ANOMALY_EXPLAINER_MODEL,
        promptVersion: ANOMALY_PROMPT_VERSION,
        systemPrompt: system,
        userPrompt: user,
        response: parsed ? { quotes: parsed.quotes.length, chars: parsed.explanation.length } : null,
        error,
        usage,
        durationMs: Date.now() - startedAt,
        validationStatus: error ? 'parse_error' : 'ok',
      })
    }
    return {
      draft: parsed?.explanation?.trim() || null,
      usedTags: parsed?.quotes ?? [],
      costUsd,
      model: ANOMALY_EXPLAINER_MODEL,
    }
  }
}

export interface RunAnomalyCheckArgs {
  clientId: string
  runId: string
  /** The run's frozen window (`pipeline_runs.window_start` / `window_end`). A
   *  run with no start covered no week and is not read. */
  window: { start: string | null; end: string } | null
  /** Videos this update held, for the thin gate. Null when nobody counted. */
  updateVideos?: number | null
  admin?: Admin
  now?: string
  /** False for a replay: read, decide, return, write nothing and call nothing. */
  persist?: boolean
  explainer?: Explainer
}

/**
 * Read the week, decide, write the flags, explain them if there are any.
 *
 * Every exit is a value, never a throw, except for a database error that is not
 * a missing migration: the caller logs the line and the update carries on.
 */
export async function runAnomalyCheck(args: RunAnomalyCheckArgs): Promise<AnomalyCheckResult> {
  const admin = args.admin ?? createAdminClient()
  const persist = args.persist !== false
  const readAt = args.now ?? new Date().toISOString()
  const empty = {
    reading: null,
    registration: null,
    suppression: null,
    written: 0,
    explanation: null,
    costUsd: 0,
  }

  if (!args.window?.start) {
    return { ...empty, status: 'no_window', note: 'this update covered no window — nothing to compare a week against' }
  }
  const window: AnomalyWindow = { from: args.window.start, to: args.window.end }

  // The thin gate, before anything is read: a week measured off an update that
  // did not finish, or read half its usual corpus, is our coverage moving.
  const trailing = await selectAll<{ id: string; videos_scraped: number | null; status: string; stalled?: boolean | null }>(() =>
    admin
      .from('pipeline_runs')
      .select('id, videos_scraped, status')
      .eq('client_id', args.clientId)
      .neq('id', args.runId)
      .in('status', ['completed', 'partial'])
      .order('started_at', { ascending: false })
      .limit(8),
  )
  const thisRun = await admin
    .from('pipeline_runs')
    .select('status, stalled')
    .eq('id', args.runId)
    .maybeSingle()
  const size: UpdateSize = {
    analysedVideos: args.updateVideos ?? null,
    status: (thisRun.data?.status as string | undefined) ?? null,
    stalled: (thisRun.data?.stalled as boolean | undefined) ?? null,
  }
  const suppression = thinUpdate(
    size,
    trailing.map((r) => ({ analysedVideos: r.videos_scraped })),
  )
  if (suppression.suppressed) {
    return { ...empty, status: 'suppressed', suppression, note: `week not read — ${suppression.reason}` }
  }

  const months = trailingCompleteMonths(window.from, BASELINE_MONTHS)

  let reading: AnomalyReading
  let registration: PreRegistration
  let regimes: Map<string, BaselineRegime>
  try {
    const built = await buildReading(admin, args.clientId, args.runId, window, months)
    reading = built.reading
    registration = built.registration
    regimes = built.regimes
  } catch (e) {
    if (!isMissingMonthTable(e) && !isMissingKindMoodAttention(e)) throw e
    return { ...empty, status: 'missing_migration', note: 'skipped: the month reading and window functions have not been applied yet' }
  }

  if (reading.flags.length === 0) {
    return {
      ...empty,
      status: 'nothing_unusual',
      reading,
      registration,
      suppression,
      note: `nothing unusual — ${reading.tested} of ${reading.setSize} objects tested`,
    }
  }

  // ---- The one model call, and only now ----
  const quotes = await candidateQuotes(admin, args.clientId, window, reading.flags, args.runId)
  const figures = proseFigures(anomalyFigures(reading))
  const verdicts = reading.flags.map((f) => anomalyVerdict(f, window, { from: months[0], to: window.from }))
  const explainer = args.explainer ?? openAiExplainer(admin, args.clientId, args.runId, persist)
  const call = await explainer({
    system: explainerSystemPrompt(),
    user: explainerUserPrompt({ verdicts: verdictBlock(verdicts, figures), comments: quotes, window }),
  })

  // The model may name which comments it drew on; the refs shown are those,
  // in its order, and otherwise the most-engaged ones. Either way the words
  // never travel — `composeInterpretation` takes refs and the surface resolves
  // them at render.
  const byTag = new Map(quotes.map((q) => [q.tag, q]))
  const chosen = call.usedTags
    .map((t) => byTag.get(String(t).replace(/[^A-Za-z0-9]/g, '').toUpperCase()))
    .filter((q): q is (typeof quotes)[number] => q != null)
  const shown = (chosen.length > 0 ? chosen : quotes).slice(0, MAX_FLAGS)
  const refs: QuoteRef[] = shown.map((q) => ({ ref: q.ref, context: q.context }))

  const explanation = composeInterpretation('interpretation_anomaly', verdicts, figures, refs, {
    draft: call.draft,
    allow: allowTokens(reading.flags.map((f) => f.label)),
  })

  const rows = flagRows({
    clientId: args.clientId,
    runId: args.runId,
    window,
    reading,
    baselineMonths: months,
    regimes,
    readAt,
    explanation,
    explanationModel: call.model,
  })

  let written = 0
  if (persist) {
    try {
      // ON CONFLICT DO NOTHING: a flag is a statement made once. A retry of
      // this step re-inserts nothing, and the table holds no UPDATE privilege
      // to rewrite one with (20260918096000).
      const { data, error } = await admin
        .from(ANOMALY_FLAGS_TABLE)
        .upsert(rows, { onConflict: 'client_id,run_id,object_kind,object_id', ignoreDuplicates: true })
        .select('object_id')
      if (error) throw error
      written = data?.length ?? 0
    } catch (e) {
      if (!isMissingAnomalyFlags(e)) throw e
      return {
        status: 'missing_migration',
        note: 'skipped: supabase/migrations/20260918096000_anomaly_flags.sql has not been applied yet',
        reading,
        registration,
        suppression,
        written: 0,
        explanation,
        costUsd: call.costUsd,
      }
    }
  }

  return {
    status: 'flagged',
    note:
      `${reading.flaggedCount} flagged of ${reading.tested} tested in a set of ${reading.setSize} · ` +
      `${written} written · ${explanation.fallback ? 'explanation written in code' : 'explanation drafted'}`,
    reading,
    registration,
    suppression,
    written,
    explanation,
    costUsd: call.costUsd,
  }
}

/** The read and the arithmetic, with no model and no write — the half a replay
 *  wants on its own. */
export async function buildReading(
  admin: Admin,
  clientId: string,
  runId: string,
  window: AnomalyWindow,
  months: readonly string[],
): Promise<{ reading: AnomalyReading; registration: PreRegistration; regimes: Map<string, BaselineRegime> }> {
  // ---- the baseline, off the stored record ----
  const [denominatorMonths, kindMonths, subjectMonths, themeMonths] = await Promise.all([
    readMonths(admin, TABLE_DENOMINATORS, clientId, months),
    readMonths(admin, TABLE_KIND_READINGS, clientId, months),
    readMonths(admin, TABLE_SUBJECT_READINGS, clientId, months),
    readMonths(admin, TABLE_THEME_READINGS, clientId, months),
  ])

  // ---- the week, off the window functions ----
  const [weekDenominators, weekKinds, weekSubjects, weekThemes] = await Promise.all([
    readWindow(admin, RPC_WINDOW_DENOMINATORS, { p_client: clientId, p_from: window.from, p_to: window.to }, ['audience']),
    readWindow(admin, RPC_WINDOW_KIND_READINGS, { p_client: clientId, p_from: window.from, p_to: window.to }, ['audience', 'kind']),
    readWindow(admin, RPC_WINDOW_SUBJECT_READINGS, { p_client: clientId, p_from: window.from, p_to: window.to }, ['audience', 'subject_id']),
    readWindow(
      admin,
      RPC_WINDOW_THEME_READINGS,
      { p_client: clientId, p_run: runId, p_from: window.from, p_to: window.to },
      ['audience', 'theme_id'],
    ),
  ])

  const series = {
    name: SLICE,
    // Pooling audiences IS the distinct count, not an approximation of one: a
    // video sits in exactly one audience (lib/reading/coverage.ts).
    weekVideos: weekDenominators.reduce((total, r) => total + (r.videos ?? 0), 0),
    months: pooledMonths(denominatorMonths, months),
  }

  const weekByAudience = poolWindow(weekDenominators, (r) => r.audience)
  const weekKindVideos = poolWindow(weekKinds, (r) => r.kind)
  const weekSubjectVideos = poolWindow(weekSubjects, (r) => r.subject_id)
  const weekThemeVideos = poolWindow(weekThemes, (r) => r.theme_id)

  const baselineKinds = pooledByObject(kindMonths, (r) => (r as { kind?: string }).kind ?? null, months)
  const baselineSubjects = pooledByObject(subjectMonths, (r) => (r as { subject_id?: string }).subject_id ?? null, months)
  const baselineThemes = pooledByObject(themeMonths, (r) => (r as { theme_id?: string }).theme_id ?? null, months)
  const baselineRivals = pooledByObject(
    denominatorMonths.filter((r) => r.audience.startsWith(RIVAL_PREFIX)),
    (r) => r.audience,
    months,
  )

  // ---- labels ----
  const [rivals, subjects, themeLabels] = await Promise.all([
    loadCompetitors(admin, clientId).catch((e) => {
      if (isMissingCompetitors(e)) return []
      throw e
    }),
    selectAll<{ id: string; name: string }>(() =>
      admin.from('subjects').select('id, name').eq('client_id', clientId).eq('status', 'active').order('id', { ascending: true }),
    ).catch(() => [] as { id: string; name: string }[]),
    selectAll<{ id: string; canonical_label: string | null }>(() =>
      admin.from('theme_registry').select('id, canonical_label').eq('client_id', clientId).order('id', { ascending: true }),
    ),
  ])

  const candidates: PreRegisteredObject[] = []
  for (const kind of KIND_SET) {
    candidates.push({
      kind: 'kind',
      id: kind,
      label: kindLabel(kind),
      denominator: SLICE,
      weekVideos: weekKindVideos.get(kind) ?? 0,
      months: baselineKinds.get(kind) ?? [],
    })
  }
  for (const rival of rivals.filter((r) => !r.retired_at)) {
    const audience = `${RIVAL_PREFIX}${rival.name}`
    candidates.push({
      kind: 'rival',
      id: audience,
      label: rival.name,
      denominator: SLICE,
      weekVideos: weekByAudience.get(audience) ?? 0,
      months: baselineRivals.get(audience) ?? [],
    })
  }
  for (const subject of subjects) {
    candidates.push({
      kind: 'subject',
      id: subject.id,
      label: subject.name,
      denominator: SLICE,
      weekVideos: weekSubjectVideos.get(subject.id) ?? 0,
      months: baselineSubjects.get(subject.id) ?? [],
    })
  }
  const labelOf = new Map(themeLabels.map((t) => [t.id, t.canonical_label ?? '(unlabelled)']))
  for (const [themeId, monthsOf] of baselineThemes) {
    candidates.push({
      kind: 'theme',
      id: themeId,
      label: labelOf.get(themeId) ?? themeId.slice(0, 8),
      denominator: SLICE,
      weekVideos: weekThemeVideos.get(themeId) ?? 0,
      months: monthsOf,
    })
  }

  const registration = preRegisteredSet({ denominators: [series], candidates })
  const reading = weekVsBaseline({
    week: window.from.slice(0, 10),
    denominators: [series],
    set: registration.set,
  })

  // The comparability answer, per object. A kind has no grouping to be
  // like-for-like about; a theme's is the run's clustering fingerprint; a
  // subject's is the judge that decided its membership.
  const regimes = new Map<string, BaselineRegime>()
  for (const [id, r] of regimesByObject(themeMonths, (row) => (row as { theme_id?: string }).theme_id ?? null, (row) => row.clustering_key, months)) {
    regimes.set(`theme ${id}`, r)
  }
  for (const [id, r] of regimesByObject(subjectMonths, (row) => (row as { subject_id?: string }).subject_id ?? null, (row) => row.judge_version, months)) {
    regimes.set(`subject ${id}`, r)
  }

  return { reading, registration, regimes }
}
