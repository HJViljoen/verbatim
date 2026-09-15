import { z } from 'zod'
import { zodResponseFormat } from 'openai/helpers/zod'

import { chunk } from '../chunk'
import { ANALYSIS_TEMPERATURE, RUN_MODEL_BUDGET_USD, estimateCost } from '../config'
import { openai } from '../openai'
import { embeddingCoverage } from '../agent/retrieve'
import { logAiCall } from '../pipeline/ai-log'
import { embedTexts } from '../pipeline/cluster'
import { createAdminClient, selectAll } from '../supabase-admin'
import {
  JUDGE_VERSION,
  RPC_SUBJECT_BAND,
  SUBJECT_EMBED_INPUT_VERSION,
  SUBJECT_JUDGE_BATCH,
  SUBJECT_JUDGE_MODEL,
  SUBJECT_JUDGE_PROMPT_VERSION,
  SUBJECT_MATCH_HIGH,
  SUBJECT_MATCH_LOW,
  SUBJECT_MIN_COVERAGE,
  TABLE_SUBJECTS,
  TABLE_SUBJECT_MEMBERSHIPS,
  isMissingSubjects,
  subjectEmbedInput,
  type BandedPair,
  type Subject,
  type SubjectMembershipRow,
} from './types'

// Subject membership: who belongs to which subject, and what it costs.
//
// THE SHAPE, AND WHY IT IS THIS SHAPE.
//
// Two decisions, one cheap and one dear. The cheap one is the phrase vector:
// an insight far from the subject is not a member and an insight very close to
// it is, and neither answer is worth a model call. The dear one is the band in
// between, which is where the actual judgement lives — and which is 24-47% of
// the embedded corpus, not the design's assumed 15% (refute-04 §2.2, measured
// over the whole embedded population on both tenants).
//
// FAN-OUT IS PER SUBJECT, NOT PER BATCH OF INSIGHTS. Össur's band is ~1,345
// insights and a judge call takes twenty of them, which is ~68 sequential calls
// — well past the 300 s route cap, so this cannot be one step. Partitioning by
// subject gives a bounded, data-independent fan-out (5-8 steps, against an
// account concurrency of 5), lets each step read its own band with one RPC
// call, and keeps a failure to one subject instead of all of them. The cost is
// that an insight banded against two subjects has its text sent twice: ~1.58
// pairs per banded insight measured, so ~1.6x the input tokens of a per-insight
// batching, which at the measured shape is $0.17 against $0.14 an update for
// Össur. Three cents for a step that cannot time out is the right trade.
//
// COST, FROM REAL COUNTS (2026-09-15, both tenants, read-only):
//   Össur   3,129 live insights · band 1,236-1,480 at 5-8 subjects
//           → ~2,100 pairs → ~107 calls → ~$0.17 per full re-judge
//   Sealand 2,872 live insights · band   816-  959
//           → ~1,300 pairs → ~66 calls  → ~$0.10
// A full re-judge is the pessimistic case and happens when JUDGE_VERSION moves
// or a Pass A prompt bump re-mints every insight id. The steady state is much
// smaller: one run replaced 20.1% of Össur's live insights and 33.8% of
// Sealand's, and only those need deciding, because subject_band() returns only
// pairs with no decision at this JUDGE_VERSION.
//
// IT REFUSES RATHER THAN UNDER-COUNTS. An unembedded insight is invisible to
// subject_band(), so scoring against a half-embedded corpus does not read low,
// it reads WRONG and says nothing about it. The research measured Össur at
// 53.7% and Sealand at 27.3% earlier on 2026-09-15; by the afternoon the
// backfill had been run and both read 3,129/3,129 and 2,872/2,872 — so the
// gate is satisfied today and is here for the next time it is not. A Pass A
// prompt bump re-mints every insight id with a NULL vector, and that is a
// tenant back at 0% with nothing on any surface saying so. Below
// SUBJECT_MIN_COVERAGE the pass writes nothing and logs `coverage_short`.
//
// AND THE REFUSAL HAS TO REACH THE RECORD, not just this table. Memberships
// persist between runs, so a refusal here does not make the month reading
// EMPTY the way a failed theme pass does — it makes it short, and freeze-months
// would write that down and freeze it. `subjectFreezeHold` (lib/subjects/read.ts)
// is the link: whatever this pass says it did not decide, the same run's freeze
// declines to write a subject month around.

