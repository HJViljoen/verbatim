import { describe, expect, it } from 'vitest'

import { fakeDb } from '../test/fake-db'
import { ANALYSIS_PROSE_TABLES, deleteSnapshotFiles, filesOfSnapshots, proseNeedles, scrubJson, scrubProseRow, scrubStoredProse, type ProseTable } from './analysis-prose'
import { runErasure, unfinishedMessage } from './erase-run'
import { ERASED_WORDS } from './stored-prose'

// An erasure request reaches the analysis's own prose (scripts/erase-commenter.ts,
// step 7f): every table a pass writes prose to after it has read comments, and
// every snapshot that froze it. Synthetic words, none from production.

const ERASED = 'my socket rubs raw after an hour every single day'
// Another commenter, near the same words: never touched.
const OTHER = 'my socket rubs a little after a long day'

// How each column is stored, so a fixture row has the shape the table has.
const TEXT_ARRAY = new Set(['member_themes', 'supporting_theme_labels'])
const TEXT = new Set(['theme', 'description', 'label', 'canonical_label', 'title', 'finding', 'reasoning', 'explanation', 'headline', 'subject'])

/** A value for one column that quotes `said`, in the column's own type. */
function carrying(column: string, said: string): unknown {
  if (TEXT.has(column)) return `People keep saying "${said}" about the fit.`
  if (TEXT_ARRAY.has(column)) return ['Fit and comfort', `Saying "${said}"`]
  // jsonb: nested, with the keys, numbers, nulls and enum strings a renderer
  // reads beside the prose.
  return {
    kind: 'weekly_read', version: 3, status: 'ready', sentiment: 'negative',
    lines: [{ body: `One wrote "${said}", and others agreed.`, basedOn: ['o1'], videos: 4 }, { body: 'Price came up less.', basedOn: [], videos: null }],
    quote: { ref: 'e:11111111-1111-4111-8111-111111111111', text: '' },
  }
}

function rowsFor(spec: ProseTable, said: string, client: string, n: number) {
  const key = Object.fromEntries(spec.key.map((k) => [k, k === 'id' ? `${spec.table}-${n}` : `${k}-${n}`]))
  return { ...key, client_id: client, ...Object.fromEntries(spec.columns.map((c) => [c, carrying(c, said)])) }
}

const has = (v: unknown, s: string) => JSON.stringify(v).includes(s)

