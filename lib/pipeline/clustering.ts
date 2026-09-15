import { CLUSTER_SIMILARITY_THRESHOLD, EVIDENCE_FLOOR, SYNTHESIS_MODEL } from '../config'

// The regime a run clustered under, and where a series crosses from one to
// another (Phase 1 item 3, decisions J and L).
//
// WHY A RUN ID IS NOT AN ANSWER. `month_theme_readings.run_id` says which run's
// clustering produced a month's numbers, and AGENTS.md's rule — like-for-like
// only where run_id is equal — is a safe rule and a blunt one. Two runs a week
// apart usually cluster identically, so refusing every comparison across a
// run_id change would refuse nearly every comparison there is. And the converse
// is worse: ONE run id can span a regime change. Össur's 29a56395 and d346b0f7
// differ in their Pass A flags (translation and OCR off, then on) with nothing
// recording it but a seven-key JSON blob, and a resumed run keeps its id while
// re-clustering under today's constants.
//
// So the run records what it clustered under, at open-run, beside the frozen
// window and the frozen flags — and the reading compares THAT. Legible rather
// than hashed: an operator reading `a=pass_a_v4.1;c=0.58;f=2;m=gpt-5.4;k=video_v1`
// off a month row can see which knob moved, where a hash would only say "not
// the same".
//
// WHAT IS IN IT, AND WHY EACH ONE. A change to any of these re-partitions the
// corpus or moves the line the product draws through it, which is exactly when
// a month-to-month change stops being a change in the conversation:
//   a  the Pass A prompt version — a bump re-reads every eligible video, which
//      re-mints the insights the clustering runs over
//   c  the embedding cluster similarity threshold — where one theme ends
//   f  the evidence floor — which themes the product will show at all, and now
//      also where the video arm of the theme key takes over
//   m  the merge model — a gpt-5.4 call with no temperature decides which
//      clusters fuse, so its identity is part of the clustering
//   k  the theme-key rule — the cutover to the video key is itself an identity
//      event (measured: 83 Össur and 107 Sealand themes land on a different
//      entry the first time it runs), and a marker that does not carry it
//      would make the one run that needs the marker look unremarkable
//
// Deliberately NOT in it: the re-read share (a property of the run, stamped per
// observation — a regime can be identical while the corpus underneath moves),
// the tenant's tracked terms and rivals (config_changes is the record of those,
// with its own break rules), and `EMBEDDING_MODEL`, which cannot change without
// re-embedding the whole corpus and would arrive as a migration, not a knob.

/** The theme-key rule in force. Bumped when matchThemes changes what it keys
 *  on — not when a threshold moves, which `c` and `f` already carry. */
export const THEME_KEY_RULE = 'video_v1'

/** The knobs that define a run's clustering. */
export interface ClusteringRegime {
  /** `passAPromptVersion(flags.transcripts)` — the regime the run's Pass A
   *  calls book against. */
  promptVersion: string
  clusterThreshold: number
  evidenceFloor: number
  mergeModel: string
  themeKey: string
}

/** The regime this deploy would cluster under, given the Pass A version the
 *  run's frozen flags select (`passAPromptVersion(flags.transcripts)`, passed
 *  in rather than imported so the boundary detector below can be read by a page
 *  without dragging the model client in behind it).
 *
 *  Read at open-run, once, and written to the row — never recomputed later, for
 *  the same reason the window is frozen there (AGENTS.md). */
export function currentClusteringRegime(input: { promptVersion: string }): ClusteringRegime {
  return {
    promptVersion: input.promptVersion,
    clusterThreshold: CLUSTER_SIMILARITY_THRESHOLD,
    evidenceFloor: EVIDENCE_FLOOR,
    mergeModel: SYNTHESIS_MODEL,
    themeKey: THEME_KEY_RULE,
  }
}

/** The fingerprint, as stored in `pipeline_runs.clustering_key` and copied onto
 *  the month rows freeze-months writes. Fixed field order, so two keys compare
 *  as strings. */
export function clusteringKey(regime: ClusteringRegime): string {
  return [
    `a=${regime.promptVersion}`,
    `c=${regime.clusterThreshold}`,
    `f=${regime.evidenceFloor}`,
    `m=${regime.mergeModel}`,
    `k=${regime.themeKey}`,
  ].join(';')
}

/**
 * Are two readings like-for-like on their clustering?
 *
 * NULL is unknown, never "the same as the other one": every row frozen before
 * 2026-09-18 carries no key, and reading two unknowns as equal would let the
 * seeded back-read — five months frozen in one visit — silently claim a regime
 * it never recorded. Two unknowns are therefore NOT the same regime, which
 * makes the answer conservative in the direction a reader can survive: a
 * caveat printed where none was needed, rather than a direction word spoken
 * across a re-grouping.
 */
export function sameRegime(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a) && Boolean(b) && a === b
}

/** Where a series crosses from one clustering to another. The rule is drawn
 *  BEFORE `month`: the month named is the first one under the new key. */
export interface ClusteringBoundary {
  month: string
  /** The key on the older side, and on the newer one. Either may be null. */
  from: string | null
  to: string | null
  /** `changed`  both sides known and different — "themes were re-grouped".
   *  `unknown`  one side has no key at all, so nobody can say whether they
   *             were. It is drawn in a second token, and it is not a break:
   *             it is the absence of the record, which is what every month
   *             frozen before this shipped has. */
  kind: 'changed' | 'unknown'
}

/**
 * The boundaries in a month series, oldest first.
 *
 * Takes the stored rows as they come — one entry per month, the key it was
 * frozen under — and reports each crossing once. A month with no row at all is
 * not a boundary: a gap in the series is the series' business (hollow, thin,
 * below floor), and the regime on either side of it is still comparable if the
 * keys agree.
 */
export function clusteringBoundaries(
  months: readonly { month: string; clustering_key?: string | null }[],
): ClusteringBoundary[] {
  const ordered = [...months].sort((a, b) => a.month.localeCompare(b.month))
  const out: ClusteringBoundary[] = []
  for (let i = 1; i < ordered.length; i++) {
    const from = ordered[i - 1].clustering_key ?? null
    const to = ordered[i].clustering_key ?? null
    if (from && to && from === to) continue
    out.push({ month: ordered[i].month, from, to, kind: from && to ? 'changed' : 'unknown' })
  }
  return out
}
