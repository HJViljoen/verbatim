// Your moves, Design v2 (depth T7): ONE tenant's loader output, dumped once,
// so the page can be drawn from real data offline (scripts/pages-shots.ts
// `--moves-dump <dir>`, keys moves-v2-ossur and moves-v2-sealand) and its
// figures spot-checked against the database.
//
//   node --env-file=<.env.local> --import tsx scripts/moves-v2-dump.ts --confirm \
//     --client <uuid> --out <dir>/ossur.json [--top]
//
// READ-ONLY, AND IT READS PRODUCTION. One page load (about forty statements:
// the advice, decisions, moves, subjects, the month tables, the plan, the
// conclusions, the cited insights and one quote) and, with `--top`, the
// Dashboard tile's lighter read beside it. It writes nothing to the database.
// It makes one embedding call (the short list's: about seventy advice texts,
// a fraction of a cent). It will not start without `--confirm`, and it
// refuses to read past a probe slower than 3 s (AGENTS.md: production reads
// are serialised and rationed).
//
// The dump is the loader's output as a tenant's owner would see it
// (`canDecide: true`), plus how many statements the tenant holds (the page
// draws them only for the operator while they are held).
//
// THE LEVEL PAGES (levels as pages, 17 Oct): `--view advice:<id>`,
// `--view advice:first` (the first piece waiting, found by the record's own
// three-statement read), `--view move:<id>`, `--view move:first` (the newest
// dated move, one small read), or `--view record`, with `--params
// 'video=<videos.id>'`, `'videos=all'` or `'all=1'` as the pages read them.
// It writes `{ view, data, statements }` for scripts/pages-shots.ts
// (`MOVES_LEVELS_JSON=<file> --only moves-levels-real`) and prints every
// statement the page load made, by table. One page load; the advice page
// makes the short list's embedding call too (cached per server, a fraction of
// a cent), as the root does.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const flag = (name: string, fallback = ''): string => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}

async function main() {
  const clientId = flag('client')
  const out = flag('out')
  if (!args.includes('--confirm') || !clientId || !out) {
    console.error('moves-v2-dump reads PRODUCTION once: --confirm --client <uuid> --out <file.json> [--top] [--view advice:<id|first>|move:<id|first>|record] [--params ...]')
    process.exit(2)
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const started = Date.now()
  const probe = await createClient(url, key).from('clients').select('id').eq('id', clientId).maybeSingle()
  const probeMs = Date.now() - started
  if (probe.error) throw new Error(`probe failed in ${probeMs} ms: ${probe.error.message}`)
  console.log(`Probe: ${probeMs} ms.`)
  if (probeMs > 3_000) {
    console.error('The probe took over 3 s. Wait fifteen minutes.')
    process.exit(3)
  }

  // Imported after the probe: the loader's modules build an OpenAI client on
  // import.
  const { readingHandle } = await import('../lib/reading/read')
  const { loadMovesPage, topMoves } = await import('../lib/pages/v2/moves')
  const { loadStatements } = await import('../lib/pages/moves-statements')
  const view = flag('view')
  if (view) {
    await dumpLevel({ url, key, clientId, out, view, readingHandle })
    return
  }
  const supabase = createClient(url, key)
  const scope = { supabase, clientId, reading: readingHandle(clientId, createClient(url, key)), params: {} }
  const t0 = Date.now()
  const data = await loadMovesPage(scope, { canDecide: true })
  const pageMs = Date.now() - t0
  const statements = await loadStatements(supabase, clientId, { canEdit: false, brand: data?.brand ?? '' })
  let top: unknown = null
  let topMs: number | null = null
  if (args.includes('--top')) {
    const t1 = Date.now()
    top = await topMoves(scope, { canDecide: true })
    topMs = Date.now() - t1
  }
  const file = resolve(process.cwd(), out)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify({ clientId, at: new Date().toISOString(), pageMs, topMs, statements: statements?.statements.length ?? null, data, top }, null, 2)}\n`)
  console.log(`Wrote ${file} (page ${pageMs} ms${topMs != null ? `, tile ${topMs} ms` : ''}).`)
}

/** One level page's loader output, its statements counted by table. */
async function dumpLevel(a: { url: string; key: string; clientId: string; out: string; view: string; readingHandle: (clientId: string, client?: ReturnType<typeof createClient>) => unknown }) {
  const { loadAdvicePage, loadMovePage, loadRecordPage } = await import('../lib/pages/v2/moves-levels-load')
  const counts = new Map<string, number>()
  const counted = (): ReturnType<typeof createClient> => {
    const target = createClient(a.url, a.key)
    return new Proxy(target, {
      get(t, prop, receiver) {
        if (prop === 'from') return (name: string) => { counts.set(`from:${name}`, (counts.get(`from:${name}`) ?? 0) + 1); return t.from(name) }
        if (prop === 'rpc') return (fn: string, ...rest: unknown[]) => { counts.set(`rpc:${fn}`, (counts.get(`rpc:${fn}`) ?? 0) + 1); return (t.rpc as (...x: unknown[]) => unknown)(fn, ...rest) }
        return Reflect.get(t, prop, receiver)
      },
    }) as ReturnType<typeof createClient>
  }
  const params = Object.fromEntries(new URLSearchParams(flag('params')))
  const scope = () => {
    const db = counted()
    return { supabase: db, clientId: a.clientId, reading: a.readingHandle(a.clientId, db) as never, params }
  }
  const [kind, rawId = ''] = a.view.split(':')
  let id = rawId
  if (kind === 'advice' && id === 'first') {
    const record = await loadRecordPage(scope())
    id = record?.groups[0]?.rows[0]?.lineageId ?? ''
    console.log(`advice:first is ${id || 'none'}`)
    counts.clear()
    if (!id) throw new Error('No piece of advice waiting: name one with --view advice:<lineage>.')
  }
  if (kind === 'move' && id === 'first') {
    const res = await createClient(a.url, a.key).from('moves').select('id').eq('client_id', a.clientId).order('declared_at', { ascending: false }).limit(1).maybeSingle()
    id = (res.data as { id?: string } | null)?.id ?? ''
    console.log(`move:first is ${id || 'none'}`)
    if (!id) throw new Error('No dated move: name one with --view move:<id>.')
  }
  const t0 = Date.now()
  const data = kind === 'record' ? await loadRecordPage(scope())
    : kind === 'advice' ? await loadAdvicePage(scope(), id, { canDecide: true })
      : kind === 'move' ? await loadMovePage(scope(), id, { canDecide: true })
        : (() => { throw new Error(`--view ${a.view}: advice:<id|first>, move:<id|first> or record`) })()
  const total = [...counts.values()].reduce((x, y) => x + y, 0)
  console.log(`${kind} page: ${Date.now() - t0} ms, ${total} statements`)
  for (const [k, v] of [...counts.entries()].sort((x, y) => y[1] - x[1])) console.log(`  ${v}  ${k}`)
  const file = resolve(process.cwd(), a.out)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify({ view: kind, at: new Date().toISOString(), statements: total, data }, null, 2)}\n`)
  console.log(`Wrote ${file}.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
