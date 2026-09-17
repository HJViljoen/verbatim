import { createAdminClient } from '../lib/supabase-admin'
import { recordConfigChange, scriptActor } from '../lib/config-log'

// Pause or resume a workspace's report schedule (Phase 0 WP2, the operator half
// of the Studio's own toggle).
//
// `report_schedules.active` decides whether a finished update emails anybody:
// `scheduleDue` (lib/schedules/due.ts) drops an inactive schedule before
// anything renders or sends, and NOTHING else can put it back — an accepted
// invite only appends to `recipients` (lib/schedules/default.ts
// joinDefaultSchedule), it never touches this flag. So this is the one lever
// that holds whatever else happens to the list.
//
// There has been no operator path to it. The flag lives in the Studio, which
// needs a browser session inside the tenant, and the last change to it
// (2026-09-15, switching Sealand's digest ON) was a hand-typed UPDATE through
// the SQL editor with a config_changes row written beside it by hand. This is
// that, as a re-runnable command that cannot forget the second half.
//
// No trigger watches report_schedules — the tracking_configs_audit trigger
// watches tracking_configs — so the log row is written here, `recordConfigChange`
// under the `schedule` surface, in the same shape the Studio action and the
// 2026-09-15 change both used: field 'active', before/after `{ active: bool }`.
//
//   node --env-file=.env.local --import tsx scripts/set-schedule-active.ts \
//     --client <uuid> [--schedule <uuid>] --active false [--note "..."] [--apply]
//
// KNOW WHAT PAUSING COSTS. An ARMED tenant (report_period != 'paused') whose
// schedules are all inactive records no report_sends row at all, and
// `cadenceReliability` then counts every finished update as owed-and-unsettled:
// the ops check raises `report_missed`, "A finished update reached nobody",
// once per update, to ALERT_EMAIL. That alert is the operator's, never the
// tenant's — but it is a weekly email to somebody, and it is the exact reason
// this schedule was switched ON with an empty list on 2026-09-15. Pause it when
// silence must be guaranteed whatever lands in `recipients`; leave it active
// and empty when it need only be quiet today.

interface Args {
  clientId: string
  scheduleId: string | null
  active: boolean | null
  note: string | null
  apply: boolean
}

function parseBool(v: string): boolean {
  if (v === 'true') return true
  if (v === 'false') return false
  throw new Error(`--active takes true or false, got "${v}"`)
}

function parseArgs(argv: string[]): Args {
  const a: Args = { clientId: '', scheduleId: null, active: null, note: null, apply: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const next = () => argv[++i]
    if (flag === '--client') a.clientId = next()
    else if (flag === '--schedule') a.scheduleId = next()
    else if (flag === '--active') a.active = parseBool(next())
    else if (flag === '--note') a.note = next()
    else if (flag === '--apply') a.apply = true
    else throw new Error(`unknown flag: ${flag}`)
  }
  if (!a.clientId) throw new Error('--client <uuid> is required')
  if (a.active === null) throw new Error('--active true|false is required: there is no safe default for who gets emailed')
  return a
}

interface Row {
  id: string
  name: string
  cadence: string
  recipients: string[]
  active: boolean
  is_default: boolean
  review: boolean
  last_sent_at: string | null
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const active = args.active as boolean
  const admin = createAdminClient()

  const [clientRes, cfgRes, schedRes] = await Promise.all([
    admin.from('clients').select('company_name, is_active').eq('id', args.clientId).maybeSingle(),
    admin.from('tracking_configs').select('report_period, report_day').eq('client_id', args.clientId).maybeSingle(),
    admin.from('report_schedules')
      .select('id, name, cadence, recipients, active, is_default, review, last_sent_at')
      .eq('client_id', args.clientId).order('is_default', { ascending: false }).order('created_at'),
  ])
  // All three checked. A dropped error here reads as "no schedule", which is
  // the sentence an operator uses to conclude that no email goes out.
  for (const [what, res] of [['clients', clientRes], ['tracking_configs', cfgRes], ['report_schedules', schedRes]] as const) {
    if (res.error) throw new Error(`${what}: ${res.error.message}`)
  }
  const client = clientRes.data
  if (!client) throw new Error(`no client ${args.clientId}`)
  const rows = (schedRes.data ?? []) as Row[]
  if (!rows.length) throw new Error(`no report_schedules row for ${args.clientId}`)

