import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { briefFixture } from '../../../components/briefs/fixture'
import { isBriefSnapshotId, storeBriefSet, type MonthlyBriefRow } from './store'
import { BRIEF_ROLES, isMonthlyBriefData, storedBrief, type MonthlyBriefData } from './types'

// The month's set as stored: one snapshot per (client, month, role), however
// many times the compose step runs, and nothing a tenant's session reads that
// is the operator's (what a brief held, what it cost). The database is a few
// arrays: what is under test is which rows exist afterwards.

interface Row { [k: string]: unknown }

function fakeDb() {
  const tables: Record<string, Row[]> = { report_snapshots: [], artifacts: [], monthly_briefs: [] }
  let next = 0
  const path = (row: Row, col: string): unknown => {
    const m = /^(\w+)((?:->\w+)*)->>(\w+)$/.exec(col)
    if (!m) return row[col]
    let v = row[m[1]] as Row | undefined
    for (const k of m[2].split('->').filter(Boolean)) v = v?.[k] as Row | undefined
    return v?.[m[3]]
  }
  const from = (table: string) => {
    const filters: [string, unknown][] = []
    let op: 'select' | 'update' | 'delete' | 'insert' | 'upsert' = 'select'
    let payload: Row | Row[] | null = null
    const rows = () => tables[table].filter((r) => filters.every(([c, v]) => path(r, c) === v || (Array.isArray(v) && v.includes(path(r, c)))))
    const run = () => {
      if (op === 'update') { for (const r of rows()) Object.assign(r, payload); return { data: null, error: null } }
      if (op === 'delete') { const gone = new Set(rows()); tables[table] = tables[table].filter((r) => !gone.has(r)); return { data: null, error: null } }
      if (op === 'insert') { const r = { id: `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`, created_at: `2026-10-05T00:00:${String(next).padStart(2, '0')}Z`, ...(payload as Row) }; tables[table].push(r); return { data: r, error: null } }
      if (op === 'upsert') {
        for (const p of payload as Row[]) {
          const at = tables[table].find((r) => r.client_id === p.client_id && r.month === p.month && r.role === p.role)
          if (at) Object.assign(at, p)
          else tables[table].push({ ...p })
        }
        return { data: null, error: null }
      }
      return { data: rows().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))), error: null }
    }
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => { filters.push([c, v]); return q },
      in: (c: string, v: unknown[]) => { filters.push([c, v]); return q },
      order: () => q,
      limit: (n: number) => Promise.resolve({ ...run(), data: (run().data as Row[]).slice(0, n) }),
      single: () => Promise.resolve(run()),
      update: (p: Row) => { op = 'update'; payload = p; return q },
      delete: () => { op = 'delete'; return q },
      insert: (p: Row) => { op = 'insert'; payload = p; return q },
      upsert: (p: Row[]) => { op = 'upsert'; payload = p; return Promise.resolve(run()) },
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    }
    return q
  }
  const storage = { from: () => ({ remove: async () => ({ error: null }) }) }
  return { db: { from, storage } as unknown as SupabaseClient, tables }
}

const SEP = '2026-09-01'
const set = (thin: readonly string[] = []): MonthlyBriefData[] => BRIEF_ROLES.map((role) => {
  const d = { ...briefFixture(role), month: SEP, held: [{ what: 'also: an idea', reason: 'no brief printed it as a finding' }], costUsd: 0.42 }
  return thin.includes(role) ? { ...d, findings: [], sections: [] } : d
})
const store = (db: SupabaseClient, briefs: MonthlyBriefData[]) =>
  storeBriefSet(db, { clientId: 'client-1', runId: 'run-oct', month: SEP, asOf: '2026-10-05T06:00:00Z', briefs, costUsd: { sales: 0.6 } })

describe('storeBriefSet', () => {
  it('stores each printing brief once per (client, month, role): a retried compose rewrites, never adds', async () => {
    const { db, tables } = fakeDb()
    const first = await store(db, set())
    expect(tables.report_snapshots).toHaveLength(4)
    tables.artifacts.push({ id: 'a1', snapshot_id: first[0].snapshot_id, storage_path: 'p', stale: false })
    const again = await store(db, set())
    expect(tables.report_snapshots).toHaveLength(4)
    expect(again.map((r) => r.snapshot_id)).toEqual(first.map((r) => r.snapshot_id))
    expect(tables.monthly_briefs).toHaveLength(4)
    // The PDF printed from the first is printed again on the next download.
    expect(tables.artifacts[0].stale).toBe(true)
  })

  it('a role that is thin on the retry loses the snapshot the first attempt stored', async () => {
    const { db, tables } = fakeDb()
    await store(db, set())
    const rows = await store(db, set(['content']))
    expect(tables.report_snapshots).toHaveLength(3)
    expect(rows.find((r) => r.role === 'content')).toMatchObject({ status: 'thin', snapshot_id: null })
    const named = new Set(tables.monthly_briefs.map((r) => r.snapshot_id).filter(Boolean))
    expect(tables.report_snapshots.every((s) => named.has(s.id))).toBe(true)
  })

  it('keeps what a brief held and what it cost out of the snapshot a tenant reads, in the ledger', async () => {
    const { db, tables } = fakeDb()
    const rows: MonthlyBriefRow[] = await store(db, set())
    for (const s of tables.report_snapshots) {
      expect(s.data).not.toHaveProperty('held')
      expect(s.data).not.toHaveProperty('costUsd')
      expect(isMonthlyBriefData(s.data)).toBe(true)
    }
    expect(rows[0]).toMatchObject({ role: 'sales', cost_usd: 0.6, held: [{ what: 'also: an idea', reason: 'no brief printed it as a finding' }] })
    expect(tables.monthly_briefs.every((r) => Array.isArray(r.held) && (r.held as unknown[]).length === 1)).toBe(true)
  })
})

describe('the stored brief and its PDF door', () => {
  it('storedBrief drops only the operator\'s fields', () => {
    const d = { ...briefFixture('sales'), held: [{ what: 'x', reason: 'y' }], costUsd: 1 }
    const s = storedBrief(d)
    expect(Object.keys(s).sort()).toEqual(Object.keys(d).filter((k) => k !== 'held' && k !== 'costUsd').sort())
  })

  it('answers only a snapshot id', () => {
    expect(isBriefSnapshotId('393b95df-705c-4cd0-9654-a5a92327b4bf')).toBe(true)
    for (const x of ['', 'abc', '393b95df-705c-4cd0-9654-a5a92327b4bf.pdf', "1' or '1'='1", '393b95df705c4cd09654a5a92327b4bf']) expect(isBriefSnapshotId(x)).toBe(false)
  })
})
