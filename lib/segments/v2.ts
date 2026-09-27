import { createHash } from 'node:crypto'

import type { AiLogArgs } from '../pipeline/ai-log'
import {
  JUDGE_ROLES, ROLE_SEGMENT, SEGMENT_JUDGE_PASS, SEGMENT_JUDGE_VERSION, judgeReason,
  type JudgeRole, type SegmentJudgeBatchResult, type SegmentJudgement,
} from './judge'
import type { Segment } from './rules'

// segments_v2's pure half (plan WP3.2): the rows a judgement becomes, the
// ledger row a call becomes, the judged plan file label-segments --rule
// segments_v2 writes and applies, and the 50-video hand check that decides
// whether v2 may set the default view (decision F).
//
// SPENDING AND WRITING ARE TWO PASTES. `label-segments --rule segments_v2
// --spend --plan-out <file>` calls the model and writes only that local file;
// `--apply --from-plan <file>` writes the file's labels with no model call. So
// the hand check can score the judge BEFORE any label lands, and a plan that
// fails it is simply never applied.

// ---- Rows -------------------------------------------------------------------------

/** One `video_segments` insert for a judged video. */
export interface JudgeRow {
  client_id: string
  video_id: string
  rule_version: typeof SEGMENT_JUDGE_VERSION
  segment: Segment
  method: 'judge'
  reason: string
  actor_label: string
}

/** The judge's rows. decided_at is the database's now(). */
export function judgeRows(clientId: string, judgements: readonly Pick<SegmentJudgement, 'videoId' | 'segment' | 'reason'>[], actorLabel: string): JudgeRow[] {
  return judgements.map((j) => ({
    client_id: clientId, video_id: j.videoId, rule_version: SEGMENT_JUDGE_VERSION, segment: j.segment, method: 'judge',
    reason: j.reason, actor_label: actorLabel,
  }))
}

/** Insert-if-absent: MF1's unique index holds one judge row per video and
 *  version, and one duplicate fails a whole insert, so the held are left out. */
export function freshJudgements<T extends { videoId: string }>(judgements: readonly T[], held: ReadonlySet<string>): T[] {
  const seen = new Set<string>()
  return judgements.filter((j) => !held.has(j.videoId) && !seen.has(j.videoId) && (seen.add(j.videoId), true))
}

/** The ai_call_log row for one judged batch (lib/pipeline/ai-log.ts logAiCall). */
export function judgeLogArgs(r: SegmentJudgeBatchResult, a: { clientId: string; runId: string | null; callIndex: number }): AiLogArgs {
  return {
    clientId: a.clientId, runId: a.runId, pass: SEGMENT_JUDGE_PASS, callIndex: a.callIndex, model: r.call.model,
    promptVersion: r.call.promptVersion, systemPrompt: r.call.systemPrompt, userPrompt: r.call.userPrompt, response: r.call.response,
    error: r.error, usage: r.usage, durationMs: r.durationMs, validationStatus: r.error ? 'error' : r.missing.length > 0 ? 'partial' : 'ok',
  }
}

// ---- The judged plan file ---------------------------------------------------------

export const V2_PLAN_KIND = 'segments_v2_plan'

/** What the hand check shows of a judged video. `category` is the category
 *  side of the market (not the client's own post, not filed under a rival). */
export interface PlanVideo {
  id: string
  platform: string
  account: string | null
  caption: string | null
  hashtags: string[]
  topics: string[]
  category: boolean
  lane: string | null
}

export interface PlanLabel { videoId: string; role: JudgeRole; segment: Segment; reason: string; why: string }

export interface PlanCall {
  callIndex: number
  videos: number
  usage: { prompt_tokens: number; completion_tokens: number }
  costUsd: number
  durationMs: number
  error: string | null
  missing: number
}

export interface V2Plan {
  kind: typeof V2_PLAN_KIND
  version: typeof SEGMENT_JUDGE_VERSION
  project: string
  clientId: string
  createdAt: string
  gitSha: string
  model: string
  promptVersion: string
  maxUsd: number
  costUsd: number
  calls: PlanCall[]
  labels: PlanLabel[]
  /** Videos no verdict came back for: judged again next time. */
  missing: string[]
  videos: PlanVideo[]
}

