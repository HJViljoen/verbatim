import { describe, expect, it } from 'vitest'

import type { ConfigActor } from '../config-log'
import {
  dueRows,
  effectiveMonth,
  pendingByField,
  queuedByWords,
  queuedMessage,
  queuedPatch,
  queueLines,
  queueRows,
  queueSummary,
  queueTrackingEdit,
  sameValue,
  type QueuedRow,
} from './queue'

// Queued tracking edits (plan §2.10 D5, decision I, WP3.10). Sealand's search
// set as it stands (the preview's "The search set", 22 terms since 20 Sep).

const ACTOR: ConfigActor = { kind: 'user', user_id: 'u-1', label: 'daniela@sealand.example · queued for the 1st', at: '2026-11-22T09:00:00Z' }
const STORED = {
  brand_keywords: ['sealand gear', '#sealandgear', 'sealand bag'],
  competitor_keywords: ['cotopaxi backpack', 'freitag bag', 'rareform bag', 'frtg', 'north face backpack', 'patagonia black hole', 'fombrand'],
  industry_keywords: ['eco backpack', 'recycled bag', 'sustainable backpack', 'upcycled bag', 'recycled sailcloth', 'sailcloth bag', 'upcycled backpack', 'handmade bag', 'sustainable fashion', 'travel gear', 'made from waste', 'locally made south africa'],
  exclude_terms: ['argentina', 'chile', 'torres del paine', 'ecuador', 'volcano', 'schengen', 'immigration', 'border control', 'hip hop'],
  competitor_names: ['Cotopaxi', 'Freitag', 'Rareform', 'The North Face', 'Patagonia', 'Freedom of Movement', 'Old School'],
  competitor_handles: {},
  own_handles: {},
}

describe('effectiveMonth', () => {
  it('is the 1st of the next month, and never before 1 Jan 2027 (decision I)', () => {
    expect(effectiveMonth('2026-10-14T10:00:00Z')).toBe('2027-01-01')
    expect(effectiveMonth('2026-12-31T23:59:59Z')).toBe('2027-01-01')
    expect(effectiveMonth('2027-01-01T00:00:00Z')).toBe('2027-02-01')
    expect(effectiveMonth('2027-03-15T12:00:00Z')).toBe('2027-04-01')
  })
  it('says the month in the save\'s message', () => {
    expect(queuedMessage('2027-01-01')).toBe('Queued for 1 January 2027. Searches are held still until then so October and November can be compared.')
  })
})

describe('queueRows', () => {
  const now = '2026-11-22T09:00:00Z'
  it('queues only the columns that moved, whole, with the actor and the month', () => {
    const rows = queueRows({
      posted: { ...STORED, industry_keywords: STORED.industry_keywords.filter((t) => t !== 'upcycled bag').concat('carry-on backpack') },
      stored: STORED, pending: [], actor: ACTOR, now,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ field: 'industry_keywords', effective_month: '2027-01-01', queued_by: 'u-1', queued_label: ACTOR.label, queued_at: now })
    expect(rows[0].after).toContain('carry-on backpack')
  })
  it('reads a reorder or a change of case as no edit', () => {
    expect(queueRows({ posted: { brand_keywords: ['Sealand Bag', 'sealand gear', '#sealandgear'] }, stored: STORED, pending: [], actor: ACTOR, now })).toEqual([])
    expect(sameValue({ youtube: 'a', tiktok: 'b' }, { tiktok: 'b', youtube: 'a' })).toBe(true)
  })
  it('compares against what waits, so putting a waiting change back queues the stored value', () => {
    const waiting: QueuedRow = { field: 'brand_keywords', after: ['sealand gear'], effective_month: '2027-01-01', queued_label: 'x', queued_at: '2026-11-01T00:00:00Z' }
    const rows = queueRows({ posted: { brand_keywords: STORED.brand_keywords }, stored: STORED, pending: [waiting], actor: ACTOR, now })
    expect(rows.map((r) => [r.field, r.after])).toEqual([['brand_keywords', STORED.brand_keywords]])
  })
  it('never queues a null: a list is an array, a handle map an object (MF3\'s CHECK)', () => {
    const rows = queueRows({ posted: { exclude_terms: undefined, own_handles: undefined }, stored: { exclude_terms: ['chile'], own_handles: { youtube: 'x' } }, pending: [], actor: ACTOR, now })
    expect(rows.map((r) => r.after)).toEqual([[], {}])
  })
})

describe('the apply\'s pure half', () => {
  const rows: QueuedRow[] = [
    { field: 'industry_keywords', after: ['a'], effective_month: '2027-01-01', queued_label: 'x', queued_at: '2026-10-20T00:00:00Z' },
    { field: 'industry_keywords', after: ['b'], effective_month: '2027-01-01', queued_label: 'x', queued_at: '2026-11-20T00:00:00Z' },
    { field: 'competitor_names', after: ['Cotopaxi'], effective_month: '2027-02-01', queued_label: 'x', queued_at: '2027-01-05T00:00:00Z' },
    { field: 'brand_keywords', after: ['z'], effective_month: '2027-01-01', queued_label: 'x', queued_at: '2026-10-01T00:00:00Z', applied_at: '2027-01-03T00:00:00Z' },
    // A row that names a month before the floor still waits for it.
    { field: 'exclude_terms', after: ['q'], effective_month: '2026-12-01', queued_label: 'x', queued_at: '2026-10-02T00:00:00Z' },
  ]
  it('applies nothing before 1 Jan 2027, whatever a row says', () => {
    expect(dueRows(rows, '2026-12-06T02:00:00Z')).toEqual([])
  })
  it('on the 1st, the waiting rows of months that have started, the newest per field', () => {
    const due = dueRows(rows, '2027-01-03T02:00:00Z')
    expect(due.map((r) => r.field)).toEqual(['industry_keywords', 'industry_keywords', 'exclude_terms'])
    expect(queuedPatch(due)).toEqual({ industry_keywords: ['b'], exclude_terms: ['q'] })
    expect(pendingByField(rows).get('brand_keywords')).toBeUndefined()
  })
})

