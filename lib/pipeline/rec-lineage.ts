import { cosine } from './cluster'
import { RECOMMENDATION_TYPES } from './schemas'

// Recommendation lineage (WP7c, 2026-09-11) — the cross-update identity
// `recommendations` never had.
//
// Pass D-b deletes and reinserts a client's recommendations every update, with
// fresh UUIDs and no key correlating a new row to the one it replaces. That is
// why `recommendations.status` has been granted to tenants since 2026-08-18 and
// written by nobody: a status set on Monday would be deleted by Sunday's
// update, and "you marked this done" would have nothing to attach to.
//
// This is the themes problem, one table over — and it gets the themes answer:
// an identity separate from the per-update row id. It does NOT get the themes
// MECHANISM. Themes match on membership (durable insight ids) because labels
// churn; a recommendation has no membership at all — `based_on.insight_ids`
// point at market_insights rows that are themselves regenerated every update.
// What a recommendation has is a type and a sentence, so that is what matches:
// an exact normalised title, or a title embedding above the bar its type pair
// sets.
//
// TYPE IS A PREFERENCE, NOT A GATE (decision D11, 2026-09-15). It was a hard
// gate until now — a pair of different types was never even scored. Measured on
// production: `type` is not a closed vocabulary at all. The D-b prompt turns
// 'other' into a free-form slug (pass-d.ts), so 53 of 121 stored rows (44%)
// carry a label the model invented, 22 distinct values across two tenants, nine
// of them appearing in exactly one update ever. The gate's own near-misses are
// visible in the data: `audience_target` vs `audience_targeting`,
// `competitive_move` vs `competitive_response`, `content_idea` vs
// `content_communication` — the same category, renamed by a later prompt
// version, and unrelated as far as an equality test is concerned. Across the 22
// consecutive update pairs in production the gate left 41 of 107 new
// recommendations with no candidate to score at all.
//
// So: every label outside RECOMMENDATION_TYPES folds to `other` before the
// comparison (which by itself takes those 66 candidates to 78), and a pair
// whose folded types still differ is scored against a HIGHER bar rather than
// refused. Same type 0.55, different type 0.62.
//
// The asymmetry that sets both bars: a false match silently transfers a
// client's "Done" onto an action they have never seen, while a missed one costs
// only a recommendation that reads New for one more update — which is exactly
// today's behaviour. When in doubt this starts a new lineage.
//
// WHERE THE STATUS ITSELF NOW COMES FROM. Until 2026-09-15 the only record of a
// client's decision was `recommendations.status` on the prior row, so a missed
// match erased it. `rec_decisions` is the record now, keyed on the lineage; the
// prior row's status is kept here as the fallback for a decision that was never
// filed (see `inheritedStatus`).
//
// Pure: the caller embeds (or, in tests, supplies vectors). No I/O here.

/**
 * Cosine at or above which two same-type titles are the same recommendation.
 *
 * MEASURED, not guessed (calibration 2026-09-12, `scratch/rec-lineage-calibration.md`):
 * the last three updates of both live tenants, 29 titles embedded with the
 * pipeline's own `text-embedding-3-small`. That yields **13** best same-type
 * candidates, labelled by hand: 9 the same recommendation reworded (0.433 –
 * 0.796) and 4 different actions (0.351 – 0.472). The bands OVERLAP, so no
 * value separates them cleanly; 0.55 sits in the only real gap (0.472 → 0.605),
 * keeping 7 of the 9 true pairs and admitting 0 of the 4 false ones, biased to
 * the safe side of that gap. Thirteen pairs is a thin base — treat the number
 * as the best available reading, not a settled constant.
 *
 * The first guess was 0.82. Not one of the nine true pairs clears it — titles
 * are re-rolled as completely as theme labels are, and lineage would never have
 * carried a single status. Re-measure if the D-b prompt's title style changes.
 */
export const REC_LINEAGE_THRESHOLD = 0.55

/**
 * The same bar for a pair whose folded types differ (decision D11).
 *
 * Not measured — there is no labelled cross-type pair to measure against, the
 * gate having refused to score one for as long as it existed. It is set by the
 * calibration's shape instead: 0.62 sits above the highest FALSE pair the
 * labelling saw (0.472) with room to spare, and above the lowest TRUE pair it
 * kept (0.605) — so a cross-type pair has to look MORE alike than the weakest
 * same-type match that was accepted by hand before it inherits a client's word.
 * Re-measure when there are real cross-type matches to label; until then this is
 * a deliberately conservative guess, not a reading.
 */
export const REC_LINEAGE_CROSS_TYPE_THRESHOLD = 0.62

/**
 * The type as the matcher compares it: one of the seven `RECOMMENDATION_TYPES`
 * names, or `other` for everything else.
 *
 * `pass-d.ts` persists `slugify(custom_category)` whenever the model answers
 * 'other', so the column holds whatever a reasoning model felt like naming a
 * category that week — `creator_clinic_distribution`, `maker_program`,
 * `assortment_architecture`. Folding those together does not pretend they are
 * the same thing; it says the label carries no information worth comparing, and
 * lets the title decide at the cross-type bar.
 */
