import Link from 'next/link'
import { SettingsFrame } from '@/components/settings-frame'
import { Card, CardTitle } from '@/components/pages/studio/ui'
import { STACK, STACK_CELL, STACK_HEAD, STACK_ROW, TBL, TD, TH, TAG, TAG_TONE } from '@/components/v2/look'
import { EmptyBox, GoLink } from '@/components/v2/ui'
import { cn } from '@/lib/utils'
import { getSessionContext, canManageTenant } from '@/lib/auth'
import { settingsBar } from '@/lib/settings/bar'
import { createAdminClient } from '@/lib/supabase-admin'
import { recipientsBySchedule } from '@/lib/schedules/default'
import { getBaseUrl } from '@/lib/site'
import { InviteForm, InviteLinkField, RevokeButton, ResendButton, RoleSelect, RemoveMember, CopyLinkButton } from './team-ui'
import { canResendInvite, inviteState, memberUpdateStatus, UPDATE_STATUS_WORDS } from '@/lib/team-copy'
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
//
// SINCE THE AUDIT DESIGN (7 Nov, Settings-Team.dc.html): four white tiles
// with 21px titles and no icon; Invite with labelled fields; Members a table
// (Name, Email, The update, Role, a hidden Remove head) with the count in its
// head ("5 members", out of the frame's meta), the role a labelled select per
// row for the owner; Who gets the update a table of schedules, each one's
// addresses one a line from the data (not `scheduleLine`'s " · " join);
// Invites with the link a labelled read-only field and Copy link, Resend and
// Revoke white buttons. On a phone each table row stacks (STACK). The empty
// states are in the dashed box. No render test covers this page: it is
// checked on the dev server.

interface MemberRow { id: string; full_name: string | null; email: string; role: 'owner' | 'admin' | 'member' }
interface InviteRow { id: string; email: string; role: 'owner' | 'admin' | 'member'; expires_at: string; token: string | null }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Heinrich's address, as a link (finish-list item 18): "ask us" with no way
 *  to reach anyone is a dead end. */
function ContactLink() {
  return <a href={`mailto:${CONTACT_EMAIL}`} className={INLINE_GO}>{CONTACT_EMAIL}</a>
}

/** The kit's link look at the size of the sentence it sits in. */
const INLINE_GO = 'font-medium text-foreground underline decoration-control underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground'

/** A tile's head: its title, and a count at the right. */
function Head({ title, count }: { title: string; count?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <CardTitle>{title}</CardTitle>
      {count ? <span className="text-[14px] text-muted-foreground">{count}</span> : null}
    </div>
  )
}

