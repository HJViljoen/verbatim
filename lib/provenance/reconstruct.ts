// How each video was FIRST found, reconstructed from the evidence left
// (market-first plan WP1.4, the planner behind scripts/reconstruct-provenance.ts).
//
// WHY. `videos.source_keywords` holds the union of keywords from the LAST run
// that surfaced a video: every run that resurfaces it overwrites how it was first
// found (lib/gather/gather.ts; GC F26). Gather-time provenance arrives only with
// deploy 4 (WP3.4). Until then the first finds are pieced together, once, into
// `video_provenance`, from four kinds of evidence, in this order:
//
//   1. `gate_verdicts`: the earliest KEPT verdict is the video's first-stored
//      run, and its `keyword` is `source_keywords[0]` of that run (gather.ts), a
//      term that certainly found it. Recorded from the first gather on 9 Sep
//      (staging holds none before it; GC OQ4 asks whether production does).
//   2. the production snapshot (WP1.0, `snapshot@<date>`), then
//   3. the staging export (WP0.1, `staging@2026-09-20`, a production copy):
//      a snapshot's `source_keywords` IS the first-found union when no gather ran
//      between the video's first-stored gather and the snapshot, because nothing
//      could have resurfaced it yet. Then the video is `exact` from that
//      snapshot. Otherwise a snapshot is a later union: `reconstructed`.
//   4. no verdict (era A, before gate recording began; and on staging 989
//      videos stored by the two 9 Sep gathers that left none): the earliest
//      snapshot's terms that the first-stored gather searched (`reconstructed`);
//      when it names none of them, every term it carries was added later, the
//      terms that first found it were overwritten, and they cannot be known
//      (`ambiguous`, GC F29: about 40 in August).
//
// The current `source_keywords`, read when the plan is made, is the last
// snapshot (`snapshot@<that day>`).
//
// A video gathered by reading an ACCOUNT (videos.source 'owned' or
// 'competitor_owned', lib/gather/owned.ts) was found by no search at all:
// `exact`, evidence 'account', no terms.
//
// Community harvests are stamped `r/<name>` (lib/gather/subreddits.ts
// subredditLabel), so a term starting "r/" goes to first_subreddits.
//
// PURE. The script reads the rows and writes the plan; nothing here reads a
// database, a file or the clock.

export type ProvenanceMethod = 'exact' | 'reconstructed' | 'ambiguous'

export interface ProvenanceVideo {
  /** videos.id */
  id: string
  platform: string
  /** the platform's own id (videos.video_id), which gate_verdicts carries */
  videoId: string
  /** videos.scraped_at: the insert default, never in the upsert payload, so the first-stored time */
  firstSeen: string
  /** videos.source_keywords now (the newest union) */
  sourceKeywords: readonly string[]
  /** videos.source: 'discovered' | 'owned' | 'competitor_owned' */
  source?: string | null
}

export interface ProvenanceVerdict {
  runId: string | null
  platform: string
  videoId: string
  keyword: string | null
  kept: boolean
  createdAt: string
}

/** One gather: a run that wrote keyword_performance rows, at its first row's
 *  time, with the terms it searched. (`pipeline_runs.started_at` is re-stamped
 *  on resume, GC F28, so it is not the gather's time.) */
export interface ProvenanceGather {
  runId: string
  at: string
  terms: ReadonlySet<string>
}

/** A copy of `source_keywords` taken at `takenAt`, keyed by videos.id. */
export interface ProvenanceSnapshot {
  label: string
  takenAt: string
  sourceKeywords: ReadonlyMap<string, readonly string[]>
}

export interface ProvenanceInput {
  videos: readonly ProvenanceVideo[]
  verdicts: readonly ProvenanceVerdict[]
  gathers: readonly ProvenanceGather[]
  /** In order of preference: the production snapshot first, then the staging export. */
  snapshots: readonly ProvenanceSnapshot[]
  /** When the current `source_keywords` were read, and the label to cite them by. */
  now: { label: string; takenAt: string }
}

export interface ProvenanceRow {
  videoId: string
  firstRunId: string | null
  firstStoredAt: string
  firstTerms: string[]
  firstSubreddits: string[]
  method: ProvenanceMethod
  evidence: string
}

const ms = (iso: string): number => Date.parse(iso)
const key = (platform: string, videoId: string): string => `${platform}\u0000${videoId}`
const ACCOUNT_SOURCES: readonly string[] = ['owned', 'competitor_owned']

