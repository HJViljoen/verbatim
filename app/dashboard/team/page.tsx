import Link from 'next/link'
import { UserPlus, Users, Clock, Mail } from 'lucide-react'
import { SettingsFrame } from '@/components/settings-frame'
import { getSessionContext, canManageTenant } from '@/lib/auth'
import { settingsBar } from '@/lib/settings/bar'
import { createAdminClient } from '@/lib/supabase-admin'
import { recipientsBySchedule } from '@/lib/schedules/default'
import { getBaseUrl } from '@/lib/site'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { InviteForm, RevokeButton, ResendButton, MemberControls, CopyLinkButton } from './team-ui'
import { canResendInvite, inviteState } from '@/lib/team-copy'
import { canSeeStudio, STUDIO_HREF } from '@/lib/studio-visibility'
import { CONTACT_EMAIL } from '@/lib/legal'
import type { Metadata } from 'next'
import { surface } from '@/lib/nav'
import { settingsSubPage } from '@/lib/settings/rail'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: `${settingsSubPage('team').label} · ${surface('settings').label}` }

// Team management — list members + pending invites, invite teammates, manage
// roles. Owners/admins can invite + revoke; only owners change roles or remove
// members. Members see a read-only roster. Authorization is enforced in the
// server actions and by RLS — the UI gating below is only UX.

interface MemberRow { id: string; full_name: string | null; email: string; role: 'owner' | 'admin' | 'member' }
interface InviteRow { id: string; email: string; role: 'owner' | 'admin' | 'member'; expires_at: string; token: string | null }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Heinrich's address, as a link (finish-list item 18): "ask us" with no way
 *  to reach anyone is a dead end. */
function ContactLink() {
  return <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2">{CONTACT_EMAIL}</a>
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {cap(role)}
    </span>
  )
}

