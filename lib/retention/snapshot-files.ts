import type { SupabaseClient } from '@supabase/supabase-js'

import { ARTIFACTS_BUCKET } from '../artifacts'
import { isMissingTable } from './stored-prose'

// The stored files of a snapshot an erasure scrubs (scripts/erase-commenter.ts,
// step 7f): every PDF and PNG built from it, a brief's included, every version.
//
// THE ORDER, AND WHY (fresh review, 9 Nov).
//   1. RECORD the snapshot on the pending list (`erasure_pending_files`,
//      migration 20261114093000) before its words are scrubbed. Once they are,
//      nothing finds the snapshot by the commenter's words again, so a delete
//      that failed would never be retried. The record is what is retried.
//   2. Scrub the snapshot's words (the caller).
//   3. Work through the WHOLE pending list, this request's and any earlier
//      one's: flag the snapshot's artifacts stale, delete every object in its
//      bucket folder, flag again, then clear its record. A download between
//      the flag and the delete re-renders a new version from the scrubbed
//      snapshot; the folder is read after the flag, so that version goes too
//      and the second flag sends the next download to a clean re-render. A
//      failure keeps the record, fails the step (the comments stay, exit 1),
//      and the next run tries again. The words are never put back.
// `markSnapshotsStale` (lib/artifacts.ts) is not used here: it reads only rows
// not yet stale and removes only their current path, so a retry after a failed
// remove found nothing, and an older version left by a re-render was never in
// its reach.

export const PENDING_TABLE = 'erasure_pending_files'
export const PENDING_MIGRATION = 'supabase/migrations/20261114093000_erasure_pending_files.sql'

const messageOf = (e: unknown) => (e as { message?: string } | null)?.message ?? String(e)

/** The folder every version of a snapshot's files is stored in
 *  (`artifactPath`, lib/artifacts.ts). */
export const snapshotFolder = (clientId: string, snapshotId: string) => `${clientId}/${snapshotId}`

/**
 * Every stored object of one snapshot: whatever its bucket folder holds (every
 * version, current or left behind) and every path its artifacts rows name.
 * Read only.
 */
export async function storedObjectsOf(admin: SupabaseClient, clientId: string, snapshotId: string): Promise<string[]> {
  const folder = snapshotFolder(clientId, snapshotId)
  const listed = await admin.storage.from(ARTIFACTS_BUCKET).list(folder, { limit: 1000 })
  if (listed.error) throw new Error(`list ${ARTIFACTS_BUCKET}/${folder}: ${messageOf(listed.error)}`)
  const rows = await admin.from('artifacts').select('storage_path').eq('snapshot_id', snapshotId)
  if (rows.error) throw new Error(`read artifacts of ${snapshotId}: ${messageOf(rows.error)}`)
  const paths = new Set<string>()
  for (const o of (listed.data ?? []) as { name?: string }[]) if (o.name) paths.add(`${folder}/${o.name}`)
  for (const r of (rows.data ?? []) as { storage_path?: string | null }[]) if (r.storage_path) paths.add(r.storage_path)
  return [...paths].sort()
}

/**
 * Step 1: put a snapshot on the pending list before its words are scrubbed,
 * where it has any stored object. Returns how many it has. Throws where the
 * list cannot be written (its migration not applied, or a write error), so the
 * snapshot is never scrubbed without a record of its files.
 */
export async function recordSnapshotFiles(
  admin: SupabaseClient,
  a: { clientId: string; snapshotId: string; platform: string; authorKey: string },
): Promise<number> {
  const objects = await storedObjectsOf(admin, a.clientId, a.snapshotId)
  if (!objects.length) return 0
  const { error } = await admin.from(PENDING_TABLE).upsert(
    { snapshot_id: a.snapshotId, client_id: a.clientId, platform: a.platform, author_key: a.authorKey },
    { onConflict: 'snapshot_id', ignoreDuplicates: true },
  )
  if (error) {
    if (isMissingTable(error, PENDING_TABLE)) {
      throw new Error(`snapshot ${a.snapshotId} has ${objects.length} stored file(s) and they cannot be recorded for deletion: apply ${PENDING_MIGRATION} first`)
    }
    throw new Error(`record ${a.snapshotId} in ${PENDING_TABLE}: ${messageOf(error)}`)
  }
  return objects.length
}

export interface DeletedFiles { snapshotId: string; paths: string[] }

/**
 * Step 3: every snapshot on the pending list, its files deleted (`apply`) or
 * listed. Each that succeeds leaves the list; each that fails stays on it, and
 * the call then throws naming them all. A database without the table has no
 * list.
 */
export async function deletePendingSnapshotFiles(admin: SupabaseClient, opts: { apply: boolean }): Promise<DeletedFiles[]> {
  const pending = await admin.from(PENDING_TABLE).select('snapshot_id, client_id').order('snapshot_id', { ascending: true })
  if (pending.error) {
    if (isMissingTable(pending.error, PENDING_TABLE)) return []
    throw new Error(`read ${PENDING_TABLE}: ${messageOf(pending.error)}`)
  }
  const out: DeletedFiles[] = []
  const failed: string[] = []
  for (const p of (pending.data ?? []) as { snapshot_id: string; client_id: string }[]) {
    try {
      if (!opts.apply) {
        out.push({ snapshotId: p.snapshot_id, paths: await storedObjectsOf(admin, p.client_id, p.snapshot_id) })
        continue
      }
      const flag = async () => {
        const { error } = await admin.from('artifacts').update({ stale: true }).eq('snapshot_id', p.snapshot_id)
        if (error) throw new Error(`flag artifacts stale: ${messageOf(error)}`)
      }
      await flag()
      const paths = await storedObjectsOf(admin, p.client_id, p.snapshot_id)
      if (paths.length) {
        const rm = await admin.storage.from(ARTIFACTS_BUCKET).remove(paths)
        if (rm.error) throw new Error(`delete ${paths.join(', ')}: ${messageOf(rm.error)}`)
      }
      await flag()
      const { error } = await admin.from(PENDING_TABLE).delete().eq('snapshot_id', p.snapshot_id)
      if (error) throw new Error(`clear ${PENDING_TABLE}: ${messageOf(error)}`)
      out.push({ snapshotId: p.snapshot_id, paths })
    } catch (e) {
      failed.push(`snapshot ${p.snapshot_id}: ${messageOf(e)}`)
    }
  }
  if (failed.length) throw new Error(`stored files not deleted, kept on the list for a re-run: ${failed.join('; ')}`)
  return out
}
