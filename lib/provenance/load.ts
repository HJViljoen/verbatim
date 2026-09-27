import { readFileSync } from 'node:fs'
import type { SupabaseClient } from '@supabase/supabase-js'

import { audienceOf } from '../rivals'
import { selectAll } from '../supabase-admin'
import type { ConfigChange } from '../config-log'
import type { ProvenanceRow, ProvenanceSnapshot } from './reconstruct'
import { evidenceTerms, type KeywordRow, type MonthVideo, type RunRow } from './searches'

// The reads behind the four WP1.4 scripts (reconstruct-provenance,
// log-tracking-eras, measure-comparability, label-segments). I/O glue, not
// tested (AGENTS.md: the pure halves are, in reconstruct.ts and searches.ts).
//
// Every read is a paged PostgREST select or an RPC, and every page is counted
// (`Pages`), because pages are what the read ration counts (plan §4.0).
// Where MF1 is not applied (a dry run on staging), a missing table or function
// reads as null, and the scripts take the same data from a local file instead:
// the WP0.1 export (`--export`) and a provenance plan (`--provenance`).

export interface Pages { n: number }

function counted<T>(pages: Pages, rows: T[]): T[] {
  pages.n += Math.max(1, Math.ceil(rows.length / 1000))
  return rows
}

/** Is this error "that table or function is not there" (MF1 not applied)? */
export function isMissingObject(error: unknown, name: string): boolean {
  const text = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error)
  return text.includes(name) && /schema cache|does not exist|Could not find/i.test(text)
}

export interface VideoRow {
  id: string
  platform: string
  video_id: string
  source_keywords: string[] | null
  first_seen: string
  source: string | null
  is_client: boolean | null
  is_competitor: boolean | null
  competitor_name: string | null
  analyzed_lane: string | null
  account_name?: string | null
  caption?: string | null
  hashtags?: string[] | null
  topics?: string[] | null
}

/** Every video of the client. `text` adds account, caption, hashtags and topics (the maker rule, the heuristic gate). */
export function readVideos(admin: SupabaseClient, clientId: string, pages: Pages, opts: { text?: boolean } = {}): Promise<VideoRow[]> {
  const build = opts.text
    ? () => admin.from('videos')
      .select('id, platform, video_id, source_keywords, first_seen:scraped_at, source, is_client, is_competitor, competitor_name, analyzed_lane, account_name, caption, hashtags, topics')
      .eq('client_id', clientId).order('id')
    : () => admin.from('videos')
      .select('id, platform, video_id, source_keywords, first_seen:scraped_at, source, is_client, is_competitor, competitor_name, analyzed_lane')
      .eq('client_id', clientId).order('id')
  return selectAll<VideoRow>(build as () => { range: (a: number, b: number) => PromiseLike<{ data: VideoRow[] | null; error: unknown }> })
    .then((r) => counted(pages, r))
}

export interface VerdictRow { run_id: string | null; platform: string; video_id: string; keyword: string | null; kept: boolean; source: string; created_at: string }

export function readVerdicts(admin: SupabaseClient, clientId: string, pages: Pages): Promise<VerdictRow[]> {
  return selectAll<VerdictRow>(() =>
    admin.from('gate_verdicts').select('run_id, platform, video_id, keyword, kept, source, created_at').eq('client_id', clientId).order('id'),
  ).then((r) => counted(pages, r))
}

export function readKeywordRows(admin: SupabaseClient, clientId: string, pages: Pages): Promise<KeywordRow[]> {
  return selectAll<KeywordRow>(() =>
    admin.from('keyword_performance').select('run_id, platform, keyword, created_at').eq('client_id', clientId).order('id'),
  ).then((r) => counted(pages, r))
}

export interface RunReadRow extends RunRow { started_at: string | null; completed_at: string | null }

export function readRuns(admin: SupabaseClient, clientId: string, pages: Pages): Promise<RunReadRow[]> {
  return selectAll<RunReadRow>(() =>
    admin.from('pipeline_runs').select('id, status, started_at, completed_at, config_snapshot').eq('client_id', clientId).order('started_at').order('id'),
  ).then((r) => counted(pages, r))
}

export function readConfigChanges(admin: SupabaseClient, clientId: string, pages: Pages): Promise<ConfigChange[]> {
  return selectAll<ConfigChange>(() =>
    admin.from('config_changes').select('*').eq('client_id', clientId).order('changed_at').order('id'),
  ).then((r) => counted(pages, r))
}

export interface StoredProvenance { video_id: string; first_terms: string[]; first_subreddits: string[]; method: string; evidence: string }

/** The stored provenance, or null when MF1's table is not there. */
export async function readProvenanceTable(admin: SupabaseClient, clientId: string, pages: Pages): Promise<Map<string, StoredProvenance> | null> {
  try {
    const rows = await selectAll<StoredProvenance>(() =>
      admin.from('video_provenance').select('video_id, first_terms, first_subreddits, method, evidence').eq('client_id', clientId).order('video_id'),
    )
    return new Map(counted(pages, rows).map((r) => [r.video_id, r]))
  } catch (e) {
    if (isMissingObject(e, 'video_provenance')) return null
    throw e
  }
}

/** market_month_videos(p_client, p_month) through the RPC, paged, or null when
 *  MF1's function is not there. */
