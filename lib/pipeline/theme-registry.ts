import { REGISTRY_MATCH_STRONG, REGISTRY_MATCH_WEAK, THEME_MATCH_THRESHOLD, REGISTRY_DORMANT_RUNS, EVIDENCE_FLOOR } from '../config'

// Theme identity — the pure matching logic (shape B-lite, 2026-08-17; the
// re-analysis-stable key, 2026-09-18). No I/O: persistThemes loads the
// registry, calls matchThemes, and writes the result.
//
// WHY MEMBERSHIP, NOT LABELS. Measured on two Sealand runs whose Pass A output
// was byte-identical (shape A froze it): 507 of 537 themes had an EXACTLY
// identical supporting_insight_ids set, while 48 of the 58 themes the
// label-embedding rule flagged "new" were the same theme with a new label.
// Clustering is now fully reproducible; the only nondeterminism left is the two
// gpt-5.4 calls (theme-merge picks which clusters fuse, pass-b picks the words),
// and neither accepts a temperature. So the words are the volatile part and the
// membership is the stable part — match on the stable part.
//
// WHY VIDEOS, NOT INSIGHT ROWS (item 3, 2026-09-18). The membership was the
// right idea keyed on the wrong ids. `audience_insights.id` is re-minted every
// time Pass A re-reads a video and hard-deleted a run later by
// prune-stale-analysis, so the key erodes in proportion to how much of the
// corpus a run re-read: 20.2% of Össur's member references one run back, and
// 100% across a Pass A prompt-version bump, which re-reads everything at once.
// `videos.id` survives both — the row is upserted on (client, platform,
// video_id) and retention tombstones rather than deletes. Measured on the two
// corpus-wide re-reads this database already holds (2026-08-09→16, 08-16→23),
// the insight key carries 0 of 334 and 0 of 444 identities where the video key
// carries 192 and 238.
//
// AND WHY IT IS A PREFERENCE, NOT A REPLACEMENT. A bare video key is degenerate
// below the evidence floor: 58.5% of Össur's themes have a single supporting
// video and 218 of 757 share an identical video set with another theme in the
// same bucket (Sealand: 507 of 1,053). Above the floor the video key is a
// strict superset — on both tenants it re-assigned NOTHING and only rescued
// identities the insight key had dropped. So the video arm leads where the
// candidate's own set clears the floor and is damped below it, the insight arm
// is the second reading, and the label's embedding breaks what is left.

export type MatchKind = 'exact' | 'strong' | 'weak' | 'new' | 'revived'

/** Which reading of the membership claimed the identity.
 *  `video`   the durable set (primary above the evidence floor)
 *  `insight` the row-id set (the second arm, and all there is below the floor)
 *  `title`   an exact normalised label, the ONE thing allowed to cross two
 *            bucket strings that name the same rival. */
export type MatchArm = 'video' | 'insight' | 'title'

/** A registry entry as loaded from the DB (last observation's state). */
export interface RegistryEntry {
  id: string
  bucket: string
  member_insight_ids: string[]
  /** `theme_registry.member_video_ids` (M2). Optional because a deploy can
   *  land before the migration and because every caller that does not care
   *  about the video arm — the operator script, a test — may leave it out:
   *  an absent set is an empty one, which scores 0 and falls through to the
   *  insight arm, i.e. exactly the behaviour before 2026-09-18. */
  member_video_ids?: string[]
  embedding: number[] | null
  status: string
  canonical_label: string
}

/** A theme produced by THIS run, awaiting an identity. `key` is any caller-side
 *  handle (the themes-array index) used to map results back. */
export interface IncomingTheme {
  key: string
  bucket: string
  memberInsightIds: string[]
  /** `AggregatedTheme.supportingVideoIds` — the distinct source videos of the
   *  cluster (lib/pipeline/step-a2.ts aggregate). */
  memberVideoIds?: string[]
  label: string
  embedding: number[] | null
}

export interface MatchResult {
  key: string
  /** null = no registry entry claimed; the caller creates one. */
  themeId: string | null
  kind: MatchKind
  score: number
  /** Diagnostics only (no genealogy UI in v1): other entries that overlapped. */
  mergedFrom?: string[]
  splitFrom?: string
}

