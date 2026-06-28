import { randomUUID } from 'crypto'
import { createAdminClient } from '../lib/supabase-admin'
import { runGather, type PlatformResult } from '../lib/gather/gather'
import type { Platform } from '../lib/gather/types'

// CLI runner for gather. Run with env loaded:
//   node --env-file=.env.local --import tsx scripts/run-gather.ts [flags]
//
// Needs APIFY_TOKEN set and the APIFY_*_ACTOR slugs confirmed (lib/config.ts).
//
// Flags:
//   --client <uuid>      client_id (default: Ossur)
//   --platform <name>    restrict to one platform (repeatable; default: client config)
//   --run <uuid>         reuse an existing run id (idempotent re-gather)
//   --max-videos <n>     override tracking_configs.max_videos
//   --video-limit <n>    cap videos comment-scraped per platform (cost control)
//   --dry-run            run Apify + normalise, write nothing, no run row

const OSSUR = 'e52cac94-30e1-426a-9a36-31b11e0b30b6'

interface Args {
  clientId: string
  platforms?: Platform[]
  runId?: string
  maxVideos?: number
  videoLimit?: number
  dryRun: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { clientId: OSSUR, dryRun: false }
  const platforms: Platform[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--client') args.clientId = next()
    else if (a === '--platform') platforms.push(next() as Platform)
    else if (a === '--run') args.runId = next()
    else if (a === '--max-videos') args.maxVideos = Number(next())
    else if (a === '--video-limit') args.videoLimit = Number(next())
    else if (a === '--dry-run') args.dryRun = true
    else throw new Error(`unknown flag: ${a}`)
  }
  if (platforms.length) args.platforms = platforms
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()
  const runId = args.runId ?? randomUUID()

  // Create the run row unless reusing one or dry-running (the Inngest orchestrator
  // will own this lifecycle later; the CLI owns it for now).
  if (!args.runId && !args.dryRun) {
    const { error } = await admin
      .from('pipeline_runs')
      .insert({ id: runId, client_id: args.clientId, status: 'running' })
    if (error) throw new Error(`create pipeline_run: ${error.message}`)
  }

  console.log(
    `Gather — client=${args.clientId} platforms=${args.platforms?.join(',') ?? 'config'} ` +
      `run=${runId} dryRun=${args.dryRun}`,
  )

  const results = await runGather({
    clientId: args.clientId,
    runId,
    platforms: args.platforms,
    maxVideos: args.maxVideos,
    videoLimit: args.videoLimit,
    dryRun: args.dryRun,
  })

  console.log('\n=== SUMMARY ===')
  let totalVideos = 0
  let totalComments = 0
  let totalErrors = 0
  for (const r of results as PlatformResult[]) {
    console.log(`${r.platform.padEnd(10)} ${r.videos} videos · ${r.comments} comments · ${r.errors.length} errors`)
    for (const e of r.errors) console.log(`   ! ${e}`)
    totalVideos += r.videos
    totalComments += r.comments
    totalErrors += r.errors.length
  }
  console.log(`TOTAL      ${totalVideos} videos · ${totalComments} comments · ${totalErrors} errors`)

  if (!args.runId && !args.dryRun) {
    await admin
      .from('pipeline_runs')
      .update({
        status: totalVideos === 0 ? 'failed' : totalErrors > 0 ? 'partial' : 'completed',
        videos_scraped: totalVideos,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId)
  }
}

main().catch((e) => {
  console.error('Gather failed:', e)
  process.exit(1)
})
