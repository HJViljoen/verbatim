// Market's loader output for ONE tenant, dumped to JSON (depth v2, T3), so the
// page can be drawn from real data offline (`MARKET_V2_JSON=<file>
// scripts/pages-shots.ts --only market-v2-real`) and its figures checked
// against the database. READ-ONLY: it calls `topMarket` (to learn the week's
// lead) and then `loadMarket` once, with that lead's panel open; it writes
// nothing to the database and spends no model or Apify money.
//
//   OPENAI_API_KEY=dummy node --env-file=<.env.local> --import tsx \
//     scripts/market-v2-dump.ts --confirm --client <uuid> --out <file.json> \
//     [--params 'period=month&conv=<id>&at=top'] [--no-open]
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
import { loadMarket, marketParams, topMarket } from '../lib/pages/v2/market'

const args = process.argv.slice(2)
const flag = (n: string): string | null => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : null }

async function main() {
  if (!args.includes('--confirm')) throw new Error('A production read: pass --confirm (and hold the depth-v2 read lock).')
  const clientId = flag('client')
  const out = flag('out')
  if (!clientId || !out) throw new Error('--client <uuid> --out <file.json>')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const db = createClient(url, key)

  const started = Date.now()
  const probe = await db.from('clients').select('id').eq('id', clientId).maybeSingle()
  const probeMs = Date.now() - started
  if (probe.error) throw new Error(`probe: ${probe.error.message} (${probeMs} ms): do not read this instance for fifteen minutes`)
  console.log(`Probe (PostgREST): ${probeMs} ms.`)
  if (probeMs > 3_000) throw new Error(`The probe took ${probeMs} ms (the line is 3,000). Wait fifteen minutes.`)

  const raw = Object.fromEntries(new URLSearchParams(flag('params') ?? ''))
  const t0 = Date.now()
  let conv: string | undefined = raw.conv
  if (!conv && !args.includes('--no-open') && (raw.period ?? 'week') === 'week') {
    const top = await topMarket({ supabase: db, clientId, reading: readingHandle(clientId, db) })
    const lead = top?.hero ? (top.hero.kind === 'flag' ? top.hero.card.conv?.id : top.hero.conv.id) : null
    console.log(`topMarket: ${Date.now() - t0} ms; lead ${lead ?? 'none'}`)
    writeFileSync(resolve(out.replace(/\.json$/, '.top.json')), JSON.stringify(top, null, 2))
    conv = lead ?? undefined
  }
  const params = marketParams({ ...raw, ...(conv ? { conv, at: raw.at ?? 'top' } : {}) })
  const t1 = Date.now()
  const data = await loadMarket({ supabase: db, clientId, reading: readingHandle(clientId, db), params })
  console.log(`loadMarket: ${Date.now() - t1} ms`)
  writeFileSync(resolve(out), JSON.stringify(data, null, 2))
  console.log(`Wrote ${resolve(out)}`)
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
