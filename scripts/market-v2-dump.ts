// Market's loader output for ONE tenant and ONE page, dumped to JSON (depth
// v2, T3; Market's pages, 17 Oct), so the page can be drawn from real data
// offline (`MARKET_V2_JSON=<file> scripts/pages-shots.ts --only
// market-pages-real` for the top page) and its figures checked against the
// database. READ-ONLY: `loadMarket` once for the page named (`--view`: `top`,
// the default; `week`; `subject:<id>`; `conversation:<id>`, or
// `conversation:lead`, which first calls `topMarket` to learn the week's
// lead); it writes nothing to the database and spends no model or Apify money.
//
//   OPENAI_API_KEY=dummy node --env-file=<.env.local> --import tsx \
//     scripts/market-v2-dump.ts --confirm --client <uuid> --out <file.json> \
//     [--view top|week|subject:<id>|conversation:<id>|conversation:lead] [--params 'period=month']
//
// THIS IS A PRODUCTION READ. One page load, about forty statements. It will not
// start without `--confirm`, and it probes first: the smallest PostgREST read
// there is, timed, and it refuses to go on past 3 s or on an error (AGENTS.md:
// production reads from agents are serialised and rationed). Take the
// depth-v2 read lock before running it.

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { readingHandle } from '../lib/reading/read'
import { loadMarket, marketParams, topMarket, type MarketView } from '../lib/pages/v2/market'

const args = process.argv.slice(2)
const flag = (n: string): string | null => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : null }

async function main() {
  if (!args.includes('--confirm')) throw new Error('A production read: pass --confirm (and hold the depth-v2 read lock).')
  const clientId = flag('client')
  const out = flag('out')
  if (!clientId || !out) throw new Error('--client <uuid> --out <file.json>')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const raw0 = createClient(url, key)
  // EVERY STATEMENT COUNTED: each `.from(table)` (a select page is one) and
  // each `.rpc(name)`, by name, so a load's cost is a number, not a guess. A
  // fresh client per load, so neither load is helped by the other's memo.
  const counts = new Map<string, number>()
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1)
  const counted = (): typeof raw0 => {
    const target = createClient(url, key)
    return new Proxy(target, {
      get(t, prop, receiver) {
        if (prop === 'from') return (name: string) => { bump(`from:${name}`); return t.from(name) }
        if (prop === 'rpc') return (fn: string, ...rest: unknown[]) => { bump(`rpc:${fn}`); return (t.rpc as (...a: unknown[]) => unknown)(fn, ...rest) }
        return Reflect.get(t, prop, receiver)
      },
    }) as typeof raw0
  }
  const report = (label: string) => {
    const total = [...counts.values()].reduce((a, b) => a + b, 0)
    console.log(`${label}: ${total} statements`)
    for (const [k, v] of [...counts.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${v}  ${k}`)
    counts.clear()
  }

  const started = Date.now()
  const probe = await raw0.from('clients').select('id').eq('id', clientId).maybeSingle()
  const probeMs = Date.now() - started
  if (probe.error) throw new Error(`probe: ${probe.error.message} (${probeMs} ms): do not read this instance for fifteen minutes`)
  console.log(`Probe (PostgREST): ${probeMs} ms.`)
  if (probeMs > 3_000) throw new Error(`The probe took ${probeMs} ms (the line is 3,000). Wait fifteen minutes.`)

  const raw = Object.fromEntries(new URLSearchParams(flag('params') ?? ''))
  const t0 = Date.now()
  const asked = flag('view') ?? 'top'
  let view: MarketView = { kind: 'top' }
  if (asked === 'week') view = { kind: 'week' }
  else if (asked.startsWith('subject:')) view = { kind: 'subject', id: asked.slice('subject:'.length) }
  else if (asked.startsWith('conversation:')) {
    let id = asked.slice('conversation:'.length)
    if (id === 'lead') {
      const tdb = counted()
      const top = await topMarket({ supabase: tdb, clientId, reading: readingHandle(clientId, tdb) })
      const lead = top?.hero ? (top.hero.kind === 'flag' ? top.hero.card.conv?.id : top.hero.conv.id) : null
      console.log(`topMarket: ${Date.now() - t0} ms; lead ${lead ?? 'none'}`)
      report('topMarket')
      writeFileSync(resolve(out.replace(/\.json$/, '.top.json')), JSON.stringify(top, null, 2))
      if (!lead) throw new Error('No lead conversation this week: name one with --view conversation:<id>.')
      id = lead
    }
    view = { kind: 'conversation', id }
  } else if (asked !== 'top') throw new Error(`--view ${asked}: top, week, subject:<id> or conversation:<id|lead>`)
  const params = marketParams(raw)
  const t1 = Date.now()
  const db = counted()
  const data = await loadMarket({ supabase: db, clientId, reading: readingHandle(clientId, db), params, view })
  console.log(`loadMarket: ${Date.now() - t1} ms`)
  report('loadMarket')
  writeFileSync(resolve(out), JSON.stringify(data, null, 2))
  console.log(`Wrote ${resolve(out)}`)
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
