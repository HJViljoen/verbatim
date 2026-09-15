import { createAdminClient } from '../lib/supabase-admin'
import { recordConfigChange, scriptActor } from '../lib/config-log'
import { sendsWeekly } from '../lib/schedules/artefact'
import { WEEKLY_BLOCK_KEYS } from '../lib/reports/weekly'
import { migration, parseArgs, validate, describes } from '../lib/schedules/migrate-keys'
import type { ScheduleRow } from '../lib/schedules/types'

// Move a live schedule onto the weekly report's block keys (Phase 1 WP17).
//
// WHY THIS IS A MIGRATION AND NOT A RENAME. A schedule's `starter_key` and a
// report's stored section keys are CONTRACTS: Össur's one active schedule sends
// a `report_id` report whose three sections name `dashboard.*` tiles, one sent
// snapshot and one live share link name the same keys, and the old Dashboard's
// module is still registered precisely so those keep rendering (WP11 deviation
// 1). Renaming a key in code would silently drop eight of ten tiles from a live
// weekly email — which is exactly the failure refute-06 found. So the change is
// made ROW BY ROW, by an operator, with the before and after printed, and the
// old report is left standing so yesterday's artefacts still render.
//
// WHAT IT WRITES, at most three fields on `report_schedules`:
//   starter_key  →  'weekly_report'   (what the send path branches on today)
//   report_id    →  null              (a weekly artefact resolves no template)
//   artefact     →  'weekly'          (only where M8 has been applied)
// and a `config_changes` row, because who receives what is a configuration
// change and no trigger watches this table.
//
//   node --env-file=.env.local --import tsx scripts/migrate-schedule-keys.ts \
//     --client <uuid> [--schedule <uuid>] [--apply]
//
// DRY BY DEFAULT. Without --apply it prints what each schedule sends now, what
// it would send after, and what is left behind — and writes nothing.

async function artefactColumnExists(admin: ReturnType<typeof createAdminClient>): Promise<boolean> {
  const { error } = await admin.from('report_schedules').select('artefact').limit(1)
  return !error
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const errors = validate(args)
  if (errors.length) {
    console.error('Cannot migrate:')
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  const clientId = args.clientId as string
  const admin = createAdminClient()

  const [clientRes, schedulesRes, hasArtefact] = await Promise.all([
    admin.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    admin.from('report_schedules').select('*').eq('client_id', clientId).order('is_default', { ascending: false }).order('created_at'),
    artefactColumnExists(admin),
  ])
  // Checked, both: a dropped error here reads as "no schedule", which is the
  // sentence an operator uses to decide that nobody is being emailed.
  if (clientRes.error) throw new Error(`clients: ${clientRes.error.message}`)
  if (schedulesRes.error) throw new Error(`report_schedules: ${schedulesRes.error.message}`)
  const client = clientRes.data as { company_name: string } | null
  if (!client) throw new Error(`no client ${clientId}`)
  const all = (schedulesRes.data ?? []) as ScheduleRow[]
  const chosen = args.scheduleId ? all.filter((s) => s.id === args.scheduleId) : all
  if (args.scheduleId && chosen.length === 0) throw new Error(`no schedule ${args.scheduleId} on this workspace`)

  console.log(`${client.company_name} — schedule keys ${args.apply ? 'APPLY' : 'dry run'}`)
  console.log(`  report_schedules.artefact (M8): ${hasArtefact ? 'applied — the column is written too' : 'NOT applied — the starter key carries it for now'}\n`)

  // The sections a `report_id` schedule sends today, so the operator sees what
  // is being left behind rather than a uuid.
  const reportIds = chosen.map((s) => s.report_id).filter((r): r is string => Boolean(r))
  const sections = new Map<string, number>()
  if (reportIds.length > 0) {
    const { data } = await admin.from('reports').select('id, sections').in('id', reportIds)
    for (const r of (data ?? []) as { id: string; sections: unknown[] | null }[]) sections.set(r.id, (r.sections ?? []).length)
  }

  const todo: ScheduleRow[] = []
  for (const s of chosen) {
    const already = sendsWeekly(s)
    const line = `  ${s.name}${s.is_default ? ' (default)' : ''} · ${s.active ? 'active' : 'inactive'} · ${s.recipients.length} recipient(s)`
    console.log(line)
    console.log(`      now:   ${describes({ ...s, sections: s.report_id ? sections.get(s.report_id) : undefined })}`)
    if (already) {
      console.log('      after: unchanged — this schedule already sends the weekly report')
      continue
    }
    console.log(`      after: the weekly report, ${WEEKLY_BLOCK_KEYS.length} sections — ${WEEKLY_BLOCK_KEYS.join(', ')}`)
    if (s.report_id) {
      console.log(`      ! the stored report ${s.report_id.slice(0, 8)} is LEFT IN PLACE, so its sent snapshots and share links keep rendering`)
    }
    todo.push(s)
  }

  if (todo.length === 0) {
    console.log('\nNothing to change.')
    return
  }
  if (!args.apply) {
    console.log(`\n(dry run — nothing written. ${todo.length} schedule(s) would change. Re-run with --apply.)`)
    return
  }

  for (const s of todo) {
    const payload = migration(hasArtefact)
    const { error } = await admin.from('report_schedules').update(payload).eq('id', s.id).eq('client_id', clientId)
    if (error) throw new Error(`report_schedules ${s.id}: ${error.message}`)
    // WHO RECEIVES WHAT IS A CONFIGURATION CHANGE, and the trigger that watches
    // configuration watches `tracking_configs`, not this table — so the actor
    // is recorded here or nowhere (AGENTS.md: every configuration write carries
    // an actor).
    await recordConfigChange(admin, {
      clientId,
      surface: 'schedule',
      field: 'report_schedules.starter_key',
      before: { starter_key: s.starter_key, report_id: s.report_id, artefact: s.artefact ?? null },
      after: { starter_key: payload.starter_key, report_id: null, artefact: hasArtefact ? 'weekly' : null },
      actor: scriptActor(`scripts/migrate-schedule-keys.ts --client ${clientId} --apply`),
      note: `${s.name} now sends the weekly report`,
    })
    console.log(`  ✓ ${s.name}`)
  }
  console.log(`\n${todo.length} schedule(s) migrated. The next update sends the weekly report.`)
}

if (process.argv[1]?.includes('migrate-schedule-keys')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
