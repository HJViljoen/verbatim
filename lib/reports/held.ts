import type { SupabaseClient } from '@supabase/supabase-js'
import { reviewAudience } from '../schedules/members'
import { isMissingPublishColumns, onPlatform, type PlatformSendState } from '../schedules/platform-state'
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
 * report is. And once it is put ON THE PLATFORM without its email
 * (`published_at`, lib/schedules/publish.ts: the operator's since the backfill
 * of 1 Oct, and the runner's for every weekly read it builds since 5 Oct), it
 * is the workspace's too: an issue on the platform like a sent one (`onPlatform`,
 * the rule the Studio's past issues ask). The pages are not this rule's: they
 * print the newest ready read whatever its send (lib/written/published.ts).
 *
 * FAILS CLOSED. Where the sends cannot be read, nothing a send carries is
 * shown to someone who may not read held builds.
 */

/** May this session read a build that has not gone out? */
export function mayReadHeld(session: { operator?: unknown | null }, clientId: string, opts?: { studioVisible?: boolean; sendsLocked?: boolean }): boolean {
  return session.operator != null || reviewAudience(clientId, opts) === 'members'
}

/** A send row as the rule reads it. */
type HeldRow = { snapshot_id: string | null } & PlatformSendState

/** Which of these send rows hold their snapshot back: each snapshot a send
 *  carries, unless some send carrying it is on the platform (went out, or was
 *  published without its email). Pure. */
export function heldOf(rows: readonly HeldRow[]): Set<string> {
  const held = new Set<string>()
  const out = new Set<string>()
  for (const r of rows) {
    if (!r.snapshot_id) continue
    ;(onPlatform(r) ? out : held).add(r.snapshot_id)
  }
  for (const id of out) held.delete(id)
  return held
}

/** The columns the rule reads, with or without the publish columns (a
 *  database the migration has not reached reads every row unpublished). */
const COLS = 'snapshot_id, status, published_at'
const COLS_BEFORE_PUBLISH = 'snapshot_id, status'

/** Every held snapshot of the workspace, or null where the sends could not be
 *  read (the caller then shows nothing a send carries). */
export async function heldSnapshotIds(admin: SupabaseClient, clientId: string): Promise<Set<string> | null> {
  type Page = { range: (from: number, to: number) => PromiseLike<{ data: HeldRow[] | null; error: unknown }> }
  const read = (cols: string) => selectAll<HeldRow>(() =>
    admin.from('report_sends').select(cols).eq('client_id', clientId).not('snapshot_id', 'is', null).order('claimed_at') as unknown as Page,
  )
  try {
    try {
      return heldOf(await read(COLS))
    } catch (e) {
      // selectAll rethrows with the message only: the column is named in it.
      const message = e instanceof Error ? e.message : String(e)
      if (!isMissingPublishColumns(e) && !(/published_at/.test(message) && /does not exist|schema cache/.test(message))) throw e
      return heldOf(await read(COLS_BEFORE_PUBLISH))
    }
  } catch (e) {
    console.error(`[held] the sends could not be read for ${clientId}; held builds are hidden: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

/** Is this one snapshot held? True where the sends could not be read. */
export async function snapshotHeld(admin: SupabaseClient, clientId: string, snapshotId: string): Promise<boolean> {
  const read = (cols: string) => admin.from('report_sends').select(cols).eq('client_id', clientId).eq('snapshot_id', snapshotId)
  let { data, error } = await read(COLS)
  if (error && isMissingPublishColumns(error)) ({ data, error } = await read(COLS_BEFORE_PUBLISH))
  if (error) {
    console.error(`[held] the sends of snapshot ${snapshotId} could not be read; treated as held: ${error.message}`)
    return true
  }
  return heldOf((data ?? []) as unknown as HeldRow[]).has(snapshotId)
}
