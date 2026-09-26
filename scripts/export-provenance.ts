import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createAdminClient, selectAll } from '../lib/supabase-admin'
import { SEALAND_CLIENT_ID } from '../lib/config'

// Export the provenance evidence a project holds, to a local JSON file
// (market-first WP0.1; reused by WP2.8 for the production snapshot).
//
// WHY. `videos.source_keywords` is the union of keywords from the LAST
// in-window run that surfaced a video (lib/gather/gather.ts: the upsert writes
// it for fresh kept AND resurfaced videos), so every run that resurfaces a
// video overwrites how it was first found. The first-found evidence only
// survives outside the database. This file keeps it:
//
//   videos              id, platform, platform video_id, source_keywords, the
//                       three attribution columns, analyzed_lane, and
//                       first_seen = videos.scraped_at. scraped_at is the
//                       insert default and is never in the gather's upsert
//                       payload (VideoInsert), so it is the first-stored time.
//   videoMonths         per (video, UTC month): comments with comment_date in
//                       that month, joined on (client_id, platform, video_id)
//                       exactly as monthly_denominators joins. `video_id` here
//                       is videos.id (uuid), the key video_provenance uses.
//   gateVerdicts        every verdict row: run, platform id, first keyword of
//                       that run (source_keywords[0]), kept, source.
//   keywordPerformance  the exact term set of each gather.
//   runs                id, started_at, status, period.
//
// READ-ONLY, ALWAYS. There is no write path in this file: --apply and --write
// are refused, and --read-only is accepted only so a paste line can say so.
// It writes one local file and nothing else.
//
// WHICH PROJECT, FIRST. --project is required and must be one of the two
// allow-listed refs, chosen explicitly: staging `zfmxrrugaihxpubunleu` or
// production `mkwjlckescdveosvrvaq` (read-only; WP1.0 and WP2.8). It refuses,
// before any read, when NEXT_PUBLIC_SUPABASE_URL is not that project. It never
// prompts, so it works through `!`, which has no tty.
//
// --since <YYYY-MM-DD> narrows every section to rows at or after that instant
// (videos by first_seen, verdicts and keyword rows by created_at, runs by
// started_at; videoMonths follows the narrowed videos). Without it, everything
// the client holds is exported.
//
// THE READ RATION. Every page is a PostgREST read of at most 1,000 rows
// (selectAll). The full Sealand staging export at the 20 Sep state is about 50
// pages (5,256 videos, 5,130 verdicts, 455 keyword rows, 23 runs, and about
// 35,000 dated comments aggregated here into 2,244 video-months). The page
// count is printed so it can be counted against the ration. On production
// prefer --since, and check the PostgREST path as well as SQL first
// (AGENTS.md: the two can be down alone).
//
//   node --env-file=.env.local --import tsx scripts/export-provenance.ts \
//     --project <ref> [--client <uuid>] [--since YYYY-MM-DD] [--out <path>] [--read-only]

const ALLOWED_PROJECTS = {
  zfmxrrugaihxpubunleu: 'staging',
  mkwjlckescdveosvrvaq: 'production',
} as const
type ProjectRef = keyof typeof ALLOWED_PROJECTS

const PAGE = 1000
// chunkedIn's size in the gather: an `in.(...)` list longer than this risks the
// PostgREST URL cap.
const IN_CHUNK = 100

export interface ExportArgs {
  project: ProjectRef
  clientId: string
  since: string | null
  out: string
}

export interface ExportVideo {
  id: string
  platform: string
  video_id: string
  source_keywords: string[] | null
  is_client: boolean | null
  is_competitor: boolean | null
  competitor_name: string | null
  analyzed_lane: string | null
  first_seen: string
}
export interface ExportVideoMonth { video_id: string; month: string; dated_comments: number }
export interface ExportGateVerdict {
  run_id: string | null
  platform: string
  video_id: string
  keyword: string | null
  kept: boolean
  source: string
  created_at: string
}
export interface ExportKeywordPerformance { run_id: string | null; platform: string; keyword: string; bucket: string | null; created_at: string }
export interface ExportRun { id: string; started_at: string | null; status: string | null; period: string | null }