/** Read a plan back, refusing anything that is not one, or is another
 *  project's or tenant's. Sentences, so a paste stops at the first line. */
export function parsePlan(json: unknown, expect: { project?: string; clientId?: string } = {}): V2Plan {
  const p = json as Partial<V2Plan> | null
  if (!p || p.kind !== V2_PLAN_KIND || p.version !== SEGMENT_JUDGE_VERSION) {
    throw new Error(`not a ${SEGMENT_JUDGE_VERSION} plan (label-segments --rule segments_v2 --spend --plan-out writes one)`)
  }
  if (!Array.isArray(p.labels) || !Array.isArray(p.videos) || !Array.isArray(p.calls) || !Array.isArray(p.missing)) throw new Error('the plan is incomplete: labels, videos, calls or missing is not a list')
  if (expect.project && p.project !== expect.project) throw new Error(`the plan was judged on ${p.project}, not --project ${expect.project}`)
  if (expect.clientId && p.clientId !== expect.clientId) throw new Error(`the plan is client ${p.clientId}, not ${expect.clientId}`)
  const seen = new Set<string>()
  for (const l of p.labels) {
    if (!(JUDGE_ROLES as readonly string[]).includes(l.role) || ROLE_SEGMENT[l.role] !== l.segment || l.reason !== judgeReason(l.role)) {
      throw new Error(`the plan's label for ${l.videoId} does not match its role (${l.role} / ${l.segment} / ${l.reason})`)
    }
    if (seen.has(l.videoId)) throw new Error(`the plan labels ${l.videoId} twice`)
    seen.add(l.videoId)
  }
  return p as V2Plan
}

export interface PlanTally { roles: Record<JudgeRole, number>; segments: Record<Segment, number>; videos: number }

/** Role and segment counts over the given labels. */
export function tallyLabels(labels: readonly Pick<PlanLabel, 'role' | 'segment'>[]): PlanTally {
  const roles = Object.fromEntries(JUDGE_ROLES.map((r) => [r, 0])) as Record<JudgeRole, number>
  const segments: Record<Segment, number> = { market: 0, maker: 0, noise: 0 }
  for (const l of labels) { roles[l.role]++; segments[l.segment]++ }
  return { roles, segments, videos: labels.length }
}

// ---- The hand check ---------------------------------------------------------------

/** Decision F's bar, for maker and off-topic precision alike. */
export const HAND_CHECK_PRECISION = 0.8

/** A stratum: what the judge said, grouped as the precision needs it. */
export type Stratum = 'maker' | 'off-topic' | 'market'
export const stratumOf = (role: JudgeRole): Stratum => (role === 'maker' ? 'maker' : role === 'off-topic' ? 'off-topic' : 'market')

/** The agent's fresh 50: twenty the judge called makers, twenty it called
 *  off-topic (the two precisions), and ten it left in the market (what it
 *  missed). Then Heinrich's 20: ten and ten more of the two it marked. */
export const AGENT_DRAW: Readonly<Record<Stratum, number>> = { maker: 20, 'off-topic': 20, market: 10 }
export const HEINRICH_DRAW: Readonly<Record<Stratum, number>> = { maker: 10, 'off-topic': 10, market: 0 }

const md5 = (s: string): string => createHash('md5').update(s).digest('hex')
const byKey = (key: (id: string) => string) => (a: string, b: string) => {
  const ka = key(a); const kb = key(b)
  return ka < kb ? -1 : ka > kb ? 1 : 0
}

/** The research's 150 hand labels (CQ §C): the first 150, in md5(id) order, of
 *  the Aug–Sep category videos (not the client's own, not a rival's, full lane,
 *  a comment dated in August or September). The same rule
 *  scripts/pg-shim/segments-parity.ts reproduces them by, from WP0.1's export. */
export function researchSample(exp: {
  videos: readonly { id: string; is_client: boolean | null; is_competitor: boolean | null; analyzed_lane: string | null }[]
  videoMonths: readonly { video_id: string; month: string }[]
}, n = 150): string[] {
  const inAugSep = new Set(exp.videoMonths.filter((r) => r.month.startsWith('2026-08') || r.month.startsWith('2026-09')).map((r) => r.video_id))
  return exp.videos
    .filter((v) => v.is_client !== true && v.is_competitor !== true && v.analyzed_lane === 'full' && inAugSep.has(v.id))
    .map((v) => v.id)
    .sort(byKey(md5))
    .slice(0, n)
}