describe('what the page says', () => {
  it('names each waiting change against what is searched now, and the month', () => {
    const rows: QueuedRow[] = [
      { field: 'industry_keywords', after: [...STORED.industry_keywords.filter((t) => t !== 'upcycled bag'), 'carry-on backpack'], effective_month: '2027-01-01', queued_label: 'daniela@sealand.example · queued for the 1st', queued_at: '2026-11-22T09:00:00Z' },
      { field: 'own_handles', after: { youtube: '@sealandgear' }, effective_month: '2027-01-01', queued_label: 'x', queued_at: '2026-11-23T09:00:00Z' },
    ]
    const lines = queueLines(rows, STORED)
    expect(lines.map((l) => [l.label, l.words])).toEqual([
      ['The category', 'adds carry-on backpack; takes out upcycled bag'],
      ['Your accounts', 'accounts changed'],
    ])
    expect(queueSummary(lines, '2026-11-24T00:00:00Z')).toBe('queued for January: 2 changes')
    expect(queuedByWords(lines[0])).toBe('queued 22 Nov by daniela@sealand.example')
  })
  it('says none yet when nothing waits', () => {
    expect(queueSummary([], '2026-11-24T00:00:00Z')).toBe('queued for January: none yet')
  })
})

// ---- The write, on a stand-in client ------------------------------------------------

function client(reads: Record<string, { data?: unknown; error?: unknown }>, inserts: unknown[][] = [], insertError: unknown = null) {
  const chain = (table: string): unknown => new Proxy(() => {}, {
    get(_t, prop) {
      if (prop === 'then') {
        const r = reads[table] ?? { data: null }
        return (resolve: (v: unknown) => void) => resolve({ data: r.data ?? null, error: r.error ?? null })
      }
      if (prop === 'insert') {
        return (rows: unknown[]) => { inserts.push(rows); return Promise.resolve({ data: null, error: insertError }) }
      }
      return () => chain(table)
    },
  })
  return { from: (table: string) => chain(table) }
}

describe('queueTrackingEdit', () => {
  const now = '2026-11-22T09:00:00Z'
  it('writes the moved columns on the write client, each with the client and the actor', async () => {
    const inserts: unknown[][] = []
    const out = await queueTrackingEdit({
      read: client({ tracking_config_queue: { data: [] }, tracking_configs: { data: STORED } }),
      write: client({}, inserts),
      clientId: 'ac16988e-c4f3-4baf-b388-73895852a554',
      posted: { competitor_names: [...STORED.competitor_names, 'Topo Designs'] },
      derive: (will) => ({ competitor_keywords: [...(will.competitor_keywords as string[]), 'topo designs'] }),
      actor: ACTOR, now,
    })
    expect(out).toEqual({ state: 'queued', month: '2027-01-01', rows: 2 })
    const rows = inserts[0] as { client_id: string; field: string; queued_by: string }[]
    expect(rows.map((r) => r.field)).toEqual(['competitor_keywords', 'competitor_names'])
    expect(rows.every((r) => r.client_id === 'ac16988e-c4f3-4baf-b388-73895852a554' && r.queued_by === 'u-1')).toBe(true)
  })
  it('is unavailable before MF3: the table is not there, so nothing reads as queued', async () => {
    const missing = { message: 'Could not find the table \'public.tracking_config_queue\' in the schema cache', code: 'PGRST205' }
    const inserts: unknown[][] = []
    const out = await queueTrackingEdit({
      read: client({ tracking_config_queue: { error: missing } }), write: client({}, inserts),
      clientId: 'c', posted: { brand_keywords: ['x'] }, actor: ACTOR, now,
    })
    expect(out).toEqual({ state: 'unavailable' })
    expect(inserts).toEqual([])
  })
  it('writes nothing where nothing moved', async () => {
    const inserts: unknown[][] = []
    const out = await queueTrackingEdit({
      read: client({ tracking_config_queue: { data: [] }, tracking_configs: { data: STORED } }), write: client({}, inserts),
      clientId: 'c', posted: { brand_keywords: STORED.brand_keywords }, actor: ACTOR, now,
    })
    expect(out).toEqual({ state: 'unchanged' })
    expect(inserts).toEqual([])
  })
  it('reports a failed write', async () => {
    const out = await queueTrackingEdit({
      read: client({ tracking_config_queue: { data: [] }, tracking_configs: { data: STORED } }), write: client({}, [], { message: 'permission denied' }),
      clientId: 'c', posted: { brand_keywords: ['x'] }, actor: ACTOR, now,
    })
    expect(out).toEqual({ state: 'failed', error: 'permission denied' })
  })
})