/** Terms in order, trimmed, blanks and repeats dropped. */
function dedupe(xs: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of xs) {
    const t = (x ?? '').trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

/** A term list split into search terms and communities (`r/<name>`). */
export function splitTerms(terms: readonly string[]): { terms: string[]; subreddits: string[] } {
  const all = dedupe(terms)
  return { terms: all.filter((t) => !t.startsWith('r/')), subreddits: all.filter((t) => t.startsWith('r/')) }
}

/** A video is stored by the gather that started at most this long before its
 *  first_seen (a gather's searches, and so its inserts, run for hours: the
 *  9 Sep 10:30 gather stored YouTube videos at 11:10 on staging)… */
export const GATHER_SPAN_MS = 24 * 60 * 60 * 1000
/** …or at most this long after it: a search's keyword row can land a moment
 *  after the first videos it stored. */
export const GATHER_LEAD_MS = 10 * 60 * 1000

/** The gather a video was stored in: the latest one begun before its first_seen
 *  (within GATHER_LEAD_MS after it), no more than GATHER_SPAN_MS before it. */
export function gatherOf(firstSeen: string, gathers: readonly ProvenanceGather[]): ProvenanceGather | null {
  const t = ms(firstSeen)
  if (Number.isNaN(t)) return null
  let best: ProvenanceGather | null = null
  for (const g of gathers) {
    const at = ms(g.at)
    if (at > t + GATHER_LEAD_MS || t - at > GATHER_SPAN_MS) continue
    if (best == null || at > ms(best.at)) best = g
  }
  return best
}

/** The last gather at or before an instant, from gathers sorted oldest first. */
function lastGatherBefore(at: string, sorted: readonly ProvenanceGather[]): ProvenanceGather | null {
  let out: ProvenanceGather | null = null
  for (const g of sorted) if (ms(g.at) <= ms(at)) out = g
  return out
}

/** When gate recording began: the gather holding the earliest verdict (or the
 *  verdict itself when no gather matches). Null when no verdict exists. */
export function recordingStartOf(verdicts: readonly ProvenanceVerdict[], gathers: readonly ProvenanceGather[]): number | null {
  let first: number | null = null
  for (const v of verdicts) {
    const t = ms(v.createdAt)
    if (!Number.isNaN(t) && (first == null || t < first)) first = t
  }
  if (first == null) return null
  const g = gatherOf(new Date(first).toISOString(), gathers)
  return g ? Math.min(ms(g.at), first) : first
}

/** The plan: one row per video, from the best evidence it has. */
export function planProvenance(input: ProvenanceInput): ProvenanceRow[] {
  const gathers = [...input.gathers].filter((g) => !Number.isNaN(ms(g.at))).sort((a, b) => ms(a.at) - ms(b.at))
  const gatherById = new Map(gathers.map((g) => [g.runId, g]))

  const firstKept = new Map<string, ProvenanceVerdict>()
  for (const v of input.verdicts) {
    if (!v.kept || Number.isNaN(ms(v.createdAt))) continue
    const k = key(v.platform, v.videoId)
    const held = firstKept.get(k)
    if (!held || ms(v.createdAt) < ms(held.createdAt)) firstKept.set(k, v)
  }
  const recordingStart = recordingStartOf(input.verdicts, gathers)
  const eraATerms = new Set<string>()
  if (recordingStart != null) for (const g of gathers) if (ms(g.at) < recordingStart) for (const t of g.terms) eraATerms.add(t)

  const out: ProvenanceRow[] = []
  for (const video of input.videos) {
    const stored = gatherOf(video.firstSeen, gathers)
    const snapshots: ProvenanceSnapshot[] = [
      ...input.snapshots,
      { label: input.now.label, takenAt: input.now.takenAt, sourceKeywords: new Map([[video.id, video.sourceKeywords]]) },
    ]
    const termsIn = (s: ProvenanceSnapshot): readonly string[] | null => s.sourceKeywords.get(video.id) ?? null
    /** A snapshot taken before any gather after `first` holds the first-found union. */
    const firstUnion = (first: ProvenanceGather | null): ProvenanceSnapshot | null =>
      first == null ? null : snapshots.find((s) => termsIn(s) != null && lastGatherBefore(s.takenAt, gathers)?.runId === first.runId) ?? null
    /** The earliest snapshot taken after the video was first stored. */
    const earliest = [...snapshots]
      .filter((s) => termsIn(s) != null && ms(s.takenAt) >= ms(video.firstSeen))
      .sort((a, b) => ms(a.takenAt) - ms(b.takenAt))[0] ?? null
    const row = (method: ProvenanceMethod, evidence: string, terms: readonly string[], runId: string | null): ProvenanceRow => {
      const split = splitTerms(terms)
      return {
        videoId: video.id, firstRunId: runId, firstStoredAt: video.firstSeen,
        firstTerms: split.terms, firstSubreddits: split.subreddits, method, evidence,
      }
    }

    if (ACCOUNT_SOURCES.includes(video.source ?? '')) {
      out.push(row('exact', 'account', [], stored?.runId ?? null))
      continue
    }

    const verdict = firstKept.get(key(video.platform, video.videoId))
    if (verdict) {
      const first = (verdict.runId ? gatherById.get(verdict.runId) : undefined) ?? stored
      const runId = verdict.runId ?? first?.runId ?? null
      const union = firstUnion(first)
      if (union) out.push(row('exact', union.label, [...(verdict.keyword ? [verdict.keyword] : []), ...termsIn(union)!], runId))
      else if (verdict.keyword) out.push(row('exact', 'gate_verdicts', [verdict.keyword], runId))
      else if (earliest && termsIn(earliest)!.length > 0) out.push(row('reconstructed', earliest.label, termsIn(earliest)!, runId))
      else out.push(row('ambiguous', 'gate_verdicts', [], runId))
      continue
    }

    const union = firstUnion(stored)
    if (union && termsIn(union)!.length > 0) {
      out.push(row('exact', union.label, termsIn(union)!, stored?.runId ?? null))
      continue
    }

    // Only a term the first-stored gather searched can have found it: the
    // stored gather's terms where it is known, else (before gate recording)
    // everything era A searched. A later union that names none of them was
    // overwritten: the first terms cannot be known.
    const eraA = recordingStart != null && ms(video.firstSeen) < recordingStart
    const couldHave = stored?.terms ?? (eraA ? eraATerms : null)
    const seen = earliest ? termsIn(earliest)! : []
    const known = couldHave ? seen.filter((t) => couldHave.has(t)) : seen
    if (known.length > 0) out.push(row('reconstructed', earliest!.label, known, stored?.runId ?? null))
    else out.push(row('ambiguous', eraA ? 'era_a' : (earliest?.label ?? 'era_a'), [], stored?.runId ?? null))
  }
  return out
}

/** Counts by method and evidence, for the script's summary line. */
export function provenanceSummary(rows: readonly ProvenanceRow[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) {
    const k = `${r.method}:${r.evidence}`
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}
