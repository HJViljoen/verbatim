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
 * MOVED 2026-09-23, from 0.70/0.55, against the first measurement ever taken
 * with REAL subject phrases (status/subject-band-2026-09-23.md; Sealand's six
 * named subjects against all 3,719 live embedded insights on the preview
 * branch, read-only).
 *
 * The old pair came from refute-04 §2.2 and research/subjects.md §6, which
 * probed with `theme_registry` `label. description` vectors and measured
 * 24–47% of the population inside 0.55–0.70. Both notes flagged the substitution
 * as the open question ("a real subject phrase is shorter and embeds LOWER"),
 * and it was not a small correction. The SAME corpus, the SAME day, six probes
 * either way:
 *
 *   probe                      pairs ≥0.70   pairs in 0.55–0.70
 *   top-6 theme_registry             214            1,176
 *   the six real subjects              5              110
 *
 * A theme vector is written FROM the insights it clusters, so it sits at their
 * centroid; a client's phrase does not, and a description written as "Comments
 * about X, excluding Y" sits in a different register from an insight's
 * `theme. description`. The whole similarity distribution lands ~0.10 lower:
 * across the six subjects max similarity is 0.578–0.733, mean 0.23–0.30, and
 * NOTHING in the corpus reaches 0.75.
 *
 * What the old band cost, measured by lexical recall — insights whose own theme
 * slug literally contains the subject's word (487 of them across the six):
 *
 *   threshold   0.55   0.50   0.45   0.40   0.35
 *   recall       17%    29%    52%    70%    81%
 *
 * A band starting at 0.55 was discarding five in six of even the most literal
 * members before the judge was ever asked. And the judge was not the thing
 * rejecting them: of the 110 pairs it saw at the old band it said yes to 92
 * (84%), which is a band set far inside the region it was built to arbitrate.
 *
 * 0.60 for the auto tier: 28 pairs clear it and all 28 read as members by hand,
 * while 0.70 admitted 5 — a tier that decided nothing. 0.40 for the floor: 70%
 * lexical recall at 2,316 pairs, ~117 judge calls, ~$0.05 a full re-judge
 * against a $3.00 pass ceiling. 0.35 buys 11 more points of recall for $0.11
 * and is the next step if the shares still read short; cost is not what bounds
 * this choice, and pretending otherwise is what made the band tight.
 *
 * STILL NOT CALIBRATED. The repo's precedent for picking a pair like this is
 * REC_LINEAGE_THRESHOLD / REC_LINEAGE_CROSS_TYPE_THRESHOLD
 * (lib/pipeline/rec-lineage.ts), chosen against a hand-labelled pair set.
 * scripts/subject-calibration.ts is that set for subjects: it samples 200
 * insights per tenant, prints precision at each threshold pair, and a subject
 * prints "calibrating" until a precision at or above SUBJECT_PRECISION_FLOOR
 * has been recorded against it. Moving either number changes JUDGE_VERSION,
 * which is the point — a month read under one band is not comparable with a
 * month read under another, and every subject goes back to "calibrating".
 */
export const SUBJECT_MATCH_HIGH = 0.6

/** Below this, the vector alone decides the other way: not a member, and no row
 *  is stored. That answer costs nothing to recompute, and storing it would put
 *  the whole corpus in `subject_memberships` for an answer nobody reads. */
export const SUBJECT_MATCH_LOW = 0.4

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

/**
 * Where an exclusion clause starts, in a subject description.
 *
 * A description is written for a READER — a person in Settings, and the judge's
 * system prompt, both of which can act on "excluding Y". An embedding cannot.
 * A vector has no negation: "excluding general durability" puts *durability*
 * into the phrase vector, positively, and the two subjects carrying the longest
 * such clauses (Waterproofing, Repair & warranty) measured worst in BOTH
 * directions on 2026-09-23 — 12% judge yes-rate at the new band, and 551 and
 * 692 pairs dragged in to keep 67 and 86.
 *
 * Anchored on a clause boundary (a comma, a semicolon, a dash, an opening
 * bracket or a sentence end) so that a description which happens to contain the
 * word mid-phrase — "an exclusive finish" — is not cut. `exclusive` is not in
 * the list for the same reason the boundary is required: a marker is a word
 * that OPENS a clause, and this list is deliberately short. A marker nobody
 * writes is a regex nobody can reason about.
 */
