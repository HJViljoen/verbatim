import { fullDate } from './format'

// The Team page's and the invite page's words (29 Sep 2026, the Sealand
// walkthrough's team fixes). Pure, so the words are tested.

/** "an" before "admin" and "owner", "a" before "member": the invite page
 *  said "as a admin". */
export function articleFor(word: string): 'a' | 'an' {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}

export function withArticle(role: string): string {
  return `${articleFor(role)} ${role}`
}

export interface InviteState {
  expired: boolean
  /** "expires 1 Oct 2026" or "expired 24 Sep 2026", in the app's date form,
   *  never the browser's (it printed "9/24/2026"). */
  line: string
}

/**
 * Where a pending invite stands. The database keeps an expired invite as
 * `pending` (acceptance checks `expires_at`), so the Team page listed five
 * invites that expired on 24 Sep as "Pending … expires 9/24/2026".
 */
export function inviteState(expiresAt: string, now: string): InviteState {
  const expired = Date.parse(expiresAt) <= Date.parse(now)
  return { expired, line: `${expired ? 'expired' : 'expires'} ${fullDate(expiresAt)}` }
}

/** May this inviter resend this invite? The rule `inviteMember` holds: an
 *  admin can only invite members, an owner can invite admins too. */
export function canResendInvite(inviterRole: string, inviteRole: string): boolean {
  if (inviterRole === 'owner') return inviteRole !== 'owner'
  if (inviterRole === 'admin') return inviteRole === 'member'
  return false
}
