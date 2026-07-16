import type { VideoInsert, VideoRef } from './types'

// Delta-scraping (2026-07-16). Two moves, one comparison:
//
//   1. SKIP UNCHANGED — a search that resurfaces a video we already hold gives
//      us its current comments_count for free. If it hasn't grown past what we
//      scraped, the paid comment scrape is a duplicate — skip it.
//   2. RE-CHECK ACTIVE — if it HAS grown, re-scrape it even when it has aged
//      out of the weekly window. Measured on the stored corpus (2026-07-16):
//      ~27% of an IG video's lifetime comments arrive after its first week, and
//      the one-shot-scrape design lost all of them. New comments carry the
//      current run_id + their own comment_date, so the period slice stays
//      honest automatically (inWindow on comment_date).
//
// The baseline is comments_count_at_scrape (stamped by scrapeCommentsBatch),
// falling back to the stored comments_count for rows that predate the column —
// correct for them, because the old pipeline scraped on every re-find, so
// find-time count == scrape-time count.
//
// These are pure functions — the orchestrator (gatePlatform) supplies the
// stored state and applies the results. Tested in delta.test.ts.

/** The stored-videos slice the delta comparison needs (+ entity tags, grafted
 *  back onto re-upserts so naive normalise tags can't clobber GPT attribution). */
export interface KnownVideoState {
  video_id: string
  video_url: string
  comments_count: number
  comments_count_at_scrape: number | null
  upload_date: string | null
  is_client: boolean
  is_competitor: boolean
  competitor_name: string | null
}

/** One re-check candidate: a known video with a freshly observed count. */
export interface RecheckCandidate {
  video_id: string
  video_url: string
  /** comments_count as just observed (search metadata or a native count API). */
  freshCount: number
  /** comments_count_at_scrape ?? stored comments_count. */
  baseline: number
}

export interface DeltaSplit {
  /** Not in the DB — the full fresh path (window → gate → attribution → upsert → scrape). */
  fresh: VideoInsert[]
  /** Already stored: this run's observation paired with the stored state. */
  resurfaced: { video: VideoInsert; state: KnownVideoState }[]
}

/** Split a platform's merged search results into fresh vs already-stored. */
export function splitDelta(merged: VideoInsert[], known: Map<string, KnownVideoState>): DeltaSplit {
  const fresh: VideoInsert[] = []
  const resurfaced: DeltaSplit['resurfaced'] = []
  for (const video of merged) {
    const state = known.get(video.video_id)
    if (state) resurfaced.push({ video, state })
    else fresh.push(video)
  }
  return { fresh, resurfaced }
}

/** Baseline for the growth comparison — see the module note on the fallback. */
export const scrapeBaseline = (state: Pick<KnownVideoState, 'comments_count' | 'comments_count_at_scrape'>): number =>
  state.comments_count_at_scrape ?? state.comments_count

/**
 * Pick which known videos earn a re-scrape: grown by at least `minGrowth` new
 * comments (a scrape is a paid actor run — one or two new comments don't cover
 * it), past the platform's comment threshold, biggest growth first, capped.
 * Shrunk or unchanged counts (deleted comments, metadata jitter) never qualify.
 */
export function pickRechecks(
  candidates: RecheckCandidate[],
  opts: { minGrowth: number; threshold: number | null; cap: number },
): VideoRef[] {
  return candidates
    .map((c) => ({ ...c, growth: c.freshCount - c.baseline }))
    .filter((c) => c.growth >= opts.minGrowth && (opts.threshold == null || c.freshCount >= opts.threshold))
    .sort((a, b) => b.growth - a.growth)
    .slice(0, opts.cap)
    .map((c) => ({ video_id: c.video_id, video_url: c.video_url, comments_count: c.freshCount }))
}
