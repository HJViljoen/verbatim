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

// ---- Who gets the update (sw-2 item 2) --------------------------------------
//
// The Team page counted only SWITCHED-ON schedules: "Who gets the update (0)",
// every member "not on the update", while Readiness said "Weekly digest has 2
// addresses" and the record showed Brayden and Daniela joining the digest. The
// digest is paused, with both on it. The page now says who is on each list and
// that a paused one sends nothing, and Readiness says "paused" in the same word.

export interface ScheduleOnTeam {
  name: string
  active: boolean
  recipients: readonly string[]
}

export type UpdateStatus = 'gets' | 'paused' | 'none'

/** Where a member stands: on a schedule that sends, only on paused ones, or on none. */
export function memberUpdateStatus(email: string | null | undefined, schedules: readonly ScheduleOnTeam[]): UpdateStatus {
  const e = (email ?? '').toLowerCase()
  if (!e) return 'none'
  const on = schedules.filter((s) => s.recipients.some((r) => r.toLowerCase() === e))
  if (on.some((s) => s.active)) return 'gets'
  return on.length > 0 ? 'paused' : 'none'
}

export const UPDATE_STATUS_WORDS: Readonly<Record<UpdateStatus, string>> = {
  gets: 'gets the update',
  paused: 'on the update, which is paused',
  none: 'not on the update',
}

/** One schedule's line under "Who gets the update": its addresses, and where
 *  it is paused, that nothing is sent. */
export function scheduleLine(s: ScheduleOnTeam): string {
  const who = s.recipients.join(' · ')
  if (!s.active) {
    return s.recipients.length === 0
      ? 'paused, with no addresses on it'
      : `paused, so nothing is sent · ${s.recipients.length === 1 ? '1 address' : `${s.recipients.length} addresses`} on it: ${who}`
  }
  return s.recipients.length === 0 ? 'no addresses yet' : who
}
