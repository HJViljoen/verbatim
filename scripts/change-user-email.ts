import { createAdminClient } from '../lib/supabase-admin'

/**
 * Change the address a person signs in with.
 *
 * There is no UI for this and no self-serve path: Supabase's own change-email
 * flow mails a confirmation link to BOTH addresses, and the one account that
 * most needs to move is the platform admin's, whose old address may already be
 * gone. So this is the admin API instead, with `email_confirm: true` — the new
 * address lands already confirmed and no mail is sent.
 *
 *   node --env-file=.env.local --import tsx scripts/change-user-email.ts \
 *     --user <auth uuid> --email <new address> [--apply]
 *
 * WHAT IT TOUCHES, and nothing else:
 *   auth.users.email          via supabase.auth.admin.updateUserById
 *   auth.identities           the `email` provider's identity_data.email /
 *                             provider_id, which GoTrue rewrites in the same
 *                             call. VERIFIED AFTER THE FACT below rather than
 *                             assumed: the identity row is what a password
 *                             sign-in matches on, and a version that updated
 *                             only auth.users would lock the account out with
 *                             everything looking correct.
 *   public.users.email        the app's own copy, which every tenant surface
 *                             reads.
 *
 * WHAT IT DELIBERATELY DOES NOT TOUCH:
 *   - the password. `updateUserById` with only `email` leaves
 *     `encrypted_password` alone; there is no reset and no reason for one.
 *   - `platform_admins`, which is keyed by user_id. So is `isPlatformAdmin`
 *     (lib/agent/access.ts) and so is every membership lookup in lib/auth.ts:
 *     nothing in the app authorises on an address. The id does not move, so
 *     operator rights do not either.
 *   - DELIVERY addresses. `report_schedules.recipients` and
 *     `tracking_configs.report_emails` are where a person asked a report to be
 *     SENT, which is a different decision from where they sign in, and the
 *     owner may well want the old inbox to keep receiving. They are printed,
 *     never rewritten.
 *   - HISTORY. `report_sends.recipients` records what went to whom, and
 *     `config_changes.actor_label` records who made a change under the name
 *     they had at the time. Rewriting either would be falsifying a record.
 *
 * NOT a tenant configuration change, so it writes no `config_changes` row —
 * that log is per-client and readable by every member of the tenant, and an
 * operator's own login is neither. The audit line it prints is the record;
 * keep it with the ticket.
 */

interface Args { userId: string; email: string; apply: boolean }

function parseArgs(argv: string[]): Args {
  const a: Args = { userId: '', email: '', apply: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const next = () => argv[++i]
    if (flag === '--user') a.userId = next()
    else if (flag === '--email') a.email = (next() ?? '').trim().toLowerCase()
    else if (flag === '--apply') a.apply = true
    else throw new Error(`unknown flag: ${flag}`)
  }
  if (!a.userId) throw new Error('--user <auth uuid> is required')
  if (!a.email) throw new Error('--email <new address> is required')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) throw new Error(`not an email: "${a.email}"`)
  return a
}

interface AuthRow { id: string; email: string | null; identities?: { provider: string; identity_data?: Record<string, unknown> }[] }

/** The identity providers on an account, as one readable line. A password
 *  change is only safe on a plain `email` identity: an account that also signs
 *  in with Google matches that provider on the Google address, and moving the
 *  primary address out from under it is a different operation entirely. */
