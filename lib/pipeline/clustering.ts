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
// than hashed: an operator reading `a=pass_a_v4.1;i=transcripts+translation+ocr;c=0.58;f=2;m=gpt-5.4;mp=theme_merge_v1;k=video_v1`
// off a month row can see which knob moved, where a hash would only say "not
// the same".
//
// WHAT IS IN IT, AND WHY EACH ONE. A change to any of these re-partitions the
// corpus or moves the line the product draws through it, which is exactly when
// a month-to-month change stops being a change in the conversation:
//   a  the Pass A prompt version — a bump re-reads every eligible video, which
//      re-mints the insights the clustering runs over
//   i  the Pass A INPUT flags (transcripts · translation · ocr). A flag flip
//      re-reads a video without touching the prompt version: both 'translated'
//      and 'ocr' are SelectReasons in pass-a-plan, deliberately, so that the
//      corpus is re-read a video at a time instead of all at once. That is the
//      very event this comment's own example is — Össur 29a56395 → d346b0f7
//      flipped translation and OCR on — and `a=` alone does not move for it,
//      so the key would have called the two months like-for-like
//   c  the embedding cluster similarity threshold — where one theme ends
//   f  the evidence floor — which themes the product will show at all, and now
//      also where the video arm of the theme key takes over
//   m  the merge model — a gpt-5.4 call with no temperature decides which
//      clusters fuse, so its identity is part of the clustering
//   mp the merge PROMPT version — the model is half of that call; the words
//      that ask it which clusters are one theme are the other half, and a
//      rewording re-partitions the corpus exactly as a moved threshold does
//   k  the theme-key rule — the cutover to the video key is itself an identity
//      event, and a marker that does not carry it would make the one run that
//      needs the marker look unremarkable. Measured with
//      scripts/theme-key-backtest.ts: on the first run under it, 46 Össur and
//      57 Sealand themes stop being `new` and continue an entry the old key had
//      dropped, and 0 / 3 land on a DIFFERENT entry than the old key gave them.
//      The re-assignments are small; the hundred-odd changes of hand are not,
//      and both are the clustering answering differently on the same corpus
//
// Deliberately NOT in it: the re-read share (a property of the run, stamped per
// observation — a regime can be identical while the corpus underneath moves),
// the tenant's tracked terms and rivals (config_changes is the record of those,
// with its own break rules), and `EMBEDDING_MODEL`, which cannot change without
// re-embedding the whole corpus and would arrive as a migration, not a knob.

/** The theme-key rule in force. Bumped when matchThemes changes what it keys
 *  on — not when a threshold moves, which `c` and `f` already carry. */
export const THEME_KEY_RULE = 'video_v1'

/** The Pass A inputs a run read its videos with.
 *
 *  Flipping any of them re-reads the corpus a video at a time without moving
 *  `passAPromptVersion` — but by two different doors, and this comment used to
 *  name only one. `transcripts` / `translation` / `ocr` are each a
 *  `SelectReason` of their own in pass-a-plan ('transcript', 'translated',
 *  'ocr'). `ownPostAudience` is not: it changes which LANE a video enters, and
 *  `decideAnalysis` re-selects it on `s.analyzed_lane !== a.laneNow` under the
 *  reason 'lane'. Same effect, different rule — an own post stamped
 *  `claims_only` re-selects as 'lane' when the switch goes on, and one that
 *  was `skip` has no `analyzed_run_id` at all and re-selects as 'new'. */
export interface PassAInputs {
  transcripts: boolean
  translation: boolean
  ocr: boolean
  /** Own posts took Pass A's full lane (fix/client-audience, 2026-09-24).
   *  OPTIONAL because every regime recorded before that date has no answer to
   *  the question — absent reads as off, which is what those runs did. It
   *  belongs in the key because flipping it changes WHICH VIDEOS produce
   *  insights, so the themes on either side are clustered from different
   *  corpora: exactly the re-grouping a direction word may not be spoken
   *  across. The first run after this ships therefore opens a new regime and
   *  the boundary prints, which is the conservative answer and the intended
   *  one. */
  ownPostAudience?: boolean
}

/** The knobs that define a run's clustering. */
export interface ClusteringRegime {
  /** `passAPromptVersion(flags.transcripts)` — the regime the run's Pass A
   *  calls book against. */
  promptVersion: string
  /** The run's frozen Pass A flags — `flags.transcripts` / `.translation` /
   *  `.ocr`, not today's environment. */
  passAInputs: PassAInputs
  clusterThreshold: number
  evidenceFloor: number
  mergeModel: string
  /** theme-merge.ts PROMPT_VERSION, passed in for the same reason the Pass A
   *  version is: clustering.ts must stay importable by a page. */
  mergePromptVersion: string
  themeKey: string
}

/** The enabled inputs, in a fixed order, as one legible token. `none` rather
 *  than an empty field so a key never has two adjacent separators. */
function inputsField(inputs: PassAInputs): string {
  const on = (['transcripts', 'translation', 'ocr', 'ownPostAudience'] as const).filter((k) => inputs[k])
  return on.length ? on.join('+') : 'none'
}

/** The regime this deploy would cluster under, given the Pass A version the
 *  run's frozen flags select (`passAPromptVersion(flags.transcripts)`, passed
 *  in rather than imported so the boundary detector below can be read by a page
 *  without dragging the model client in behind it).
 *
 *  Read at open-run, once, and written to the row — never recomputed later, for
 *  the same reason the window is frozen there (AGENTS.md). */
export function currentClusteringRegime(input: {
  promptVersion: string
  passAInputs: PassAInputs
  mergePromptVersion: string
}): ClusteringRegime {
  return {
    promptVersion: input.promptVersion,
    passAInputs: input.passAInputs,
    clusterThreshold: CLUSTER_SIMILARITY_THRESHOLD,
    evidenceFloor: EVIDENCE_FLOOR,
    mergeModel: SYNTHESIS_MODEL,
    mergePromptVersion: input.mergePromptVersion,
    themeKey: THEME_KEY_RULE,
  }
}

/** The fingerprint, as stored in `pipeline_runs.clustering_key` and copied onto
 *  the month rows freeze-months writes. Fixed field order, so two keys compare
 *  as strings. */
export function clusteringKey(regime: ClusteringRegime): string {
  return [
    `a=${regime.promptVersion}`,
    `i=${inputsField(regime.passAInputs)}`,
    `c=${regime.clusterThreshold}`,
    `f=${regime.evidenceFloor}`,
    `m=${regime.mergeModel}`,
    `mp=${regime.mergePromptVersion}`,
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
 *
 * FOR THE CALLER: two nulls are never equal, so a series whose months were all
 * frozen before 2026-09-18 — today, all 925 frozen rows on both tenants —
 * yields an `unknown` boundary at EVERY month but the first. That is the
 * correct conservative answer (nobody can say whether those months were
 * re-grouped) and the tests lock it, but it is not a per-month caveat to print:
 * a reader collapses a consecutive run of `unknown` into one statement about
 * the stretch, the way "no change record before <date>" is one label and not a
 * badge on every row. Only a `changed` boundary names a single month.
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
