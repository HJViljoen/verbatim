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
// The threshold is deliberately high. A false match silently transfers a
// client's "Done" onto an action they have never seen; an unmatched pair costs
// only a recommendation that reads New for one more update. When in doubt this
// starts a new lineage.
//
// Pure: the caller embeds (or, in tests, supplies vectors). No I/O here.

/** Cosine at or above which two same-type titles are the same recommendation. */
export const REC_LINEAGE_THRESHOLD = 0.82

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