export interface MatchOptions {
  strong?: number
  weak?: number
  cosineFloor?: number
  /** Injected so this module stays free of the embedding/OpenAI import chain. */
  cosine?: (a: number[], b: number[]) => number
  /** Video-set size a CANDIDATE must reach before the video arm leads.
   *  Defaults to the evidence floor, which is the same line the product draws
   *  between a theme it will show and one it will not. */
  floor?: number
  /** Folds two bucket strings that name the same rival onto one key, so an
   *  identity survives a re-spelling. Injected — the fold lives in
   *  lib/rivals.ts (audienceFold) and this module stays pure. Default: the
   *  literal bucket, i.e. matching never crosses a bucket at all. */
  bucketKey?: (bucket: string) => string
}

/** |A ∩ B| / |A ∪ B| over id sets. 1.0 = the same members exactly. */
export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0
  const A = new Set(a)
  const B = new Set(b)
  let inter = 0
  for (const id of B) if (A.has(id)) inter++
  const union = A.size + B.size - inter
  return union === 0 ? 0 : inter / union
}

/**
 * How much a membership of `n` is trusted to carry an identity on its own.
 *
 * 1 at the evidence floor and above; damped below it, so a ONE-VIDEO theme can
 * never score 1.0 however exactly its set matches. That is the whole defence
 * against the video key's one weakness: 443 of Össur's 757 themes and 507 of
 * Sealand's 1,053 stand on a single video, and 218 of them share that video
 * with another theme in the same bucket. Without the damp they would all tie at
 * 1.0 and identity would be handed out by `entryId.localeCompare` — an
 * alphabetical decision about whose time series continues.
 */
export function sizeWeight(n: number, floor: number = EVIDENCE_FLOOR): number {
  if (n <= 0) return 0
  return n >= floor ? 1 : n / (n + 1)
}

/** A label folded to what two runs can be expected to agree on: lowercase, no
 *  accents, no punctuation, single spaces. The ONLY signal allowed to carry an
 *  identity across two bucket strings, and only when they name one rival. */
