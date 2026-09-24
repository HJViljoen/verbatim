import { createAdminClient } from '../lib/supabase-admin'
import { recordConfigChange, scriptActor, updateWithActor } from '../lib/config-log'

// Clear `tracking_configs.report_emails` — the dead recipient list.
//
// Recipients moved to `report_schedules` at T0-10 and nothing has written or
// read this column since; `lib/config-log.ts` leaves it off WATCHED_CONFIG_
// COLUMNS for exactly that reason. It still holds four live Össur addresses,
// and `authenticated` still holds column-level UPDATE on it — so it is a trap
// for whoever next builds a recipients form and binds to the column a settings
// page has always shown.
//
// IT IS NOT CLEARED BY THE PRODUCT. Settings › Reports and recipients prints
// the list, says nothing has been sent to it, and asks. Deleting a client's
// stored addresses because a page loaded is not a thing a page should do, and
// the addresses are the only surviving record of who was on the list before
// the move. This script is the act, and Heinrich runs it on his own word.
//
// Dry by default. --apply writes, one tenant at a time.
//
//   node --env-file=.env.local --import tsx scripts/clear-report-emails.ts [--client <uuid>] [--apply]

interface Args { clientId: string | null; apply: boolean }

function parseArgs(argv: string[]): Args {
  const a: Args = { clientId: null, apply: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client') a.clientId = argv[++i] ?? null
    else if (argv[i] === '--apply') a.apply = true
  }
  return a
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()

  let q = admin.from('tracking_configs').select('client_id, report_emails')
  if (args.clientId) q = q.eq('client_id', args.clientId)
  const { data, error } = await q
  if (error) throw new Error(`read: ${error.message}`)

  const rows = (data ?? []).filter((r) => ((r.report_emails as string[] | null) ?? []).length > 0)
  if (rows.length === 0) {
    console.log('Nothing to clear — no workspace has a stored report_emails list.')
    return
  }

  for (const r of rows) {
    const clientId = r.client_id as string
    const before = (r.report_emails as string[] | null) ?? []
    console.log(`${clientId}: ${before.length} address(es) — ${before.join(', ')}`)
    if (!args.apply) continue

    const actor = scriptActor('scripts/clear-report-emails.ts --apply')
    const { error: writeError } = await updateWithActor(
      (payload) => admin.from('tracking_configs').update(payload).eq('client_id', clientId),
      { report_emails: [], updated_at: new Date().toISOString() },
      actor,
    )
    if (writeError) {
      console.error(`  not cleared: ${writeError.message}`)
      continue
    }
    // The trigger watches this table but NOT this column (it is off
    // WATCHED_CONFIG_COLUMNS), so without this the clearing would happen with
    // no record of it anywhere — which is the one thing a workspace's own
    // addresses disappearing must not do.
    await recordConfigChange(admin, {
      clientId,
      surface: 'schedule',
      field: 'tracking_configs.report_emails',
      before,
      after: [],
      actor,
      note: 'cleared an old list of report recipients that nothing had sent to since each report gained its own list. Nobody was removed from anything that sends.',
      rowsAffected: before.length,
    })
    console.log('  cleared.')
  }

  if (!args.apply) console.log('\n(dry run — nothing written. Re-run with --apply.)')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
