import { createAdminClient } from '../lib/supabase-admin'
import { scriptActor, updateWithActor } from '../lib/config-log'
import { HANDLE_PLATFORMS, validateHandles } from '../lib/provisioning'

// Set one rival's own accounts (Phase 0 WP2, for decision D3).
//
// `competitor_handles` is what the census reads: with it, a rival's own posts
// are captured and stamped `competitor_owned`, and "what they are pitching"
// has a source. Without it — Össur's state today, `{}` — a rival's own channel
// is invisible except where a keyword search happens to surface it.
//
// It is operator-set on purpose (20260910090000_competitor_census.sql: "a wrong
// handle here would attribute someone else's posts to a tracked brand, so it is
// not self-serve"), and `authenticated` holds no UPDATE grant on the column. Up
// to now the only way to write it was a hand-edited per-tenant script, and
// nothing validated what went in.
//
// This writes ONE rival at a time, merged into the stored object, dry by
// default, and refuses:
//   - a rival name that is not in competitor_names (the keys must match
//     exactly, or the census reads an account nothing downstream can attribute)
//   - a platform no account can be read on
//   - a YouTube value that is not a channel id (the reader calls the Data API
//     with it; an @name reads nothing at all, silently)
//
// Verify each handle by hand before running this. The Sealand pass found that
// TikTok @cotopaxi is a private individual named Nelson, and that
// instagram.com/freitag is a newspaper — a rival's own site footer is the only
// source worth trusting.
//
//   node --env-file=.env.local --import tsx scripts/set-competitor-handles.ts \
//     --client <uuid> --competitor "Ottobock" \
//     [--instagram ottobock] [--tiktok ottobock] [--youtube UC…] [--clear] [--apply]

interface Args {
  clientId: string | null
  competitor: string | null
  handles: Record<string, string>
  clear: boolean
  apply: boolean
}

function parseArgs(argv: string[]): Args {
  const a: Args = { clientId: null, competitor: null, handles: {}, clear: false, apply: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const next = () => argv[++i]
    if (flag === '--client') a.clientId = next()
    else if (flag === '--competitor') a.competitor = next()
    else if (flag === '--clear') a.clear = true
    else if (flag === '--apply') a.apply = true
    else if (flag.startsWith('--') && HANDLE_PLATFORMS.includes(flag.slice(2))) a.handles[flag.slice(2)] = next()
    else throw new Error(`unknown flag: ${flag}`)
  }
  return a
}

const show = (h: Record<string, string> | undefined) =>
  h && Object.keys(h).length
    ? Object.entries(h).map(([p, v]) => `${p}=${v}`).join(' · ')
    : '(none)'

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const problems: string[] = []
  if (!args.clientId) problems.push('--client <uuid> is required')
  if (!args.competitor) problems.push('--competitor "<name>" is required, spelled exactly as it is in competitor_names')
  if (!args.clear && Object.keys(args.handles).length === 0) {
    problems.push(`pass at least one of ${HANDLE_PLATFORMS.map((p) => `--${p}`).join(', ')}, or --clear`)
  }
  problems.push(...validateHandles(args.handles))
  if (problems.length) {
    console.error('Cannot set handles:')
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }
  const clientId = args.clientId as string
  const rival = (args.competitor as string).trim()
  const admin = createAdminClient()

  const [{ data: client }, { data: cfg }] = await Promise.all([
    admin.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    admin.from('tracking_configs').select('competitor_names, competitor_handles, platforms').eq('client_id', clientId).maybeSingle(),
  ])
  if (!client) throw new Error(`no client ${clientId}`)
  if (!cfg) throw new Error(`no tracking_configs row for ${clientId}`)

  const names = (cfg.competitor_names ?? []) as string[]
  const match = names.find((n) => n.toLowerCase() === rival.toLowerCase())
  if (!match) {
    console.error(
      `\n"${rival}" is not a tracked rival for ${client.company_name}.\n` +
      `  competitor_names: ${names.join(', ') || '(none)'}\n` +
      '  The keys of competitor_handles must match competitor_names exactly — a handle under any\n' +
      '  other key reads an account whose posts nothing downstream can attribute.',
    )
    process.exit(1)
  }
  if (match !== rival) {
    console.log(`Using the stored spelling "${match}" rather than "${rival}".\n`)
  }

  const stored = (cfg.competitor_handles ?? {}) as Record<string, Record<string, string>>
  const before = stored[match]
  const merged: Record<string, Record<string, string>> = { ...stored }
  if (args.clear) delete merged[match]
  else merged[match] = { ...(before ?? {}), ...args.handles }

  console.log(`${client.company_name} · ${match} — ${args.apply ? 'APPLY' : 'dry run'}\n`)
  console.log(`  before  ${show(before)}`)
  console.log(`  after   ${show(merged[match])}`)
  const platforms = (cfg.platforms ?? []) as string[]
  const unread = Object.keys(merged[match] ?? {}).filter((p) => !platforms.includes(p))
  if (unread.length) {
    console.log(`\n  ! ${unread.join(', ')} is not in this tenant's platforms (${platforms.join(', ')}), so the account is stored but never read`)
  }
  if (!args.clear) {
    console.log('\n  each configured account is read once per update: roughly $0.02–0.10 an account, per update')
    console.log('  its posts arrive stamped competitor_owned, in that rival\'s bucket, and count toward its share')
  }

  if (!args.apply) {
    console.log('\n(dry run — nothing written. Re-run with --apply.)')
    return
  }

  const { error, stamped } = await updateWithActor(
    (payload) => admin.from('tracking_configs').update(payload).eq('client_id', clientId),
    { competitor_handles: merged, updated_at: new Date().toISOString() },
    scriptActor(`scripts/set-competitor-handles.ts --client ${clientId} --competitor "${match}" --apply`),
  )
  if (error) throw new Error(`write handles: ${error.message}`)
  // The honest sentence, not the hopeful one: `updateWithActor` retries
  // UNSTAMPED when `last_actor` is rejected, and this write is the one that
  // starts spending Apify money on a rival's accounts.
  console.log(stamped
    ? '\nwritten. The change log records it under the `handles` surface, with this command as the actor.'
    : '\nwritten, but NOT attributed: tracking_configs.last_actor was rejected, so this write was ' +
      'retried without it. The change log has no row for it, or one naming the database role — ' +
      'apply supabase/migrations/20260915091000_config_changes.sql (or let PostgREST refresh its ' +
      'schema cache) and record this change before the next update reads these accounts.')
  console.log('The accounts are read on the next update; nothing historical is re-read or re-stamped.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
