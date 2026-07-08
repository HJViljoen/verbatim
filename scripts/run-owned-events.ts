import { runStep2c } from '../lib/pipeline/owned-events'
import { createAdminClient } from '../lib/supabase-admin'

// Step 2c runner — detect + explain owned-account events for a run (or every
// completed run of a client, oldest first, with --all-runs). Detection is free
// (code only); the explanation is one SYNTHESIS_MODEL call per run WITH events,
// so re-running for prompt iteration costs cents, like run-recs.ts.
//   node --env-file=.env.local --import tsx scripts/run-owned-events.ts --client <id> --run <id>
//
// Flags:
//   --run <uuid>      run id to process
//   --all-runs        process every completed run for the client instead
//   --client <uuid>   client_id (default: the demo tenant)
//   --no-persist      detect + explain but don't store account_events

const DEMO_CLIENT_ID = 'de300055-0000-4000-8000-000000000001'

interface Args {
  clientId: string
  runId?: string
  allRuns: boolean
  persist: boolean
}

function parseArgs(argv: string[]): Args {
  const a: Args = { clientId: DEMO_CLIENT_ID, allRuns: false, persist: true }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--run') a.runId = argv[++i]
    else if (flag === '--all-runs') a.allRuns = true
    else if (flag === '--client') a.clientId = argv[++i]
    else if (flag === '--no-persist') a.persist = false
    else throw new Error(`unknown flag: ${flag}`)
  }
  if (!a.runId && !a.allRuns) throw new Error('--run <uuid> or --all-runs is required')
  return a
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  let runIds: string[]
  if (args.allRuns) {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('pipeline_runs').select('id')
      .eq('client_id', args.clientId).eq('status', 'completed')
      .order('completed_at', { ascending: true })
    if (error) throw new Error(`list runs: ${error.message}`)
    runIds = ((data ?? []) as { id: string }[]).map((r) => r.id)
  } else {
    runIds = [args.runId!]
  }

  let totalCost = 0
  for (const runId of runIds) {
    const res = await runStep2c({ clientId: args.clientId, runId, persist: args.persist })
    totalCost += res.costUsd
    console.log(`\n=== run ${runId} — ${res.events.length} event(s)${res.skippedReason ? ` (${res.skippedReason})` : ''} ===`)
    for (const e of res.events) {
      console.log(`  [sev ${e.severity}] ${e.magnitudeLabel}`)
      if (e.explained) {
        console.log(`    → ${e.explanation}`)
        if (e.supportingThemeLabels.length) console.log(`    themes: ${e.supportingThemeLabels.join(' · ')}`)
        if (e.heroQuote) console.log(`    quote: "${e.heroQuote}"`)
      } else {
        console.log('    → unexplained — the tracked conversation does not account for this')
      }
    }
  }
  console.log(`\n✓ done · ${runIds.length} run(s) · est. cost $${totalCost.toFixed(4)}`)
}

main().catch((e) => {
  console.error('\n✗ run-owned-events failed:', e instanceof Error ? e.message : e)
  process.exit(1)
})