describe('every table of analysis prose is scrubbed of the erased words, and only of them', () => {
  it.each(ANALYSIS_PROSE_TABLES.map((s) => [s.table, s] as const))('%s', async (_name, spec) => {
    const tables = {
      [spec.table]: [
        rowsFor(spec, ERASED, 'c1', 1),
        rowsFor(spec, OTHER, 'c1', 2),
        // Another workspace holding the same sentence is not this request's.
        rowsFor(spec, ERASED, 'c2', 3),
      ],
    }
    const db = fakeDb(tables)
    // Before: the erasure's own workspace holds the words in every column.
    for (const c of spec.columns) expect(has(tables[spec.table][0][c as keyof (typeof tables)[string][0]], ERASED), `${spec.table}.${c} before`).toBe(true)

    const r = await scrubStoredProse(db.client as never, spec, ['c1'], [ERASED], { apply: true })

    expect(r.rows).toBe(1)
    const [mine, other, elsewhere] = tables[spec.table]
    // After: none of its columns does, each carries the marker, and its shape
    // (every key, number, null and enum) is what it was.
    for (const c of spec.columns) {
      const v = (mine as Record<string, unknown>)[c]
      expect(has(v, ERASED), `${spec.table}.${c} after`).toBe(false)
      expect(has(v, ERASED_WORDS), `${spec.table}.${c} marker`).toBe(true)
      expect(JSON.stringify(v)).toBe(JSON.stringify(carrying(c, ERASED_WORDS)))
    }
    expect(other).toEqual(rowsFor(spec, OTHER, 'c1', 2))
    expect(elsewhere).toEqual(rowsFor(spec, ERASED, 'c2', 3))
    // One update, keyed by the table's own key.
    const updates = db.calls.filter((c) => c.op === 'update')
    expect(updates).toHaveLength(1)
    expect(updates[0].filters).toEqual(spec.key.map((k) => `${k}=${(mine as Record<string, unknown>)[k]}`))
  })

  it('is idempotent: a second run finds nothing and writes nothing', async () => {
    const spec = ANALYSIS_PROSE_TABLES.find((s) => s.table === 'week_reads')!
    const db = fakeDb({ week_reads: [rowsFor(spec, ERASED, 'c1', 1)] })
    expect((await scrubStoredProse(db.client as never, spec, ['c1'], [ERASED], { apply: true })).rows).toBe(1)
    expect((await scrubStoredProse(db.client as never, spec, ['c1'], [ERASED], { apply: true })).rows).toBe(0)
    expect(db.calls.filter((c) => c.op === 'update')).toHaveLength(1)
  })

  it('counts and writes nothing on a dry run, and hands back the scrubbed rows\' keys', async () => {
    const spec = ANALYSIS_PROSE_TABLES.find((s) => s.table === 'report_snapshots')!
    const db = fakeDb({ report_snapshots: [rowsFor(spec, ERASED, 'c1', 1), rowsFor(spec, OTHER, 'c1', 2)] })
    const r = await scrubStoredProse(db.client as never, spec, ['c1'], [ERASED], { apply: false })
    expect(r).toEqual({ rows: 1, keys: [{ id: 'report_snapshots-1' }] })
    expect(db.calls.filter((c) => c.op === 'update')).toEqual([])
  })

  it('reads nothing where the table is not in this database', async () => {
    const spec = ANALYSIS_PROSE_TABLES.find((s) => s.table === 'client_statement_readings')!
    const db = fakeDb({})
    expect(await scrubStoredProse(db.client as never, spec, ['c1'], [ERASED], { apply: true })).toEqual({ rows: 0, keys: [] })
  })

  it('skips a column this database does not have yet and scrubs the rest', async () => {
    const spec = ANALYSIS_PROSE_TABLES.find((s) => s.table === 'report_snapshots')!
    const tables = { report_snapshots: [rowsFor(spec, ERASED, 'c1', 1)] }
    const db = fakeDb(tables)
    // PostgREST's answer to a select naming a column that is not there.
    const client = new Proxy(db.client as object, {
      get(target, key) {
        const from = Reflect.get(target, key)
        if (key !== 'from') return from
        return (table: string) => {
          const b = (from as (t: string) => Record<string, unknown>)(table)
          return new Proxy(b, {
            get(bt, k) {
              const sel = Reflect.get(bt, k)
              if (k !== 'select') return sel
              return (cols: string) => {
                if (!cols.includes('workings')) return (sel as (c: string) => unknown)(cols)
                const failed = { data: null, error: { code: '42703', message: 'column report_snapshots.workings does not exist' } }
                const chain: Record<string, unknown> = { then: (r: (v: unknown) => unknown) => Promise.resolve(failed).then(r) }
                for (const m of ['in', 'limit', 'order', 'range']) chain[m] = () => chain
                return chain
              }
            },
          })
        }
      },
    })
    expect((await scrubStoredProse(client as never, spec, ['c1'], [ERASED], { apply: true })).rows).toBe(1)
    const update = db.calls.find((c) => c.op === 'update')!
    expect(Object.keys(update.values as object).sort()).toEqual(['data', 'title'])
  })
})

describe('the match: whole texts of two words or more', () => {
  it('drops a one-word text and puts the longest first', () => {
    expect(proseNeedles(['Gorgeous!!!', 'rubs raw daily', ERASED, '  rubs raw daily '])).toEqual([ERASED, 'rubs raw daily'])
  })

  it('never erases another person\'s use of a one-word comment', async () => {
    const spec = ANALYSIS_PROSE_TABLES.find((s) => s.table === 'themes')!
    const row = { id: 't1', client_id: 'c1', label: 'Frustration with fit', description: 'Viewers voice frustration with fit', member_themes: ['frustration'] }
    const db = fakeDb({ themes: [{ ...row }] })
    expect((await scrubStoredProse(db.client as never, spec, ['c1'], ['frustration'], { apply: true })).rows).toBe(0)
    expect(db.calls.filter((c) => c.op === 'update')).toEqual([])
  })

  it('keeps a JSON value\'s shape and hands back the same value where nothing matched', () => {
    const v = carrying('data', OTHER)
    expect(scrubJson(v, [ERASED])).toBe(v)
    expect(scrubProseRow({ data: v }, ['data'], [ERASED])).toBeNull()
    const nested = { a: [1, null, true, { b: `x ${ERASED} y`, c: 'negative' }], d: { e: 2 } }
    expect(scrubJson(nested, [ERASED])).toEqual({ a: [1, null, true, { b: `x ${ERASED_WORDS} y`, c: 'negative' }], d: { e: 2 } })
  })
})

