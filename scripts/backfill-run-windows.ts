import { createAdminClient, selectAll } from '../lib/supabase-admin'
import { periodWindowDays } from '../lib/config'

// Label the window every historical run covered — after the fact, and marked as
// such (Phase 0 WP1, 2026-09-15).
//
// Runs opened before the bookkeeping columns shipped carry no window. It cannot
// be recovered: the window was a reading of Date.now() inside a step that left
// no trace, and for the two multi-day runs there were two different readings.
// What CAN be said honestly is the rule those runs were following —
// [started_at − periodWindowDays(period), started_at] — so that is what this
// writes, under window_basis = 'reconstructed'. Nothing may read a
// reconstructed window as a record of what was gathered; it is a label saying
// "this is the window the code of the day would have used".
//
// The period is taken, in order of authority:
//   run_summary.period   the value the run itself stamped at synthesis
//   options.period       the trigger's override, when the run never synthesised
//   tracking_configs     today's cadence — the weakest, and marked as such
//
// Pure bookkeeping: reads pipeline_runs, run_summary and tracking_configs;
// writes only pipeline_runs' window columns, and ONLY with --apply. No model
// call, no Apify, no spend. Idempotent: rows that already carry a window_end
// are skipped, so a run that wrote its own window is never relabelled.
//
//   node --env-file=.env.local --import tsx scripts/backfill-run-windows.ts [--client <uuid>] [--apply]

type PeriodSource = 'run_summary' | 'options' | 'tracking_configs' | 'default'

interface RunRow {
  id: string
  client_id: string
  status: string
  started_at: string
  completed_at: string | null
  window_end: string | null
  period: string | null
  options: { period?: string } | null
}

function parseArgs(argv: string[]): { clientId: string | null; apply: boolean } {
  const args = { clientId: null as string | null, apply: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client') args.clientId = argv[++i]
    else if (argv[i] === '--apply') args.apply = true
    else throw new Error(`unknown flag: ${argv[i]}`)
  }
  return args
}

/** [start, end] for a run, from the rule its own code was following. */
function reconstructWindow(startedAt: string, period: string): { start: string; end: string } {
  const endMs = Date.parse(startedAt)
  return {
    start: new Date(endMs - periodWindowDays(period) * 86_400_000).toISOString(),
    end: new Date(endMs).toISOString(),
  }
}

async function main() {
  const { clientId, apply } = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()

  const runs = await selectAll<RunRow>(() => {
    const q = admin
      .from('pipeline_runs')
      .select('id, client_id, status, started_at, completed_at, window_end, period, options')
      .order('started_at', { ascending: true })
      .order('id', { ascending: true })
    return clientId ? q.eq('client_id', clientId) : q
  })

  const [{ data: clients }, { data: configs }, summaries] = await Promise.all([
    admin.from('clients').select('id, company_name'),
    admin.from('tracking_configs').select('client_id, report_period'),
    selectAll<{ run_id: string; period: string | null }>(() =>
      admin.from('run_summary').select('run_id, period').order('run_id', { ascending: true }),
    ),
  ])
  const nameOf = new Map((clients ?? []).map((c) => [c.id as string, c.company_name as string]))
  const cadenceOf = new Map((configs ?? []).map((c) => [c.client_id as string, c.report_period as string | null]))
  const summaryPeriod = new Map(summaries.map((s) => [s.run_id, s.period]))

  const todo = runs.filter((r) => !r.window_end)
  console.log(
    `${apply ? 'APPLY' : 'DRY RUN'} · ${runs.length} run${runs.length === 1 ? '' : 's'} read · ` +
    `${todo.length} without a window · ${runs.length - todo.length} already windowed (left alone)\n`,
  )
  if (todo.length === 0) return

  const rows: Record<string, unknown>[] = []
  const bySource: Record<PeriodSource, number> = {
    run_summary: 0, options: 0, tracking_configs: 0, default: 0,
  }

  for (const run of todo) {
    let period = summaryPeriod.get(run.id) ?? null
    let source: PeriodSource = 'run_summary'
    if (!period) { period = run.options?.period ?? null; source = 'options' }
    if (!period) { period = cadenceOf.get(run.client_id) ?? null; source = 'tracking_configs' }
    if (!period) { period = 'weekly'; source = 'default' }
    bySource[source]++

    const window = reconstructWindow(run.started_at, period)
    rows.push({
      run: run.id.slice(0, 8),
      client: nameOf.get(run.client_id) ?? run.client_id.slice(0, 8),
      status: run.status,
      started: run.started_at.slice(0, 16).replace('T', ' '),
      period,
      from: source,
      days: periodWindowDays(period),
      window_start: window.start.slice(0, 10),
      window_end: window.end.slice(0, 10),
    })

    if (apply) {
      const { error } = await admin
        .from('pipeline_runs')
        .update({
          period,
          window_start: window.start,
          window_end: window.end,
          window_basis: 'reconstructed',
        })
        .eq('id', run.id)
        // Belt and braces: a run that opened and wrote its own window while this
        // script was walking the list must not be relabelled 'reconstructed'.
        .is('window_end', null)
      if (error) throw new Error(`update run ${run.id}: ${error.message}`)
    }
  }

  console.table(rows)
  console.log(
    `\nperiod source: run_summary ${bySource.run_summary} · options ${bySource.options} · ` +
    `tracking_configs ${bySource.tracking_configs} · default 'weekly' ${bySource.default}`,
  )
  console.log(
    apply
      ? `\nwrote ${rows.length} reconstructed window${rows.length === 1 ? '' : 's'}.`
      : '\nDRY RUN — nothing written. Re-run with --apply to write these.',
  )
  if (!apply) return
  console.log(
    "A reconstructed window is a label, not a record: it says what the code of the day would have\n" +
    'used, not what the run gathered. Only a run that wrote its own window at open-run can say that.',
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