const providersOf = (u: AuthRow) => (u.identities ?? []).map((i) => i.provider).sort()

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()

  const { data: found, error: getErr } = await admin.auth.admin.getUserById(args.userId)
  if (getErr || !found?.user) throw new Error(`no auth user ${args.userId}: ${getErr?.message ?? 'not found'}`)
  const before = found.user as unknown as AuthRow
  const providers = providersOf(before)

  const { data: profileBefore, error: pErr } = await admin
    .from('users').select('id, email, full_name, role, client_id').eq('id', args.userId).maybeSingle()
  if (pErr) throw new Error(`read public.users: ${pErr.message}`)

  const { data: adminRow, error: aErr } = await admin
    .from('platform_admins').select('user_id').eq('user_id', args.userId).maybeSingle()
  if (aErr) throw new Error(`read platform_admins: ${aErr.message}`)

  console.log(`\nChange sign-in address — ${args.apply ? 'APPLY' : 'dry run'}\n`)
  console.log(`  user id           ${args.userId}`)
  console.log(`  auth.users.email  ${before.email ?? '(none)'}  →  ${args.email}`)
  console.log(`  public.users      ${profileBefore ? `${profileBefore.email} · ${profileBefore.full_name ?? '(no name)'} · ${profileBefore.role}` : '(no row — auth account with no membership)'}`)
  console.log(`  identities        ${providers.join(', ') || '(none)'}`)
  console.log(`  platform admin    ${adminRow ? 'yes (keyed by user_id, unaffected)' : 'no'}`)

  // The stop condition. A Google (or any non-password) identity means the
  // address is not ours to move: the provider owns it, and rewriting
  // auth.users.email underneath leaves an account that can neither password
  // sign-in nor match its provider.
  const unsupported = providers.filter((p) => p !== 'email')
  if (unsupported.length) {
    console.error(
      `\nREFUSING: this account has non-password identities (${unsupported.join(', ')}).\n` +
      '  Moving the primary address under an OAuth identity is a different operation and\n' +
      '  needs the owner\'s decision. Nothing has been changed.',
    )
    process.exit(1)
  }
  if (providers.length === 0) {
    console.error('\nREFUSING: no identity rows at all. Nothing has been changed.')
    process.exit(1)
  }

  // Already taken? The admin API would reject it, but a refusal that names the
  // holder is more useful than a 422, and a dry run has to be able to say so.
  const { data: clash, error: cErr } = await admin
    .from('users').select('id, email').ilike('email', args.email).maybeSingle()
  if (cErr) throw new Error(`check public.users for a clash: ${cErr.message}`)
  if (clash && clash.id !== args.userId) {
    console.error(`\nREFUSING: ${args.email} already belongs to public.users ${clash.id}. Nothing has been changed.`)
    process.exit(1)
  }
  if (before.email?.toLowerCase() === args.email) {
    console.log('\nNothing to change: that is already the address.')
    return
  }

  console.log('\n  what this does')
  console.log('    the password is UNTOUCHED, and no confirmation mail is sent (email_confirm: true)')
  console.log('    delivery addresses and historical records are left exactly as they are')
  console.log(`    rollback:\n      node --env-file=.env.local --import tsx scripts/change-user-email.ts --user ${args.userId} --email ${before.email} --apply`)

  if (!args.apply) {
    console.log('\n(dry run — nothing written. Re-run with --apply.)')
    return
  }

  const { data: updated, error: upErr } = await admin.auth.admin.updateUserById(args.userId, {
    email: args.email,
    email_confirm: true,
  })
  if (upErr) throw new Error(`update auth user: ${upErr.message}`)
  const after = updated.user as unknown as AuthRow

  const { error: profErr } = await admin
    .from('users').update({ email: args.email }).eq('id', args.userId)
  if (profErr) {
    console.error(
      `\nauth.users moved to ${args.email} but public.users did NOT (${profErr.message}).\n` +
      '  The account signs in on the new address and the app still shows the old one.\n' +
      '  Fix public.users before doing anything else, or roll back with the command above.',
    )
    process.exit(1)
  }

  const { data: profileAfter } = await admin
    .from('users').select('email').eq('id', args.userId).maybeSingle()

  // Did GoTrue rewrite the identity, or only the user row? Checked, not
  // assumed: the identity is what a password sign-in resolves.
  const identity = (after.identities ?? []).find((i) => i.provider === 'email')
  const identityEmail = identity?.identity_data?.email as string | undefined

  console.log('\nwritten. Re-read:')
  console.log(`  auth.users.email          ${after.email ?? '(none)'}`)
  console.log(`  auth.identities[email]    ${identityEmail ?? '(not returned)'}`)
  console.log(`  public.users.email        ${profileAfter?.email ?? '(none)'}`)
  if (identityEmail && identityEmail.toLowerCase() !== args.email) {
    console.error(
      `\n! the email identity still reads ${identityEmail}. A password sign-in matches the IDENTITY,\n` +
      '  so the new address may not work. Verify before relying on it, and roll back if it does not.',
    )
  }
  // The audit line. Nothing else records this: it is not tenant configuration,
  // so it is deliberately absent from config_changes.
  console.log(
    `\nAUDIT ${new Date().toISOString()} scripts/change-user-email.ts --apply ` +
    `user=${args.userId} from=${before.email} to=${args.email} password=untouched`,
  )
  console.log(
    '\nThe owner must now sign out and sign in again with the new address and their EXISTING password.\n' +
    'Existing sessions keep working until their access token refreshes, and until then the JWT still\n' +
    'carries the OLD email claim — lib/auth.ts reads identity off `claims.email`, so anything that\n' +
    'stamps an address (an invite\'s Reply-To, a config-log actor label) would still use the old one.',
  )
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
