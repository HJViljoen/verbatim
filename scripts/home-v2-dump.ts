// The Dashboard's loader output for ONE tenant, dumped to JSON (depth v2, T8),
// so the page can be drawn from real data offline (`scripts/pages-shots.ts
// --home-dump <dir>`, keys dashboard-ossur and dashboard-sealand) and its
// load measured: every statement counted by table and RPC, the whole load's
// time and each tile's.
//
//   node --env-file=<.env.local> --import tsx scripts/home-v2-dump.ts --confirm \
//     --client <uuid> --out <dir>/ossur.json
//
// THIS IS A PRODUCTION READ: one Dashboard load (every tile's `top<Page>()`,
// the weekly chart, the subjects), read-only, nothing written. Your moves'
// tile makes the short list's one embedding call (about seventy advice
// texts, a fraction of a cent). It will not start without `--confirm`, and it
// probes PostgREST first and refuses to go on past 3 s or on an error
// (AGENTS.md: production reads from agents are serialised and rationed). Take
// the depth-v2 read lock before running it.
//
// TWO CLIENTS, AS THE APP HAS: the session's (here the service role, standing
// in for it) and the reading handle's, so the memo (lib/reading/memo.ts)
// shares exactly what it shares on the app path.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const flag = (n: string): string | null => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null }

async function main() {
  const clientId = flag('client')
  const out = flag('out')
  if (!args.includes('--confirm') || !clientId || !out) {
    console.error('home-v2-dump reads PRODUCTION once: --confirm --client <uuid> --out <file.json> (and hold the depth-v2 read lock)')
    process.exit(2)
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  const started = Date.now()
  const probe = await createClient(url, key).from('clients').select('id').eq('id', clientId).maybeSingle()
  const probeMs = Date.now() - started
  if (probe.error) throw new Error(`probe (PostgREST): ${probe.error.message} (${probeMs} ms): do not read this instance for fifteen minutes`)
  console.log(`Probe (PostgREST): ${probeMs} ms.`)
  if (probeMs > 3_000) throw new Error(`The probe took ${probeMs} ms (the line is 3,000). Wait fifteen minutes.`)

  // EVERY STATEMENT COUNTED, on both clients: each `.from(table)` and each
  // `.rpc(name)`, by name.
  const counts = new Map<string, number>()
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1)
  const counted = (label: string): SupabaseClient => {
    const target = createClient(url, key)
    return new Proxy(target, {
      get(t, prop, receiver) {
        if (prop === 'from') return (name: string) => { bump(`${label} from:${name}`); return t.from(name) }
        if (prop === 'rpc') return (fn: string, ...rest: unknown[]) => { bump(`${label} rpc:${fn}`); return (t.rpc as (...a: unknown[]) => unknown)(fn, ...rest) }
        return Reflect.get(t, prop, receiver)
      },
    }) as SupabaseClient
  }

  // Imported after the probe: the loaders' modules build an OpenAI client on import.
  const { readingHandle } = await import('../lib/reading/read')
  const { startDashboard } = await import('../lib/pages/v2/home')

  const t0 = Date.now()
  const reads = startDashboard({ supabase: counted('session'), clientId, reading: readingHandle(clientId, counted('reading')), canDecide: true })
  const tiles: Record<string, number> = {}
  const timed = async <T,>(name: string, p: Promise<T>): Promise<T> => { const v = await p; tiles[name] = Date.now() - t0; return v }
  const [bar, market, week, voices, products, content, moves, agent] = await Promise.all([
    timed('bar', reads.bar), timed('market', reads.market), timed('week', reads.week), timed('voices', reads.voices),
    timed('products', reads.products), timed('content', reads.content), timed('moves', reads.moves), timed('agent', reads.agent),
  ])
  const ms = Date.now() - t0
  const total = [...counts.values()].reduce((a, b) => a + b, 0)
  console.log(`Dashboard: ${ms} ms, ${total} statements.`)
  console.log(`Tiles settled at (ms): ${Object.entries(tiles).map(([k, v]) => `${k} ${v}`).join(', ')}`)
  for (const [k, v] of [...counts.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${v}  ${k}`)
  const states = { market: market.state, week: week.state, voices: voices.state, products: products.state, content: content.state, moves: moves.state }
  console.log(`Tile reads: ${JSON.stringify(states)}`)

  const file = resolve(out)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify({
    clientId, readAt: new Date().toISOString(), probeMs, ms, statements: total, tiles,
    byStatement: Object.fromEntries(counts),
    data: { bar, market, week, voices, products, content, moves, agent },
  }, null, 2))
  console.log(`Wrote ${file}`)
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
