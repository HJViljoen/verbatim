import { ANALYSIS_MODEL } from '../config'

// Subjects — the shapes, the thresholds, and the one string that decides
// whether two of a subject's months may be compared (Phase 1 WP4, design items
// 4 and 22).
//
// A subject is not a theme. A theme is what the clustering found this week; a
// subject is what the client said it wants to be measured on, and it does not
// move. So a subject's numbers are not attributed to a run — they are
// attributed to a JUDGE: which model, reading which prompt, at which
// thresholds, decided who belongs. That is `JUDGE_VERSION` below, and it is the
// comparability key on every stored month (20260918093000_subjects.sql).
//
// The rules that produce the numbers live in SQL (monthly_subject_readings,
// window_subject_readings); the rules about WHEN a month stops moving live in
// lib/reading/monthly.ts and are shared with themes; this file is the contract
// between them and the two runners beside it.

/** How many subjects a tenant carries. Not a database CHECK, deliberately: a
 *  tenant has to be able to sit at three while it is setting up, and the
 *  proposer offers more than eight so there is something to choose from. The
 *  Settings editor enforces the ceiling; this is what it enforces. */
export const SUBJECTS_MIN = 5
export const SUBJECTS_MAX = 8

export const SUBJECT_ORIGINS = ['own_claims', 'category_theme', 'client'] as const
export type SubjectOrigin = (typeof SUBJECT_ORIGINS)[number]

export const SUBJECT_STATUSES = ['proposed', 'active', 'retired'] as const
export type SubjectStatus = (typeof SUBJECT_STATUSES)[number]

export const MEMBERSHIP_METHODS = ['embedding_high', 'judge', 'client'] as const
export type MembershipMethod = (typeof MEMBERSHIP_METHODS)[number]

export const MOVE_KINDS = ['subject', 'theme', 'advice'] as const
export type MoveKind = (typeof MOVE_KINDS)[number]

export const MOVE_STATUSES = ['active', 'done', 'dropped'] as const
export type MoveStatus = (typeof MOVE_STATUSES)[number]

/**
 * The promise the product makes about causation, said once.
 *
 * A move is the client drawing a line and saying what they are trying to
 * change; from that date we report what the conversation did, and we never
 * claim we caused it. It is the masthead OV5 prints over the moves list AND
 * the sentence the control that CREATES one carries, so it lives beside the
 * move's own shapes rather than in either surface — two byte-for-byte copies
 * of a promise are two copies that can drift.
 */
export const MOVE_PROMISE =
  'We report what the conversation did after you acted. We never claim you caused it.'

export const MOVE_DIRECTIONS = ['up', 'down'] as const
export type MoveDirection = (typeof MOVE_DIRECTIONS)[number]

/** A move may name at most five themes — the number `initiatives` settled on
 *  and the number its DB CHECK still enforces. A subject-kinded move names one
 *  subject and no themes at all, which is the whole reason `moves` exists
 *  beside `initiatives`: a subject's membership is a set that exceeds five and
 *  is re-decided every week. */
export const MOVE_MAX_THEMES = 5

// ---- The band ---------------------------------------------------------------

/**
 * At or above this cosine similarity, the phrase vector alone decides: the
 * insight is a member and no model is asked.
 *
 * NOT calibrated yet, and the module says so rather than implying otherwise.
 * The two numbers below are the design's own starting pair. What is measured
 * (research/subjects.md §6, refute-04 §2.2, both read-only against production
 * on 2026-09-15, using theme_registry vectors as stand-in subject phrases):
 * 5.0–8.5% of a sample of 200 insights clear 0.70, and 24–47% of the embedded
 * population falls in 0.55–0.70 depending on how many subjects there are. Both
 * measurements used `label. description` probes, and a real subject phrase is
 * shorter and embeds LOWER, so the true band is likely wider still.
 *
 * The repo's precedent for picking a pair like this is REC_LINEAGE_THRESHOLD /
 * REC_LINEAGE_CROSS_TYPE_THRESHOLD (lib/pipeline/rec-lineage.ts), which were
 * chosen against a hand-labelled pair set. scripts/subject-calibration.ts is
 * that set for subjects: it samples 200 insights per tenant, prints precision
 * at each threshold pair, and a subject prints "calibrating" until a precision
 * at or above SUBJECT_PRECISION_FLOOR has been recorded against it. Moving
 * either number changes JUDGE_VERSION, which is the point — a month read under
 * one band is not comparable with a month read under another.
 */
