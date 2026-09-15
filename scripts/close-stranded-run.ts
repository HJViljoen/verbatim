import { createAdminClient } from '../lib/supabase-admin'
import { RUN_STUCK_MS } from '../lib/ops/health'
import { closingMessage } from '../lib/pipeline/run-bookkeeping'

// Close a run that is never going to close itself (Phase 0 WP9, decision D5).
//
//   node --env-file=.env.local --import tsx scripts/close-stranded-run.ts \
//     --run <uuid> [--apply]
//
// Why a script exists for one UPDATE: nothing in the product can do it. A run
// at 'running' is reclaimed opportunistically the next time the same client
// opens a run (decideOpenRun, RUN_STALE_AFTER_HOURS), and onFailure closes the
// client's running rows when the Inngest function itself gives up — but neither
// knows the status 'analyzing', which is what the standalone Pass A script
// parks a run at and never returns to. Össur's 06706296 has sat there since
// 2026-06-13; the health check's 14-day lookback is the only reason it is not
// an alert every morning forever. It blocks nothing (the single-flight unique
// index is 'running'-only) and it will outlive everything unless someone closes
// it by hand.
//
// It is closed 'failed', not 'completed': the run genuinely never finished. The
// message says who closed it and when, and what it was doing — a row nobody can
// explain later is how the ten April rows all came to share one completed_at.
//
// Dry by default. --apply writes one UPDATE to one row and nothing else.

const APPLY_FLAG = '--apply'

/** Statuses this script will close. Both mean "still going" to the health
 *  check; only these can be stranded. */
const OPEN_STATUSES = new Set(['running', 'analyzing'])

/** Run-keyed tables worth naming before closing a run: whatever it did produce
 *  stays exactly where it is, and the operator should see it first. */
const ATTACHED_TABLES = [
  'videos',
  'themes',
  'theme_observations',
  'audience_insights',
  'language_samples',
  'market_insights',
  'competitive_insights',
  'recommendations',
  'run_summary',
  'run_costs',
] as const

interface Args { runId: string | null; apply: boolean }

function parseArgs(argv: string[]): Args {
  const a: Args = { runId: null, apply: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--run') a.runId = argv[++i]
    else if (flag === APPLY_FLAG) a.apply = true
    else throw new Error(`unknown flag: ${flag}`)
  }
  return a
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.runId) {
    console.error('--run <uuid> is required: this script closes one named run and has no default.')
    process.exit(1)
  }
  const admin = createAdminClient()
  const now = new Date()

  const { data: run, error } = await admin
    .from('pipeline_runs')
    .select('id, client_id, status, started_at, completed_at, error_message, videos_scraped')
    .eq('id', args.runId)
    .maybeSingle()
  if (error) throw new Error(`read run: ${error.message}`)
  if (!run) throw new Error(`no pipeline_runs row ${args.runId}`)

  const { data: client } = await admin.from('clients').select('company_name').eq('id', run.client_id).maybeSingle()
  const startedAt = run.started_at as string
  const ageMs = now.getTime() - Date.parse(startedAt)
  const ageDays = (ageMs / 86_400_000).toFixed(1)

  console.log(`${client?.company_name ?? run.client_id} — run ${run.id} ${args.apply ? 'APPLY' : 'dry run'}\n`)
  console.log(`  status        ${run.status}`)
  console.log(`  started       ${startedAt} (${ageDays} days ago)`)
  console.log(`  completed     ${run.completed_at ?? '—'}`)
  console.log(`  error_message ${run.error_message ?? '—'}`)

  // Refusals, both of them about not closing a run that is alive. A live run
  // stamped 'failed' loses its own onFailure handling and its client's next
  // run opens against a row that says it is finished.
  if (!OPEN_STATUSES.has(run.status as string)) {
    console.log(`\nNothing to do: this run is already '${run.status}'.`)
    return
  }
  if (ageMs <= RUN_STUCK_MS) {
    console.error(`\nRefusing: this run opened ${Math.round(ageMs / 60_000)} min ago, inside the ${RUN_STUCK_MS / 3600_000} h the health check gives a run before calling it stuck. It may still be working.`)
    process.exit(1)
  }

  const counts = await Promise.all(ATTACHED_TABLES.map(async (table) => {
    const { count, error: countErr } = await admin.from(table).select('run_id', { count: 'exact', head: true }).eq('run_id', run.id)
    if (countErr) throw new Error(`counting ${table}: ${countErr.message}`)
    return [table, count ?? 0] as const
  }))
  const attached = counts.filter(([, n]) => n > 0)
  console.log('\n  what is attached to it')
  console.log(`    ${attached.length ? attached.map(([t, n]) => `${t}=${n}`).join(' · ') : 'nothing'}`)
  console.log('    these rows are NOT touched. Every page anchors on the latest completed or')
  console.log('    partial run, so nothing reads them today and nothing will after this.')

  const message = closingMessage(run.status as string, startedAt, now)
  console.log('\n  the write')
  console.log(`    status         ${run.status}  →  failed`)
  console.log(`    completed_at   ${run.completed_at ?? '—'}  →  ${now.toISOString()}`)
  console.log(`    error_message  ${run.error_message ?? '—'}  →  ${message}`)

  if (!args.apply) {
    console.log(`\n(dry run — nothing written. Re-run with ${APPLY_FLAG}.)`)
    return
  }

  // Guarded on the status it was read at: if anything reopened or closed this
  // row between the read and here, the UPDATE matches nothing and says so
  // rather than overwriting a live run.
  const { data: updated, error: writeErr } = await admin
    .from('pipeline_runs')
    .update({ status: 'failed', completed_at: now.toISOString(), error_message: message })
    .eq('id', run.id)
    .eq('status', run.status)
    .select('id')
  if (writeErr) throw new Error(`close run: ${writeErr.message}`)
  if (!updated?.length) throw new Error(`run ${run.id} is no longer '${run.status}' — nothing written; read it again`)
  console.log('\nclosed.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