export function normaliseTitle(label: string | null | undefined): string {
  return (label ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Both readings of one (theme, entry) pair, and which one led. */
export interface PairScore {
  /** What the pair is matched on: the leading arm's reading. */
  score: number
  arm: MatchArm
  /** The video arm, damped by `sizeWeight`; 0 when the entry's own set does
   *  not clear the floor (or it has none, which is every entry until M2's
   *  backfill has run). */
  video: number
  /** The insight-row arm, undamped — it is what the matcher has always used. */
  insight: number
}

/**
 * Score one (theme, entry) pair on both arms and say which one leads.
 *
 * The video arm leads wherever the CANDIDATE's stored set clears the floor,
 * which is the population the measurement covers: above it the video key
 * re-assigned zero identities on either tenant and rescued 40 (Össur) / 56
 * (Sealand) per run that the insight key had dropped. The insight arm is not a
 * fallback in the "only when the other is absent" sense — it is read every
 * time and wins when it reads higher, which is what keeps the change a strict
 * improvement rather than a re-keying.
 */
export function scorePair(
  t: Pick<IncomingTheme, 'memberInsightIds' | 'memberVideoIds'>,
  e: Pick<RegistryEntry, 'member_insight_ids' | 'member_video_ids'>,
  floor: number = EVIDENCE_FLOOR,
): PairScore {
  const themeVideos = t.memberVideoIds ?? []
  const entryVideos = e.member_video_ids ?? []
  const insight = jaccard(t.memberInsightIds, e.member_insight_ids)
  const video = entryVideos.length >= floor
    ? jaccard(themeVideos, entryVideos) * sizeWeight(Math.min(themeVideos.length, entryVideos.length), floor)
    : 0
  return video > 0 && video >= insight
    ? { score: video, arm: 'video', video, insight }
    : { score: insight, arm: 'insight', video, insight }
}

const ARM_RANK: Record<MatchArm, number> = { video: 0, insight: 1, title: 2 }

interface Candidate {
  key: string
  entryId: string
  score: number
  kind: MatchKind
  arm: MatchArm
  /** The second reading, for the tiebreak among video-tied candidates. */
  insight: number
  /** The label embeddings' cosine, when both are present; 0 when they are not. */
  cosine: number
}

/**
 * Assign each incoming theme a registry identity.
 *
 * Rules, in order (per bucket — see the crossing rule below for the one
 * exception):
 *   1. score >= strong  → same theme (an identical set above the floor is 1.0)
 *   2. score >= weak AND label cosine >= cosineFloor → same theme (the
 *      split/merge band, where both signals must agree)
 *   3. otherwise → new entry
 *
 * The score is `scorePair`: the video arm where the candidate's stored set
 * clears the floor, the insight arm otherwise or wherever it reads higher.
 * Among candidates that tie, the video arm is preferred, then the insight
 * reading, then the label embeddings' cosine — which is what decides the
 * degenerate case the video key brings with it, two below-floor themes sharing
 * one video.
 *
 * WHAT MAY CROSS A BUCKET. Nothing, except an EXACTLY equal normalised title
 * between two buckets `bucketKey` says are the same rival —
 * `competitor:Cotopaxi` and `competitor:cotopaxi `, or the two halves of a
 * rename that re-stamped the corpus but not this entry. Membership may not
 * cross: the buckets partition the corpus, so an overlapping member set across
 * two of them means the video was re-tagged, which is a change of whose post it
 * is and not a continuation of a theme.
 *
 * Assignment is GREEDY by descending score and each registry entry can be
 * claimed at most once per run: when a cluster splits in two, the larger half
 * continues the time series and the smaller opens a fresh entry (reported with
 * `splitFrom`), rather than both claiming the same identity.
 */
export function matchThemes(
  incoming: IncomingTheme[],
  registry: RegistryEntry[],
  opts: MatchOptions = {},
): MatchResult[] {
  const strong = opts.strong ?? REGISTRY_MATCH_STRONG
  const weak = opts.weak ?? REGISTRY_MATCH_WEAK
  const cosineFloor = opts.cosineFloor ?? THEME_MATCH_THRESHOLD
  const cosine = opts.cosine
  const floor = opts.floor ?? EVIDENCE_FLOOR
  const bucketKey = opts.bucketKey ?? ((b: string) => b)

  const byBucket = new Map<string, RegistryEntry[]>()
  for (const e of registry) {
    const key = bucketKey(e.bucket)
    const arr = byBucket.get(key)
    if (arr) arr.push(e)
    else byBucket.set(key, [e])
  }

  // 1. Score every (theme, entry) pair with any evidence of being one theme.
  const candidates: Candidate[] = []
  const overlapByKey = new Map<string, string[]>()
  for (const t of incoming) {
    const entries = byBucket.get(bucketKey(t.bucket)) ?? []
    const title = normaliseTitle(t.label)
    const overlapped: string[] = []
    for (const e of entries) {
      let s: PairScore
      if (e.bucket === t.bucket) {
        s = scorePair(t, e, floor)
      } else {
        // A different spelling of the same rival. Only the title crosses, and
        // only an exact one: a partial membership overlap here is a re-tagged
        // video, not a theme continuing.
        if (!title || title !== normaliseTitle(e.canonical_label)) continue
        s = { score: strong, arm: 'title', video: 0, insight: 0 }
      }
      if (s.score <= 0) continue
      overlapped.push(e.id)
      const cos = cosine && t.embedding && e.embedding ? cosine(t.embedding, e.embedding) : 0
      const common = { key: t.key, entryId: e.id, score: s.score, arm: s.arm, insight: s.insight, cosine: cos }
      if (s.score >= strong) {
        candidates.push({ ...common, kind: s.score >= 1 ? 'exact' : 'strong' })
      } else if (s.score >= weak && cosine && t.embedding && e.embedding && cos >= cosineFloor) {
        // The ambiguous band: membership alone is not enough, so the words have
        // to agree too before we continue someone's time series.
        candidates.push({ ...common, kind: 'weak' })
      }
    }
    overlapByKey.set(t.key, overlapped)
  }

  // 2. Greedy assignment: best score first, one entry per theme, one theme per
  //    entry. The video arm leads a tie, then the insight reading, then the
  //    words; entry id last, so a rerun is deterministic.
  candidates.sort((a, b) =>
    b.score - a.score ||
    ARM_RANK[a.arm] - ARM_RANK[b.arm] ||
    b.insight - a.insight ||
    b.cosine - a.cosine ||
    a.entryId.localeCompare(b.entryId) ||
    a.key.localeCompare(b.key))
  const takenEntry = new Set<string>()
  const assigned = new Map<string, Candidate>()
  for (const c of candidates) {
    if (assigned.has(c.key) || takenEntry.has(c.entryId)) continue
    assigned.set(c.key, c)
    takenEntry.add(c.entryId)
  }

  const dormantById = new Map(registry.map((e) => [e.id, e.status === 'dormant']))
  const entryById = new Map(registry.map((e) => [e.id, e]))
  return incoming.map((t) => {
    const c = assigned.get(t.key)
    const overlapped = overlapByKey.get(t.key) ?? []
    if (!c) {
      // No identity claimed. If it overlapped entries that someone else took,
      // it is the smaller half of a split — recorded, but still a new theme.
      // Attribute it to the entry it overlapped MOST, not the first in id order.
      let splitFrom: string | undefined
      let best = 0
      for (const id of overlapped) {
        if (!takenEntry.has(id)) continue
        const e = entryById.get(id)
        const j = e ? scorePair(t, e, floor).score : 0
        if (j > best) { best = j; splitFrom = id }
      }
      return { key: t.key, themeId: null, kind: 'new' as MatchKind, score: 0, ...(splitFrom ? { splitFrom } : {}) }
    }
    const others = overlapped.filter((id) => id !== c.entryId)
    return {
      key: t.key,
      themeId: c.entryId,
      kind: dormantById.get(c.entryId) ? ('revived' as MatchKind) : c.kind,
      score: c.score,
      ...(others.length ? { mergedFrom: others } : {}),
    }
  })
}

/**
 * The last `count` runs that actually THEMED this client, newest first, with
 * this run at the head.
 *
 * Dormancy's window was read off `pipeline_runs` — the last three rows with
 * status completed|partial, of any kind. Össur's history holds five completed
 * runs with zero themes (2026-06-29 → 07-02), and a gather-only "Run now" or a
 * run that closes `partial` before persist-themes consumes a dormancy slot the
 * same way, retiring live themes a run or two early. The migration's own
 * comment and the JSDoc both said "themed runs"; the query did not.
 *
 * The registry answers it without a query at all: every run that wrote
 * observations stamped `last_seen_run_id` on the entries it claimed, at
 * `last_seen_at`. A run whose every entry has since been re-seen drops out of
 * this list — and correctly, because every entry it would have kept alive has a
 * newer run on it already.
 */
export function themedRunWindow(
  entries: readonly { last_seen_run_id: string | null; last_seen_at?: string | null }[],
  runId: string,
  count: number = REGISTRY_DORMANT_RUNS,
): string[] {
  const seen = new Map<string, string>()
  for (const e of entries) {
    const id = e.last_seen_run_id
    if (!id || id === runId) continue
    const at = e.last_seen_at ?? ''
    const prior = seen.get(id)
    if (prior === undefined || prior < at) seen.set(id, at)
  }
  const others = [...seen.entries()]
    .sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : a[0].localeCompare(b[0])))
    .map(([id]) => id)
  return [runId, ...others].slice(0, count)
}

/** Registry entries to mark dormant: active, and not seen in the last
 *  `dormantAfter` themed runs. `recentRunIds` is newest-first. */
export function dormantIds(
  registry: { id: string; last_seen_run_id: string | null; status: string }[],
  recentRunIds: string[],
  dormantAfter: number = REGISTRY_DORMANT_RUNS,
): string[] {
  const window = new Set(recentRunIds.slice(0, dormantAfter))
  return registry
    .filter((e) => e.status === 'active' && (!e.last_seen_run_id || !window.has(e.last_seen_run_id)))
    .map((e) => e.id)
}

/** Run-level tally for the persist step's result and the operator script. */
export function matchTally(results: MatchResult[]): Record<MatchKind, number> {
  const t: Record<MatchKind, number> = { exact: 0, strong: 0, weak: 0, new: 0, revived: 0 }
  for (const r of results) t[r.kind]++
  return t
}