export const SUBJECT_MATCH_HIGH = 0.7

/** Below this, the vector alone decides the other way: not a member, and no row
 *  is stored. That answer costs nothing to recompute, and storing it would put
 *  the whole corpus in `subject_memberships` for an answer nobody reads. */
export const SUBJECT_MATCH_LOW = 0.55

/** Insights per judge call. The design's unit, kept — but a decision is about a
 *  (insight, subject) PAIR, and a banded insight is ambiguous against 1.43–1.98
 *  subjects on average (refute-04 §2.4), so a call of 20 insights carries
 *  roughly 29–40 decisions and its output scales with the pairs, not the
 *  insights. That is why the cost note below is per pair. */
export const SUBJECT_JUDGE_BATCH = 20

/** The model that judges the band. `gpt-4.1-mini`, the repo's batched-classifier
 *  model. The design's named escape hatch (`gpt-5.4-nano`) is not one — it is a
 *  reasoning model and MODEL_PRICING's own comment says reasoning tokens bill as
 *  output, which measures cost-NEUTRAL against gpt-4.1-mini at this shape
 *  (refute-04 §2.6). The cut that does exist is `gpt-4.1-nano`, at a different
 *  quality trade nobody has taken. */
export const SUBJECT_JUDGE_MODEL = ANALYSIS_MODEL

/** The prompt's identity. Bump it with any change to what the judge is asked. */
export const SUBJECT_JUDGE_PROMPT_VERSION = 'subject_judge_v1'

/**
 * The comparability key, written onto every membership row and every stored
 * month.
 *
 * It folds in everything that could change the answer without changing the
 * question: the prompt, the model and BOTH thresholds. Two months of one
 * subject are like-for-like exactly when this string is equal on both, which is
 * the same rule `month_theme_readings.run_id` carries for a theme — and the
 * reason a subject row does not use run_id for it, because a subject's
 * membership is a judgement artefact and not a clustering one.
 *
 * It is also how the incremental step knows what to do: `subject_band()`
 * returns only pairs with no decision AT THIS VERSION, so bumping any of the
 * three parts re-judges the whole corpus on the next run. That is a real cost
 * (≈$0.14–0.25 for both tenants, refute-04 §2.5) and it is deliberate — budget
 * for it, exactly as AGENTS.md says to budget for a Pass A prompt bump.
 */
export const JUDGE_VERSION =
  `${SUBJECT_JUDGE_PROMPT_VERSION}·${SUBJECT_JUDGE_MODEL}·${SUBJECT_MATCH_HIGH}/${SUBJECT_MATCH_LOW}`

// ---- The phrase vector ------------------------------------------------------

/** The text a subject is embedded from. The same shape as `embedInput`
 *  (lib/pipeline/cluster.ts) and `matchText` (lib/pipeline/themes.ts) — a short
 *  name, a full stop, a sentence — so the phrase lands in the same region of the
 *  space the insight vectors occupy. A bare 1–3 word name embeds systematically
 *  further from a long description than this does, which is exactly the
 *  distortion the research flagged as unmeasurable. */
export function subjectEmbedInput(s: { name: string; description?: string | null }): string {
  const name = s.name.trim()
  const description = (s.description ?? '').trim()
  return description ? `${name}. ${description}` : name
}

/** Which formula produced a stored `subjects.embedding`. Change
 *  `subjectEmbedInput` or EMBEDDING_MODEL and every vector written before
 *  becomes incomparable with every vector written after — a silent retrieval
 *  failure, not an error. Bump this at the same time so the repair is a query.
 *  (The EMBED_INPUT_VERSION argument, lib/pipeline/cluster.ts, one table over.) */
