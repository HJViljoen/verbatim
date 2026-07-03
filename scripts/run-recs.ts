import { rerunPassDb } from '../lib/pipeline/pass-d'
import { createAdminClient } from '../lib/supabase-admin'

// D-b-only re-runner: regenerates a run's recommendations in place from its
// already-persisted market/competitive insights — recommendation prompt
// iteration without re-rolling the rest of the synthesis (run-cd.ts does the
// full back half). First use: purging embedded verbatim quotes (pass_d_b_v2).
//   node --env-file=.env.local --import tsx scripts/run-recs.ts --run <id> [flags]
//
// Flags:
//   --run <uuid>      run id whose recommendations to regenerate (required)
//   --client <uuid>   client_id (default: Ossur)
//   --no-persist      run the GPT call but don't replace the stored rows

const OSSUR = 'e52cac94-30e1-426a-9a36-31b11e0b30b6'

interface Args {
  clientId: string
  runId?: string
  persist: boolean
}

function parseArgs(argv: string[]): Args {
  const a: Args = { clientId: OSSUR, persist: true }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--run') a.runId = argv[++i]
    else if (flag === '--client') a.clientId = argv[++i]
    else if (flag === '--no-persist') a.persist = false
    else throw new Error(`unknown flag: ${flag}`)
  }
  if (!a.runId) throw new Error('--run <uuid> is required')
  return a
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  console.log(`D-b rerun — run=${args.runId} client=${args.clientId} persist=${args.persist}`)

  const d = await rerunPassDb({ clientId: args.clientId, runId: args.runId!, persist: args.persist })
  console.log(`\n=== PASS D-b — recommendations (${d.recommendations.length}) ===`)
  if (d.rejectedRefs) console.log(`  (rejected refs: ${d.rejectedRefs})`)

  // Full reasoning for the quality review — the point of a rerun is the prose.
  if (args.persist) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('recommendations')
      .select('type, priority, title, reasoning')
      .eq('client_id', args.clientId).eq('run_id', args.runId!)
    for (const r of data ?? []) console.log(`\n[${r.type} · ${r.priority}] ${r.title}\n  ${r.reasoning}`)
  } else {
    for (const r of d.recommendations) console.log(`  [${r.type} · ${r.priority}] ${r.title}`)
  }

  console.log(`\ncost: $${d.costUsd.toFixed(5)} (${d.promptTokens}+${d.completionTokens} tok)`)
}

main().catch((e) => {
  console.error('D-b rerun failed:', e)
  process.exit(1)
})
