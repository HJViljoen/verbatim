import type { SupabaseClient } from '@supabase/supabase-js'
import { rows } from './read'

// The video update — shared by every page loader that reads a corpus of videos.
//
// A page anchors on the latest CLOSED update, but not every update gathers:
// an analysis-only update re-reads videos an earlier update collected and
// writes no `videos` rows of its own. Anchoring video reads on the latest
// update then shows the client an empty corpus. So video-dependent reads
// anchor on their own run: the newest closed update that actually gathered
// videos. Every other read stays on the latest update.
//
// `videos` rows carry the identity of the run that scraped them, so the
// presence of a row IS the evidence that the run gathered.
//
// In-flight updates are excluded: a run writes videos before it closes, so an
// unfinished one can already have some and must not become the video update
// (the page keeps serving the previous update while a new one collects).
//
// Sibling of `themed-run.ts`, same rule on a different table. What each page
// does with a null answer is the page's own decision and stays there —
// Dashboard falls back to the latest update, Content calls it empty, and
// Competitive gates its video reads off.

export interface VideoRunRow {
  run_id: string | null
  /** Anything monotonic with time — a video row's `scraped_at`. */
  scraped_at?: string | null
}

export interface LatestVideoRun {
  runId: string
  /** The scrape time of the newest video in that update; Content shows it as the update's date. */
  scrapedAt: string | null
}

/** The newest update among `rows` that gathered videos, skipping in-flight
 *  ones. Rows with no date rank oldest; on a tie the later row wins, which
 *  keeps a caller's own ordering meaningful. Null when no update has videos. */
export function pickLatestVideoRun(
  rows: VideoRunRow[],
  runningIds: readonly string[] = [],
): LatestVideoRun | null {
  let best: LatestVideoRun | null = null
  let bestAt = ''
  for (const row of rows) {
    const runId = row.run_id
    if (!runId || runningIds.includes(runId)) continue
    const at = row.scraped_at ?? ''
    if (best === null || at >= bestAt) {
      best = { runId, scrapedAt: row.scraped_at ?? null }
      bestAt = at
    }
  }
  return best
}

/** One round trip for the same rule: the DB orders and takes the newest video
 *  row, `pickLatestVideoRun` states what that row means. `page` names the
 *  caller in the log line, because five loaders share this. */
export async function fetchLatestVideoRun(
  supabase: SupabaseClient,
  clientId: string,
  runningIds: readonly string[],
  page: string,
): Promise<LatestVideoRun | null> {
  let q = supabase.from('videos').select('run_id, scraped_at').eq('client_id', clientId)
  if (runningIds.length) q = q.not('run_id', 'in', `(${runningIds.join(',')})`)
  // videos.run_id is nullable and its FK is ON DELETE SET NULL, so deleting an
  // update orphans its videos rather than removing them. With .limit(1) there
  // is no second row to fall through to, so one orphan at the top of the
  // ordering would answer "no update ever gathered" — and Content reads that as
  // its empty state. Excluded in SQL, because the picker never sees row two.
  const res = await q.not('run_id', 'is', null).order('scraped_at', { ascending: false }).limit(1)
  return pickLatestVideoRun(rows<VideoRunRow>(res, `${page}.videoRun`), runningIds)
}

/** The updates that are collecting right now. Every loader that anchors on a
 *  run needs them, and every loader asked for them itself until this. */
export async function fetchRunningRunIds(supabase: SupabaseClient, clientId: string, page: string): Promise<string[]> {
  const res = await supabase.from('pipeline_runs').select('id').eq('client_id', clientId).eq('status', 'running')
  return rows<{ id: string }>(res, `${page}.runningRuns`).map((r) => r.id)
}
