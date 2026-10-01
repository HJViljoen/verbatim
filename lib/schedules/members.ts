import type { SupabaseClient } from '@supabase/supabase-js'
import { SCHEDULE_RECIPIENTS_MAX } from '../config'
import { tenantLocked } from '../tenant-locks'
import { normaliseRecipients } from './validate'

/** Every member of the workspace, for the review email — owners, admins and
 *  members alike (any of them may read, edit and send). Oldest first, capped
 *  like a schedule's own list. */
export async function memberEmails(admin: SupabaseClient, clientId: string): Promise<string[]> {
  const { data, error } = await admin
    .from('users')
    .select('email')
    .eq('client_id', clientId)
    .order('created_at')
  if (error) throw new Error(`members: read failed: ${error.message}`)
  const emails = ((data ?? []) as { email: string | null }[]).map((r) => r.email ?? '').filter(Boolean)
  return normaliseRecipients(emails).slice(0, SCHEDULE_RECIPIENTS_MAX)
}

/**
 * WHETHER A TENANT'S MEMBERS REVIEW THEIR OWN BUILDS (pages build, 1 Oct).
 * False: the Studio opened to clients (`STUDIO_TENANT_VISIBLE`), but its
 * review controls and Send stayed the operator's, so the review email, and
 * with it every held build (`lib/reports/held.ts` `mayReadHeld`), stays the
 * operator's for every tenant. Until the split it rode the Studio's
 * visibility flag, which would have handed an unlocked tenant's members held
 * builds the moment the Studio opened. `studioVisible` below is this answer.
 */
export const TENANT_REVIEWS = false

/**
 * WHO READS A BUILD BEFORE IT GOES OUT (writing back, T7's review fix).
 *
 * The review email links into the Studio, and the Studio is hidden from
 * tenant users (`STUDIO_TENANT_VISIBLE`, lib/studio-visibility.ts): a member
 * who got it landed on Reports with nothing to read and no Send to press.
 * And a send-locked tenant's members may not send at all (`TENANT_LOCKS`,
 * decision J: during the trial sending is Heinrich's). For either, the review
 * goes to the OPERATOR, who can open the Studio, read the email as it will go
 * out and press Send; the tenant's members hear nothing until the report
 * itself arrives. Where the Studio is open to the tenant and nothing is
 * locked, the members review it, as before.
 *
 * Pure, and the two facts are arguments (AGENTS.md: gated pure functions take
 * the flag), so both answers stay tested while the Studio is hidden.
 */
export function reviewAudience(
  clientId: string,
  opts: { studioVisible?: boolean; sendsLocked?: boolean } = {},
): 'operator' | 'members' {
  const studioVisible = opts.studioVisible ?? TENANT_REVIEWS
  const sendsLocked = opts.sendsLocked ?? tenantLocked(clientId, 'sends')
  return !studioVisible || sendsLocked ? 'operator' : 'members'
}

/** The operator's inbox: `ALERT_EMAIL`, the address every operator alert goes
 *  to (lib/email.ts), comma-separated where it names more than one. Empty
 *  where it is not set: then nobody is emailed, and the caller says so. */
export function operatorEmails(env: Record<string, string | undefined> = process.env): string[] {
  return normaliseRecipients((env.ALERT_EMAIL ?? '').split(/[\s,;]+/).filter((e) => e.includes('@')))
}

/** The review email's list for this workspace, and whose it is. */
export async function reviewRecipients(
  admin: SupabaseClient,
  clientId: string,
  opts: { studioVisible?: boolean; sendsLocked?: boolean; env?: Record<string, string | undefined> } = {},
): Promise<{ audience: 'operator' | 'members'; to: string[] }> {
  const audience = reviewAudience(clientId, opts)
  return audience === 'operator'
    ? { audience, to: operatorEmails(opts.env) }
    : { audience, to: await memberEmails(admin, clientId) }
}