export function normaliseRecType(type: string | null | undefined): string {
  const t = (type ?? '').trim().toLowerCase()
  return (RECOMMENDATION_TYPES as readonly string[]).includes(t) ? t : 'other'
}

/** The cosine two titles must reach to be the same recommendation, given what
 *  their types say. */
export function lineageThresholdFor(a: string, b: string): number {
  return normaliseRecType(a) === normaliseRecType(b)
    ? REC_LINEAGE_THRESHOLD
    : REC_LINEAGE_CROSS_TYPE_THRESHOLD
}

/** A recommendation as the previous update left it. */
export interface PriorRec {
  id: string
  /** Null on rows written before lineage existed — the row's own id starts the lineage. */
  lineage_id: string | null
  type: string
  title: string
  status: string | null
}

/** A recommendation this update is about to insert. */
export interface NewRec {
  id: string
  type: string
  title: string
}

export interface LineageAssignment {
  /** The lineage this recommendation belongs to — inherited, or its own id. */
  lineageId: string
  /** The status to insert with: an inherited one, or null to take the DB default. */
  status: string | null
  /** The prior row this matched, for the log. Null when it starts a lineage. */
  matchedPriorId: string | null
  /** How it matched, for the log. */
  matchKind: 'exact' | 'similar' | 'new'
}

/** Title as the matcher sees it: case, punctuation and spacing are noise a
 *  reasoning model re-rolls every update; the words are the recommendation. */
export function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Assign a lineage to each new recommendation.
 *
 * `newVectors` / `priorVectors` are title embeddings in the same order as
 * `next` / `priors`; pass empty arrays to match on exact titles alone (the
 * fallback when embedding fails — a run must not die because a nice-to-have
 * continuity signal was unavailable).
 *
 * Matching is greedy over the best available pair, so one prior is claimed
 * once: two near-identical new recommendations cannot both inherit the same
 * "Done". An exact title match always outranks a similarity match, and a
 * same-type pair wins a tie against a cross-type one at the same score.
 */
export function assignLineage(
  next: NewRec[],
  priors: PriorRec[],
  newVectors: number[][] = [],
  priorVectors: number[][] = [],
): LineageAssignment[] {
  const out: LineageAssignment[] = next.map((r) => ({
    lineageId: r.id,
    status: null,
    matchedPriorId: null,
    matchKind: 'new' as const,
  }))
  if (priors.length === 0) return out

  const normNext = next.map((r) => normaliseTitle(r.title))
  const normPrior = priors.map((r) => normaliseTitle(r.title))
  const typeNext = next.map((r) => normaliseRecType(r.type))
  const typePrior = priors.map((r) => normaliseRecType(r.type))
  const canEmbed = newVectors.length === next.length && priorVectors.length === priors.length

  // Every candidate pair that clears ITS bar, best first. `exact` scores above
  // any cosine so an identical title is never outbid by a paraphrase — and an
  // identical title is allowed to cross types, because a model that re-tagged
  // the same sentence has changed its filing, not its recommendation. (Not one
  // of the 107 consecutive pairs in production shares a normalised title, so
  // this costs nothing today and is the one signal strong enough to spend.)
  const pairs: { n: number; p: number; score: number; kind: 'exact' | 'similar'; sameType: boolean }[] = []
  for (let n = 0; n < next.length; n++) {
    for (let p = 0; p < priors.length; p++) {
      const sameType = typeNext[n] === typePrior[p]
      if (normNext[n].length > 0 && normNext[n] === normPrior[p]) {
        pairs.push({ n, p, score: 2, kind: 'exact', sameType })
        continue
      }
      if (!canEmbed) continue
      const score = cosine(newVectors[n], priorVectors[p])
      if (score >= (sameType ? REC_LINEAGE_THRESHOLD : REC_LINEAGE_CROSS_TYPE_THRESHOLD)) {
        pairs.push({ n, p, score, kind: 'similar', sameType })
      }
    }
  }
  // Ranked by similarity, not by how far each pair cleared its own bar: the bar
  // says whether a pair may be considered, the score says which of two is the
  // better reading of the same prior. Same type breaks a tie, because the label
  // does carry something when the sentences are equally alike.
  pairs.sort((a, b) =>
    b.score - a.score ||
    Number(b.sameType) - Number(a.sameType) ||
    a.n - b.n || a.p - b.p)

  const takenNew = new Set<number>()
  const takenPrior = new Set<number>()
  for (const pair of pairs) {
    if (takenNew.has(pair.n) || takenPrior.has(pair.p)) continue
    takenNew.add(pair.n)
    takenPrior.add(pair.p)
    const prior = priors[pair.p]
    out[pair.n] = {
      lineageId: prior.lineage_id ?? prior.id,
      // 'new' is the column default, i.e. "the client has not touched this" —
      // inheriting it would be a no-op, and inheriting null would overwrite
      // nothing. Only a status the client actually set carries forward.
      //
      // Since 2026-09-15 this is the FALLBACK: `rec_decisions` is where a
      // decision is recorded, and `inheritedStatus` reads it by lineage. This
      // still answers for a lineage the ledger has never heard of — a status
      // written before the ledger existed, or one whose decision row failed to
      // land while the column write succeeded.
      status: prior.status && prior.status !== 'new' ? prior.status : null,
      matchedPriorId: prior.id,
      matchKind: pair.kind,
    }
  }
  return out
}