export async function readMonthVideos(admin: SupabaseClient, clientId: string, month: string, pages: Pages): Promise<MonthVideo[] | null> {
  try {
    const rows = await selectAll<{ video_id: string; audience: string; platform: string; dated_comments: number }>(() =>
      admin.rpc('market_month_videos', { p_client: clientId, p_month: month }).order('video_id'),
    )
    return counted(pages, rows).map((r) => ({ id: r.video_id, platform: r.platform, audience: r.audience, dated: Number(r.dated_comments) }))
  } catch (e) {
    if (isMissingObject(e, 'market_month_videos')) return null
    throw e
  }
}

// ---- The local files ------------------------------------------------------------------

/** The shape scripts/export-provenance.ts writes (WP0.1's staging export, WP1.0's
 *  production snapshot). */
export interface ProvenanceExportFile {
  exportedAt: string
  project: string
  clientId: string
  videos: { id: string; platform: string; video_id: string; source_keywords: string[] | null; is_client: boolean | null; is_competitor: boolean | null; competitor_name: string | null; analyzed_lane: string | null; first_seen: string }[]
  videoMonths: { video_id: string; month: string; dated_comments: number }[]
  gateVerdicts: VerdictRow[]
  keywordPerformance: (KeywordRow & { bucket?: string | null })[]
  runs: { id: string; started_at: string | null; status: string | null; period?: string | null }[]
}

export function readExportFile(path: string, clientId: string): ProvenanceExportFile {
  const d = JSON.parse(readFileSync(path, 'utf8')) as ProvenanceExportFile
  if (d.clientId !== clientId) throw new Error(`${path} is client ${d.clientId}, not ${clientId}`)
  return d
}

/** An export as a snapshot of source_keywords. A staging export is dated by its
 *  last insert (staging never gathered after its copy, so that is when its
 *  source_keywords last moved); a production snapshot by when it was read. */
export function snapshotOf(d: ProvenanceExportFile, kind: 'staging' | 'snapshot'): ProvenanceSnapshot {
  const takenAt = kind === 'staging'
    ? d.videos.reduce((m, v) => (v.first_seen > m ? v.first_seen : m), '')
    : d.exportedAt
  return {
    label: `${kind}@${takenAt.slice(0, 10)}`,
    takenAt,
    sourceKeywords: new Map(d.videos.map((v) => [v.id, v.source_keywords ?? []])),
  }
}

/** The market's videos in one month, from an export (the dry-run stand-in for
 *  market_month_videos: full lane, the client's own posts out). */
export function monthVideosFromExport(d: ProvenanceExportFile, month: string): MonthVideo[] {
  const byId = new Map(d.videos.map((v) => [v.id, v]))
  const out: MonthVideo[] = []
  for (const r of d.videoMonths) {
    if (r.month.slice(0, 7) !== month.slice(0, 7)) continue
    const v = byId.get(r.video_id)
    if (!v || v.analyzed_lane !== 'full' || v.is_client === true) continue
    out.push({ id: v.id, platform: v.platform, audience: audienceOf(v), dated: r.dated_comments })
  }
  return out
}

/** A provenance plan written by reconstruct-provenance --out, keyed by video. */
export function readProvenanceFile(path: string): Map<string, StoredProvenance> {
  const d = JSON.parse(readFileSync(path, 'utf8')) as { rows: ProvenanceRow[] }
  return new Map(d.rows.map((r) => [r.videoId, { video_id: r.videoId, first_terms: r.firstTerms, first_subreddits: r.firstSubreddits, method: r.method, evidence: r.evidence }]))
}

/** Every video's surfacing evidence: first-found terms, each snapshot, the
 *  current source_keywords and every gate verdict's keyword (searches.ts). */
export function evidenceMap(args: {
  videos: readonly Pick<VideoRow, 'id' | 'platform' | 'video_id' | 'source_keywords'>[]
  provenance: ReadonlyMap<string, StoredProvenance> | null
  snapshots: readonly ProvenanceSnapshot[]
  verdicts: readonly Pick<VerdictRow, 'platform' | 'video_id' | 'keyword'>[]
}): Map<string, Set<string>> {
  const verdictTerms = new Map<string, string[]>()
  for (const v of args.verdicts) {
    if (!v.keyword) continue
    const k = `${v.platform}\u0000${v.video_id}`
    verdictTerms.set(k, [...(verdictTerms.get(k) ?? []), v.keyword])
  }
  const out = new Map<string, Set<string>>()
  for (const v of args.videos) {
    const p = args.provenance?.get(v.id)
    out.set(v.id, evidenceTerms([
      p?.first_terms, p?.first_subreddits, v.source_keywords,
      ...args.snapshots.map((s) => s.sourceKeywords.get(v.id) ?? null),
      verdictTerms.get(`${v.platform}\u0000${v.video_id}`),
    ]))
  }
  return out
}

/** The comments dated in one month (platform, video and first capture), for
 *  the late-capture figure (lib/provenance/measure.ts lateCaptureOf). */
export async function readMonthComments(admin: SupabaseClient, clientId: string, month: string, pages: Pages): Promise<{ platform: string; video_id: string; created_at: string }[]> {
  const from = `${month.slice(0, 7)}-01`
  const d = new Date(`${from}T00:00:00Z`)
  const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10)
  const rows = await selectAll<{ platform: string; video_id: string; created_at: string }>(() =>
    admin.from('comments').select('platform, video_id, created_at').eq('client_id', clientId)
      .gte('comment_date', `${from}T00:00:00.000Z`).lt('comment_date', `${to}T00:00:00.000Z`).order('id'),
  )
  return counted(pages, rows)
}
