import { cosine } from './cluster'

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
// type equality (never crossed — "post more shorts" and "answer the insurance
// question" are different actions however similarly phrased) AND either an
// exact normalised title or a title embedding above REC_LINEAGE_THRESHOLD.
//
// The asymmetry that sets the threshold: a false match silently transfers a
// client's "Done" onto an action they have never seen, while a missed one costs
// only a recommendation that reads New for one more update — which is exactly
// today's behaviour. When in doubt this starts a new lineage.
//
// Pure: the caller embeds (or, in tests, supplies vectors). No I/O here.

/**
 * Cosine at or above which two same-type titles are the same recommendation.
 *
 * MEASURED, not guessed (calibration 2026-09-12, `scratch/rec-lineage-calibration.md`):
 * the last three updates of both live tenants, 29 titles embedded with the
 * pipeline's own `text-embedding-3-small`, every new recommendation's best
 * same-type candidate labelled by hand. Nine pairs were the same recommendation
 * reworded (0.433 – 0.796); eight were different actions (0.087 – 0.472). The
 * bands OVERLAP, so no value separates them cleanly; 0.55 sits in the only real
 * gap (0.472 → 0.605), keeping 7 of the 9 true pairs and admitting 0 of the 8
 * false ones, biased to the safe side of that gap.
 *
 * The first guess was 0.82. Not one of the nine true pairs clears it — titles
 * are re-rolled as completely as theme labels are, and lineage would never have
 * carried a single status. Re-measure if the D-b prompt's title style changes.
 */
export const REC_LINEAGE_THRESHOLD = 0.55

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
 * "Done". An exact title match always outranks a similarity match.
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
  const canEmbed = newVectors.length === next.length && priorVectors.length === priors.length

  // Every candidate pair that clears the bar, best first. `exact` scores above
  // any cosine so an identical title is never outbid by a paraphrase.
  const pairs: { n: number; p: number; score: number; kind: 'exact' | 'similar' }[] = []
  for (let n = 0; n < next.length; n++) {
    for (let p = 0; p < priors.length; p++) {
      if (next[n].type !== priors[p].type) continue
      if (normNext[n].length > 0 && normNext[n] === normPrior[p]) {
        pairs.push({ n, p, score: 2, kind: 'exact' })
        continue
      }
      if (!canEmbed) continue
      const score = cosine(newVectors[n], priorVectors[p])
      if (score >= REC_LINEAGE_THRESHOLD) pairs.push({ n, p, score, kind: 'similar' })
    }
  }
  pairs.sort((a, b) => b.score - a.score || a.n - b.n || a.p - b.p)

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
      status: prior.status && prior.status !== 'new' ? prior.status : null,
      matchedPriorId: prior.id,
      matchKind: pair.kind,
    }
  }
  return out
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
