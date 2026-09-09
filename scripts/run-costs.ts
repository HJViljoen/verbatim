import { createAdminClient, selectAll } from '../lib/supabase-admin'

// Operator read of what runs cost. Read-only.
//
// The surface T3.3 asked for is "the run row in the operator view", and there
// isn't one: no page lists pipeline runs (the Studio page reads pipeline_runs
// only to decide whether a report can be sent), and cost is superadmin-only by
// RLS anyway. So the surface is here, next to keyword-roi.ts and subreddit-roi.ts.
//
//   node --env-file=.env.local --import tsx scripts/run-costs.ts [--client <uuid>] [--limit 20]
//   node --env-file=.env.local --import tsx scripts/run-costs.ts --run <uuid>
//
// Without --run: one line per run, newest first — apify + openai + transcribe
// with the attribution label. With --run: the same line plus the run's Apify
// spend broken down by the step that spent it.

function parseArgs(argv: string[]) {
  const args = { clientId: '', runId: '', limit: 20 }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client') args.clientId = argv[++i]
    else if (argv[i] === '--run') args.runId = argv[++i]
    else if (argv[i] === '--limit') args.limit = Number(argv[++i])
    else throw new Error(`unknown flag: ${argv[i]}`)
  }
  return args
}

interface RunRow {
  id: string
  client_id: string
  status: string
  started_at: string
}

interface CostRow {
  run_id: string
  openai_usd: number | string | null
  transcribe_usd: number | string | null
  apify_usd: number | string | null
  apify_attribution: string | null
}

const usd = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v))
const money = (v: number | null) => (v === null ? 'n/a' : `$${v.toFixed(4)}`).padStart(10)

async function main() {
  const { clientId, runId, limit } = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()

  let q = admin.from('pipeline_runs')
    .select('id, client_id, status, started_at')
    .order('started_at', { ascending: false })
    .limit(runId ? 1 : limit)
  if (clientId) q = q.eq('client_id', clientId)
  if (runId) q = q.eq('id', runId)
  const { data: runData, error } = await q
  if (error) throw new Error(error.message)
  const runs = (runData ?? []) as RunRow[]
  if (!runs.length) { console.log('no runs'); return }

  const { data: costData } = await admin
    .from('run_costs')
    .select('run_id, openai_usd, transcribe_usd, apify_usd, apify_attribution')
    .in('run_id', runs.map((r) => r.id))
  const costs = new Map((((costData ?? []) as CostRow[])).map((c) => [c.run_id, c]))

  const { data: nameData } = await admin
    .from('clients').select('id, company_name').in('id', [...new Set(runs.map((r) => r.client_id))])
  const names = new Map(((nameData ?? []) as { id: string; company_name: string }[]).map((c) => [c.id, c.company_name]))

  console.log(
    'started'.padEnd(17) + 'client'.padEnd(16) + 'status'.padEnd(11) +
    'apify'.padStart(10) + 'openai'.padStart(10) + 'transcr'.padStart(10) + '  attribution',
  )
  let total = 0
  for (const r of runs) {
    const c = costs.get(r.id)
    const a = usd(c?.apify_usd), o = usd(c?.openai_usd), t = usd(c?.transcribe_usd)
    total += (a ?? 0) + (o ?? 0) + (t ?? 0)
    console.log(
      r.started_at.slice(0, 16).replace('T', ' ').padEnd(17) +
      (names.get(r.client_id) ?? r.client_id.slice(0, 8)).slice(0, 15).padEnd(16) +
      r.status.padEnd(11) +
      money(a) + money(o) + money(t) +
      `  ${c ? c.apify_attribution ?? '—' : 'no run_costs row'}`,
    )
    if (!runId) console.log(`  ${r.id}`)
  }
  console.log(`\ntotal across ${runs.length} run(s): $${total.toFixed(4)}`)

  if (!runId) return

  // Per-step Apify breakdown — the thing the window method could never give.
  const rows = await selectAll<{ step: string | null; actor_id: string; usage_usd: number | string | null; items: number | null; status: string | null; settled: boolean }>(
    () => admin.from('apify_runs')
      .select('step, actor_id, usage_usd, items, status, settled')
      .eq('run_id', runId).order('created_at', { ascending: true }),
  )
  if (!rows.length) {
    console.log('\nno apify_runs rows for this run (pre-Phase-3, or an analysis-only resume)')
    return
  }
  const byStep = new Map<string, { usd: number; calls: number; items: number; unsettled: number; failed: number }>()
  for (const row of rows) {
    const key = row.step ?? '(no step)'
    const agg = byStep.get(key) ?? { usd: 0, calls: 0, items: 0, unsettled: 0, failed: 0 }
    agg.usd += Number(row.usage_usd ?? 0)
    agg.calls++
    agg.items += row.items ?? 0
    if (!row.settled) agg.unsettled++
    if (row.status && row.status !== 'SUCCEEDED') agg.failed++
    byStep.set(key, agg)
  }
  console.log(`\napify by step (${rows.length} actor runs)`)
  for (const [step, a] of [...byStep].sort((x, y) => y[1].usd - x[1].usd)) {
    console.log(
      `${`$${a.usd.toFixed(4)}`.padStart(9)}  ${String(a.calls).padStart(4)} run(s)  ${String(a.items).padStart(6)} items  ` +
      `${a.unsettled ? `${a.unsettled} unsettled  ` : ''}${a.failed ? `${a.failed} not-succeeded  ` : ''}${step}`,
    )
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
