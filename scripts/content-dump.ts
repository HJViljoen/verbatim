// Dump the Content page's LOADER OUTPUT for one tenant (depth v2, T6; and
// since 17 Oct each of its level pages), to draw it offline with the shots
// harness and to spot-check its figures against the database. READ-ONLY: it
// calls one loader with the service role, writes JSON to the file you name,
// spends no OpenAI or Apify money and writes nothing to the database.
//
//   OPENAI_API_KEY=dummy node --env-file=.env.local --import tsx scripts/content-dump.ts --confirm \
//     --client <uuid> --out <file.json> [--view root|idea:<id>|idea:first|replies|posts] [--params 'period=month']
//
// THE VIEWS (depth as pages, 17 Oct; the G5 boards):
//   root          the root (`loadContentPage`) and the Dashboard's tile
//                 (`topContent`, beside it as <out>.top.json); drawn with
//                 `CONTENT_DUMP=<file> … pages-shots.ts --only content-dump`.
//   idea:<id>     a post idea's page by its `post_ideas.id` (`loadContentIdea`);
//   idea:first    the root's first idea, learned from the Dashboard's tile
//                 (`topContent`, one light load first, counted apart);
//   replies       the reply list's page (`loadContentReplies`);
//   posts         your posts' page (`loadContentPosts`).
// A level page's dump is `{ view, data }`, drawn by its own page with
// `CONTENT_LEVEL_JSON=<file> … pages-shots.ts --only content-levels-real`.
// `--params` takes the page's own params: `sub=1` on an idea, `period=month`
// or `kind=buy` on the reply list, `all=1` or `post=<videos.id>` on your posts.
//
// ONE PAGE LOAD A RUN, AND .env.local IS PRODUCTION. A level page is fifteen to
// about thirty-five statements (counted and printed, by table). It will not
// start without `--confirm`, and it probes the instance first and refuses to
// run if that probe takes over 3 s or errors (AGENTS.md: production reads from
// agents are serialised and rationed; take the shared lock first).

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { createClient } from '@supabase/supabase-js'

import { readingHandle } from '../lib/reading/read'
import { loadContentPage, topContent } from '../lib/pages/v2/content'
import { loadContentIdea } from '../lib/pages/v2/content-idea'
import { loadContentPosts } from '../lib/pages/v2/content-posts'
import { loadContentReplies } from '../lib/pages/v2/content-replies'

const args = process.argv.slice(2)
const flag = (name: string, fallback = ''): string => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}

async function main(): Promise<void> {
  const clientId = flag('client')
  const out = flag('out')
  const view = flag('view', 'root')
  if (!clientId || !out) throw new Error('usage: content-dump.ts --confirm --client <uuid> --out <file.json> [--view root|idea:<id>|idea:first|replies|posts] [--params "period=month"]')
  if (!/^(root|replies|posts|idea:.+)$/.test(view)) throw new Error(`--view ${view}: root, idea:<id>, idea:first, replies or posts`)
  if (!args.includes('--confirm')) throw new Error('refusing to read production without --confirm')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (--env-file)')
  const admin = createClient(url, key, { auth: { persistSession: false } })

  // EVERY STATEMENT COUNTED (the Market dump's pattern): each `.from(table)`
  // and `.rpc(name)`, by name, on a fresh client per load.
  const counts = new Map<string, number>()
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1)
  const counted = (): typeof admin => {
    const target = createClient(url, key, { auth: { persistSession: false } })
    return new Proxy(target, {
      get(t, prop, receiver) {
        if (prop === 'from') return (name: string) => { bump(`from:${name}`); return t.from(name) }
        if (prop === 'rpc') return (fn: string, ...rest: unknown[]) => { bump(`rpc:${fn}`); return (t.rpc as (...a: unknown[]) => unknown)(fn, ...rest) }
        return Reflect.get(t, prop, receiver)
      },
    }) as typeof admin
  }
  const report = (label: string) => {
    const total = [...counts.values()].reduce((a, b) => a + b, 0)
    console.log(`${label}: ${total} statements`)
    for (const [k, v] of [...counts.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${v}  ${k}`)
    counts.clear()
  }

  // The probe: one trivial read, timed. Slow or failing, nothing else runs.
  const t0 = Date.now()
  const probe = await admin.from('clients').select('id').eq('id', clientId).maybeSingle()
  const probeMs = Date.now() - t0
  if (probe.error || probeMs > 3000) throw new Error(`probe ${probe.error ? `failed: ${probe.error.message}` : `took ${probeMs} ms`}; no production read now`)
  if (!probe.data) throw new Error(`no client ${clientId}`)
  console.log(`Probe (PostgREST): ${probeMs} ms.`)

  const params = Object.fromEntries(new URLSearchParams(flag('params')))
  const scopeOf = (db: typeof admin, p: Record<string, string>) => ({ supabase: db, clientId, reading: readingHandle(clientId, db), params: p })
  mkdirSync(dirname(resolve(out)), { recursive: true })

  if (view === 'root') {
    const t1 = Date.now()
    const page = await loadContentPage(scopeOf(counted(), params))
    console.log(`loadContentPage: ${Date.now() - t1} ms`)
    report('loadContentPage')
    const t2 = Date.now()
    const top = await topContent(scopeOf(counted(), {}))
    console.log(`topContent: ${Date.now() - t2} ms`)
    report('topContent')
    writeFileSync(resolve(out), JSON.stringify(page, null, 2))
    writeFileSync(resolve(out).replace(/\.json$/, '') + '.top.json', JSON.stringify(top, null, 2))
    console.log(`Wrote ${resolve(out)}`)
    return
  }

  let data: unknown
  const t1 = Date.now()
  if (view.startsWith('idea:')) {
    let id = view.slice('idea:'.length)
    if (id === 'first') {
      const top = await topContent(scopeOf(counted(), {}))
      report('topContent (to learn the first idea)')
      if (!top.idea) throw new Error(`No idea on the root (${top.state}): name one with --view idea:<id>.`)
      id = top.idea.id
      console.log(`first idea ${id}`)
    }
    data = await loadContentIdea(scopeOf(counted(), params), id)
  } else if (view === 'replies') {
    data = await loadContentReplies(scopeOf(counted(), params))
  } else {
    data = await loadContentPosts(scopeOf(counted(), params))
  }
  const name = view.startsWith('idea:') ? 'idea' : view
  console.log(`${name}: ${Date.now() - t1} ms`)
  report(name)
  writeFileSync(resolve(out), JSON.stringify({ view: name, data }, null, 2))
  console.log(`Wrote ${resolve(out)}`)
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