// Option 2 (Heinrich, 9 Nov): a scrubbed snapshot's stored files are deleted
// and flagged stale (markSnapshotsStale, the path of steps 7d and 8), AFTER
// its words are gone, so the next download re-renders it clean.
describe('the stored files of a scrubbed snapshot are deleted, and only those', () => {
  const spec = ANALYSIS_PROSE_TABLES.find((s) => s.table === 'report_snapshots')!

  /** The fake database with a Storage bucket that records removals, and can
   *  be told to refuse them. */
  function world(refuse = false) {
    const tables = {
      report_snapshots: [rowsFor(spec, ERASED, 'c1', 1), rowsFor(spec, OTHER, 'c1', 2)],
      artifacts: [
        { id: 'a1', client_id: 'c1', snapshot_id: 'report_snapshots-1', storage_path: 'c1/s1/page-v1.pdf', stale: false },
        { id: 'a2', client_id: 'c1', snapshot_id: 'report_snapshots-1', storage_path: 'c1/s1/old-v1.pdf', stale: true },
        { id: 'a3', client_id: 'c1', snapshot_id: 'report_snapshots-2', storage_path: 'c1/s2/page-v1.pdf', stale: false },
      ],
      week_reads: [rowsFor(ANALYSIS_PROSE_TABLES.find((s) => s.table === 'week_reads')!, ERASED, 'c1', 9)],
    }
    const db = fakeDb(tables)
    const removed: string[] = []
    const storage = {
      from: () => ({
        remove: async (paths: string[]) => {
          if (refuse) return { data: null, error: { message: 'storage is unreachable' } }
          removed.push(...paths)
          return { data: paths, error: null }
        },
      }),
    }
    const client = { ...(db.client as object), storage } as never
    return { tables, db, client, removed }
  }
  const after = (client: never) => async (key: Record<string, unknown>) => { await deleteSnapshotFiles(client, String(key.id)) }

  it('deletes an affected snapshot\'s PDF and flags it to re-render; an unaffected one is kept', async () => {
    const w = world()
    const r = await scrubStoredProse(w.client, spec, ['c1'], [ERASED], { apply: true, after: after(w.client) })
    expect(r.rows).toBe(1)
    // The affected snapshot's live file is gone and its row flagged; its
    // already-stale row is not touched again.
    expect(w.removed).toEqual(['c1/s1/page-v1.pdf'])
    expect(w.tables.artifacts.find((a) => a.id === 'a1')!.stale).toBe(true)
    // The other snapshot's file stays, live.
    expect(w.tables.artifacts.find((a) => a.id === 'a3')!.stale).toBe(false)
    expect(w.removed).not.toContain('c1/s2/page-v1.pdf')
    // The words went first: the snapshot was scrubbed before its file was flagged.
    const order = w.db.calls.filter((c) => c.op === 'update').map((c) => c.table)
    expect(order).toEqual(['report_snapshots', 'artifacts'])
    expect(has(w.tables.report_snapshots[0], ERASED)).toBe(false)
  })

  it('names what it deleted', async () => {
    const w = world()
    expect((await deleteSnapshotFiles(w.client, 'report_snapshots-1')).map((f) => f.storage_path)).toEqual(['c1/s1/page-v1.pdf'])
    expect(await deleteSnapshotFiles(w.client, 'no-such-snapshot')).toEqual([])
  })

  it('a failed delete is reported, the snapshot is put back for a re-run, and the next scrub still runs', async () => {
    const w = world(true)
    const logged: string[] = []
    const outcome = await runErasure({
      suppress: { name: 'suppression', run: async () => {} },
      scrubs: [
        { name: 'stored prose: report_snapshots', run: async () => { await scrubStoredProse(w.client, spec, ['c1'], [ERASED], { apply: true, after: after(w.client) }) } },
        { name: 'stored prose: week_reads', run: async () => { await scrubStoredProse(w.client, ANALYSIS_PROSE_TABLES.find((s) => s.table === 'week_reads')!, ['c1'], [ERASED], { apply: true }) } },
      ],
      erase: { name: 'delete the comments', run: async () => { throw new Error('must not run') } },
    }, (line) => logged.push(line))
    expect(outcome).toEqual({ failed: ['stored prose: report_snapshots'], erased: false })
    // Reported, naming the snapshot and the file it could not delete.
    expect(logged.join('\n')).toContain('report_snapshots-1')
    expect(logged.join('\n')).toContain('c1/s1/page-v1.pdf')
    expect(logged.join('\n')).toContain('storage is unreachable')
    expect(w.removed).toEqual([])
    // Put back as it was, so a re-run finds it by its words and tries again.
    expect(w.tables.report_snapshots[0]).toEqual(rowsFor(spec, ERASED, 'c1', 1))
    // The next scrub ran.
    expect(has(w.tables.week_reads[0], ERASED)).toBe(false)
    expect(unfinishedMessage(outcome)).toContain('NOT deleted')
  })

  it('a dry run deletes and flags nothing, and lists what it would delete', async () => {
    const w = world()
    const r = await scrubStoredProse(w.client, spec, ['c1'], [ERASED], { apply: false, after: after(w.client) })
    expect(w.removed).toEqual([])
    expect(w.db.calls.filter((c) => c.op === 'update')).toEqual([])
    // (The fake hands back whole rows, whatever is selected.)
    expect((await filesOfSnapshots(w.client, r.keys.map((k) => String(k.id)))).map((f) => f.id)).toEqual(['a1'])
  })
})
