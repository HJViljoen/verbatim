// Dump the Content page's LOADER OUTPUT for one tenant (depth v2, T6), to draw
// it offline with the shots harness (`CONTENT_DUMP=<file> … pages-shots.ts
// --only content-dump`) and to spot-check its figures against the database.
// READ-ONLY: it calls `loadContentPage` (and `topContent`, the Dashboard's
// tile) with the service role, writes JSON to the file you name, spends no
// OpenAI or Apify money and writes nothing to the database.
//
//   node --env-file=.env.local --import tsx scripts/content-dump.ts --confirm \
//     --client <uuid> --out <file.json> [--params 'period=month&idea=1']
//
// ONE PAGE LOAD A RUN, AND .env.local IS PRODUCTION. A Content load is about
// thirty statements (the reply queue's four chunked reads are most of them).
// It will not start without `--confirm`, and it probes the instance first and
// refuses to run if that probe takes over 3 s or errors (AGENTS.md: production
// reads from agents are serialised and rationed; take the shared lock first).

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { createClient } from '@supabase/supabase-js'

import { readingHandle } from '../lib/reading/read'
import { loadContentPage, topContent } from '../lib/pages/v2/content'

const args = process.argv.slice(2)
const flag = (name: string, fallback = ''): string => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}

async function main(): Promise<void> {
  const clientId = flag('client')
  const out = flag('out')
  if (!clientId || !out) throw new Error('usage: content-dump.ts --confirm --client <uuid> --out <file.json> [--params "period=month"]')
  if (!args.includes('--confirm')) throw new Error('refusing to read production without --confirm')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (--env-file)')
  const admin = createClient(url, key, { auth: { persistSession: false } })

  // The probe: one trivial read, timed. Slow or failing, nothing else runs.
  const t0 = Date.now()
  const probe = await admin.from('clients').select('id').eq('id', clientId).maybeSingle()
  const probeMs = Date.now() - t0
  if (probe.error || probeMs > 3000) throw new Error(`probe ${probe.error ? `failed: ${probe.error.message}` : `took ${probeMs} ms`}; no production read now`)
  if (!probe.data) throw new Error(`no client ${clientId}`)

  const params = Object.fromEntries(new URLSearchParams(flag('params')))
  const t1 = Date.now()
  const scope = { supabase: admin, clientId, reading: readingHandle(clientId, admin), params }
  const page = await loadContentPage(scope)
  const pageMs = Date.now() - t1
  const t2 = Date.now()
  const top = await topContent({ ...scope, params: {} })
  const topMs = Date.now() - t2

  mkdirSync(dirname(resolve(out)), { recursive: true })
  writeFileSync(resolve(out), JSON.stringify(page, null, 2))
  writeFileSync(resolve(out).replace(/\.json$/, '') + '.top.json', JSON.stringify(top, null, 2))
  console.log(JSON.stringify({ clientId, probeMs, pageMs, topMs, out: resolve(out) }))
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
