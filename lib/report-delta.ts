import type { createAdminClient } from './supabase-admin'
import type { CiSummary } from './pipeline/schemas'

// Week-over-week delta for the report's "what changed" block (Redesign Spec §7).
// Computed from consecutive run_summary rows — no genealogy: the previous row is
// simply the latest one dated before the current run's. Every field degrades to
// null independently, so a first report (no previous row) or a metric missing on
// either side hides just that line, never the report.

type Admin = ReturnType<typeof createAdminClient>

interface SovEntry {
  videos: number
  views: number
  pct_videos: number
}

export interface RunSummaryRow {
  run_id: string
  run_date: string
  period: string | null
  total_videos: number | null
  total_comments: number | null
  overall_sentiment_positive: string | number | null
  share_of_voice: Record<string, SovEntry> | null
  consumer_intelligence_summary: CiSummary | null
}

export interface ShareSide {
  /** Client's share of tracked conversation, % of videos. */
  client: number
  /** Largest tracked competitor by share, if any competitor is tracked. */
  competitor: { name: string; pct: number } | null
}

export interface RunDelta {
  prevRunDate: string
  /** % of conversations positive, now vs the previous update. */
  sentiment: { now: number; prev: number; change: number } | null
  share: { now: ShareSide; prev: ShareSide } | null
  /** Confirmed (multi-source) themes not present in the previous update.
   *  Null when the previous run has no themes to compare against. */
  newThemes: { count: number; labels: string[] } | null
  conversations: { now: number; prev: number } | null
}

const num = (v: string | number | null | undefined): number | null => {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function loadRunSummary(
  admin: Admin,
  clientId: string,
  runId: string,
): Promise<RunSummaryRow | null> {
  const { data } = await admin
    .from('run_summary')
    .select('run_id, run_date, period, total_videos, total_comments, overall_sentiment_positive, share_of_voice, consumer_intelligence_summary')
    .eq('client_id', clientId)
    .eq('run_id', runId)
    .maybeSingle()
  return (data as RunSummaryRow | null) ?? null
}

/** Client + top-competitor share out of a share_of_voice map. */
export function readShare(sov: Record<string, SovEntry> | null): ShareSide | null {
  if (!sov || !sov.client) return null
  let competitor: ShareSide['competitor'] = null
  for (const [key, entry] of Object.entries(sov)) {
    if (!key.startsWith('competitor:')) continue
    const pct = num(entry?.pct_videos)
    if (pct == null) continue
    if (!competitor || pct > competitor.pct) competitor = { name: key.slice('competitor:'.length), pct }
  }
  const client = num(sov.client.pct_videos)
  return client == null ? null : { client, competitor }
}

export async function computeRunDelta(
  admin: Admin,
  clientId: string,
  current: RunSummaryRow,
): Promise<RunDelta | null> {
  const { data: prev } = await admin
    .from('run_summary')
    .select('run_id, run_date, period, total_videos, total_comments, overall_sentiment_positive, share_of_voice, consumer_intelligence_summary')
    .eq('client_id', clientId)
    .lt('run_date', current.run_date)
    .order('run_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!prev) return null
  const prevRow = prev as RunSummaryRow

  const sentNow = num(current.overall_sentiment_positive)
  const sentPrev = num(prevRow.overall_sentiment_positive)

  const shareNow = readShare(current.share_of_voice)
  const sharePrev = readShare(prevRow.share_of_voice)

  // "New themes" is only honest when the previous run has themes to have been
  // matched against — otherwise every theme carries first_seen trivially.
  let newThemes: RunDelta['newThemes'] = null
  const { data: prevTheme } = await admin
    .from('themes')
    .select('id')
    .eq('client_id', clientId)
    .eq('run_id', prevRow.run_id)
    .limit(1)
    .maybeSingle()
  if (prevTheme) {
    const { data: fresh } = await admin
      .from('themes')
      .select('label')
      .eq('client_id', clientId)
      .eq('run_id', current.run_id)
      .eq('first_seen', true)
      .eq('single_source', false)
      .order('strength_score', { ascending: false })
    const rows = (fresh ?? []) as { label: string }[]
    newThemes = { count: rows.length, labels: rows.slice(0, 2).map((r) => r.label) }
  }

  const convNow = num(current.total_comments)
  const convPrev = num(prevRow.total_comments)

  return {
    prevRunDate: prevRow.run_date,
    sentiment:
      sentNow != null && sentPrev != null
        ? { now: sentNow, prev: sentPrev, change: Math.round((sentNow - sentPrev) * 10) / 10 }
        : null,
    share: shareNow && sharePrev ? { now: shareNow, prev: sharePrev } : null,
    newThemes,
    conversations: convNow != null && convPrev != null ? { now: convNow, prev: convPrev } : null,
  }
}
