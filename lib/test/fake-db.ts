/**
 * A table-driven stand-in for the untyped Supabase client, for offline tests
 * that exercise a reader's I/O glue (market-first WP3.9 and WP3.11).
 *
 * WHAT IT ANSWERS. `from(table)` with `select`, `eq`, `neq`, `in`, `is`,
 * `not(col, 'is', null)`, `gte`, `lte`, `lt`, `order`, `limit`, `range`,
 * `maybeSingle` and `single`, over rows handed in per table; and `rpc(fn,
 * args)` through a function handed in per name. A table the test did not name
 * answers with a PostgREST-shaped "does not exist" error, so a reader's
 * missing-table guard is exercised by leaving the table out. Every call is
 * recorded, so a test can assert what was (and was not) read.
 *
 * NOT A DATABASE. No joins, no counts beyond `head: true` over the filtered
 * rows, no ordering beyond one column at a time. It is the smallest thing
 * that lets a loader run end to end without a network.
 *
 * AND THE THREE WRITES, for a writer's glue (writing back, the weekly read's
 * send path): `insert(row | rows)` appends to the table (an `id` is made up
 * where the row has none) and hands the rows back through `select` /
 * `single` / `maybeSingle`; `update(patch)` and `delete()` apply to the rows
 * the filters match, when the chain is awaited. Each is recorded with its
 * rows or patch (`FakeCall.values`), so a test can assert what was written.
 */

type Row = Record<string, unknown>

export interface FakeCall {
  table: string
  op: 'select' | 'rpc' | 'insert' | 'update' | 'delete'
  columns?: string
  filters: string[]
  /** The rows an insert wrote, or the patch an update applied. */
  values?: unknown
}

export interface FakeDb {
  client: unknown
  calls: FakeCall[]
}

const missing = (table: string) => ({
  code: '42P01',
  message: `relation "public.${table}" does not exist`,
})

export function fakeDb(
  tables: Record<string, Row[]>,
  rpcs: Record<string, (args: Record<string, unknown>) => Row[] | { error: { code?: string; message: string } }> = {},
): FakeDb {
  const calls: FakeCall[] = []
  let seq = 0

  function query(table: string) {
    const call: FakeCall = { table, op: 'select', filters: [] }
    calls.push(call)
    const preds: ((r: Row) => boolean)[] = []
    let written: Row[] | null = null
    let patch: Row | null = null
    let removing = false
    let orderCol: string | null = null
    let asc = true
    let from = 0
    let to = Number.POSITIVE_INFINITY
    let head = false
    let wantCount = false

    const run = () => {
      if (!(table in tables)) return { data: null, error: missing(table), count: null }
      if (written) return { data: written, error: null, count: null }
      if (patch) {
        const hit = tables[table].filter((r) => preds.every((p) => p(r)))
        for (const r of hit) Object.assign(r, patch)
        return { data: hit, error: null, count: null }
      }
      if (removing) {
        const keep = tables[table].filter((r) => !preds.every((p) => p(r)))
        const gone = tables[table].length - keep.length
        tables[table].splice(0, tables[table].length, ...keep)
        return { data: null, error: null, count: gone }
      }
      let rows = tables[table].filter((r) => preds.every((p) => p(r)))
      if (orderCol) {
        const col = orderCol
        rows = [...rows].sort((a, b) => {
          const x = a[col] as string | number
          const y = b[col] as string | number
          return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1)
        })
      }
      const count = rows.length
      const page = rows.slice(from, Number.isFinite(to) ? to + 1 : undefined)
      return { data: head ? null : page, error: null, count: wantCount ? count : null }
    }

    const builder: Record<string, unknown> = {
      insert(v: Row | Row[]) {
        call.op = 'insert'
        written = (Array.isArray(v) ? v : [v]).map((r) => ({ ...r, id: r.id ?? `fake-${table}-${++seq}` }))
        call.values = written
        if (table in tables) tables[table].push(...written)
        return builder
      },
      update(v: Row) { call.op = 'update'; patch = v; call.values = v; return builder },
      delete() { call.op = 'delete'; removing = true; return builder },
      select(columns?: string, opts?: { count?: string; head?: boolean }) {
        call.columns = columns
        head = Boolean(opts?.head)
        wantCount = Boolean(opts?.count)
        return builder
      },
      eq(col: string, v: unknown) { call.filters.push(`${col}=${String(v)}`); preds.push((r) => r[col] === v); return builder },
      neq(col: string, v: unknown) { call.filters.push(`${col}!=${String(v)}`); preds.push((r) => r[col] !== v); return builder },
      in(col: string, vs: readonly unknown[]) { call.filters.push(`${col} in ${vs.length}`); const set = new Set(vs); preds.push((r) => set.has(r[col])); return builder },
      is(col: string, v: unknown) { call.filters.push(`${col} is ${String(v)}`); preds.push((r) => (r[col] ?? null) === v); return builder },
      not(col: string, op: string, v: unknown) {
        call.filters.push(`${col} not ${op} ${String(v)}`)
        if (op === 'is' && v === null) preds.push((r) => r[col] != null)
        return builder
      },
      gte(col: string, v: string) { call.filters.push(`${col}>=${v}`); preds.push((r) => String(r[col]) >= v); return builder },
      lte(col: string, v: string) { call.filters.push(`${col}<=${v}`); preds.push((r) => String(r[col]) <= v); return builder },
      lt(col: string, v: string) { call.filters.push(`${col}<${v}`); preds.push((r) => String(r[col]) < v); return builder },
      order(col: string, opts?: { ascending?: boolean }) { if (!orderCol) { orderCol = col; asc = opts?.ascending !== false } return builder },
      limit(n: number) { to = from + n - 1; return builder },
      range(a: number, b: number) { from = a; to = b; return Promise.resolve(run()) },
      maybeSingle() { const r = run(); return Promise.resolve({ ...r, data: r.data ? r.data[0] ?? null : null }) },
      single() { const r = run(); return Promise.resolve({ ...r, data: r.data ? r.data[0] ?? null : null }) },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(run()).then(resolve, reject)
      },
    }
    return builder
  }

  const client = {
    from: (table: string) => query(table),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ table: fn, op: 'rpc', filters: Object.keys(args ?? {}) })
      const f = rpcs[fn]
      if (!f) return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn} in the schema cache` } }
      const out = f(args ?? {})
      return Array.isArray(out) ? { data: out, error: null } : { data: null, error: out.error }
    },
  }
  return { client, calls }
}
