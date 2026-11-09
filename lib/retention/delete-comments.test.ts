import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { fakeDb } from '../test/fake-db'
import { deletePendingSnapshotFiles, recordSnapshotFiles } from './snapshot-files'
import { deleteCommentsProperly } from './youtube-refresh-io'

// deleteCommentsProperly is shared by the nightly YouTube refresh and the
// erase script's step 8. The erase script alone passes `recordSnapshots`, so
// a failed delete of a citing snapshot's files is retried on its next run;
// the refresh behaves exactly as before. Synthetic ids and words.

function world() {
  const tables: Record<string, Record<string, unknown>[]> = {
    comments: [{ id: 'k1', client_id: 'c1', text: 'my socket rubs raw after an hour' }, { id: 'k2', client_id: 'c1', text: 'fine for me' }],
    insight_evidence: [],
    language_samples: [],
    recommendations: [], market_insights: [], competitive_insights: [], account_events: [],
    report_snapshots: [
      { id: 's9', client_id: 'c1', evidence_ids: ['c:k1'] },
      { id: 's2', client_id: 'c1', evidence_ids: ['c:k2'] },
    ],
    artifacts: [
      { id: 'a9', client_id: 'c1', snapshot_id: 's9', storage_path: 'c1/s9/page-v2.pdf', stale: false },
      { id: 'a2', client_id: 'c1', snapshot_id: 's2', storage_path: 'c1/s2/page-v1.pdf', stale: false },
    ],
    erasure_pending_files: [],
  }
  const objects = new Set(['c1/s9/page-v1.pdf', 'c1/s9/page-v2.pdf', 'c1/s2/page-v1.pdf'])
  const state = { refuse: false, removed: [] as string[][] }
  const storage = {
    from: () => ({
      list: async (folder: string) => ({ data: [...objects].filter((p) => p.startsWith(`${folder}/`)).map((p) => ({ name: p.slice(folder.length + 1) })), error: null }),
      remove: async (ps: string[]) => {
        if (state.refuse) return { data: null, error: { message: 'storage is unreachable' } }
        state.removed.push(ps)
        for (const p of ps) objects.delete(p)
        return { data: ps, error: null }
      },
    }),
  }
  const db = fakeDb(tables)
  return { tables, db, objects, state, client: { ...(db.client as object), storage } as never }
}
const gone = [{ id: 'k1', client_id: 'c1', text: 'my socket rubs raw after an hour' }]

describe('the nightly refresh path is unchanged', () => {
  it('flags and deletes the citing snapshot\'s current file after the delete, and never touches the pending list', async () => {
    const w = world()
    const r = await deleteCommentsProperly(w.client, gone)
    expect(r).toEqual({ deleted: 1, insightsAffected: 0, heroQuotesNulled: 0, artifactsStaled: 1 })
    expect(w.tables.comments.map((c) => c.id)).toEqual(['k2'])
    // markSnapshotsStale, as before: the live row flagged, its current path removed.
    expect(w.tables.artifacts.map((a) => [a.id, a.stale])).toEqual([['a9', true], ['a2', false]])
    expect(w.state.removed).toEqual([['c1/s9/page-v2.pdf']])
    // The same reads and writes as before: snapshots by `id` alone, and no
    // call on the erasure's list.
    expect(w.db.calls.filter((c) => c.table === 'report_snapshots').map((c) => c.columns)).toEqual(['id'])
    expect(w.db.calls.some((c) => c.table === 'erasure_pending_files')).toBe(false)
    const ops = w.db.calls.filter((c) => c.op !== 'select').map((c) => `${c.op}:${c.table}`)
    expect(ops).toEqual(['delete:comments', 'update:artifacts'])
  })

  it('both refresh call sites pass no recorder', () => {
    const src = readFileSync(resolve(__dirname, 'youtube-refresh-io.ts'), 'utf8')
    const calls = [...src.matchAll(/await deleteCommentsProperly\(admin, (\w+), (\{[^}]*\})\)/g)].map((m) => m[2])
    expect(calls).toEqual(['{ dryRun: opts.dryRun }', '{ dryRun: opts.dryRun }'])
  })
})

describe('the erase script\'s step 8: a failed delete is retried on the next run', () => {
  const record = (client: never) => async (snapshots: { id: string; client_id: string }[]) => {
    let n = 0
    for (const s of snapshots) n += await recordSnapshotFiles(client, { clientId: s.client_id, snapshotId: s.id, platform: 'youtube', authorKey: 'sockfan' })
    return n
  }

  it('records the citing snapshot before the delete, and flags or deletes nothing itself', async () => {
    const w = world()
    const r = await deleteCommentsProperly(w.client, gone, { recordSnapshots: record(w.client) })
    expect(r.artifactsStaled).toBe(2)
    expect(w.tables.erasure_pending_files.map((p) => p.snapshot_id)).toEqual(['s9'])
    const ops = w.db.calls.filter((c) => c.op !== 'select').map((c) => `${c.op}:${c.table}`)
    expect(ops).toEqual(['upsert:erasure_pending_files', 'delete:comments'])
    expect(w.state.removed).toEqual([])
  })

  it('a delete that fails after the comments are gone stays listed, and the next run deletes every version', async () => {
    const w = world()
    await deleteCommentsProperly(w.client, gone, { recordSnapshots: record(w.client) })
    w.state.refuse = true
    await expect(deletePendingSnapshotFiles(w.client, { apply: true })).rejects.toThrow(/s9.*storage is unreachable/)
    expect(w.tables.erasure_pending_files).toHaveLength(1)
    // The next run: the comment is gone, so nothing finds the snapshot by
    // it; the list does.
    w.state.refuse = false
    expect((await deletePendingSnapshotFiles(w.client, { apply: true })).map((d) => d.paths)).toEqual([['c1/s9/page-v1.pdf', 'c1/s9/page-v2.pdf']])
    expect([...w.objects]).toEqual(['c1/s2/page-v1.pdf'])
    expect(w.tables.erasure_pending_files).toEqual([])
  })

  it('a recorder that fails deletes nothing, so a re-run finds the comments', async () => {
    const w = world()
    await expect(deleteCommentsProperly(w.client, gone, { recordSnapshots: async () => { throw new Error('cannot record') } })).rejects.toThrow('cannot record')
    expect(w.tables.comments.map((c) => c.id)).toEqual(['k1', 'k2'])
  })
})
