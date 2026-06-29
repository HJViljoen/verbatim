'use client'

import { useActionState, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Check, Copy, Loader2 } from 'lucide-react'
import {
  inviteMember, revokeInvitation, changeMemberRole, removeMember,
  type ActionState, type Role,
} from './actions'

const idleState: ActionState = { ok: false, message: '' }

const selectCls =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'

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
      className="inline-flex items-center gap-1.5 rounded-lg border border-input px-2.5 h-8 text-xs hover:bg-accent"
      title="Copy invite link"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy link'}
    </button>
  )
}

export function InviteForm({ inviterRole }: { inviterRole: Role }) {
  const [state, formAction, pending] = useActionState(inviteMember, idleState)
  const roles = grantableRoles(inviterRole)

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          name="email"
          type="email"
          required
          placeholder="teammate@brand.com"
          className="sm:flex-1"
          disabled={pending}
        />
        <select name="role" defaultValue={roles[roles.length - 1]} className={selectCls} disabled={pending}>
          {roles.map((r) => <option key={r} value={r}>{cap(r)}</option>)}
        </select>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Invite'}
        </Button>
      </div>

      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-green-600' : 'text-destructive'}`}>{state.message}</p>
      )}

      {state.ok && state.inviteUrl && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <code className="flex-1 truncate text-xs text-muted-foreground">{state.inviteUrl}</code>
          <CopyLinkButton url={state.inviteUrl} />
        </div>
      )}
    </form>
  )
}

export function RevokeButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(revokeInvitation, idleState)
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}
        className="text-destructive hover:text-destructive">
        {pending ? 'Revoking…' : 'Revoke'}
      </Button>
      {!state.ok && state.message && <span className="ml-2 text-xs text-destructive">{state.message}</span>}
    </form>
  )
}

// Owner-only controls for a teammate row: change role + remove.
export function MemberControls({ userId, currentRole }: { userId: string; currentRole: Role }) {
  const [roleState, roleAction, rolePending] = useActionState(changeMemberRole, idleState)
  const [removeState, removeAction, removePending] = useActionState<ActionState, FormData>(removeMember, idleState)
  const err = (!roleState.ok && roleState.message) || (!removeState.ok && removeState.message) || ''

  return (
    <div className="flex items-center justify-end gap-2">
      <form action={roleAction} className="flex items-center gap-2">
        <input type="hidden" name="userId" value={userId} />
        <select
          name="role"
          defaultValue={currentRole}
          disabled={rolePending}
          className={selectCls}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          {(['owner', 'admin', 'member'] as Role[]).map((r) => (
            <option key={r} value={r}>{cap(r)}</option>
          ))}
        </select>
      </form>
      <form action={removeAction}>
        <input type="hidden" name="userId" value={userId} />
        <Button type="submit" variant="ghost" size="sm" disabled={removePending}
          className="text-destructive hover:text-destructive">
          {removePending ? 'Removing…' : 'Remove'}
        </Button>
      </form>
      {err && <span className="text-xs text-destructive">{err}</span>}
    </div>
  )
}