/** The fraction of a run's model budget this pass may spend before it stops.
 *
 *  `RUN_MODEL_BUDGET_USD` is a kill switch for the whole run, checked at every
 *  step boundary (`assertWithinBudget`), and tripping it fails the run and
 *  emails. A membership pass that measures $0.17 has no business being the
 *  thing that does that, so it carries its own ceiling at 5% of the run's —
 *  $3.00 at the default $60, roughly 18x the measured cost. Past it the pass
 *  stops, keeps what it has already written, and says so; the rest is still
 *  undecided next run, which is the retry.
 *
 *  It is the PASS's ceiling in both runners, and that takes arithmetic in each
 *  because the two spend differently. `judgeAllSubjects` subtracts as it goes.
 *  The pipeline does not call it — every subject is its own retryable step — so
 *  the step loop sums the previous steps' `costUsd` and hands each step what is
 *  left. Handing each step the whole ceiling instead would make the real
 *  ceiling eight times this one, and `assertWithinBudget` would not catch it:
 *  it trips at RUN_MODEL_BUDGET_USD, by which point the run has failed. */
export const SUBJECT_BUDGET_SHARE = 0.05

export const subjectBudgetUsd = (runBudget = RUN_MODEL_BUDGET_USD): number => runBudget * SUBJECT_BUDGET_SHARE

export const SUBJECT_JUDGE_PASS = 'subject_judge'

// ---- Pure -------------------------------------------------------------------

/** The judge's answer shape. One decision per insight ref — the batch is one
 *  subject's band, so the subject is in the system prompt and never in the
 *  answer, which removes a whole class of mis-attribution. */
export const SubjectJudgeSchema = z.object({
  decisions: z.array(
    z.object({
      ref: z.string(),
      belongs: z.boolean(),
    }),
  ),
})
export type SubjectJudgeOutput = z.infer<typeof SubjectJudgeSchema>

/** One insight as the judge sees it. */
export interface JudgeCandidate {
  id: string
  theme: string
  description: string
  score: number
}

/** Split one subject's band into call-sized batches. Twenty insights a call,
 *  the design's number; at ~25 output tokens a decision that is ~500 output
 *  tokens, which is a shape `classify_meta` has run 252 times. */
export function planJudgeBatches(
  band: readonly JudgeCandidate[],
  batchSize = SUBJECT_JUDGE_BATCH,
): JudgeCandidate[][] {
  return chunk([...band], batchSize)
}

/** Is the corpus embedded enough to count a subject against it? */
export function coverageClears(
  coverage: { embedded: number; total: number },
  floor = SUBJECT_MIN_COVERAGE,
): boolean {
  // A tenant with no live insights at all has nothing to under-count, so it
  // clears: the pass will simply find no band and write nothing.
  if (coverage.total === 0) return true
  return coverage.embedded / coverage.total >= floor
}

export function buildJudgeSystemPrompt(subject: { name: string; description: string | null }): string {
  return [
    'You decide whether a single piece of customer feedback belongs to one named SUBJECT that a brand is tracking.',
    '',
    `THE SUBJECT: "${subject.name}"`,
    subject.description ? `WHAT IT MEANS: ${subject.description}` : 'WHAT IT MEANS: (no description was given — judge on the name alone, and be strict.)',
    '',
    'Each numbered block is one thing the brand’s audience said, as the product recorded it: a short slug and a sentence describing what people said. For each block, answer whether that feedback is ABOUT this subject.',
    '',
    'Judge the subject matter, not the mood. "This is far too expensive" and "great value for what it is" are both about price. A complaint and a compliment about the same thing are both members.',
    '',
    'Say no when the feedback is about something adjacent rather than this. Two things being mentioned in the same breath does not make them one subject, and a subject that swallows everything measures nothing.',
    '',
    'Return exactly one decision per block, using the block’s own ref. Never invent a ref and never skip one.',
  ].join('\n')
}

export function buildJudgeUserPrompt(batch: readonly JudgeCandidate[]): string {
  return batch
    .map((c, i) => `[i${i + 1}] ${c.theme.replace(/_/g, ' ')}: ${c.description.trim()}`)
    .join('\n')
}