  const target = args.scheduleId
    ? rows.find((r) => r.id === args.scheduleId)
    : rows.find((r) => r.is_default)
  if (!target) {
    throw new Error(args.scheduleId
      ? `no schedule ${args.scheduleId} on this workspace`
      : 'this workspace has no default schedule — pass --schedule <uuid>')
  }

  const period = (cfgRes.data?.report_period as string | undefined) ?? '(none)'
  console.log(`\n${client.company_name} — schedule ${args.apply ? 'APPLY' : 'dry run'}\n`)
  for (const r of rows) {
    const mark = r.id === target.id ? '→' : ' '
    console.log(`  ${mark} ${r.name.padEnd(16)} ${r.cadence.padEnd(13)} active=${String(r.active).padEnd(5)} recipients=${r.recipients.length}${r.is_default ? '  (default)' : ''}${r.review ? '  (review)' : ''}`)
  }
  console.log(`\n  target        ${target.name} (${target.id})`)
  console.log(`  active        ${target.active}  →  ${active}${target.active === active ? '   (unchanged)' : ''}`)
  console.log(`  recipients    ${target.recipients.length ? target.recipients.join(', ') : '(none)'}`)
  console.log(`  cadence       ${target.cadence} · tenant report_period '${period}'${client.is_active ? '' : ' · client is_active=false'}`)

  if (target.active === active) {
    console.log('\nNothing to change.')
    return
  }

  console.log('\n  what this means')
  if (!active) {
    console.log('    this schedule sends nothing, whatever lands in its recipient list — an accepted')
    console.log('    invite appends to `recipients` and never re-activates a schedule, so the pause holds.')
    const others = rows.filter((r) => r.id !== target.id && r.active)
    console.log(others.length
      ? `    ! ${others.length} OTHER schedule(s) stay active: ${others.map((r) => `${r.name} (${r.recipients.length} recipient(s))`).join(', ')}`
      : '    no other schedule is active, so no report email leaves for this workspace at all.')
    if (!others.length && period !== 'paused') {
      console.log('    ! with the tenant still armed and no active schedule, every finished update will be')
      console.log('      counted as owed-and-unsettled and raise a `report_missed` ops alert to ALERT_EMAIL')
      console.log('      (the operator, never the tenant). That is the price of the guarantee.')
    }
  } else {
    console.log(target.recipients.length
      ? `    the next finished update emails ${target.recipients.length} recipient(s): ${target.recipients.join(', ')}`
      : '    the next finished update records a SKIPPED send (no recipients) — nothing renders, nothing sends, no ops alert.')
  }

  if (!args.apply) {
    console.log('\n(dry run — nothing written. Re-run with --apply.)')
    return
  }

  const { error } = await admin
    .from('report_schedules')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', target.id)
    .eq('client_id', args.clientId)
  if (error) throw new Error(`write schedule: ${error.message}`)

  const logged = await recordConfigChange(admin, {
    clientId: args.clientId,
    surface: 'schedule',
    field: 'active',
    before: { active: target.active },
    after: { active },
    actor: scriptActor(`scripts/set-schedule-active.ts --client ${args.clientId} --active ${active} --apply`),
    note: args.note ?? (active
      ? `The ${target.name} schedule was switched on.`
      : `The ${target.name} schedule was paused. It sends nothing until it is switched on again, whoever is added to its recipient list.`),
  })

  const { data: after, error: reErr } = await admin
    .from('report_schedules').select('id, name, active, recipients, cadence').eq('id', target.id).maybeSingle()
  if (reErr) throw new Error(`re-read schedule: ${reErr.message}`)
  console.log('\nwritten. Re-read:')
  console.log(JSON.stringify(after, null, 2))
  console.log(logged ? 'change log: recorded.' : 'change log: NOT recorded (see the error above).')
  console.log(
    `\nTo undo:\n  node --env-file=.env.local --import tsx scripts/set-schedule-active.ts --client ${args.clientId} --active ${!active} --apply`,
  )
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
