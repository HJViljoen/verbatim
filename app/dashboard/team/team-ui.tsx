'use client'

import { useActionState, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, LBL } from '@/components/v2/look'
import { cn } from '@/lib/utils'
import {
  inviteMember, revokeInvitation, resendInvitation, changeMemberRole, removeMember,
  type ActionState,
} from './actions'
import type { Role } from '@/lib/auth'

// The Team tab's client controls. Since the audit design (7 Nov,
// Settings-Team.dc.html): labelled fields in the kit's input, Invite the
// yellow button (the tab's one primary), Copy link, Resend, Revoke and Remove
// the white secondary button with no icon; a member's role a labelled select
// in its own table cell, Remove in the next. What each does is unchanged.
// Styles from components/v2/look.ts (import-free, the client-bundle guard).

const idleState: ActionState = { ok: false, message: '' }

const FIELD = cn(INPUT, 'max-sm:h-11')
const BUTTON = cn(BTN_SECONDARY, 'max-sm:h-11')
const SAID = 'text-[13px] leading-[1.45]'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Roles an inviter may grant via a link. Owners aren't minted through invites
// (promote a member to owner after they join); this keeps link-based escalation
// off the table.
function grantableRoles(inviterRole: Role): Role[] {
  return inviterRole === 'owner' ? ['admin', 'member'] : ['member']
}

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          /* clipboard blocked — the link is visible to select manually */
        }
      }}
      className={BUTTON}
      title="Copy invite link"
    >
      {copied ? 'Copied' : 'Copy link'}
    </button>
  )
}

/** The invite link as the board draws it: a labelled, read-only field. */
export function InviteLinkField({ id, url }: { id: string; url: string }) {
  return (
    <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-1.5">
      <label htmlFor={id} className={LBL}>Invite link</label>
      <input id={id} type="text" readOnly value={url} className={cn(FIELD, 'w-full text-secondary-foreground')} />
    </div>
  )
}

export function InviteForm({ inviterRole }: { inviterRole: Role }) {
  const [state, formAction, pending] = useActionState(inviteMember, idleState)
  const roles = grantableRoles(inviterRole)

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
          <label htmlFor="invite-email" className={LBL}>Email</label>
          <input id="invite-email" name="email" type="email" required placeholder="teammate@brand.com" disabled={pending} className={cn(FIELD, 'w-full')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="invite-role" className={LBL}>Role</label>
          <select id="invite-role" name="role" defaultValue={roles[roles.length - 1]} disabled={pending} className={cn(FIELD, 'w-[140px]')}>
            {roles.map((r) => <option key={r} value={r}>{cap(r)}</option>)}
          </select>
        </div>
        <button type="submit" disabled={pending} className={cn(BTN_PRIMARY, 'px-5 max-sm:h-11')}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Invite
        </button>
      </div>

      {state.message && (
        <p role="status" className={cn(SAID, 'm-0', state.ok ? 'text-secondary-foreground' : 'text-caution')}>{state.message}</p>
      )}

      {state.ok && state.inviteUrl && (
        <div className="flex flex-wrap items-end gap-2">
          <InviteLinkField id="invite-new-link" url={state.inviteUrl} />
          <CopyLinkButton url={state.inviteUrl} />
        </div>
      )}
    </form>
  )
}

export function RevokeButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(revokeInvitation, idleState)
  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? 'Revoking…' : 'Revoke'}
      </button>
      {!state.ok && state.message && <span role="status" className={cn(SAID, 'text-caution')}>{state.message}</span>}
    </form>
  )
}

// Resend in one step: the old invite is revoked and a fresh one emailed, with
// a new 7-day link (the Sealand walkthrough, 29 Sep).
export function ResendButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(resendInvitation, idleState)
  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? 'Sending…' : 'Resend'}
      </button>
      {state.message && <span role="status" className={cn(SAID, state.ok ? 'text-secondary-foreground' : 'text-caution')}>{state.message}</span>}
    </form>
  )
}

// Owner-only controls for a teammate row: the role (its own cell) and Remove
// (the next cell). Changing the role submits at once, as before.
export function RoleSelect({ userId, currentRole, name }: { userId: string; currentRole: Role; name: string }) {
  const [state, action, pending] = useActionState(changeMemberRole, idleState)
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="userId" value={userId} />
      <label htmlFor={`role-${userId}`} className="sr-only">Role for {name}</label>
      <select
        id={`role-${userId}`}
        name="role"
        defaultValue={currentRole}
        disabled={pending}
        className={cn(INPUT, 'h-9 w-[130px] max-sm:h-11')}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {(['owner', 'admin', 'member'] as Role[]).map((r) => (
          <option key={r} value={r}>{cap(r)}</option>
        ))}
      </select>
      {!state.ok && state.message ? <span role="status" className={cn(SAID, 'text-caution')}>{state.message}</span> : null}
    </form>
  )
}

export function RemoveMember({ userId, name }: { userId: string; name: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(removeMember, idleState)
  return (
    <form action={action} className="flex flex-col items-end gap-1 max-sm:items-start">
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" disabled={pending} aria-label={`Remove ${name}`} className={cn(BTN_SECONDARY, 'h-9 px-3.5 max-sm:h-11')}>
        {pending ? 'Removing…' : 'Remove'}
      </button>
      {!state.ok && state.message ? <span role="status" className={cn(SAID, 'text-caution')}>{state.message}</span> : null}
    </form>
  )
}
