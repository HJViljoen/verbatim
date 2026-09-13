import { createAdminClient, selectAll } from '../lib/supabase-admin'
import { discoverRunKeywords } from '../lib/pipeline/keyword-discovery'

// Backfill / repair keyword_candidates for runs that predate the
// keyword-discovery pipeline step (2026-09-13), or whose step failed (it is
// logged-and-swallowed by design, so a run can finish clean without rows).
//
// Pure aggregation: reads videos + audience_insights + tracking_configs, writes
// only keyword_candidates, and ONLY with --apply. No model call, no Apify.
//
// HONESTY CAVEAT: gather restamps videos.run_id to the newest run on every
// upsert, so an OLD run's videos have mostly been restamped away and it will
// discover little or nothing. The newest run is the exact one.
//
//   node --env-file=.env.local --import tsx scripts/backfill-keyword-candidates.ts --client <uuid> [--run <uuid>] [--apply]

const TOP = 30

function parseArgs(argv: string[]): { clientId: string; runId: string | null; apply: boolean } {
  const args = { clientId: null as string | null, runId: null as string | null, apply: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client') args.clientId = argv[++i]
    else if (argv[i] === '--run') args.runId = argv[++i]
    else if (argv[i] === '--apply') args.apply = true
    else throw new Error(`unknown flag: ${argv[i]}`)
  }
  if (!args.clientId) throw new Error('--client <uuid> is required')
  return { ...args, clientId: args.clientId }
}

async function main() {
  const { clientId, runId, apply } = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()

  let runIds: string[]
  if (runId) {
    runIds = [runId]
  } else {
    // Every finished run of this client that still owns videos. 'partial' counts:
    // a run is partial because some OTHER step noted an error, and discovery is
    // swallowed rather than noted — so a partial run is every bit as likely to be
    // missing its candidates, and is exactly what this script is for. Counted
    // head-only so a 1,200-video run costs one cheap request, not a page walk.
    const runs = await selectAll<{ id: string }>(() =>
      admin
        .from('pipeline_runs')
        .select('id')
        .eq('client_id', clientId)
        .in('status', ['completed', 'partial'])
        .order('started_at', { ascending: true })
        .order('id', { ascending: true }),
    )
    runIds = []
    for (const r of runs) {
      const { count, error } = await admin
        .from('videos')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('run_id', r.id)
      if (error) throw new Error(`video count for run ${r.id}: ${error.message}`)
      if ((count ?? 0) > 0) runIds.push(r.id)
    }
  }

  if (runIds.length === 0) {
    console.log(`client ${clientId}: no completed or partial run with videos — nothing to discover`)
    return
  }
  console.log(
    `${apply ? 'APPLY' : 'DRY RUN'} · client ${clientId} · ${runIds.length} run${runIds.length === 1 ? '' : 's'}\n`,
  )

  const summary: Record<string, unknown>[] = []
  for (const id of runIds) {
    const r = await discoverRunKeywords(admin, clientId, id, { persist: apply })
    summary.push({
      run: id.slice(0, 8),
      videos: r.videos,
      candidates: r.candidates.length,
      topics: r.topics,
      hashtags: r.hashtags,
    })

    if (!apply && r.candidates.length) {
      console.log(`run ${id.slice(0, 8)} — top ${Math.min(TOP, r.candidates.length)} of ${r.candidates.length}:`)
      console.table(
        r.candidates.slice(0, TOP).map((c) => {
          const top = Object.entries(c.found_by).sort((a, b) => b[1] - a[1])[0]
          return {
            term: c.term,
            kind: c.kind,
            videos: c.videos,
            comments: c.comments,
            insights: c.insights,
            platforms: c.platforms.join(','),
            'found by': top ? `${top[0]} (${top[1]})` : '—',
            'client/comp/owned': `${c.client_videos}/${c.competitor_videos}/${c.owned_videos}`,
          }
        }),
      )
    }
  }

  console.table(summary)
  console.log(
    apply
      ? 'written — scripts/keyword-candidates.ts now reads these rows'
      : 'dry run — nothing written; re-run with --apply to persist',
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