const EXCLUSION_CLAUSE =
  /(?:\s*[,;:(–—-]+\s*|\s*\.\s+)(?:excluding|excludes|exclude|not including|but not|except for|except|ignoring|and not)\b/i

/**
 * The meta-register frame a subject description opens with.
 *
 * An insight embeds as `theme words. description` — "waterproof feature. Users
 * appreciate that the bag is waterproof and effectively keeps rain out". A
 * subject description opens one level up, ABOUT the feedback rather than in it:
 * "Comments about how well the bags keep their contents dry". Six words of
 * "comments about" is six words of a register the corpus never uses, in a
 * ~30-word phrase.
 */
const META_FRAME =
  /^(?:comments?|feedback|mentions?|discussion|discussions|talk|remarks?|posts?|anything|everything|what (?:people|customers|users|owners) say)\s+(?:about|on|regarding|concerning|of|around)(?:\s+|$)/i

/** Sentence-case the first letter and end on a full stop, so a fragment lifted
 *  out of the middle of a description still reads as a sentence — which is the
 *  shape the corpus's own vectors were built from. */
function asSentence(text: string): string {
  const t = text.trim().replace(/[\s,;:–—-]+$/, '').replace(/\s+(?:and|or|but)$/i, '')
  if (!t) return ''
  const body = t[0].toUpperCase() + t.slice(1)
  return /[.!?]$/.test(body) ? body : `${body}.`
}

/**
 * A subject description as a plain positive statement: the exclusion clause
 * gone, the "comments about" frame gone, nothing else changed.
 *
 * PURE, AND THE DESCRIPTION COLUMN IS NOT TOUCHED. `subjects.description` stays
 * exactly what the client wrote — it is what Settings shows them, and it is what
 * `buildJudgeSystemPrompt` hands the judge under WHAT IT MEANS, exclusions and
 * all. This is a derived EMBED INPUT and nothing else reads it.
 *
 * Returns '' when the description is empty, or when it was nothing but an
 * exclusion — in which case the name alone is the honest phrase.
 */
export function subjectPositiveGloss(description?: string | null): string {
  const text = (description ?? '').trim()
  if (!text) return ''
  const cut = EXCLUSION_CLAUSE.exec(text)
  const positive = cut ? text.slice(0, cut.index) : text
  return asSentence(positive.replace(META_FRAME, ''))
}

/** The text a subject is embedded from. The same shape as `embedInput`
 *  (lib/pipeline/cluster.ts) and `matchText` (lib/pipeline/themes.ts) — a short
 *  name, a full stop, a sentence — so the phrase lands in the same region of the
 *  space the insight vectors occupy. A bare 1–3 word name embeds systematically
 *  further from a long description than this does, which is exactly the
 *  distortion the research flagged as unmeasurable.
 *
 *  v2 (2026-09-24) feeds it the positive gloss rather than the description as
 *  written. Measured on Sealand's six subjects against all 3,719 live insights
 *  (status/subject-band-2026-09-23.md PART THREE): every subject's maximum
 *  similarity rose, and the two that carried the longest exclusion clauses
 *  gained most. See SUBJECT_EMBED_INPUT_VERSION for what a change here costs. */
export function subjectEmbedInput(s: { name: string; description?: string | null }): string {
  const name = s.name.trim()
  const gloss = subjectPositiveGloss(s.description)
  return gloss ? `${name}. ${gloss}` : name
}

/** Which formula produced a stored `subjects.embedding`. Change
 *  `subjectEmbedInput` or EMBEDDING_MODEL and every vector written before
 *  becomes incomparable with every vector written after — a silent retrieval
 *  failure, not an error. Bump this at the same time so the repair is a query.
 *  (The EMBED_INPUT_VERSION argument, lib/pipeline/cluster.ts, one table over.)
 *
 *  `subjectsNeedingVectors` compares a stored row's `embed_input_version`
 *  against this string, so bumping it IS the repair: the next membership pass
 *  re-embeds every subject whose version differs, at ~$0.0000005 for the set,
 *  before it bands anything. That is the same path a subject with no vector at
 *  all takes, and it has been there since v1. */
export const SUBJECT_EMBED_INPUT_VERSION = 'subject_embed_v2'

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