/** Ids in a seeded order: md5 of `${seed}:${id}`. The same seed draws the same
 *  sample; a new seed a fresh one. */
export const seededOrder = (ids: readonly string[], seed: string): string[] => [...ids].sort(byKey((id) => md5(`${seed}:${id}`)))

/** One row of the sheet. The judge's answer is NOT on it: the labeller works
 *  blind, and the score joins the plan back in. */
export interface HandCheckItem {
  id: string
  platform: string
  account: string | null
  caption: string | null
  hashtags: string[]
  topics: string[]
  /** The labeller's role, one of JUDGE_ROLES, or 'skip' for a video that can
   *  no longer be judged (deleted, private). Null until labelled. */
  label: JudgeRole | 'skip' | null
  note: string
}

export const HAND_CHECK_KIND = 'segments_v2_hand_check'

export interface HandCheckSheet {
  kind: typeof HAND_CHECK_KIND
  seed: string
  clientId: string
  project: string
  plan: { file: string; createdAt: string; promptVersion: string }
  drawnAt: string
  /** Eligible videos, and how many of them the research's 150 took out. */
  eligible: number
  excluded: number
  agent: HandCheckItem[]
  heinrich: HandCheckItem[]
}

export interface HandCheckDraw {
  agent: HandCheckItem[]
  heinrich: HandCheckItem[]
  eligible: number
  excluded: number
  /** Strata the eligible videos could not fill: [stratum, wanted, got]. */
  short: [Stratum, number, number][]
}

/**
 * Draw the fresh 50 and Heinrich's 20 from a judged plan: the category videos
 * of the full lane (the market's category side, where the research's 150 came
 * from) that the judge labelled, less the research's 150. Seeded, so a re-run
 * draws the same videos; disjoint, so no video is checked twice.
 */
export function drawHandCheck(plan: Pick<V2Plan, 'labels' | 'videos'>, exclude: ReadonlySet<string>, seed: string): HandCheckDraw {
  if (!seed.trim()) throw new Error('the hand check needs a --seed: a new one draws a fresh sample')
  const role = new Map(plan.labels.map((l) => [l.videoId, l.role]))
  const byId = new Map(plan.videos.map((v) => [v.id, v]))
  const pool = plan.videos.filter((v) => v.category && v.lane === 'full' && role.has(v.id))
  const eligible = pool.filter((v) => !exclude.has(v.id)).map((v) => v.id)
  const order = seededOrder(eligible, seed)
  const item = (id: string): HandCheckItem => {
    const v = byId.get(id)!
    return { id, platform: v.platform, account: v.account, caption: v.caption, hashtags: v.hashtags, topics: v.topics, label: null, note: '' }
  }
  const agent: string[] = []
  const heinrich: string[] = []
  const short: [Stratum, number, number][] = []
  for (const s of ['maker', 'off-topic', 'market'] as const) {
    const ids = order.filter((id) => stratumOf(role.get(id)!) === s)
    const a = ids.slice(0, AGENT_DRAW[s])
    const h = ids.slice(AGENT_DRAW[s], AGENT_DRAW[s] + HEINRICH_DRAW[s])
    if (a.length + h.length < AGENT_DRAW[s] + HEINRICH_DRAW[s]) short.push([s, AGENT_DRAW[s] + HEINRICH_DRAW[s], a.length + h.length])
    agent.push(...a)
    heinrich.push(...h)
  }
  // Mixed on the sheet, so its order says nothing about what the judge said.
  const shuffle = (ids: string[]) => [...ids].sort(byKey((id) => md5(`${seed}:sheet:${id}`))).map(item)
  return { agent: shuffle(agent), heinrich: shuffle(heinrich), eligible: eligible.length, excluded: pool.length - eligible.length, short }
}

export interface Precision { k: number; n: number; precision: number | null; pass: boolean }

export interface HandCheckScore {
  maker: Precision
  offTopic: Precision
  /** What the judge left in the market that the labeller called maker or off-topic. */
  marketMissed: { k: number; n: number }
  labelled: number
  items: number
  /** Items drawn whose video the plan does not hold (a different plan). */
  unknown: string[]
  verdict: 'pass' | 'below' | 'incomplete'
}

