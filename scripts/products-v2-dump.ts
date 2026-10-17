// Your products' loader output for ONE tenant and ONE page, dumped to JSON
// (17 Oct; the level pages, the G4 boards), so the page can be drawn from
// real data offline and its figures checked against the database:
//
//   the root:      PRODUCTS_JSON=<file>       scripts/pages-shots.ts --only products-real
//   a level page:  PRODUCTS_LEVEL_JSON=<file> scripts/pages-shots.ts --only products-levels-real
//
// READ-ONLY: one page load (`loadProducts`, or `loadProductsLevel` for the
// page named by `--view`), plus one root load first where the view names its
// category or product as `first`. It writes nothing to the database and
// spends no model or Apify money.
//
//   OPENAI_API_KEY=dummy node --env-file=<.env.local> --import tsx \
//     scripts/products-v2-dump.ts --confirm --client <uuid> --out <file.json> \
//     [--view root|category:<id>|category:first|product:<category id>/<product id>|product:first] [--params 'month=2026-09']
//
// `category:first` is the root's first column with a video this month (the
// shelf's order); `product:first` the product with the most videos on the
// shelf. `--params 'video=<videos.id>'` or `'videos=all'` on a product, and
// `'unclear=all'` on a category, as the pages' own params do; neither reads
// more.
//
// THIS IS A PRODUCTION READ. One page load, about thirty statements (Össur's
// fixture database: the root 33, a category 30, a product 24; production
// pages more rows past the 1,000 cap). It will not start without `--confirm`,
// and it probes first: the smallest PostgREST read there is, timed, and it
// refuses to go on past 3 s or on an error (AGENTS.md: production reads from
// agents are serialised and rationed). Take the depth-v2 read lock before
// running it. The dump holds commenters' words: keep it local.

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { readingHandle } from '../lib/reading/read'
import { loadProducts, parseProductsParams } from '../lib/pages/v2/products'
import { loadProductsLevel, type LevelAsk } from '../lib/pages/v2/products-levels'

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
  // each `.rpc(name)`, by name. A fresh client per load, so neither load is
  // helped by the other's memo.
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

  const params = parseProductsParams(Object.fromEntries(new URLSearchParams(flag('params') ?? '')))
  const asked = flag('view') ?? 'root'
  // The session is the operator's, as an owner (the Tag controls drawn).
  const base = (db: typeof raw0) => ({ supabase: db, clientId, reading: readingHandle(clientId, db), params, role: 'owner' as const })

  if (asked === 'root') {
    const db = counted()
    const t = Date.now()
    const data = await loadProducts(base(db))
    console.log(`loadProducts: ${Date.now() - t} ms · ${data.state}`)
    report('loadProducts')
    writeFileSync(resolve(out), JSON.stringify(data, null, 2))
    console.log(`Wrote ${resolve(out)}`)
    return
  }

  let ask: LevelAsk | null = null
  if (asked === 'category:first' || asked === 'product:first') {
    const db = counted()
    const root = await loadProducts(base(db))
    report('the root (to find the first)')
    if (asked === 'category:first') {
      const c = root.shelf.find((x) => (x.videos ?? 0) > 0) ?? root.shelf[0]
      if (!c) throw new Error(`No category on the root (${root.state}): name one with --view category:<id>.`)
      ask = { kind: 'category', id: c.id }
    } else {
      const top = root.shelf.flatMap((c) => c.products.map((p) => ({ c, p }))).sort((a, b) => (b.p.videos ?? -1) - (a.p.videos ?? -1))[0]
      if (!top) throw new Error(`No product on the root (${root.state}): name one with --view product:<category id>/<product id>.`)
      ask = { kind: 'product', group: top.c.id, id: top.p.id }
    }
  } else if (asked.startsWith('category:')) {
    ask = { kind: 'category', id: asked.slice('category:'.length) }
  } else if (asked.startsWith('product:')) {
    const [group, id] = asked.slice('product:'.length).split('/')
    if (!group || !id) throw new Error('--view product:<category id>/<product id>')
    ask = { kind: 'product', group, id }
  } else throw new Error(`--view ${asked}: root, category:<id|first> or product:<category id>/<product id>|first`)

  const db = counted()
  const t = Date.now()
  const data = await loadProductsLevel({ ...base(db), ask })
  console.log(`loadProductsLevel (${ask.kind}): ${Date.now() - t} ms · ${data.base.state}${data.missing ? ' · missing' : ''}${data.redirect ? ` · redirect ${data.redirect}` : ''}`)
  report('loadProductsLevel')
  writeFileSync(resolve(out), JSON.stringify(data, null, 2))
  console.log(`Wrote ${resolve(out)}`)
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
