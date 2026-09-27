import type { SupabaseClient } from '@supabase/supabase-js'

// An in-memory stand-in for the admin client, for the deploy-4 run steps'
// offline tests (lib/pipeline/*-step tests; AGENTS.md: offline only, no new
// dependency). It answers the PostgREST shapes the steps use: select with eq,
// in, gte, lt, lte, gt, is, overlaps, order, limit, range, maybeSingle; insert and
// upsert (on a key list); update ... eq; and rpc through handlers. A table not
// in `tables` answers the way PostgREST answers a missing migration
// ("Could not find the table ... in the schema cache", PGRST205), and an rpc
// with no handler the way a missing function does (PGRST202). Every write is
// recorded in `writes`, in order.

type Row = Record<string, unknown>
type Filter = (r: Row) => boolean

export interface FakeAdmin {
  client: SupabaseClient
  tables: Record<string, Row[]>
  writes: { table: string; op: 'insert' | 'upsert' | 'update'; rows: Row[] }[]
  rpcCalls: { fn: string; params: Row }[]
}

export function fakeAdmin(init: {
  tables: Record<string, object[]>
  rpc?: Record<string, (params: Row) => object[] | { error: { code?: string; message: string } }>
  /** Table name → an error every insert or upsert into it returns (a guard's refusal). */
  refuse?: Record<string, (rows: Row[]) => { code?: string; message: string } | null>
}): FakeAdmin {
  const tables = init.tables as Record<string, Row[]>
  const writes: FakeAdmin['writes'] = []
  const rpcCalls: FakeAdmin['rpcCalls'] = []
  const missingTable = (t: string) => ({ code: 'PGRST205', message: `Could not find the table 'public.${t}' in the schema cache` })
  const cmp = (a: unknown, b: unknown) => String(a ?? '').localeCompare(String(b ?? ''))
  // An array filter's value: an array, or a Postgres array literal of quoted
  // elements ('{"a","b"}', lib/brands/rival-searches.ts pgTextArray).
  const arrayOf = (v: unknown): string[] => Array.isArray(v)
    ? v.map(String)
    : [...String(v).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, '$1'))

  function query(table: string) {
    const filters: Filter[] = []
    const orders: { col: string; asc: boolean }[] = []
    let lim: number | null = null
    let from = 0
    let to = Number.POSITIVE_INFINITY
    let op: 'select' | 'update' = 'select'
    let patch: Row = {}
    const result = () => {
      if (!(table in tables)) return { data: null, error: missingTable(table) }
      let rows = tables[table].filter((r) => filters.every((f) => f(r)))
      if (op === 'update') {
        for (const r of rows) Object.assign(r, patch)
        writes.push({ table, op: 'update', rows: rows.map((r) => ({ ...r })) })
        return { data: rows, error: null }
      }
      for (const o of [...orders].reverse()) rows = [...rows].sort((a, b) => (o.asc ? 1 : -1) * cmp(a[o.col], b[o.col]))
      rows = rows.slice(from, Number.isFinite(to) ? to + 1 : undefined)
      if (lim != null) rows = rows.slice(0, lim)
      return { data: rows.map((r) => ({ ...r })), error: null }
    }
    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v || String(r[c]).slice(0, 10) === String(v) && String(v).length === 10); return b },
      neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return b },
      in: (c: string, vs: unknown[]) => { filters.push((r) => vs.some((v) => r[c] === v || String(r[c]).slice(0, 10) === String(v))); return b },
      gte: (c: string, v: unknown) => { filters.push((r) => cmp(r[c], v) >= 0); return b },
      gt: (c: string, v: unknown) => { filters.push((r) => cmp(r[c], v) > 0); return b },
      lt: (c: string, v: unknown) => { filters.push((r) => cmp(r[c], v) < 0); return b },
      lte: (c: string, v: unknown) => { filters.push((r) => cmp(r[c], v) <= 0); return b },
      is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return b },
      overlaps: (c: string, v: unknown) => { const want = new Set(arrayOf(v)); filters.push((r) => Array.isArray(r[c]) && (r[c] as unknown[]).some((x) => want.has(String(x)))); return b },
      not: (c: string, o: string, v: unknown) => { filters.push((r) => !(o === 'is' ? (r[c] ?? null) === v : r[c] === v)); return b },
      order: (col: string, o?: { ascending?: boolean }) => { orders.push({ col, asc: o?.ascending !== false }); return b },
      limit: (n: number) => { lim = n; return b },
      range: (a: number, z: number) => { from = a; to = z; return Promise.resolve(result()) },
      maybeSingle: () => Promise.resolve((() => { const r = result(); return { data: r.data?.[0] ?? null, error: r.error } })()),
      single: () => Promise.resolve((() => { const r = result(); return { data: r.data?.[0] ?? null, error: r.error } })()),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej),
      update: (p: Row) => { op = 'update'; patch = p; return b },
    }
    return b
  }

  function write(table: string, op: 'insert' | 'upsert', input: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    const rows = (Array.isArray(input) ? input : [input]).map((r) => ({ ...r }))
    const run = () => {
      if (!(table in tables)) return { data: null, error: missingTable(table) }
      const refused = init.refuse?.[table]?.(rows) ?? null
      if (refused) return { data: null, error: refused }
      const keys = opts?.onConflict?.split(',').map((k) => k.trim()) ?? null
      // What the statement returns: every row it wrote, and not a duplicate
      // an ON CONFLICT DO NOTHING (ignoreDuplicates) skipped.
      const returned: Row[] = []
      for (const r of rows) {
        const at = keys ? tables[table].findIndex((h) => keys.every((k) => String(h[k]) === String(r[k]))) : -1
        if (at >= 0) {
          if (op === 'upsert' && !opts?.ignoreDuplicates) { tables[table][at] = { ...tables[table][at], ...r }; returned.push(r) }
        } else { tables[table].push(r); returned.push(r) }
      }
      writes.push({ table, op, rows })
      return { data: returned, error: null }
    }
    const done = Promise.resolve().then(run)
    return { select: () => done, then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => done.then(res, rej) }
  }

  const client = {
    from: (table: string) => ({
      ...query(table),
      insert: (rows: Row | Row[]) => write(table, 'insert', rows),
      upsert: (rows: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => write(table, 'upsert', rows, opts),
      update: (p: Row) => query(table).update(p),
    }),
    rpc: (fn: string, params: Row) => {
      rpcCalls.push({ fn, params })
      const h = init.rpc?.[fn]
      const all = (): { data: Row[] | null; error: unknown } => {
        if (!h) return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn} in the schema cache` } }
        const out = h(params)
        return Array.isArray(out) ? { data: out as Row[], error: null } : { data: null, error: out.error }
      }
      let from = 0
      let to = Number.POSITIVE_INFINITY
      const b = {
        order: () => b,
        range: (a: number, z: number) => { from = a; to = z; return Promise.resolve((() => { const r = all(); return r.data ? { data: r.data.slice(from, to + 1), error: null } : r })()) },
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(all()).then(res, rej),
      }
      return b
    },
  } as unknown as SupabaseClient
  return { client, tables, writes, rpcCalls }
}