export interface ProvenanceExport {
  exportedAt: string
  project: ProjectRef
  clientId: string
  videos: ExportVideo[]
  videoMonths: ExportVideoMonth[]
  gateVerdicts: ExportGateVerdict[]
  keywordPerformance: ExportKeywordPerformance[]
  runs: ExportRun[]
}

/** The ref in a Supabase URL (`https://<ref>.supabase.co`), or null. */
export function projectRefOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    const host = new URL(url).hostname
    const m = host.match(/^([a-z0-9]{20})\.supabase\.(co|in)$/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

export function parseArgs(argv: string[], today = new Date()): ExportArgs {
  let project: string | null = null
  let clientId = SEALAND_CLIENT_ID
  let since: string | null = null
  let out: string | null = null
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--project') project = argv[++i] ?? null
    else if (a === '--client') clientId = argv[++i] ?? ''
    else if (a === '--since') since = argv[++i] ?? null
    else if (a === '--out') out = argv[++i] ?? null
    else if (a === '--read-only') continue
    else if (a === '--apply' || a === '--write') throw new Error(`${a} refused: this script is read-only and has no write path`)
    else throw new Error(`unknown argument ${a}`)
  }
  if (!project) throw new Error('--project <ref> is required: zfmxrrugaihxpubunleu (staging) or mkwjlckescdveosvrvaq (production, read-only)')
  if (!(project in ALLOWED_PROJECTS)) throw new Error(`--project ${project} is not allow-listed (${Object.keys(ALLOWED_PROJECTS).join(', ')})`)
  if (!/^[0-9a-f-]{36}$/.test(clientId)) throw new Error(`--client must be a uuid, got ${clientId || '(empty)'}`)
  if (since !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(since) || Number.isNaN(Date.parse(`${since}T00:00:00Z`)))) {
    throw new Error(`--since must be YYYY-MM-DD, got ${since}`)
  }
  const ref = project as ProjectRef
  const day = today.toISOString().slice(0, 10)
  const name = ALLOWED_PROJECTS[ref] === 'staging' ? `provenance-staging-${day}.json` : `snapshot-prod-${day}.json`
  return {
    project: ref,
    clientId,
    since,
    out: out ?? `${process.env.HOME}/.claude/plans/verbatim-market-first/data/${name}`,
  }
}

/** The UTC calendar month of a timestamp, as its first day ('2026-09-01'),
 *  matching date_trunc('month', comment_date at time zone 'UTC')::date. */
export function utcMonthOf(ts: string): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) throw new Error(`unparseable comment_date ${ts}`)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

/** Dated comments per (video uuid, UTC month). Comments whose (platform,
 *  video_id) has no exported video are dropped, as the SQL inner join drops
 *  them; undated comments are never passed in. */
