import { createAdminClient, selectAll } from '../lib/supabase-admin'

// Operator read of keyword CANDIDATES — the add side of the keyword config,
// where scripts/keyword-roi.ts is the drop side. Rows are written per run by the
// pipeline's keyword-discovery step (topics + hashtags on that run's gate-kept
// videos, minus everything already tracked), so this pools across the last N
// runs the way keyword-roi.ts pools: a term that shows up run after run is a
// pattern, a term that showed up once is a coincidence.
//
// Read-only. Run with env loaded:
//   node --env-file=.env.local --import tsx scripts/keyword-candidates.ts --client <uuid> [--runs 8] [--kind topic|hashtag] [--limit 40]

interface CandidateRow {
  run_id: string
  term: string
  kind: string
  videos: number
  comments: number
  insights: number
  platforms: string[] | null
  found_by: Record<string, number> | null
  owned_videos: number
  client_videos: number
  competitor_videos: number
}

interface RunRow {
  id: string
  started_at: string | null
}

function parseArgs(argv: string[]): { clientId: string; runs: number; kind: string | null; limit: number } {
  const args = { clientId: null as string | null, runs: 8, kind: null as string | null, limit: 40 }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client') args.clientId = argv[++i]
    else if (argv[i] === '--runs') args.runs = Number(argv[++i])
    else if (argv[i] === '--kind') args.kind = argv[++i]
    else if (argv[i] === '--limit') args.limit = Number(argv[++i])
    else throw new Error(`unknown flag: ${argv[i]}`)
  }
  if (!args.clientId) throw new Error('--client <uuid> is required')
  if (!Number.isInteger(args.runs) || args.runs < 1) throw new Error('--runs must be a positive integer')
  if (!Number.isInteger(args.limit) || args.limit < 1) throw new Error('--limit must be a positive integer')
  if (args.kind && args.kind !== 'topic' && args.kind !== 'hashtag') throw new Error("--kind must be 'topic' or 'hashtag'")
  return { ...args, clientId: args.clientId }
}

async function main() {
  const { clientId, runs, kind, limit } = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()

  // Pick the runs FIRST, by when they ran, then read only their rows. Ordering
  // candidate rows by their own created_at (the previous shape) meant a
  // --apply backfill of an old run put that run at the top of "recent", and
  // reading every row the client has ever had to filter N runs out of it grows
  // by ~200 rows a run, forever.
  const { data: runData, error: runError } = await admin
    .from('pipeline_runs')
    .select('id, started_at')
    .eq('client_id', clientId)
    .in('status', ['completed', 'partial'])
    .order('started_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(runs)
  if (runError) throw new Error(`pipeline_runs: ${runError.message}`)
  const recent = (runData ?? []) as RunRow[]
  if (recent.length === 0) {
    console.log(`client ${clientId}: no completed or partial run — nothing to read`)
    return
  }

  const rows = await selectAll<CandidateRow>(() =>
    admin
      .from('keyword_candidates')
      .select('run_id, term, kind, videos, comments, insights, platforms, found_by, owned_videos, client_videos, competitor_videos')
      .eq('client_id', clientId)
      .in('run_id', recent.map((r) => r.id))
      .order('run_id', { ascending: true })
      .order('id', { ascending: true }),
  )
  if (rows.length === 0) {
    console.log(
      `client ${clientId}: no keyword_candidates rows in the last ${recent.length} run(s) — run the pipeline, or scripts/backfill-keyword-candidates.ts --apply`,
    )
    return
  }

  const pooled = kind ? rows.filter((r) => r.kind === kind) : rows
  if (pooled.length === 0) {
    console.log(`client ${clientId}: no ${kind} candidates in the last ${recent.length} run(s)`)
    return
  }

  interface Agg {
    term: string
    kind: string
    runs: Set<string>
    videos: number
    comments: number
    insights: number
    platforms: Set<string>
    foundBy: Map<string, number>
    client: number
    competitor: number
    owned: number
  }
  const agg = new Map<string, Agg>()
  for (const r of pooled) {
    const key = `${r.kind}::${r.term}`
    let a = agg.get(key)
    if (!a) {
      a = { term: r.term, kind: r.kind, runs: new Set(), videos: 0, comments: 0, insights: 0, platforms: new Set(), foundBy: new Map(), client: 0, competitor: 0, owned: 0 }
      agg.set(key, a)
    }
    a.runs.add(r.run_id)
    a.videos += r.videos
    a.comments += r.comments
    a.insights += r.insights
    for (const p of r.platforms ?? []) a.platforms.add(p)
    for (const [k, n] of Object.entries(r.found_by ?? {})) a.foundBy.set(k, (a.foundBy.get(k) ?? 0) + n)
    a.client += r.client_videos
    a.competitor += r.competitor_videos
    a.owned += r.owned_videos
  }

  // Dated by when the runs RAN, not when their rows were written — a backfilled
  // run still reports its own date.
  const withRows = new Set(pooled.map((r) => r.run_id))
  const dates = recent
    .filter((r) => withRows.has(r.id))
    .map((r) => (r.started_at ?? '').slice(0, 10))
    .filter(Boolean)
    .sort()
  console.log(
    `client ${clientId} · ${withRows.size} run${withRows.size === 1 ? '' : 's'} pooled (${dates[0] ?? '?'} → ${dates[dates.length - 1] ?? '?'})` +
      `${kind ? ` · kind=${kind}` : ''} · ${agg.size} distinct term${agg.size === 1 ? '' : 's'}\n`,
  )

  // Recurrence first: a term seen in more runs is a steadier signal than a term
  // that spiked once, however big the spike.
  const table = [...agg.values()]
    .sort((a, b) => b.runs.size - a.runs.size || b.videos - a.videos || b.comments - a.comments || a.term.localeCompare(b.term))
    .slice(0, limit)
    .map((a) => {
      const top = [...a.foundBy.entries()].sort((x, y) => y[1] - x[1])[0]
      return {
        term: a.term,
        kind: a.kind,
        'runs seen': a.runs.size,
        videos: a.videos,
        comments: a.comments,
        insights: a.insights,
        platforms: [...a.platforms].sort().join(','),
        'top found-by': top ? `${top[0]} (${top[1]})` : '—',
        'client/comp/owned': `${a.client}/${a.competitor}/${a.owned}`,
      }
    })

  console.table(table)
  console.log('sorted by runs seen, then videos · counts are SUMS over the pooled runs, so a term in 3 runs carries 3 runs of videos')
  console.log("top found-by = the configured search that carried most of these videos in; '—' means nothing found them (owned corpus)\n")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