const TILE = 'p-[26px] max-sm:p-[18px]'

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
  // Two or more expired invites: why their links no longer work is said once,
  // under the head, and each row keeps its "Expired" tag and its date (the
  // real-data pass, 8 Nov: Sealand's five rows each said it). "Resend sends a
  // fresh one" only where this reader may resend one of them.
  const expired = invites.filter((inv) => inviteState(inv.expires_at, nowIso).expired)
  const expiredOnce = expired.length > 1
  const expiredLine = `${expiredOnce ? 'These links no longer work.' : 'This link no longer works.'}${expired.some((inv) => canResendInvite(role, inv.role)) ? ' Resend sends a fresh one.' : ''}`
  // ON A LIST IS NOT THE SAME AS SENT TO (sw-2 item 2): a member on the
  // paused digest is on it, and the page says it is paused.
  const membersOffReport = memberRows.filter((m) => memberUpdateStatus(m.email, schedules) === 'none')

  // Team and billing are ONE rail entry over two routes (WP16): they have
  // different gates — billing is owner-only through billingAccess(), team is
  // mixed — and one route would mean merging the gates or gating panes inside
  // a page. The two link to each other instead.
  // THE ONE-LINE BAR (the 25 Sep rulings, market-first WP3.10), as on every
  // Settings sub-page.
  const bar = await settingsBar(supabase, clientId, client?.company_name ?? 'Your workspace')
  return (
    <SettingsFrame active="team" title="Settings" context={`${client?.company_name ?? 'Workspace'}${!canManage ? ', read-only' : ''}`} bar={bar} contentTitle="Team" operator={session.operator != null}>
    <div className="flex max-w-[1060px] flex-col gap-5">

      {canManage && (
        <Card className={TILE}>
          <CardTitle>Invite a teammate</CardTitle>
          <div className="mt-[18px]"><InviteForm inviterRole={role} /></div>
          <p className="m-0 mt-3.5 text-[14px] leading-[1.55] text-secondary-foreground">
            We email the invite link directly. You can also copy the generated link and share it
            yourself. It signs the person in and adds them to {client?.company_name ?? 'your workspace'}.
          </p>
        </Card>
      )}

      <Card className={TILE}>
        <Head title="Members" count={`${memberRows.length} member${memberRows.length === 1 ? '' : 's'}`} />
        <table className={cn(TBL, STACK, 'mt-3')}>
          <thead className={STACK_HEAD}>
            <tr>
              <th scope="col" className={TH}>Name</th>
              <th scope="col" className={TH}>Email</th>
              <th scope="col" className={TH}>The update</th>
              <th scope="col" className={cn(TH, 'w-[140px]')}>Role</th>
              {isOwner ? <th scope="col" className={cn(TH, 'w-[90px] pr-0')}><span className="sr-only">Remove</span></th> : null}
            </tr>
          </thead>
          <tbody className={STACK}>
            {memberRows.map((m) => {
              const isSelf = m.id === userId
              const status = memberUpdateStatus(m.email, schedules)
              const name = m.full_name || m.email
              const controls = isOwner && !isSelf
              return (
                <tr key={m.id} className={STACK_ROW}>
                  <th scope="row" className={cn(TD, STACK_CELL, 'text-left font-semibold sm:align-middle')}>
                    {name}
                    {isSelf && <span className="font-normal text-muted-foreground"> (you)</span>}
                  </th>
                  <td className={cn(TD, STACK_CELL, 'break-all sm:align-middle')}>{m.email}</td>
                  <td className={cn(TD, STACK_CELL, 'text-secondary-foreground sm:align-middle')}>{cap(UPDATE_STATUS_WORDS[status])}</td>
                  <td className={cn(TD, STACK_CELL, 'sm:align-middle')}>
                    {controls ? <RoleSelect userId={m.id} currentRole={m.role} name={name} /> : <><span className="sm:hidden">Role: </span>{cap(m.role)}</>}
                  </td>
                  {isOwner ? (
                    <td className={cn(TD, STACK_CELL, 'pr-0 text-right sm:align-middle', !controls && 'max-sm:hidden')}>
                      {controls ? <RemoveMember userId={m.id} name={name} /> : null}
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <Card className={TILE}>
        <CardTitle>Who gets the update</CardTitle>
        {totalRecipients === 0 ? (
          <div className="mt-3">
            <EmptyBox>
              {studio ? (
                <>
                  Nobody yet. Add addresses to a schedule in{' '}
                  <Link href={STUDIO_HREF} className={INLINE_GO}>the Studio</Link>,
                  or invite a teammate, they join the Weekly digest when they accept.
                </>
              ) : (
                <>Nobody yet. Heinrich sets up who gets the update with you: write to <ContactLink />.</>
              )}
            </EmptyBox>
          </div>
        ) : (
          <table className={cn(TBL, STACK, 'mt-3')}>
            <thead className={STACK_HEAD}>
              <tr>
                <th scope="col" className={cn(TH, 'w-[32%]')}>Schedule</th>
                <th scope="col" className={TH}>Who gets it</th>
              </tr>
            </thead>
            <tbody className={STACK}>
              {schedules.map((s) => (
                <tr key={s.id} className={STACK_ROW}>
                  <th scope="row" className={cn(TD, STACK_CELL, 'text-left font-semibold')}>
                    {s.name}
                    {s.is_default && <span className="font-normal text-muted-foreground"> (default)</span>}
                  </th>
                  <td className={cn(TD, STACK_CELL)}>
                    {/* The addresses from the data, one a line; a paused
                        schedule says so first (`scheduleLine`'s words, in
                        sentences: it joins with " · "). */}
                    {!s.active ? (
                      <p className="m-0 text-secondary-foreground">{s.recipients.length === 0 ? 'Paused, with no addresses on it.' : 'Paused, so nothing is sent.'}</p>
                    ) : s.recipients.length === 0 ? (
                      <p className="m-0 text-secondary-foreground">No addresses yet</p>
                    ) : null}
                    {s.recipients.length > 0 ? (
                      <ul className={cn('m-0 list-none break-all p-0 leading-[1.7]', !s.active && 'mt-1 text-secondary-foreground')}>
                        {s.recipients.map((r) => <li key={r}>{r}</li>)}
                      </ul>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {membersOffReport.length > 0 && (
          <p className="m-0 mt-4 text-[15px] leading-[1.55]">
            {membersOffReport.length} teammate{membersOffReport.length === 1 ? '' : 's'} on this workspace {membersOffReport.length === 1 ? 'is' : 'are'} not on any schedule.
            {canManage ? (
              studio ? (
                <>
                  {' '}Add them in{' '}
                  <GoLink href={STUDIO_HREF} inText className="text-[15px]">the Studio</GoLink>.
                </>
              ) : (
                <> Heinrich adds them once your reports are set up: write to <ContactLink />.</>
              )
            ) : null}
          </p>
        )}
      </Card>

      {canManage && (
        <Card className={TILE}>
          <Head title="Invites" count={`${waiting} pending${invites.length > waiting ? `, ${invites.length - waiting} expired` : ''}`} />
          {expiredOnce ? <p data-invites-expired="" className="m-0 mt-2 text-[14px] text-muted-foreground">{expiredLine}</p> : null}
          {invites.length === 0 ? (
            <div className="mt-3"><EmptyBox>No pending invites.</EmptyBox></div>
          ) : invites.map((inv) => {
            const state = inviteState(inv.expires_at, nowIso)
            return (
              <div key={inv.id} className="mt-4 flex flex-col gap-3 border-t border-track pt-4">
                <div className="min-w-0">
                  <p className="m-0 flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                    <span className="min-w-0 break-all">{inv.email}</span>
                    {state.expired ? <span className={cn(TAG, TAG_TONE.mid)}>Expired</span> : null}
                  </p>
                  <p className="m-0 mt-1 text-[14px] text-secondary-foreground">{cap(inv.role)}, {state.line}</p>
                  {state.expired ? (
                    expiredOnce ? null : <p className="m-0 mt-1 text-[14px] text-muted-foreground">{expiredLine}</p>
                  ) : inv.token ? null : (
                    <p className="m-0 mt-1 text-[14px] text-muted-foreground">Link is visible to whoever sent this invite. We emailed it to them.</p>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  {inv.token && !state.expired ? <InviteLinkField id={`invite-link-${inv.id}`} url={`${baseUrl}/invite/${inv.token}`} /> : null}
                  {inv.token && !state.expired && <CopyLinkButton url={`${baseUrl}/invite/${inv.token}`} />}
                  {canResendInvite(role, inv.role) && <ResendButton id={inv.id} />}
                  <RevokeButton id={inv.id} />
                </div>
              </div>
            )
          })}
        </Card>
      )}
    </div>
    </SettingsFrame>
  )
}