export function buildVideoMonths(
  videos: Pick<ExportVideo, 'id' | 'platform' | 'video_id'>[],
  comments: { platform: string; video_id: string; comment_date: string }[],
): ExportVideoMonth[] {
  const uuidOf = new Map(videos.map((v) => [`${v.platform}\u0000${v.video_id}`, v.id]))
  const counts = new Map<string, number>()
  for (const c of comments) {
    const id = uuidOf.get(`${c.platform}\u0000${c.video_id}`)
    if (!id) continue
    const key = `${id}\u0000${utcMonthOf(c.comment_date)}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([key, n]) => {
      const [video_id, month] = key.split('\u0000')
      return { video_id, month, dated_comments: n }
    })
    .sort((a, b) => (a.video_id < b.video_id ? -1 : a.video_id > b.video_id ? 1 : a.month < b.month ? -1 : a.month > b.month ? 1 : 0))
}

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const host = projectRefOf(process.env.NEXT_PUBLIC_SUPABASE_URL)
  if (host !== args.project) {
    throw new Error(`REFUSED: the Supabase URL points at ${host ?? 'no Supabase project'}, not --project ${args.project}. Nothing read.`)
  }
  const admin = createAdminClient()
  const sinceTs = args.since ? `${args.since}T00:00:00Z` : null
  let pages = 0
  const counted = <T>(rows: T[]) => {
    pages += Math.max(1, Math.ceil(rows.length / PAGE))
    return rows
  }
  console.log(`export-provenance: ${ALLOWED_PROJECTS[args.project]} ${args.project}, client ${args.clientId}${args.since ? `, since ${args.since}` : ''} (read-only)`)

  const videos = counted(
    await selectAll<ExportVideo & { scraped_at?: string }>(() => {
      let q = admin
        .from('videos')
        .select('id, platform, video_id, source_keywords, is_client, is_competitor, competitor_name, analyzed_lane, first_seen:scraped_at')
        .eq('client_id', args.clientId)
      if (sinceTs) q = q.gte('scraped_at', sinceTs)
      return q.order('scraped_at').order('id')
    }, PAGE),
  )

  // Dated comments: the whole client when unnarrowed (fewest pages), else per
  // platform in chunks of the narrowed videos' platform ids.
  type DatedComment = { platform: string; video_id: string; comment_date: string }
  let comments: DatedComment[] = []
  if (!sinceTs) {
    comments = counted(
      await selectAll<DatedComment>(
        () =>
          admin
            .from('comments')
            .select('platform, video_id, comment_date')
            .eq('client_id', args.clientId)
            .not('comment_date', 'is', null)
            .order('id'),
        PAGE,
      ),
    )
  } else {
    const byPlatform = new Map<string, string[]>()
    for (const v of videos) byPlatform.set(v.platform, [...(byPlatform.get(v.platform) ?? []), v.video_id])
    for (const [platform, ids] of byPlatform) {
      for (const chunk of chunks(ids, IN_CHUNK)) {
        comments.push(
          ...counted(
            await selectAll<DatedComment>(
              () =>
                admin
                  .from('comments')
                  .select('platform, video_id, comment_date')
                  .eq('client_id', args.clientId)
                  .eq('platform', platform)
                  .in('video_id', chunk)
                  .not('comment_date', 'is', null)
                  .order('id'),
              PAGE,
            ),
          ),
        )
      }
    }
  }
  const videoMonths = buildVideoMonths(videos, comments)

  const gateVerdicts = counted(
    await selectAll<ExportGateVerdict>(() => {
      let q = admin
        .from('gate_verdicts')
        .select('run_id, platform, video_id, keyword, kept, source, created_at')
        .eq('client_id', args.clientId)
      if (sinceTs) q = q.gte('created_at', sinceTs)
      return q.order('created_at').order('id')
    }, PAGE),
  )

  const keywordPerformance = counted(
    await selectAll<ExportKeywordPerformance>(() => {
      let q = admin
        .from('keyword_performance')
        .select('run_id, platform, keyword, bucket, created_at')
        .eq('client_id', args.clientId)
      if (sinceTs) q = q.gte('created_at', sinceTs)
      return q.order('created_at').order('platform').order('keyword').order('id')
    }, PAGE),
  )

  const runs = counted(
    await selectAll<ExportRun>(() => {
      let q = admin.from('pipeline_runs').select('id, started_at, status, period').eq('client_id', args.clientId)
      if (sinceTs) q = q.gte('started_at', sinceTs)
      return q.order('started_at').order('id')
    }, PAGE),
  )

  const out: ProvenanceExport = {
    exportedAt: new Date().toISOString(),
    project: args.project,
    clientId: args.clientId,
    videos,
    videoMonths,
    gateVerdicts,
    keywordPerformance,
    runs,
  }
  mkdirSync(dirname(args.out), { recursive: true })
  writeFileSync(args.out, JSON.stringify(out, null, 1) + '\n')
  console.log(
    `wrote ${args.out}\n` +
      `  videos ${videos.length} · videoMonths ${videoMonths.length} (from ${comments.length} dated comments) · ` +
      `gateVerdicts ${gateVerdicts.length} · keywordPerformance ${keywordPerformance.length} · runs ${runs.length}\n` +
      `  reads: ${pages} pages`,
  )
}

if (process.argv[1]?.endsWith('export-provenance.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