const precision = (k: number, n: number): Precision => {
  const p = n > 0 ? k / n : null
  return { k, n, precision: p, pass: p !== null && p >= HAND_CHECK_PRECISION }
}

/** Score the labelled items against what the judge said. Items labelled
 *  'skip' leave the count; an unlabelled item makes the check incomplete. */
export function scoreHandCheck(items: readonly HandCheckItem[], labels: readonly Pick<PlanLabel, 'videoId' | 'role'>[]): HandCheckScore {
  const role = new Map(labels.map((l) => [l.videoId, l.role]))
  let mk = 0; let mn = 0; let ok = 0; let on = 0; let missK = 0; let missN = 0; let labelled = 0
  const unknown: string[] = []
  for (const it of items) {
    const said = role.get(it.id)
    if (!said) { unknown.push(it.id); continue }
    if (it.label == null) continue
    labelled++
    if (it.label === 'skip') continue
    const s = stratumOf(said)
    if (s === 'maker') { mn++; if (it.label === 'maker') mk++ }
    else if (s === 'off-topic') { on++; if (it.label === 'off-topic') ok++ }
    else { missN++; if (it.label === 'maker' || it.label === 'off-topic') missK++ }
  }
  const maker = precision(mk, mn)
  const offTopic = precision(ok, on)
  const complete = labelled === items.length && unknown.length === 0
  return {
    maker, offTopic, marketMissed: { k: missK, n: missN }, labelled, items: items.length, unknown,
    verdict: !complete ? 'incomplete' : maker.pass && offTopic.pass ? 'pass' : 'below',
  }
}

// ---- The script's modes (label-segments --rule segments_v2) -----------------------

/**
 * - `project`: the default. Reads, prices the judge from the prompts it would
 *   send, and calls NO model.
 * - `judge`: `--spend --plan-out <file>`. Calls the model, refused above
 *   --max-usd before the first call, and writes only the local plan file.
 * - `review`: `--from-plan <file>`. Reads the plan against the database and
 *   prints what an apply would write. No model, no write.
 * - `apply`: `--apply --from-plan <file>`. Writes the plan's labels. No model.
 */
export type V2Mode = 'project' | 'judge' | 'review' | 'apply'

/** The mode the flags ask for, or a refusal in a sentence. Only `--spend`
 *  reaches the model, and never together with a write. */
export function v2Mode(a: { apply: boolean; spend: boolean; planOut?: string; fromPlan?: string }): V2Mode {
  const name = 'label-segments --rule segments_v2'
  if (a.spend && a.apply) throw new Error(`${name}: spending and writing are two pastes: judge with --spend --plan-out <file>, then --apply --from-plan <file>`)
  if (a.spend && a.fromPlan) throw new Error(`${name}: --from-plan applies labels already paid for; it takes no --spend`)
  if (a.spend && !a.planOut) throw new Error(`${name}: --spend needs --plan-out <new file>, so the labels paid for are kept`)
  if (!a.spend && a.planOut) throw new Error(`${name}: --plan-out is written only by a judged run (--spend)`)
  if (a.apply && !a.fromPlan) throw new Error(`${name}: --apply writes a judged plan: --apply --from-plan <file>. It never calls the model`)
  if (a.fromPlan) return a.apply ? 'apply' : 'review'
  return a.spend ? 'judge' : 'project'
}

/** decision L's band for the judge, once: $0.50–1.00. The default cap is its top. */
export const JUDGE_MAX_USD_DEFAULT = 1

/** --max-usd, in US dollars. */
export function parseMaxUsd(v: string | undefined): number {
  if (v === undefined) return JUDGE_MAX_USD_DEFAULT
  const n = Number(v)
  if (!/^\d+(\.\d+)?$/.test(v.trim()) || !Number.isFinite(n)) throw new Error(`label-segments: --max-usd is a number of US dollars, got ${v}`)
  return n
}

/** The change row's sentence (client words: no digit, no em dash). Heinrich
 *  approves it in the dry run's print before the apply, as with WP1.4's notes. */
export const SEGMENT_V2_NOTE =
  'We re-marked which videos are makers’ own projects and which are off-topic, reading each video’s caption and tags. Nothing was taken out of any count.'
