// Voices' loader output for ONE tenant and ONE page, dumped to JSON (depth v2,
// T4; Voices' level pages, 17 Oct), so the page can be drawn from real data
// offline (`VOICES_LEVEL_JSON=<file> scripts/pages-shots.ts --only
// voices-levels-real`, beside the page's own G3 board) and its figures checked
// against the database. READ-ONLY: one load of the page named (`--view`:
// `root`, the default; `group:<key>`; `brand:<key, name or competitor:name>`;
// `creator:<platform>/<account>`; or `group:first`, `brand:first`,
// `creator:first`, which first load the root and take its first group, its
// first rival that is counted (else its first rival) and its first creator).
// It writes nothing to the database and spends no model or Apify money.
//
//   OPENAI_API_KEY=dummy node --env-file=<.env.local> --import tsx \
//     scripts/voices-v2-dump.ts --confirm --client <uuid> --out <file.json> \
//     [--view root|group:<key>|brand:<key>|creator:<platform>/<account>|group:first|brand:first|creator:first] \
//     [--params 'month=2026-09&video=<videos.id>&videos=all']
//
// THIS IS A PRODUCTION READ. One page load, about forty statements (a `first`
// view adds the root's, about thirty). It will not start without `--confirm`,
// and it probes first: the smallest PostgREST read there is, timed, and it
// refuses to go on past 3 s or on an error (AGENTS.md: production reads from
// agents are serialised and rationed). Take the depth-v2 read lock before
// running it, and never beside another reader.

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { readingHandle } from '../lib/reading/read'
import { loadVoices, parseVoicesParams } from '../lib/pages/v2/voices'
import { levelParams, loadVoicesBrand, loadVoicesCreator, loadVoicesGroup } from '../lib/pages/v2/voices-levels'

const args = process.argv.slice(2)
const flag = (n: string): string | null => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : null }

/** `<platform>/<account>` as the route's two segments (an account may hold a
 *  slash), or the account alone. */
const creatorSegments = (v: string): string[] => {
  const at = v.indexOf('/')
  return at > 0 ? [v.slice(0, at), v.slice(at + 1)] : [v]
}

async function main() {
  if (!args.includes('--confirm')) throw new Error('A production read: pass --confirm (and hold the depth-v2 read lock).')
  const clientId = flag('client')
  const out = flag('out')
  if (!clientId || !out) throw new Error('--client <uuid> --out <file.json>')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const raw0 = createClient(url, key)
  // EVERY STATEMENT COUNTED: each `.from(table)` and each `.rpc(name)`, by
  // name. A fresh client per load, so neither load is helped by the other's memo.
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
  const asked = flag('view') ?? 'root'
  const load = (db: typeof raw0) => ({ supabase: db, clientId, reading: readingHandle(clientId, db) })
  let view = asked
  if (asked.endsWith(':first')) {
    const t0 = Date.now()
    const rdb = counted()
    const root = await loadVoices({ ...load(rdb), params: parseVoicesParams(raw) })
    report(`root (to find the first): ${Date.now() - t0} ms`)
    const pick = asked.startsWith('group:') ? root.groups.cards[0]?.key
      : asked.startsWith('brand:') ? (root.brands.all.find((r) => !r.you && r.state === 'counted') ?? root.brands.all.find((r) => !r.you))?.brandKey
        : root.creators.rows[0] ? `${root.creators.rows[0].platform}/${root.creators.rows[0].account}` : undefined
    if (!pick) throw new Error(`No ${asked.split(':')[0]} on the root: name one with --view ${asked.split(':')[0]}:<key>.`)
    view = `${asked.split(':')[0]}:${pick}`
    console.log(`first: ${view}`)
  }
  const t1 = Date.now()
  const db = counted()
  const p = levelParams(raw)
  const data = view === 'root' ? await loadVoices({ ...load(db), params: parseVoicesParams(raw) })
    : view.startsWith('group:') ? await loadVoicesGroup({ ...load(db), params: p, key: view.slice('group:'.length) })
      : view.startsWith('brand:') ? await loadVoicesBrand({ ...load(db), params: p, key: view.slice('brand:'.length) })
        : view.startsWith('creator:') ? await loadVoicesCreator({ ...load(db), params: p, segments: creatorSegments(view.slice('creator:'.length)) })
          : null
  if (!data) throw new Error(`--view ${asked}: root, group:<key>, brand:<key>, creator:<platform>/<account>, or group:first, brand:first, creator:first`)
  console.log(`${view}: ${Date.now() - t1} ms`)
  report(view)
  writeFileSync(resolve(out), JSON.stringify(data, null, 2))
  console.log(`Wrote ${resolve(out)}`)
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