export default async function TeamPage() {
  const session = await getSessionContext()
  const { supabase, clientId, role, userId } = session
  // A client is never pointed at the Studio (lib/studio-visibility.ts).
  const studio = canSeeStudio(session)
  const canManage = canManageTenant(role)
  const isOwner = role === 'owner'

  const [{ data: client }, { data: members }, schedules, { data: inviteData }] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    supabase.from('users').select('id, full_name, email, role').eq('client_id', clientId).order('created_at'),
    // Who actually receives the update. Accepting an invite adds you to the
    // default schedule (T0-10); showing it here is what makes "your team gets
    // the update" checkable instead of a claim.
    recipientsBySchedule(createAdminClient(), clientId),
    // Pending invites (managers only — see below) ride the same wave: round
    // trips, not rows, are the cost, and this read depends on nothing above.
    // The list comes through RLS (session client) and deliberately does NOT
    // select `token`: the column is revoked from `authenticated`, so it is
    // unreadable from PostgREST with a tenant JWT at all. Nulling it in
    // JavaScript was not a control — any admin could have read every pending
    // token directly, and the not-signed-in accept path turns a stolen OWNER
    // token into a takeover with no mailbox access.
    canManage
      ? supabase
          .from('invitations')
          .select('id, email, role, expires_at, invited_by')
          .eq('client_id', clientId).eq('status', 'pending')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: null }),
  ])
  const totalRecipients = schedules.reduce((n, s) => n + s.recipients.length, 0)
  const activeRecipientSet = new Set(
    schedules.filter((s) => s.active).flatMap((s) => s.recipients.map((e) => e.toLowerCase())),
  )

  // Pending invites + their shareable links are only fetched/built for managers.
  // The invite TOKEN is only fetched for the person who sent that invite
  // (T0-11). It is a live credential: the link it forms creates an account for
  // the invited address and signs it in. Every owner and admin used to see
  // every pending invite's token rendered as plain text, so any admin could
  // take over any pending invitation on the tenant, including an owner one.
  let invites: InviteRow[] = []
  let baseUrl = ''
  if (canManage) {
    const rows = ((inviteData as (Omit<InviteRow, 'token'> & { invited_by: string | null })[] | null) ?? [])

    // Tokens for the invites YOU sent, read with the service role.
    const mine = rows.filter((r) => r.invited_by === userId).map((r) => r.id)
    const tokenById = new Map<string, string>()
    if (mine.length) {
      const { data: withTokens } = await createAdminClient()
        .from('invitations').select('id, token').in('id', mine)
      for (const t of ((withTokens ?? []) as { id: string; token: string }[])) tokenById.set(t.id, t.token)
    }
    invites = rows.map((r) => ({ ...r, token: tokenById.get(r.id) ?? null }))
    baseUrl = await getBaseUrl()
  }

  const memberRows = (members as MemberRow[] | null) ?? []
  // EXPIRED IS NOT PENDING (29 Sep): the database keeps an expired invite as
  // `pending`, and five that expired on 24 Sep were listed as pending.
  const nowIso = new Date().toISOString()
  const waiting = invites.filter((inv) => !inviteState(inv.expires_at, nowIso).expired).length
  const membersOffReport = memberRows.filter((m) => !activeRecipientSet.has((m.email ?? '').toLowerCase()))

  // Team and billing are ONE rail entry over two routes (WP16): they have
  // different gates — billing is owner-only through billingAccess(), team is
  // mixed — and one route would mean merging the gates or gating panes inside
  // a page. The two link to each other instead.
  // THE ONE-LINE BAR (the 25 Sep rulings, market-first WP3.10), as on every
  // Settings sub-page.
  const bar = await settingsBar(supabase, clientId, client?.company_name ?? 'Your workspace')
  return (
    <SettingsFrame active="team" title="Settings" context={`${client?.company_name ?? 'Workspace'}${!canManage ? ' · read-only' : ''}`} bar={bar} contentTitle="Team" contentMeta={`${memberRows.length} member${memberRows.length === 1 ? '' : 's'}`} controls={<Link href="/dashboard/billing" className="text-[12px] font-medium text-secondary-foreground hover:underline">Plan &amp; billing →</Link>}>
    <div className="max-w-3xl space-y-4">

      {canManage && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><UserPlus className="size-4 text-muted-foreground" aria-hidden /> Invite a teammate</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <InviteForm inviterRole={role} />
            <p className="text-[11px] text-muted-foreground/70">
              We email the invite link directly. You can also copy the generated link and share it
              yourself. It signs the person in and adds them to {client?.company_name ?? 'your workspace'}.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Users className="size-4 text-muted-foreground" aria-hidden /> Members ({memberRows.length})</CardTitle></CardHeader>
        <CardContent className="divide-y">
          {memberRows.map((m) => {
            const isSelf = m.id === userId
            return (
              <div key={m.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.full_name || m.email}
                    {isSelf && <span className="ml-2 text-[11px] text-muted-foreground">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.email}
                    {activeRecipientSet.has((m.email ?? '').toLowerCase())
                      ? <span className="ml-2 text-[11px] text-positive">gets the update</span>
                      : <span className="ml-2 text-[11px] text-muted-foreground/70">not on the update</span>}
                  </p>
                </div>
                {isOwner && !isSelf
                  ? <MemberControls userId={m.id} currentRole={m.role} />
                  : <RoleBadge role={m.role} />}
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Mail className="size-4 text-muted-foreground" aria-hidden /> Who gets the update ({activeRecipientSet.size})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {totalRecipients === 0 ? (
            <p className="text-sm text-muted-foreground">
              {studio ? (
                <>
                  Nobody yet. Add addresses to a schedule in{' '}
                  <Link href={STUDIO_HREF} className="underline underline-offset-2">the Studio</Link>,
                  or invite a teammate, they join the Weekly digest when they accept.
                </>
              ) : (
                <>Nobody yet. Heinrich sets up who gets the update with you: write to <ContactLink />.</>
              )}
            </p>
          ) : (
            schedules.map((s) => (
              <div key={s.id}>
                <p className="text-xs font-medium text-muted-foreground">
                  {s.name}
                  {s.is_default && <span className="ml-1.5 text-[10px] text-muted-foreground/70">default</span>}
                </p>
                {!s.active ? (
                  <p className="text-sm text-muted-foreground">paused</p>
                ) : s.recipients.length === 0 ? (
                  <p className="text-sm text-muted-foreground">no addresses yet</p>
                ) : (
                  <p className="text-sm">{s.recipients.join(' · ')}</p>
                )}
              </div>
            ))
          )}
          {membersOffReport.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {membersOffReport.length} teammate{membersOffReport.length === 1 ? '' : 's'} on this workspace {membersOffReport.length === 1 ? 'is' : 'are'} not on any schedule.
              {canManage ? (
                studio ? (
                  <>
                    {' '}Add them in{' '}
                    <Link href={STUDIO_HREF} className="underline underline-offset-2">the Studio</Link>.
                  </>
                ) : (
                  <> Heinrich adds them once your reports are set up: write to <ContactLink />.</>
                )
              ) : null}
            </p>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Clock className="size-4 text-muted-foreground" aria-hidden /> Invites ({waiting} pending{invites.length > waiting ? `, ${invites.length - waiting} expired` : ''})</CardTitle></CardHeader>
          <CardContent className="divide-y">
            {invites.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground first:pt-0">No pending invites.</p>
            ) : invites.map((inv) => {
              const state = inviteState(inv.expires_at, nowIso)
              return (
              <div key={inv.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-medium">
                    <span className="truncate">{inv.email}</span>
                    {state.expired ? <span className="shrink-0 rounded-full bg-inner px-1.5 py-px text-[10.5px] font-medium text-secondary-foreground">Expired</span> : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {cap(inv.role)} · {state.line}
                  </p>
                  {state.expired ? (
                    <p className="mt-1 text-[11px] text-muted-foreground/70">
                      This link no longer works. Resend sends a fresh one.
                    </p>
                  ) : inv.token ? (
                    <code className="mt-1 block truncate text-[11px] text-muted-foreground/70">
                      {baseUrl}/invite/{inv.token}
                    </code>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted-foreground/70">
                      Link is visible to whoever sent this invite. We emailed it to them.
                    </p>
                  )}
                </div>
                {inv.token && !state.expired && <CopyLinkButton url={`${baseUrl}/invite/${inv.token}`} />}
                {canResendInvite(role, inv.role) && <ResendButton id={inv.id} />}
                <RevokeButton id={inv.id} />
              </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
    </SettingsFrame>
  )
}