/**
 * Map the judge's answer back onto insight ids by block ref.
 *
 * Bad refs (unknown, out of range, duplicate) are dropped, never guessed — the
 * T#/S# ref-validation invariant. An insight the model did not answer for is
 * absent from the result and therefore stays UNDECIDED: it comes back next run
 * rather than being silently recorded as "not a member", which is the answer a
 * missing decision would otherwise turn into.
 */
export function validateJudgeResponse(
  parsed: SubjectJudgeOutput,
  batch: readonly JudgeCandidate[],
): Map<string, boolean> {
  const out = new Map<string, boolean>()
  for (const d of parsed.decisions) {
    const m = /^i(\d+)$/.exec(d.ref.trim().toLowerCase())
    if (!m) continue
    const idx = Number(m[1]) - 1
    if (idx < 0 || idx >= batch.length) continue
    const id = batch[idx].id
    if (out.has(id)) continue
    out.set(id, d.belongs)
  }
  return out
}

/** The rows one decision set becomes. The score rides along even for a judged
 *  pair: it is what the band said, and a calibration run needs both the model's
 *  answer and the number that sent the pair to the model. */
export function membershipRows(args: {
  clientId: string
  subjectId: string
  runId: string | null
  decisions: ReadonlyMap<string, boolean>
  scores: ReadonlyMap<string, number>
  method: SubjectMembershipRow['method']
  judgeVersion?: string
}): SubjectMembershipRow[] {
  const rows: SubjectMembershipRow[] = []
  for (const [audience_insight_id, member] of args.decisions) {
    rows.push({
      subject_id: args.subjectId,
      audience_insight_id,
      client_id: args.clientId,
      member,
      method: args.method,
      score: args.scores.get(audience_insight_id) ?? null,
      judge_version: args.judgeVersion ?? JUDGE_VERSION,
      run_id: args.runId,
    })
  }
  return rows
}

/** Which subjects need their phrase re-embedded before anything can be banded:
 *  the ones with no vector, and the ones whose vector was built by a formula
 *  that is no longer the formula. */
export function subjectsNeedingVectors<
  T extends Pick<Subject, 'id' | 'name' | 'description' | 'embedded_at' | 'embed_input_version'>,
>(
  subjects: readonly T[],
  version = SUBJECT_EMBED_INPUT_VERSION,
): T[] {
  return subjects.filter((s) => !s.embedded_at || s.embed_input_version !== version)
}

export interface SubjectMembershipResult {
  subjectId: string
  subjectName: string
  /** Pairs the vector alone settled as members. */
  vectorMembers: number
  /** Pairs sent to the model. */
  judged: number
  /** Of those, the ones it said belong. */
  judgedMembers: number
  /** Pairs the model was asked about and did not answer for. They stay
   *  undecided on purpose — see validateJudgeResponse. */
  unanswered: number
  calls: number
  costUsd: number
  /** Rows actually written. */
  written: number
  /** Why this pass did nothing, when it did nothing. */
  skipped: 'migration' | 'coverage_short' | 'no_subjects' | 'no_vector' | null
  /** The pass hit its own ceiling and stopped early; what is left is undecided
   *  next run. */
  budgetStopped: boolean
  error?: string
}

export function emptyMembershipResult(subjectId = '', subjectName = ''): SubjectMembershipResult {
  return {
    subjectId, subjectName,
    vectorMembers: 0, judged: 0, judgedMembers: 0, unanswered: 0,
    calls: 0, costUsd: 0, written: 0, skipped: null, budgetStopped: false,
  }
}

/** What the step prints. An operator log, not a client one. */
export function membershipSummary(r: SubjectMembershipResult): string {
  // A whole-pass skip has no subject to name; a per-subject one does.
  const who = r.subjectName ? `${r.subjectName}: ` : ''
  if (r.skipped === 'migration') return `${who}skipped — 20260918093000_subjects.sql has not been applied yet`
  if (r.skipped === 'coverage_short') {
    return `${who}REFUSED — insight embedding coverage is below ${Math.round(SUBJECT_MIN_COVERAGE * 100)}%. A subject scored against a half-embedded corpus reads low and says nothing about it; run scripts/embed-insights.ts --apply first.`
  }
  if (r.skipped === 'no_subjects') return 'no active subjects — nothing to judge'
  if (r.skipped === 'no_vector') return `${who}no phrase vector, and embedding it failed — nothing judged`
  const stopped = r.budgetStopped ? ` · STOPPED at the pass ceiling ($${subjectBudgetUsd().toFixed(2)})` : ''
  const unanswered = r.unanswered > 0 ? ` · ${r.unanswered} unanswered, still undecided` : ''
  return (
    `${r.subjectName}: ${r.vectorMembers} by vector · ${r.judgedMembers}/${r.judged} by judge in ${r.calls} call(s) ` +
    `· ${r.written} rows · ~$${r.costUsd.toFixed(4)}${unanswered}${stopped}` +
    (r.error ? ` · ${r.error}` : '')
  )
}

