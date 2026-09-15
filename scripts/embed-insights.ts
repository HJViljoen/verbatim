import { createAdminClient } from '../lib/supabase-admin'
import { embedNullInsights, embedSummary } from '../lib/pipeline/embed-insights'
import { EMBEDDING_MODEL } from '../lib/config'

// Backfill audience_insights.embedding for one tenant. DRY BY DEFAULT — pass
// --apply to write.
//
//   node --env-file=.env.local --import tsx scripts/embed-insights.ts --client <uuid>
//   node --env-file=.env.local --import tsx scripts/embed-insights.ts --client <uuid> --apply
//
// WHAT THIS IS FOR NOW. The pipeline embeds its own insights from 2026-09-15
// (the `embed-insights` step, added the same day), so this script is no longer
// what keeps the index current — it is the one-off that drains the backlog
// those earlier runs left behind: 3,536 rows across the two tenants, created
// before the step existed and never re-read, because decideAnalysis does not
// re-select a video whose analysis is already current.
//
// After that it stays useful for one thing: catching a tenant up when its step
// failed for a run or two, without waiting for the next Sunday.
//
// Everything below the argument parsing is lib/pipeline/embed-insights.ts, the
// same module the pipeline step runs. Deliberately: the old version of this
// file was its own loop with its own write (one PostgREST UPDATE per row —
// 1,351 of them took minutes on Össur), and two copies of a write is how the
// two end up with different shapes and only one of them logging what it spent.

interface Args { clientId: string; apply: boolean; limit: number }

function parseArgs(argv: string[]): Args {
  const args: { clientId: string | null; apply: boolean; limit: number } = { clientId: null, apply: false, limit: 0 }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client') args.clientId = argv[++i]
    else if (argv[i] === '--apply') args.apply = true
    else if (argv[i] === '--limit') args.limit = Number(argv[++i])
    else if (argv[i] === '--force') {
      // --force used to re-embed rows that already carried a vector. The bulk
      // write cannot do that, and should not: set_insight_embeddings only
      // touches rows whose embedding is null, and that is exactly what makes
      // this script and the pipeline step safe to run twice. Re-embedding is
      // only ever needed after EMBEDDING_MODEL or embedInput changes, and then
      // a half-rebuilt corpus is worse than no rebuild — vectors built from
      // different text are not comparable and nothing reports the mismatch.
      // Clearing the old vectors is that decision, made deliberately, on its own.
      throw new Error(
        '--force is gone. The bulk write never overwrites a vector, which is what makes this safe to re-run. ' +
        'Re-embedding after a model or embed-text change means clearing the existing vectors first, on purpose, as its own step.',
      )
    } else throw new Error(`unknown flag: ${argv[i]}`)
  }
  if (!args.clientId) throw new Error('--client <uuid> is required')
  if (!Number.isFinite(args.limit) || args.limit < 0) throw new Error('--limit must be a non-negative integer')
  return { ...args, clientId: args.clientId }
}

async function main() {
  const { clientId, apply, limit } = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()

  // Price it first, whatever was asked for. The estimate is printed BEFORE any
  // spend so a dry run is a real decision point and not a formality — and the
  // dry pass also asks whether the write path exists, because "here is what it
  // would cost" is worth nothing next to "and it would fail".
  const plan = await embedNullInsights(admin, { clientId, runId: null, limit, dryRun: true })

  // The migration first, and on its own: a `missing a vector: 0` printed above
  // it reads as "nothing to do" when what happened is "nothing was looked at".
  if (plan.skipped === 'migration') {
    console.error('Apply supabase/migrations/20260915094000_insight_embedding.sql first — nothing was read and nothing was spent.')
    process.exit(1)
  }

  console.log(`model:            ${EMBEDDING_MODEL}`)
  console.log(`missing a vector: ${plan.candidates}`)
  console.log(embedSummary(plan))

  if (plan.attempted === 0) return
  if (!apply) {
    console.log('\n(dry run — nothing sent, nothing written. Re-run with --apply.)')
    return
  }

  const r = await embedNullInsights(admin, { clientId, runId: null, limit })
  console.log(`\n${embedSummary(r)}`)
  console.log('verify: select count(*) from audience_insights where embedding is null;')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
