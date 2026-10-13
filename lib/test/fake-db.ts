/**
 * A table-driven stand-in for the untyped Supabase client, for offline tests
 * that exercise a reader's I/O glue (market-first WP3.9 and WP3.11).
 *
 * WHAT IT ANSWERS. `from(table)` with `select`, `eq`, `neq`, `in`, `is`,
 * `not` (`is`, `in`, `eq`; any other operator throws), `or` (eq / is.null /
 * not.is.null), `gte`, `lte`,
 * `lt`, `order`, `limit`, `range`,
 * `maybeSingle` and `single`, over rows handed in per table; and `rpc(fn,
 * args)` through a function handed in per name. A table the test did not name
 * answers with a PostgREST-shaped "does not exist" error, so a reader's
 * missing-table guard is exercised by leaving the table out. Every call is
 * recorded, so a test can assert what was (and was not) read.
 *
 * NOT A DATABASE. No counts beyond `head: true` over the filtered rows, no
 * ordering beyond one column at a time. It is the smallest thing that lets a
 * loader run end to end without a network.
 *
 * ONE KIND OF JOIN: a flat `name!inner(col, col, alias:col)` embed in a
 * select (no parentheses inside it), where the test hands in a `name` table.
 * The parent's `<name, singular>_id` (`comments` → `comment_id`) names the
 * related row's `id`; the related row's columns are attached under `name`;
 * a parent with no related row is dropped (`!inner`); and every filter on
 * `name.col` (`eq`, `neq`, `in`, `is`, `not`, `or`, `gte`, `lte`, `lt`) reads
 * the attached row, as PostgREST's does. An embed whose table
 * the test did not hand in is left alone (rows that carry it already keep
 * theirs), and so is any nested embed.
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
    let embeds: { name: string; cols: string[] }[] = []

    /** A column's value: a `name.col` filter reads the attached row. */
    const val = (r: Row, col: string): unknown => {
      if (col in r || !col.includes('.')) return r[col]
      const [rel, field] = [col.slice(0, col.indexOf('.')), col.slice(col.indexOf('.') + 1)]
      const o = r[rel]
      const one = Array.isArray(o) ? o[0] : o
      return one && typeof one === 'object' ? (one as Row)[field] : undefined
    }

    /** The parent row with its `!inner` embeds attached, or null where one
     *  has no related row. */
    const attach = (r: Row, byId: Map<string, Map<unknown, Row>>): Row | null => {
      let out = r
      for (const e of embeds) {
        if (e.name in tables) {
          const fk = `${e.name.replace(/s$/, '')}_id`
          const rel = r[fk] == null ? undefined : byId.get(e.name)?.get(r[fk])
          const picked = rel
            ? Object.fromEntries(e.cols.flatMap((c) => {
              if (c === '*') return Object.entries(rel)
              const [alias, col] = c.includes(':') ? c.split(':').map((x) => x.trim()) : [c, c]
              return [[alias, rel[col]]]
            }))
            : null
          out = { ...out, [e.name]: picked }
        }
        if (out[e.name] == null) return null
      }
      return out
    }

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
      const byId = new Map(embeds.filter((e) => e.name in tables).map((e) => [e.name, new Map(tables[e.name].map((x) => [x.id, x] as [unknown, Row]))]))
      let rows = (embeds.length > 0 ? tables[table].map((r) => attach(r, byId)).filter((r): r is Row => r != null) : tables[table])
        .filter((r) => preds.every((p) => p(r)))
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
        embeds = [...(columns ?? '').matchAll(/(\w+)!inner\(([^()]*)\)/g)].map((m) => ({ name: m[1], cols: m[2].split(',').map((c) => c.trim()).filter(Boolean) }))
        head = Boolean(opts?.head)
        wantCount = Boolean(opts?.count)
        return builder
      },
      eq(col: string, v: unknown) { call.filters.push(`${col}=${String(v)}`); preds.push((r) => val(r, col) === v); return builder },
      neq(col: string, v: unknown) { call.filters.push(`${col}!=${String(v)}`); preds.push((r) => val(r, col) !== v); return builder },
      in(col: string, vs: readonly unknown[]) { call.filters.push(`${col} in ${vs.length}`); const set = new Set(vs); preds.push((r) => set.has(val(r, col))); return builder },
      is(col: string, v: unknown) { call.filters.push(`${col} is ${String(v)}`); preds.push((r) => (val(r, col) ?? null) === v); return builder },
      // `not` for the shapes the readers use: `is` (null or a value), `in`
      // over PostgREST's `(a,b,"c")` list and `eq`. Any other operator
      // THROWS rather than filter nothing, so a test cannot pass by a filter
      // the fake ignored (Phase 4 fix check).
      not(col: string, op: string, v: unknown) {
        call.filters.push(`${col} not ${op} ${String(v)}`)
        if (op === 'is') preds.push((r) => (val(r, col) ?? null) !== v)
        else if (op === 'in') {
          const list = new Set(String(v).replace(/^\(|\)$/g, '').split(',').map((x) => x.trim().replace(/^"|"$/g, '')).filter((x) => x !== ''))
          preds.push((r) => !list.has(String(val(r, col))))
        } else if (op === 'eq') preds.push((r) => String(val(r, col)) !== String(v))
        else throw new Error(`fakeDb: not(${col}, ${op}) is not supported`)
        return builder
      },
      // PostgREST's `or`, for the shapes the readers use: comma-separated
      // `col.eq.value`, `col.is.null` and `col.not.is.null`, and an
      // `and(…)` group of those (the lineage read: `lineage_id.eq.X,
      // and(lineage_id.is.null,id.eq.X)`).
      or(expr: string) {
        call.filters.push(`or(${expr})`)
        /** Top-level commas only: a comma inside `and(…)` is the group's. */
        const split = (e: string): string[] => {
          const out: string[] = []
          let depth = 0
          let at = 0
          for (let i = 0; i < e.length; i++) {
            if (e[i] === '(') depth++
            else if (e[i] === ')') depth--
            else if (e[i] === ',' && depth === 0) { out.push(e.slice(at, i)); at = i + 1 }
          }
          out.push(e.slice(at))
          return out
        }
        const term = (t: string): ((r: Row) => boolean) => {
          if (t.startsWith('and(') && t.endsWith(')')) {
            const all = split(t.slice(4, -1)).map(term)
            return (r: Row) => all.every((p) => p(r))
          }
          const [col, ...rest] = t.split('.')
          const op = rest.join('.')
          if (op === 'is.null') return (r: Row) => (val(r, col) ?? null) === null
          if (op === 'not.is.null') return (r: Row) => val(r, col) != null
          if (op.startsWith('eq.')) return (r: Row) => String(val(r, col)) === op.slice(3)
          throw new Error(`fakeDb: or() does not read "${t}"`)
        }
        const parts = split(expr).map(term)
        preds.push((r) => parts.some((p) => p(r)))
        return builder
      },
      gte(col: string, v: string) { call.filters.push(`${col}>=${v}`); preds.push((r) => String(val(r, col)) >= v); return builder },
      lte(col: string, v: string) { call.filters.push(`${col}<=${v}`); preds.push((r) => String(val(r, col)) <= v); return builder },
      lt(col: string, v: string) { call.filters.push(`${col}<${v}`); preds.push((r) => String(val(r, col)) < v); return builder },
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