export const SUBJECT_EMBED_INPUT_VERSION = 'subject_embed_v1'

// ---- The precision gate -----------------------------------------------------

/** Design :891 — a subject's share is not shown to a client until precision has
 *  been measured at or above this on a hand-labelled sample. */
export const SUBJECT_PRECISION_FLOOR = 0.85
/** Hand labels per tenant — PAIRS, not insights, and the whole sheet rather
 *  than a per-subject figure. A decision is about a (subject, insight) pair, so
 *  200 insights against 5-8 subjects would be 1,000-1,600 labels and days of
 *  reading; this is the afternoon the design budgets, split evenly across the
 *  confirmed set (lib/subjects/calibration.ts calibrationQuota). */
export const SUBJECT_CALIBRATION_SAMPLE = 200

/** Embedding coverage the membership step insists on before it counts anything.
 *
 *  A subject scored against a half-embedded corpus does not read low — it reads
 *  WRONG, and silently: every unembedded insight is absent from
 *  `subject_band()`, so the subject's level is understated by however much of
 *  the corpus is dark, with nothing on any surface saying so. On 2026-09-15
 *  that was 46% of Össur's live insights and 73% of Sealand's. The step refuses
 *  and logs `coverage_short` rather than writing a number it knows is short. */
export const SUBJECT_MIN_COVERAGE = 0.95

// ---- Rows -------------------------------------------------------------------

export interface Subject {
  id: string
  client_id: string
  name: string
  description: string | null
  origin: SubjectOrigin
  source_ref: string | null
  named_at: string
  status: SubjectStatus
  superseded_by: string | null
  embedded_at: string | null
  embed_input_version: string | null
  calibrated_at: string | null
  calibration_precision: number | null
  calibration_n: number | null
  /** WHICH judge that precision was measured under. Declared here, and selected
   *  by every loader, because `subjectCalibration` cannot tell "nobody recorded
   *  one" from "this read did not ask" unless the column is always asked for —
   *  and the first of those is exactly the untrustworthy case the column exists
   *  for. Null means a figure from before the column, or from a writer that did
   *  not stamp it: not evidence about the numbers this subject carries now. */
  calibration_judge_version: string | null
}

/** One decided (subject, insight) pair, ready to upsert. */
export interface SubjectMembershipRow {
  subject_id: string
  audience_insight_id: string
  client_id: string
  member: boolean
  method: MembershipMethod
  score: number | null
  judge_version: string
  run_id: string | null
}

/** One row of `subject_band(...)`: a pair this run has to decide. */
export interface BandedPair {
  audience_insight_id: string
  score: number
  band: 'member' | 'judge'
}

/** One row of `monthly_subject_readings(p_client, p_from, p_to)`. The theme
 *  reading's columns exactly — same rule, different membership. */
export type SubjectReading = {
  month: string
  audience: string
  subject_id: string
  videos: number
  comments: number
  platform_mix: Record<string, number>
  /** Member insights evidenced only on camera whose video carries no dated
   *  comment at all. A property of the subject in this audience, repeated on
   *  each of its month rows and never summed. */
  excluded_on_camera: number
  /** Cited comments with no date, per month; never summed. */
  excluded_undated: number
}

/** The window sibling's row: no month, one line per audience. */
export type SubjectWindowReading = Omit<SubjectReading, 'month'>

export interface Move {
  id: string
  client_id: string
  kind: MoveKind
  subject_id: string | null
  registry_ids: string[] | null
  lineage_id: string | null
  title: string
  note: string | null
  direction: MoveDirection
  declared_at: string
  declared_by: string | null
  status: MoveStatus
}

// ---- Calibration state ------------------------------------------------------

/** What a surface may say about a subject's numbers.
 *  `calibrating` — no precision measured at or above the floor: show the
 *                  subject, name it, and do not show a share.
 *  `ready`       — measured and clear. */
export type SubjectCalibration = 'calibrating' | 'ready'