// ---- The decision ledger (rec_decisions, 2026-09-15) ------------------------

/** The table this module reads decisions from — named once so the guard below
 *  and the pipeline's read cannot drift apart. */
export const REC_DECISIONS_TABLE = 'rec_decisions'

/** One row of `rec_decisions`, as the ledger read hands it over. */
export interface RecDecision {
  lineage_id: string
  /** One of REC_STATUSES — the DB CHECK is the guarantee. */
  status: string
  /** ISO 8601, as PostgREST returns a timestamptz. */
  decided_at: string
}

/**
 * The status a lineage carries into the next update: its LATEST decision,
 * unless that decision is 'new'.
 *
 * Latest, not "latest that is not 'new'": moving a recommendation back to New is
 * a decision like any other (the menu offers it), and answering a reset with the
 * "Done" that preceded it would undo the client's own correction on their next
 * update, silently. 'new' is the column default, so returning null for it says
 * the same thing the ledger does — take the default.
 *
 * Ties at the same instant fall to whichever row arrives last; the caller reads
 * them in the database's own order, oldest first.
 */
export function inheritedStatus(lineageId: string, decisions: RecDecision[]): string | null {
  let latest: RecDecision | null = null
  for (const d of decisions) {
    if (d.lineage_id !== lineageId) continue
    if (!latest || (d.decided_at ?? '') >= (latest.decided_at ?? '')) latest = d
  }
  if (!latest || latest.status === 'new') return null
  return latest.status
}

/**
 * Is this error "the decision ledger is not there yet"?
 *
 * `20260915093000_rec_decisions.sql` is applied by hand, so a deploy can reach
 * production before it does. Without this test the lineage read would report
 * `lineage_error` on every update and every status write in the browser would
 * fail in front of the client, for a table that is coming on Thursday. Narrow on
 * purpose — the same shape as `isMissingMonthlyReading` (WP3): this table's own
 * name, and one of the codes that means "no such relation".
 */
export function isMissingRecDecisions(error: unknown): boolean {
  if (!error) return false
  const { code, message } = (typeof error === 'object' ? error : {}) as { code?: string; message?: string }
  const text = message ?? (error instanceof Error ? error.message : String(error))
  if (!text.includes(REC_DECISIONS_TABLE)) return false
  // PGRST205 the table (and PGRST204 a column of it) from PostgREST's schema
  // cache; 42P01 / 42703 the same two from Postgres itself.
  if (code && ['PGRST205', 'PGRST204', '42P01', '42703'].includes(code)) return true
  return /in the schema cache/i.test(text) || /does not exist/i.test(text)
}

/** A `pipeline_runs` row, as the lineage read hands it over. */
export interface RunRow {
  id: string
  status: string | null
  started_at: string | null
}

/**
 * Which update counts as "the previous one" for carrying a status forward.
 *
 * It has to be the update the CLIENT saw, because what travels is a status they
 * set on that page — so it is the newest run with `status in ('completed',
 * 'partial')`, the same anchor `lib/pages/dashboard.ts` and `lib/pages/market.ts`
 * use to decide what a tenant is looking at, ordered by `started_at` as they
 * order it. An `analyzing` run already holds recommendations and a `failed` one
 * can too; neither has ever been shown to anyone, and either as the match pool
 * would silently drop every status set on the last visible update.
 */
export function previousRunId(runs: RunRow[], currentRunId: string): string | null {
  const visible = runs
    .filter((r) => r.id !== currentRunId && (r.status === 'completed' || r.status === 'partial'))
    .sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''))
  return visible[0]?.id ?? null
}

/**
 * The same rows without their `lineage_id` — the insert payload for a database
 * that has not had `20260911140000_initiatives.sql` applied yet.
 *
 * A separate function so the fallback's SHAPE is testable: the retry must drop
 * exactly one key and change nothing else, or the second insert fails for a new
 * reason and the run dies anyway — the failure this guard exists to prevent.
 */
export function withoutLineageColumn<T extends { lineage_id?: unknown }>(rows: T[]): Omit<T, 'lineage_id'>[] {
  return rows.map(({ lineage_id: _dropped, ...rest }) => rest)
}
