import { createAdminClient } from '../lib/supabase-admin'
import { scriptActor, updateWithActor } from '../lib/config-log'
import { ALL_PERIODS, DAYS } from '../app/dashboard/settings/constants'
import { periodWindowDays } from '../lib/config'

// Set a tenant's update cadence (Phase 0 WP2, for decision D4).
//
// `report_period` and `report_day` decide whether the Sunday dispatcher picks a
// tenant up at all, and every pick-up spends real money: roughly $13–20 an
// update (Apify $7–8, OpenAI $5–11). There has never been an operator path to
// this pair — the settings form offers weekly and monthly only, deliberately,
// because 'paused' is an operator lever the form's select cannot represent and
// a save silently rewrote it to 'weekly', re-arming the scheduler on a tenant
// meant to be quiet (T0-7).
//
// So: a script, dry by default, that prints what the change will cost and what
// it will send before it writes anything. The write itself is stamped, so the
// tracking_configs trigger records who armed a tenant rather than "service_role".
//
//   node --env-file=.env.local --import tsx scripts/set-cadence.ts \
//     --client <uuid> [--period weekly|monthly|daily|paused] [--day sunday] [--apply]

interface Args { clientId: string | null; period: string | null; day: string | null; apply: boolean }

function parseArgs(argv: string[]): Args {
  const a: Args = { clientId: null, period: null, day: null, apply: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const next = () => argv[++i]
    if (flag === '--client') a.clientId = next()
    else if (flag === '--period') a.period = next()
    else if (flag === '--day') a.day = next()
    else if (flag === '--apply') a.apply = true
    else throw new Error(`unknown flag: ${flag}`)
  }
  return a
}

function validate(a: Args): string[] {
  const errors: string[] = []
  if (!a.clientId) errors.push('--client <uuid> is required: there is no safe default for a cadence change')
  if (a.period && !(ALL_PERIODS as readonly string[]).includes(a.period)) {
    errors.push(`--period must be one of ${ALL_PERIODS.join(', ')} (the tracking_configs CHECK vocabulary)`)
  }
  if (a.day && !(DAYS as readonly string[]).includes(a.day)) {
    errors.push(`--day must be one of ${DAYS.join(', ')}`)
  }
  if (!a.period && !a.day) errors.push('nothing to change: pass --period, --day, or both')
  return errors
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const errors = validate(args)
  if (errors.length) {
    console.error('Cannot set the cadence:')
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  const clientId = args.clientId as string
  const admin = createAdminClient()

  const [clientRes, cfgRes, schedulesRes] = await Promise.all([
    admin.from('clients').select('company_name, is_active, approved_at').eq('id', clientId).maybeSingle(),
    admin.from('tracking_configs').select('report_period, report_day').eq('client_id', clientId).maybeSingle(),
    admin.from('report_schedules').select('name, active, recipients, is_default').eq('client_id', clientId).order('is_default', { ascending: false }),
  ])
  // Checked, all three: what this script prints decides whether a tenant is
  // armed for $13–20 an update, and a dropped error would read as "no client",
  // "no configuration" or — the dangerous one — "no schedule", which is the
  // sentence the operator uses to decide that no email goes out.
  for (const [what, res] of [['clients', clientRes], ['tracking_configs', cfgRes], ['report_schedules', schedulesRes]] as const) {
    if (res.error) throw new Error(`${what}: ${res.error.message}`)
  }
  const client = clientRes.data
  const cfg = cfgRes.data
  const schedules = schedulesRes.data
  if (!client) throw new Error(`no client ${clientId}`)
  if (!cfg) throw new Error(`no tracking_configs row for ${clientId}`)

  const before = { report_period: cfg.report_period as string, report_day: cfg.report_day as string }
  const after = {
    report_period: args.period ?? before.report_period,
    report_day: args.day ?? before.report_day,
  }

  console.log(`${client.company_name} — cadence ${args.apply ? 'APPLY' : 'dry run'}\n`)
  for (const key of ['report_period', 'report_day'] as const) {
    const changed = before[key] !== after[key]
    console.log(`  ${key.padEnd(14)} ${before[key]}${changed ? `  →  ${after[key]}` : '   (unchanged)'}`)
  }

  if (before.report_period === after.report_period && before.report_day === after.report_day) {
    console.log('\nNothing to change.')
    return
  }

  // What this costs, and who hears about it. Both are things an operator should
  // read before arming a tenant, not discover on the invoice.
  const armed = after.report_period !== 'paused'
  const rows = (schedules ?? []) as { name: string; active: boolean; recipients: string[]; is_default: boolean }[]
  const live = rows.filter((s) => s.active && s.recipients.length > 0)
  console.log('\n  what this means')
  console.log(`    ${armed
    ? `the dispatcher picks this tenant up on its ${after.report_period} slot (${after.report_day}), at roughly $13–20 an update (Apify $7–8, OpenAI $5–11)`
    : 'the dispatcher stops picking this tenant up; nothing runs and nothing is spent until it is un-paused'}`)
  if (armed) {
    console.log(`    each update gathers a ${periodWindowDays(after.report_period)}-day window`)
    console.log(`    ${live.length
      ? `${live.length} schedule(s) would email: ${live.map((s) => `${s.name} (${s.recipients.length})`).join(', ')}`
      : 'no schedule is both active and addressed, so no email goes out'}`)
    // An armed tenant with no ACTIVE schedule is silent in a way the ops check
    // reads as a failure: the dispatcher sends `sendReport: true`, the send
    // path drops an inactive schedule before it writes anything
    // (lib/schedules/due.ts), and no report_sends row exists — so
    // cadenceReliability counts the run as owed and unsettled and
    // assessPipelineHealth raises `report_missed`, "A finished update reached
    // nobody", every week. An ACTIVE schedule with no recipients is the quiet
    // state: run.ts marks the send 'skipped' before anything renders, which
    // SETTLED_SEND_STATUSES accepts — no email, no Chromium, no alert.
    if (!rows.some((s) => s.active)) {
      console.log('    ! no schedule is active, so no send is recorded at all and every finished update will raise')
      console.log('      a `report_missed` ops alert. To arm the runs and stay quiet, set the default schedule')
      console.log('      active with no recipients: the send is then recorded as skipped, and nothing renders or sends.')
    }
  }
  if (!client.is_active || !client.approved_at) {
    console.log('    ! the tenant is not active/approved, so the dispatcher skips it whatever the cadence says')
  }

  if (!args.apply) {
    console.log('\n(dry run — nothing written. Re-run with --apply.)')
    return
  }

  const { error, stamped } = await updateWithActor(
    (payload) => admin.from('tracking_configs').update(payload).eq('client_id', clientId),
    { ...after, updated_at: new Date().toISOString() },
    scriptActor(`scripts/set-cadence.ts --client ${clientId} --apply`),
  )
  if (error) throw new Error(`write cadence: ${error.message}`)
  // Say which of the two writes landed. `updateWithActor` retries UNSTAMPED
  // when `last_actor` is rejected, and this tenant is now armed either way — so
  // an unconditional "the change log records this" would be the one sentence
  // that is false exactly when the log is missing the row it names.
  console.log(stamped
    ? '\nwritten. The change log records one row per column that moved (surface `cadence`).'
    : '\nwritten, but NOT attributed: tracking_configs.last_actor was rejected, so this write was ' +
      'retried without it. The change log has no row for it, or one naming the database role — ' +
      'apply supabase/migrations/20260915091000_config_changes.sql (or let PostgREST refresh its ' +
      'schema cache) and record this change before the next one goes in.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