/**
 * Is this subject's share fit to print?
 *
 * Two independent gates and both have to pass. The precision gate is the
 * design's (:891). The judge gate is this file's: a subject whose stored
 * precision was measured under a DIFFERENT judge — a threshold moved, the
 * prompt changed — has not been calibrated for the numbers it is carrying now,
 * and an 85% from a band that no longer exists is not evidence about this one.
 *
 * THE JUDGE VERSION IS REQUIRED, and that is the whole gate. Accepting an
 * absent one as "close enough" fails OPEN: every path that writes
 * `calibrated_at` writes the judge version beside it, so a row with a figure
 * and no judge version is precisely the legacy case — a figure from a band
 * nobody can name. A loader that does not select the column would then read
 * `ready` for every subject however far the judge had drifted, which is the
 * gate quietly doing nothing. Null is `calibrating`.
 */
export function subjectCalibration(
  s: Pick<Subject, 'calibrated_at' | 'calibration_precision' | 'calibration_judge_version'>,
  judgeVersion: string = JUDGE_VERSION,
): SubjectCalibration {
  if (!s.calibrated_at) return 'calibrating'
  if ((s.calibration_precision ?? 0) < SUBJECT_PRECISION_FLOOR) return 'calibrating'
  if (s.calibration_judge_version !== judgeVersion) return 'calibrating'
  return 'ready'
}

// ---- The database names, in one place ---------------------------------------

export const TABLE_SUBJECTS = 'subjects'
export const TABLE_SUBJECT_MEMBERSHIPS = 'subject_memberships'
export const TABLE_MONTH_SUBJECT_READINGS = 'month_subject_readings'
export const TABLE_MOVES = 'moves'
export const RPC_SUBJECT_BAND = 'subject_band'
export const RPC_MONTHLY_SUBJECT_READINGS = 'monthly_subject_readings'
export const RPC_WINDOW_SUBJECT_READINGS = 'window_subject_readings'

/** The objects 20260918093000_subjects.sql creates. Used by the "this deploy
 *  landed before its migration" test, which is narrow by name and never a
 *  blanket swallow — the isMissingMonthlyReading shape (lib/reading/monthly.ts). */
const SUBJECT_OBJECTS = [
  TABLE_SUBJECTS,
  TABLE_SUBJECT_MEMBERSHIPS,
  TABLE_MONTH_SUBJECT_READINGS,
  TABLE_MOVES,
  RPC_SUBJECT_BAND,
  RPC_MONTHLY_SUBJECT_READINGS,
  RPC_WINDOW_SUBJECT_READINGS,
] as const

/**
 * Is this the error a subject read or write gets before M4 is applied?
 *
 * Migrations are applied by hand on this project, so a deploy CAN reach
 * production first. Without this test the membership step throws on every
 * attempt, burns its whole Inngest retry budget with backoff between attempts,
 * and holds one of the account's five shared concurrency slots the entire time,
 * for a write it was never going to be able to make.
 */
export function isMissingSubjects(error: unknown): boolean {
  if (!error) return false
  const { code, message } = (typeof error === 'object' ? error : {}) as { code?: string; message?: string }
  const text = message ?? (error instanceof Error ? error.message : String(error))
  if (!SUBJECT_OBJECTS.some((name) => new RegExp(`\\b${name}\\b`).test(text))) return false
  // PGRST202 the function, PGRST205 the table, 42883/42P01 the same from Postgres.
  if (code && ['PGRST202', 'PGRST205', '42883', '42P01'].includes(code)) return true
  return /in the schema cache/i.test(text) || /does not exist/i.test(text)
}

/**
 * What a reader who may not change the set is told — printed by the editor
 * where its controls would have been, and returned by the write path when one
 * of the three subject writes is called anyway.
 *
 * ONE STRING BECAUSE IT IS ONE RULE. The affordance and the refusal are the
 * same sentence; two copies are two chances to word the same rule differently,
 * and a client who is told one thing by the page and another by the save is
 * being told the product is broken.
 */
export const SUBJECT_WRITE_REFUSED =
  'Only an owner or an admin can change what we read your market against.'
