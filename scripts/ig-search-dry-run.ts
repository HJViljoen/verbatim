import { randomUUID } from 'crypto'
import { DRY_RUN_USAGE, formatDryRun, parseDryRunArgs, type DryRunSearch } from '../lib/gather/providers/dry-run'
import type { ProviderCallRow } from '../lib/gather/providers/ledger'

// Instagram search dry run (28 Nov 2026): every planned Instagram search for
// one client, through the pipeline's own router and adapter (routedSearch:
// TikHub's hashtag feed first, the Apify actor last), printed per keyword and
// variant with the source used, TikHub's calls, items seen, in-window videos,
// cost and notes, then totals and sample captions.
//
//   node --env-file=.env.local --import tsx scripts/ig-search-dry-run.ts --client <uuid> [--since YYYY-MM-DD]
//
// WRITES NOTHING: no run row, and no run context, so neither apify_runs nor
// provider_calls gets a row (the ledger's tap hands this script each feed's
// row instead); the budget read is skipped. It READS the client's
// tracking_configs, and it SPENDS: TikHub per page, Apify when a search falls
// back. `--help` for the flags. Never prints a key: only which route is set.

async function main() {
  const { OSSUR_CLIENT_ID } = await import('../lib/config')
  const args = parseDryRunArgs(process.argv.slice(2), { clientId: OSSUR_CLIENT_ID })
  if (args.help) {
    console.log(DRY_RUN_USAGE)
    return
  }
  if (args.providers) process.env.GATHER_INSTAGRAM_SEARCH_PROVIDERS = args.providers

  // Loaded after the flags: these pull in the OpenAI and Supabase clients,
  // which need the env that `--help` does not.
  const { buildPlatformTasks, inWindow, loadGatherConfig, routedSearch } = await import('../lib/gather/gather')
  const { instagram } = await import('../lib/gather/platforms/instagram')
  const { runActor } = await import('../lib/gather/apify')
  const { providerOrder } = await import('../lib/gather/providers/router')
  const { providerTransport } = await import('../lib/gather/providers/transport')
  const { tapProviderCalls } = await import('../lib/gather/providers/ledger')
  const { cleanHashtag, dedupeBy } = await import('../lib/gather/util')
  const { periodSince } = await import('../lib/config')

  const config = await loadGatherConfig(args.clientId)
  if (args.maxVideos) config.max_videos = args.maxVideos
  if (args.period) config.report_period = args.period
  if (args.since) config.window = { start: `${args.since}T00:00:00.000Z`, end: new Date().toISOString(), basis: 'anchored' }
  const since = config.window?.start?.slice(0, 10) ?? periodSince(config.report_period)

  const tasks = buildPlatformTasks(config, 'instagram')
    .filter((t) => !args.keywords.length || args.keywords.includes(t.keyword))
  console.log(
    `Instagram search dry run · client ${args.clientId} · ${tasks.length} searches · limit ${config.max_videos} · ` +
      `order ${providerOrder('instagram.search').join(' → ')} · TikHub via ${providerTransport('tikhub') ?? 'nothing (not set up)'}`,
  )
  if (!config.platforms.includes('instagram')) console.log('note: Instagram is not among this client’s configured platforms; searching anyway.')

  // Each feed's ledger row, by its target ('tag:feed'), for the report.
  const rows = new Map<string, ProviderCallRow[]>()
  tapProviderCalls((row) => {
    const key = row.target ?? ''
    rows.set(key, [...(rows.get(key) ?? []), row])
  })

  const runId = randomUUID()
  const ctx = { clientId: args.clientId, runId, config }
  const results: DryRunSearch[] = new Array(tasks.length)
  let next = 0
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++
      const task = tasks[i]
      const variant = task.variant ?? 'reels'
      const target = `${cleanHashtag(task.keyword)}:${variant === 'posts' ? 'recent' : 'reels'}`
      const base = { keyword: task.keyword, variant, calls: 0, seen: null, found: 0, inWindow: 0, costUsd: 0, notes: [], videos: [] }
      try {
        const r = await routedSearch(
          { key: 'instagram.search', adapter: instagram, config, keyword: task.keyword, variant: task.variant, community: task.community, runId, startedAt: Date.now() },
          { runActor, spendSoFar: async () => 0, now: Date.now },
        )
        const videos = dedupeBy(r.raw.map((raw) => instagram.normaliseVideo(raw, ctx)).filter((v) => v !== null), (v) => v.video_id)
        const kept = videos.filter((v) => inWindow(v.upload_date, since))
        const feed = rows.get(target) ?? []
        results[i] = {
          ...base,
          provider: r.provider,
          calls: feed.reduce((n, f) => n + f.calls, 0),
          seen: feed.length ? feed.reduce((n, f) => n + f.items_seen, 0) : null,
          found: videos.length,
          inWindow: kept.length,
          costUsd: feed.reduce((n, f) => n + f.cost_usd, 0),
          notes: r.notes,
          videos: kept.map((v) => ({ id: v.video_id, caption: v.caption })),
        }
      } catch (e) {
        const feed = rows.get(target) ?? []
        results[i] = { ...base, provider: null, error: e instanceof Error ? e.message.slice(0, 200) : String(e), calls: feed.reduce((n, f) => n + f.calls, 0), costUsd: feed.reduce((n, f) => n + f.cost_usd, 0) }
      }
      const r = results[i]
      console.log(`  done ${i + 1}/${tasks.length}: ${task.keyword} [${variant}] via ${r.provider ?? 'nothing'}, ${r.inWindow} in window`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(args.parallel, tasks.length) }, worker))
  tapProviderCalls(null)

  console.log('')
  console.log(formatDryRun(results, { since, samples: args.samples }))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
