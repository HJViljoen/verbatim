import { describe, expect, it } from 'vitest'

import { fakeDb } from '../test/fake-db'
import { deletePendingSnapshotFiles, PENDING_MIGRATION, recordSnapshotFiles, storedObjectsOf } from './snapshot-files'

// A scrubbed snapshot's stored files (fresh review, 9 Nov): recorded before
// the words go, then every version deleted and the record cleared, retried on
// every run until it succeeds. Synthetic ids.

/** A fake `artifacts` bucket: objects by path, `list(folder)` and `remove`,
 *  which can be told to fail. */
function bucket(paths: string[]) {
  const objects = new Set(paths)
  const state = { refuse: false }
  const storage = {
    from: () => ({
      list: async (folder: string) => ({
        data: [...objects].filter((p) => p.startsWith(`${folder}/`)).map((p) => ({ name: p.slice(folder.length + 1), id: p })),
        error: null,
      }),
      remove: async (ps: string[]) => {
        if (state.refuse) return { data: null, error: { message: 'storage is unreachable' } }
        for (const p of ps) objects.delete(p)
        return { data: ps, error: null }
      },
    }),
  }
  return { objects, state, storage }
}

function world(opts: { pendingTable?: boolean } = {}) {
  const tables: Record<string, Record<string, unknown>[]> = {
    artifacts: [
      // The affected snapshot: its current PDF, a PNG tile, and an old version
      // a re-render left behind that no row names any more.
      { id: 'a1', client_id: 'c1', snapshot_id: 's1', storage_path: 'c1/s1/page-v2.pdf', stale: false },
      { id: 'a2', client_id: 'c1', snapshot_id: 's1', storage_path: 'c1/s1/tile_x-v1.png', stale: false },
      // Another snapshot of the workspace: not this erasure's.
      { id: 'a3', client_id: 'c1', snapshot_id: 's2', storage_path: 'c1/s2/page-v1.pdf', stale: false },
    ],
  }
  if (opts.pendingTable !== false) tables.erasure_pending_files = []
  const db = fakeDb(tables)
  const b = bucket(['c1/s1/page-v1.pdf', 'c1/s1/page-v2.pdf', 'c1/s1/tile_x-v1.png', 'c1/s2/page-v1.pdf'])
  const client = { ...(db.client as object), storage: b.storage } as never
  return { tables, db, client, b }
}
const rec = { clientId: 'c1', snapshotId: 's1', platform: 'youtube', authorKey: 'sockfan' }

describe('every stored version of a snapshot', () => {
  it('is what its folder holds and what its rows name', async () => {
    const w = world()
    expect(await storedObjectsOf(w.client, 'c1', 's1')).toEqual(['c1/s1/page-v1.pdf', 'c1/s1/page-v2.pdf', 'c1/s1/tile_x-v1.png'])
  })
})

describe('an affected snapshot\'s files are deleted, every version, and an unaffected one\'s kept', () => {
  it('records the snapshot, deletes its folder, flags its rows, clears the record', async () => {
    const w = world()
    expect(await recordSnapshotFiles(w.client, rec)).toBe(3)
    expect(w.tables.erasure_pending_files).toEqual([expect.objectContaining({ snapshot_id: 's1', client_id: 'c1', platform: 'youtube', author_key: 'sockfan' })])
    const done = await deletePendingSnapshotFiles(w.client, { apply: true })
    expect(done).toEqual([{ snapshotId: 's1', paths: ['c1/s1/page-v1.pdf', 'c1/s1/page-v2.pdf', 'c1/s1/tile_x-v1.png'] }])
    // Every version gone, the orphaned v1 included; the other snapshot kept.
    expect([...w.b.objects]).toEqual(['c1/s2/page-v1.pdf'])
    expect(w.tables.artifacts.map((a) => [a.id, a.stale])).toEqual([['a1', true], ['a2', true], ['a3', false]])
    expect(w.tables.erasure_pending_files).toEqual([])
  })

  it('records nothing for a snapshot with no stored file', async () => {
    const w = world()
    expect(await recordSnapshotFiles(w.client, { ...rec, snapshotId: 's9' })).toBe(0)
    expect(w.tables.erasure_pending_files).toEqual([])
  })

  it('a second request on the same snapshot keeps the first record', async () => {
    const w = world()
    await recordSnapshotFiles(w.client, rec)
    await recordSnapshotFiles(w.client, { ...rec, authorKey: 'someone' })
    expect(w.tables.erasure_pending_files.map((r) => r.author_key)).toEqual(['sockfan'])
  })
})

describe('a failed delete is retried on the next run (the review\'s case)', () => {
  it('stays on the list after a failed remove, and the next run deletes it and clears it', async () => {
    const w = world()
    await recordSnapshotFiles(w.client, rec)
    w.b.state.refuse = true
    await expect(deletePendingSnapshotFiles(w.client, { apply: true })).rejects.toThrow(/s1.*storage is unreachable/)
    // The rows are flagged (the review's trap: a retry that read live rows
    // only found none), the files are still there, the record is kept.
    expect(w.tables.artifacts.filter((a) => a.snapshot_id === 's1').every((a) => a.stale)).toBe(true)
    expect([...w.b.objects]).toContain('c1/s1/page-v2.pdf')
    expect(w.tables.erasure_pending_files).toHaveLength(1)
    // The next run: the snapshot's words are long scrubbed, so nothing finds
    // it by them; the record does.
    w.b.state.refuse = false
    const done = await deletePendingSnapshotFiles(w.client, { apply: true })
    expect(done.map((d) => d.snapshotId)).toEqual(['s1'])
    expect([...w.b.objects]).toEqual(['c1/s2/page-v1.pdf'])
    expect(w.tables.erasure_pending_files).toEqual([])
  })

  it('deletes a version a download re-rendered in between, and sends the next download to a clean one', async () => {
    const w = world()
    await recordSnapshotFiles(w.client, rec)
    // A download after an earlier failed attempt re-rendered v3 (from the
    // scrubbed snapshot) and pointed its row at it, live again.
    w.b.objects.add('c1/s1/page-v3.pdf')
    Object.assign(w.tables.artifacts[0], { storage_path: 'c1/s1/page-v3.pdf', stale: false })
    await deletePendingSnapshotFiles(w.client, { apply: true })
    expect([...w.b.objects].filter((p) => p.startsWith('c1/s1/'))).toEqual([])
    expect(w.tables.artifacts[0].stale).toBe(true)
  })
})

describe('the record has to be written first', () => {
  it('refuses a snapshot with stored files where the list is not in this database, naming the migration', async () => {
    const w = world({ pendingTable: false })
    await expect(recordSnapshotFiles(w.client, rec)).rejects.toThrow(PENDING_MIGRATION)
    expect(await deletePendingSnapshotFiles(w.client, { apply: true })).toEqual([])
  })

  it('a dry run lists the pending snapshots and deletes, flags and clears nothing', async () => {
    const w = world()
    await recordSnapshotFiles(w.client, rec)
    const listed = await deletePendingSnapshotFiles(w.client, { apply: false })
    expect(listed.map((d) => d.paths.length)).toEqual([3])
    expect(w.b.objects.size).toBe(4)
    expect(w.tables.artifacts.every((a) => !a.stale)).toBe(true)
    expect(w.tables.erasure_pending_files).toHaveLength(1)
  })
})
