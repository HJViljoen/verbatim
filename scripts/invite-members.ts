import { randomBytes } from 'node:crypto'
import { createAdminClient } from '../lib/supabase-admin'
import { renderInviteEmail, sendInviteEmail } from '../lib/email'
import { ROLES, type Role } from '../lib/auth'

/**
 * Invite people to an EXISTING tenant (operator path).
 *
 * There has never been one. `scripts/provision-tenant.ts --invite` mints a
 * single owner invite and only at a tenant's BIRTH; the real flow is the
 * dashboard's own server action (app/dashboard/team/actions.ts), which needs a
 * browser session inside the tenant. So an operator asked to seat seven people
 * on a workspace they are not a member of has had exactly two options: hand-
 * written INSERTs with a hand-rolled token, or the workspace switcher and seven
 * trips through a form. This is the third.
 *
 * It is the SERVER ACTION's rules, re-run outside a browser:
 *   - the same token (`randomBytes(24).toString('base64url')`),
 *   - the same email (lib/email.ts `renderInviteEmail` — the one the send path
 *     itself renders, so the preview cannot drift from what lands),
 *   - the same two refusals: an email that is already a member of this tenant,
 *     and an email that already has a PENDING invite (the action reads that off
 *     the `invitations_pending_unique` 23505; checking first is how a dry run
 *     can say so before writing).
 *   - the same 7-day expiry, which is the COLUMN DEFAULT — neither path sets
 *     `expires_at`, and the email's "expires in 7 days" is true only because of
 *     that default.
 *
 * The one rule it deliberately does NOT re-run is the action's authz
 * (`canManageTenant`, "admins may only invite members"). There is no session
 * here to check a role against; this is the service role, which is the same
 * position `provision-tenant.ts` is in. `--invited-by` is how a row still names
 * a person: it must be an existing member of the tenant, and the invite email
 * says who sent it, so an operator cannot silently invite as nobody.
 *
 * DRY BY DEFAULT, and sending is a SECOND opt-in:
 *   --apply   writes the invitations rows
 *   --send    also sends the email (requires --apply; without it the run prints
 *             the invite URLs and the operator sends them by hand, which is the
 *             same fallback the dashboard offers when Resend is unwired)
 *
 *   node --env-file=.env.local --import tsx scripts/invite-members.ts \
 *     --client ac16988e-... \
 *     --invite daniela@sealandgear.com:owner \
 *     --invite sam@sealandgear.com:member \
 *     [--invited-by sealand@verbatimintel.com] [--apply] [--send]
 *
 * ROLES: 'owner' IS invitable. The action lets an OWNER grant any role and only
 * bars an ADMIN from granting above 'member'; the invitations CHECK takes all
 * three. So an owner invite needs no promote-afterwards dance.
 */

/** The app origin an invite link is built against, without a request in scope.
 *  Same expression as provision-tenant.ts: `lib/site.ts appBaseUrl()` falls
 *  back to localhost off a production NODE_ENV, and an invite link to localhost
 *  is worse than no link. */
const baseUrl = () =>
  (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.verbatimintel.com').replace(/\/$/, '')

interface Invite { email: string; role: Role }
interface Args {
  clientId: string
  invites: Invite[]
  invitedBy: string | null
  apply: boolean
  send: boolean
}

/** `email:role`. The role is required rather than defaulted: seating someone at
 *  the wrong level is the mistake this whole script exists to not make. */
function parseInvite(spec: string): Invite {
  const at = spec.lastIndexOf(':')
  if (at <= 0) throw new Error(`--invite wants <email>:<role>, got "${spec}"`)
  const email = spec.slice(0, at).trim().toLowerCase()
  const role = spec.slice(at + 1).trim() as Role
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`not an email: "${email}"`)
  if (!ROLES.includes(role)) throw new Error(`role must be one of ${ROLES.join(' | ')}, got "${role}"`)
  return { email, role }
}

