import type { SupabaseClient } from '@supabase/supabase-js'
import { reviewAudience } from '../schedules/members'
import { selectAll } from '../supabase-admin'

/**
 * A BUILD THAT HAS NOT GONE OUT BELONGS TO ITS REVIEWER (writing back, review
 * B1).
 *
 * A schedule with review on builds its report and stops at `ready`: the
 * snapshot and its PDF exist from Sunday morning, and nothing has been
 * approved. Before this, the Reports page listed that build under "Built for
 * you" with "Open the report" and the PDF, so anyone in the workspace could
 * read and download a report its reviewer had not yet read, which is the one
 * thing review exists to prevent.
 *
 * THE RULE. A snapshot a send carries is HELD until that send is `sent`
 * (ready, claimed, failed: built, not gone out). A held build is readable only
 * by whoever reviews the workspace's reports (`reviewAudience`: the operator
 * while the Studio is hidden from the tenant or its sending is locked, which
 * is every tenant today; the members once neither holds). Everyone else meets
 * none of it: not in Built, not in the viewer, no PDF, no share link, no
 * preview, no test send. Once it is sent it is the workspace's, as every sent
 * report is.
 *
 * FAILS CLOSED. Where the sends cannot be read, nothing a send carries is
 * shown to someone who may not read held builds.
 */

/** May this session read a build that has not gone out? */
export function mayReadHeld(session: { operator?: unknown | null }, clientId: string, opts?: { studioVisible?: boolean; sendsLocked?: boolean }): boolean {
  return session.operator != null || reviewAudience(clientId, opts) === 'members'
}

/** Which of these send rows hold their snapshot back: each snapshot a send
 *  carries, unless some send carrying it went out. Pure. */
export function heldOf(rows: readonly { snapshot_id: string | null; status: string }[]): Set<string> {
  const held = new Set<string>()
  const sent = new Set<string>()
  for (const r of rows) {
    if (!r.snapshot_id) continue
    ;(r.status === 'sent' ? sent : held).add(r.snapshot_id)
  }
  for (const id of sent) held.delete(id)
  return held
}

/** Every held snapshot of the workspace, or null where the sends could not be
 *  read (the caller then shows nothing a send carries). */
export async function heldSnapshotIds(admin: SupabaseClient, clientId: string): Promise<Set<string> | null> {
  try {
    const rows = await selectAll<{ snapshot_id: string | null; status: string }>(() =>
      admin.from('report_sends').select('snapshot_id, status').eq('client_id', clientId).not('snapshot_id', 'is', null).order('claimed_at'),
    )
    return heldOf(rows)
  } catch (e) {
    console.error(`[held] the sends could not be read for ${clientId}; held builds are hidden: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

/** Is this one snapshot held? True where the sends could not be read. */
export async function snapshotHeld(admin: SupabaseClient, clientId: string, snapshotId: string): Promise<boolean> {
  const { data, error } = await admin.from('report_sends').select('snapshot_id, status').eq('client_id', clientId).eq('snapshot_id', snapshotId)
  if (error) {
    console.error(`[held] the sends of snapshot ${snapshotId} could not be read; treated as held: ${error.message}`)
    return true
  }
  return heldOf((data ?? []) as { snapshot_id: string | null; status: string }[]).has(snapshotId)
}
