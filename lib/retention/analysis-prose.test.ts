import { describe, expect, it } from 'vitest'

import { fakeDb } from '../test/fake-db'
import { ANALYSIS_PROSE_TABLES, proseNeedles, scrubJson, scrubProseRow, scrubStoredProse, type ProseTable } from './analysis-prose'
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
    expect(r).toEqual({ rows: 1, keys: [{ id: 'report_snapshots-1', client_id: 'c1' }] })
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

// The snapshots' stored files are put on a pending list just before a
// snapshot's words are scrubbed (lib/retention/snapshot-files.ts), through
// `before`: while the row can still be found by the words.
describe('`before` runs for each carrying row, before its scrub', () => {
  const spec = ANALYSIS_PROSE_TABLES.find((s) => s.table === 'report_snapshots')!

  it('sees the row as it was, with its workspace, and only rows that carry the words', async () => {
    const tables = { report_snapshots: [rowsFor(spec, ERASED, 'c1', 1), rowsFor(spec, OTHER, 'c1', 2)] }
    const db = fakeDb(tables)
    const seen: { id: unknown; client: unknown; carried: boolean }[] = []
    await scrubStoredProse(db.client as never, spec, ['c1'], [ERASED], {
      apply: true,
      before: async (row) => { seen.push({ id: row.id, client: row.client_id, carried: has(tables.report_snapshots[0], ERASED) }) },
    })
    expect(seen).toEqual([{ id: 'report_snapshots-1', client: 'c1', carried: true }])
    expect(has(tables.report_snapshots[0], ERASED)).toBe(false)
  })

  it('a `before` that throws leaves the row as it was, so a re-run finds it, and fails the call', async () => {
    const tables = { report_snapshots: [rowsFor(spec, ERASED, 'c1', 1)] }
    const db = fakeDb(tables)
    await expect(scrubStoredProse(db.client as never, spec, ['c1'], [ERASED], { apply: true, before: async () => { throw new Error('cannot record') } })).rejects.toThrow('cannot record')
    expect(tables.report_snapshots[0]).toEqual(rowsFor(spec, ERASED, 'c1', 1))
  })

  it('is not run on a dry run', async () => {
    const db = fakeDb({ report_snapshots: [rowsFor(spec, ERASED, 'c1', 1)] })
    let ran = false
    await scrubStoredProse(db.client as never, spec, ['c1'], [ERASED], { apply: false, before: async () => { ran = true } })
    expect(ran).toBe(false)
  })
})

describe('whole documents are read in small pages', () => {
  it('a snapshot, a read, a summary: 50 rows a page; everything else the default', () => {
    const small = ANALYSIS_PROSE_TABLES.filter((s) => s.pageSize).map((s) => [s.table, s.pageSize])
    expect(small).toEqual([
      ['run_summary', 50], ['consumer_profiles', 50], ['week_reads', 50], ['client_statement_readings', 50],
      ['monthly_briefs', 50], ['report_snapshots', 50], ['reports', 50],
    ])
  })

  it('pages through every row in order of the key, so none is missed or read twice', async () => {
    const spec = ANALYSIS_PROSE_TABLES.find((s) => s.table === 'week_reads')!
    const rows = Array.from({ length: 123 }, (_, i) => rowsFor(spec, i % 2 ? ERASED : OTHER, 'c1', 1000 + i))
    const db = fakeDb({ week_reads: rows })
    const r = await scrubStoredProse(db.client as never, spec, ['c1'], [ERASED], { apply: false })
    expect(r.rows).toBe(61)
    const pages = db.calls.filter((c) => c.table === 'week_reads' && c.op === 'select').length
    expect(pages).toBe(1 + 3) // the probe, then 50 + 50 + 23
  })
})