function parseArgs(argv: string[]): Args {
  const a: Args = { clientId: '', invites: [], invitedBy: null, apply: false, send: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const next = () => argv[++i]
    if (flag === '--client') a.clientId = next()
    else if (flag === '--invite') a.invites.push(parseInvite(next()))
    else if (flag === '--invited-by') a.invitedBy = next().trim().toLowerCase()
    else if (flag === '--apply') a.apply = true
    else if (flag === '--send') a.send = true
    else throw new Error(`unknown flag: ${flag}`)
  }
  if (!a.clientId) throw new Error('--client <uuid> is required')
  if (!a.invites.length) throw new Error('at least one --invite <email>:<role> is required')
  const seen = new Set<string>()
  for (const inv of a.invites) {
    if (seen.has(inv.email)) throw new Error(`${inv.email} listed twice`)
    seen.add(inv.email)
  }
  if (a.send && !a.apply) throw new Error('--send needs --apply: there is nothing to send a link to until the row exists')
  return a
}

/** Why an invite cannot be created, in the action's own words. */
function refusal(email: string, members: Set<string>, pending: Set<string>): string | null {
  if (members.has(email)) return 'already on your team'
  if (pending.has(email)) return 'a pending invite already exists (revoke it first to re-send)'
  return null
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()

  const { data: client, error: cErr } = await admin
    .from('clients').select('id, company_name, is_active').eq('id', args.clientId).maybeSingle()
  if (cErr) throw new Error(`read client: ${cErr.message}`)
  if (!client) throw new Error(`no client ${args.clientId}`)
  const companyName = (client.company_name as string | undefined) ?? ''

  const { data: userRows, error: uErr } = await admin
    .from('users').select('id, email, role, full_name').eq('client_id', args.clientId)
  if (uErr) throw new Error(`read members: ${uErr.message}`)
  const members = new Map<string, { id: string; role: string; fullName: string | null }>()
  for (const u of (userRows ?? []) as { id: string; email: string; role: string; full_name: string | null }[]) {
    members.set((u.email ?? '').toLowerCase(), { id: u.id, role: u.role, fullName: u.full_name })
  }

  const { data: pendingRows, error: pErr } = await admin
    .from('invitations').select('email, role, created_at, expires_at')
    .eq('client_id', args.clientId).eq('status', 'pending')
  if (pErr) throw new Error(`read pending invites: ${pErr.message}`)
  const pending = new Set(
    ((pendingRows ?? []) as { email: string }[]).map((r) => (r.email ?? '').toLowerCase()),
  )

  // Who the invite says it is from. The action takes this off the session; here
  // it has to be a real member, or the email would name a stranger.
  let invitedById: string | null = null
  let inviterEmail: string | undefined
  let inviterName: string | undefined
  if (args.invitedBy) {
    const m = members.get(args.invitedBy)
    if (!m) throw new Error(`--invited-by ${args.invitedBy} is not a member of ${companyName || args.clientId}`)
    invitedById = m.id
    inviterEmail = args.invitedBy
    // The name the body uses, the address the Reply-To uses — the same split
    // the server action makes, off the same `users` row.
    inviterName = m.fullName?.trim() || undefined
  }

  const mode = args.apply ? (args.send ? 'APPLY + SEND' : 'APPLY (no email)') : 'dry run'
  console.log(`\nInvites to ${companyName || args.clientId} — ${mode}`)
  console.log(`  workspace     ${companyName} (${args.clientId})${client.is_active ? '' : '  ! is_active = false'}`)
  console.log(`  members now   ${members.size ? [...members].map(([e, m]) => `${e} (${m.role})`).join(', ') : '(none)'}`)
  console.log(`  pending now   ${pending.size ? [...pending].join(', ') : '(none)'}`)
  console.log(`  from          ${inviterName ?? inviterEmail ?? '(no inviter named — the email will not say who invited them)'}${inviterEmail && inviterName ? ` <${inviterEmail}>` : ''}`)
  console.log(`  expiry        7 days (invitations.expires_at column default; neither path sets it)\n`)

  const ok: Invite[] = []
  for (const inv of args.invites) {
    const why = refusal(inv.email, new Set(members.keys()), pending)
    if (why) console.log(`  SKIP   ${inv.email.padEnd(32)} ${inv.role.padEnd(6)}  — ${why}`)
    else {
      ok.push(inv)
      console.log(`  INSERT ${inv.email.padEnd(32)} ${inv.role.padEnd(6)}  → invitations (status pending)`)
    }
  }
  if (!ok.length) {
    console.log('\nNothing to do.')
    return
  }

  // The row shape, spelled out — a dry run has to show what it would write, and
  // `token` is the only field it cannot show (it is minted per insert below).
  console.log('\n  each row:')
  console.log(`    client_id   ${args.clientId}`)
  console.log(`    email       <as listed above, lower-cased>`)
  console.log(`    role        <as listed above>`)
  console.log(`    token       randomBytes(24).toString('base64url')  — 32 chars, minted per row`)
  console.log(`    invited_by  ${invitedById ?? 'null'}`)
  console.log(`    status      'pending'   (column default)`)
  console.log(`    expires_at  now() + 7 days   (column default)`)

  // The email, rendered by the send path's own renderer. Identical for every
  // recipient except the URL, so it is printed once.
  const sample = renderInviteEmail({
    to: ok[0].email,
    inviteUrl: `${baseUrl()}/invite/<token>`,
    companyName,
    invitedByEmail: inviterEmail,
    invitedByName: inviterName,
  })
  console.log('\n  === the email ===')
  console.log(`  from:    ${sample.from ?? '(RESEND_API_KEY / EMAIL_FROM not set here — sendInviteEmail would be a logged no-op)'}`)
  console.log(`  to:      <each recipient>`)
  console.log(`  reply-to: ${sample.replyTo ?? '(none — a reply would go to the from address)'}`)
  console.log(`  subject: ${sample.subject}`)
  console.log('  text:')
  for (const line of sample.text.split('\n')) console.log(`    ${line}`)
  console.log(`  html:    ${sample.html.length} bytes (same copy, Verbatim-branded button to the same URL)`)

  if (!args.apply) {
    console.log('\n(dry run — nothing written, nothing sent. Re-run with --apply, then --apply --send.)')
    return
  }

  console.log(`\nInserting ${ok.length} invitation(s)…`)
  const created: { email: string; role: Role; url: string }[] = []
  for (const inv of ok) {
    const token = randomBytes(24).toString('base64url')
    const { error } = await admin.from('invitations').insert({
      client_id: args.clientId,
      email: inv.email,
      role: inv.role,
      token,
      invited_by: invitedById,
    })
    if (error) {
      // 23505 = the pending-unique index. Same read the action gives it.
      console.error(`  FAILED ${inv.email}: ${error.code === '23505' ? 'a pending invite already exists' : error.message}`)
      continue
    }
    created.push({ email: inv.email, role: inv.role, url: `${baseUrl()}/invite/${token}` })
  }

  console.log(`\ncreated ${created.length}/${ok.length}:`)
  for (const c of created) console.log(`  ${c.email.padEnd(32)} ${c.role.padEnd(6)} ${c.url}`)

  if (!args.send) {
    console.log('\n(no --send: no email left this machine. Send the links above by hand.)')
    return
  }

  console.log('\nSending…')
  for (const c of created) {
    const { sent } = await sendInviteEmail({
      to: c.email,
      inviteUrl: c.url,
      companyName,
      invitedByEmail: inviterEmail,
      invitedByName: inviterName,
    })
    console.log(`  ${sent ? 'sent   ' : 'NOT SENT'} ${c.email}${sent ? '' : ' — send the link by hand'}`)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