// ---- I/O --------------------------------------------------------------------

type Admin = ReturnType<typeof createAdminClient>

/** The tenant's live subject set, in a stable order so `N-of-M` means the same
 *  thing on a retry. */
export async function loadActiveSubjects(admin: Admin, clientId: string): Promise<Subject[]> {
  return selectAll<Subject>(() =>
    admin
      .from(TABLE_SUBJECTS)
      .select('id, client_id, name, description, origin, source_ref, named_at, status, superseded_by, embedded_at, embed_input_version, calibrated_at, calibration_precision, calibration_n, calibration_judge_version')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .order('named_at', { ascending: true })
      .order('id', { ascending: true }),
  )
}

/**
 * Give every subject that needs one a phrase vector.
 *
 * 5-8 texts of ~60 tokens is one embeddings request and about $0.0000005 — the
 * cheapest thing in this file by four orders of magnitude, and the thing
 * everything else depends on. Written here rather than at naming time so that a
 * subject named while the API was down still gets one, and so that changing
 * `subjectEmbedInput` re-embeds the set on the next run instead of leaving two
 * incomparable vector spaces in one column.
 */
export async function embedSubjects(admin: Admin, subjects: readonly Subject[]): Promise<number> {
  const pending = subjectsNeedingVectors(subjects)
  if (pending.length === 0) return 0
  const vectors = await embedTexts(pending.map((s) => subjectEmbedInput(s)))
  if (vectors.length !== pending.length) {
    throw new Error(`embedSubjects: ${vectors.length} vectors for ${pending.length} subjects`)
  }
  let written = 0
  for (let i = 0; i < pending.length; i++) {
    const { error } = await admin
      .from(TABLE_SUBJECTS)
      .update({
        embedding: vectors[i],
        embedded_at: new Date().toISOString(),
        embed_input_version: SUBJECT_EMBED_INPUT_VERSION,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pending[i].id)
      // The tenant as well as the id. Safe as it stands — the ids come from a
      // tenant-scoped read one call earlier — but this is the only write in
      // lib/subjects, lib/reading or lib/rivals with no tenant predicate, on a
      // service-role connection that bypasses RLS. It costs nothing and removes
      // the one place a future refactor of the caller could go quietly wrong.
      .eq('client_id', pending[i].client_id)
    if (error) throw new Error(`subjects.embedding write: ${(error as { message?: string }).message ?? String(error)}`)
    written++
  }
  return written
}

/** One subject's band: every live insight at or above the low threshold with no
 *  decision at this judge version. `selectAll` because Össur's band is past
 *  PostgREST's 1000-row cap, on an RPC exactly as on a select. */
export async function readBand(
  admin: Admin,
  clientId: string,
  subjectId: string,
  judgeVersion = JUDGE_VERSION,
): Promise<BandedPair[]> {
  return selectAll<BandedPair>(() =>
    admin
      .rpc(RPC_SUBJECT_BAND, {
        p_client: clientId,
        p_subject: subjectId,
        p_low: SUBJECT_MATCH_LOW,
        p_high: SUBJECT_MATCH_HIGH,
        p_judge: judgeVersion,
      })
      .order('audience_insight_id', { ascending: true }),
  )
}

async function writeMemberships(admin: Admin, rows: readonly SubjectMembershipRow[]): Promise<number> {
  let written = 0
  for (const part of chunk(rows, 500)) {
    const { error } = await admin
      .from(TABLE_SUBJECT_MEMBERSHIPS)
      .upsert(part, { onConflict: 'subject_id,audience_insight_id' })
    if (error) throw new Error(`${TABLE_SUBJECT_MEMBERSHIPS} upsert: ${(error as { message?: string }).message ?? String(error)}`)
    written += part.length
  }
  return written
}

/** The insight text the judge reads, for the ids in one band. Read from the
 *  base table, not the view: these ids came out of `subject_band` moments ago
 *  and an in-flight run may already have superseded some of them — the id-set
 *  rule AGENTS.md states. */
async function loadJudgeCandidates(
  admin: Admin,
  clientId: string,
  pairs: readonly BandedPair[],
): Promise<JudgeCandidate[]> {
  const byId = new Map(pairs.map((p) => [p.audience_insight_id, p.score]))
  const rows: { id: string; theme: string; description: string }[] = []
  for (const part of chunk([...byId.keys()], 200)) {
    rows.push(
      ...(await selectAll<{ id: string; theme: string; description: string }>(() =>
        admin
          .from('audience_insights')
          .select('id, theme, description')
          .eq('client_id', clientId)
          .in('id', part)
          .order('id', { ascending: true }),
      )),
    )
  }
  return rows.map((r) => ({ ...r, score: byId.get(r.id) ?? 0 }))
}

export interface SubjectMembershipOptions {
  clientId: string
  /** null outside a run (the backfill script). */
  runId: string | null
  /** Read, plan and price; send nothing, write nothing, ai_call_log included —
   *  the rule ocr.ts, translate.ts and embed-insights.ts hold themselves to. */
  dryRun?: boolean
  /** Override the pass ceiling, for a cautious first backfill. */
  budgetUsd?: number
  /** Skip the coverage refusal. For the calibration harness alone, which is
   *  measuring precision on a sample and is not writing a number anyone reads. */
  ignoreCoverage?: boolean
  /** The tenant's embedding coverage, when the caller has already counted it.
   *  It is a property of the PASS, not of a subject — two `count=exact` queries
   *  over the whole insight population — and asking it once per subject is five
   *  to eight times the same answer. Both runners read it once and hand it
   *  down; absent, this reads it itself, so a lone caller is never wrong. */
  coverage?: { embedded: number; total: number }
}

/**
 * Decide one subject's membership, end to end.
 *
 * Failure shape, deliberately three different things:
 *  - the migration is not applied  → `skipped: 'migration'`, nothing read, nothing spent.
 *  - coverage is short             → `skipped: 'coverage_short'`, nothing written. A number
 *                                    that is silently low is worse than no number.
 *  - a call fails                  → the batch is dropped, its pairs stay undecided and come
 *                                    back next run; the pass carries on. Stopping would
 *                                    strand every later batch for one bad response, and the
 *                                    work is idempotent by construction.
 */
export async function judgeSubject(
  admin: Admin,
  subject: Subject,
  opts: SubjectMembershipOptions,
): Promise<SubjectMembershipResult> {
  const out = emptyMembershipResult(subject.id, subject.name)
  const budget = opts.budgetUsd ?? subjectBudgetUsd()

  if (!opts.ignoreCoverage) {
    const coverage = opts.coverage ?? (await embeddingCoverage(admin, opts.clientId))
    if (!coverageClears(coverage)) {
      out.skipped = 'coverage_short'
      return out
    }
  }

  let band: BandedPair[]
  try {
    band = await readBand(admin, opts.clientId, subject.id)
  } catch (e) {
    if (!isMissingSubjects(e)) throw e
    out.skipped = 'migration'
    return out
  }
  // An empty band from a subject with no vector is not "nobody belongs" — it is
  // "nothing was compared", and the two must not print the same.
  if (band.length === 0 && !subject.embedded_at) {
    out.skipped = 'no_vector'
    return out
  }

  const scores = new Map(band.map((p) => [p.audience_insight_id, p.score]))
  const vectorMembers = band.filter((p) => p.band === 'member')
  out.vectorMembers = vectorMembers.length

  const toJudge = band.filter((p) => p.band === 'judge')
  const candidates = await loadJudgeCandidates(admin, opts.clientId, toJudge)
  const batches = planJudgeBatches(candidates)
  out.judged = candidates.length
  out.calls = batches.length

  if (opts.dryRun) {
    // Price it at the measured shape rather than pretending a dry run is free
    // information: ~1,900 input and ~500 output tokens a call.
    out.costUsd = estimateCost(SUBJECT_JUDGE_MODEL, batches.length * 1900, batches.length * 500)
    return out
  }

  const rows: SubjectMembershipRow[] = membershipRows({
    clientId: opts.clientId,
    subjectId: subject.id,
    runId: opts.runId,
    decisions: new Map(vectorMembers.map((p) => [p.audience_insight_id, true])),
    scores,
    method: 'embedding_high',
  })

  let calls = 0
  for (const batch of batches) {
    if (out.costUsd >= budget) {
      out.budgetStopped = true
      break
    }
    calls++
    const systemPrompt = buildJudgeSystemPrompt(subject)
    const userPrompt = buildJudgeUserPrompt(batch)
    const startedAt = Date.now()
    let parsed: SubjectJudgeOutput | null = null
    let refusal: string | null = null
    let usage = { prompt_tokens: 0, completion_tokens: 0 }
    try {
      const completion = await openai.chat.completions.parse({
        model: SUBJECT_JUDGE_MODEL,
        temperature: ANALYSIS_TEMPERATURE,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: zodResponseFormat(SubjectJudgeSchema, 'subject_membership'),
      })
      const msg = completion.choices[0]?.message
      parsed = (msg?.parsed ?? null) as SubjectJudgeOutput | null
      refusal = msg?.refusal ?? (parsed ? null : 'no parsed output')
      usage = completion.usage ?? usage
    } catch (e) {
      refusal = e instanceof Error ? e.message : String(e)
    }
    const costUsd = estimateCost(SUBJECT_JUDGE_MODEL, usage.prompt_tokens, usage.completion_tokens)
    out.costUsd += costUsd

    await logAiCall(admin, {
      clientId: opts.clientId,
      runId: opts.runId,
      pass: SUBJECT_JUDGE_PASS,
      callIndex: calls,
      model: SUBJECT_JUDGE_MODEL,
      promptVersion: `${SUBJECT_JUDGE_PROMPT_VERSION}:${subject.name}`,
      systemPrompt,
      userPrompt,
      response: parsed,
      error: refusal,
      usage: { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens },
      durationMs: Date.now() - startedAt,
      validationStatus: parsed ? 'valid' : 'parse_error',
    })

    if (!parsed) {
      // The pairs of this batch stay undecided and come back next run. Said
      // once per pass rather than once per batch.
      out.unanswered += batch.length
      out.error = out.error ?? (refusal ?? 'no parsed output')
      continue
    }
    const decisions = validateJudgeResponse(parsed, batch)
    out.unanswered += batch.length - decisions.size
    for (const belongs of decisions.values()) if (belongs) out.judgedMembers++
    rows.push(...membershipRows({
      clientId: opts.clientId,
      subjectId: subject.id,
      runId: opts.runId,
      decisions,
      scores,
      method: 'judge',
    }))
  }
  out.calls = calls

  if (rows.length > 0) out.written = await writeMemberships(admin, rows)
  return out
}

/**
 * Every active subject of a tenant, one after another.
 *
 * The pipeline does NOT call this — it fans out over `loadActiveSubjects` so
 * each subject is its own retryable step. This is the backfill script's entry
 * point, and the shape a test can drive end to end.
 */
export async function judgeAllSubjects(
  admin: Admin,
  opts: SubjectMembershipOptions,
): Promise<SubjectMembershipResult[]> {
  const subjects = await loadActiveSubjects(admin, opts.clientId).catch((e) => {
    if (isMissingSubjects(e)) return null
    throw e
  })
  if (subjects === null) return [{ ...emptyMembershipResult(), skipped: 'migration' }]
  if (subjects.length === 0) return [{ ...emptyMembershipResult(), skipped: 'no_subjects' }]
  if (!opts.dryRun) await embedSubjects(admin, subjects)
  // Once for the pass, not once per subject.
  const coverage = opts.coverage ?? (opts.ignoreCoverage ? undefined : await embeddingCoverage(admin, opts.clientId))

  const out: SubjectMembershipResult[] = []
  let spent = 0
  const budget = opts.budgetUsd ?? subjectBudgetUsd()
  for (const s of subjects) {
    // The ceiling is the PASS's, not each subject's: eight subjects each
    // stopping at $3 would be a $24 pass.
    const r = await judgeSubject(admin, s, { ...opts, coverage, budgetUsd: Math.max(0, budget - spent) })
    spent += r.costUsd
    out.push(r)
  }
  return out
}
