// Time every database read a reading page's loader makes, against whatever
// database .env.local points at. READ-ONLY: it calls the page loaders and
// throws their answers away, spends no OpenAI or Apify money, and writes
// nothing.
//
//   node --env-file=.env.local --import tsx scripts/reading-timing.ts
//   … --page "this week" --rounds 3 --client <uuid> --detail 30
//
// WHY THIS IS A SCRIPT AND NOT A SCRATCH FILE. Phase 1 WP23 took the reading
// pages from 7-21 s to 1.6-4.6 s against production, and the whole of that came
// from a table like the one this prints: which reads a page makes, how many of
// them, how long each waited, and how much of the total was one loader waiting
// on another. The number that matters is the READ COUNT, because it is the one
// that does not move when the instance has a bad minute — and it had several
// while the package was measured. Anyone who changes a loader should be able to
// print the same table.
//
// HOW TO READ IT. `total` is the loader's wall clock; `summed` is every read's
// own wait added up. summed/total is how much concurrency the page actually
// got: at 1 the page is a queue, and a page with forty reads and a ratio of ten
// is spending its time well. The first round in a process is always slower
// (TLS, and this instance waking), so ask for two rounds and read the second.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { readingHandle } from '../lib/reading/read'
import { loadOverview } from '../lib/pages/overview'
import { loadWeek } from '../lib/pages/week'
import { loadMarketSurface } from '../lib/pages/market-surface'
import { loadCompetitiveSurface } from '../lib/pages/competitive-surface'
import { loadVoiceSurface } from '../lib/pages/voice-surface'
import { loadSubjectsPage } from '../lib/pages/subjects'

interface Call {
  label: string
  ms: number
  rows: number
}

const calls: Call[] = []

/** The read's own name: the table or function, and the source line that asked.
 *  A page reads `videos` from five places and they are five different
 *  questions, so the call site is part of the identity. */
function callSite(): string {
  const stack = (new Error().stack ?? '').split('\n').slice(2)
  for (const line of stack) {
    const m = line.match(/\((.*\/(?:lib|app|components)\/[^)]+)\)/) ?? line.match(/at (.*\/(?:lib|app|components)\/\S+)/)
    if (m && !m[1].includes('supabase-admin')) return m[1].replace(/^.*\/(lib|app|components)\//, '$1/')
  }
  return '?'
}

type Thenable = { then: (ok?: unknown, err?: unknown) => unknown }

/**
 * Wrap a PostgREST builder so that awaiting it records what it cost.
 *
 * A builder is a thenable that returns a NEW builder from every filter method,
 * so the proxy has to re-wrap whatever each method hands back — and it must not
 * touch `then` until the caller does, or every builder would fire on creation.
 */
function timed(builder: object, label: string): object {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (prop === 'then') {
        const started = Date.now()
        return (onOk?: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
          (value as (ok: unknown, err: unknown) => unknown).call(
            target,
            (res: unknown) => {
              const r = res as { data?: unknown[]; count?: number | null }
              calls.push({ label, ms: Date.now() - started, rows: Array.isArray(r?.data) ? r.data.length : r?.count ?? 0 })
              return onOk ? onOk(res) : res
            },
            onErr,
          )
      }
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          const out = (value as (...a: unknown[]) => unknown).apply(target, args)
          return out && typeof out === 'object' && typeof (out as Thenable).then === 'function'
            ? timed(out as object, label)
            : out
        }
      }
      return value
    },
  })
}

function instrumented(): SupabaseClient {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
  const from = client.from.bind(client)
  const rpc = client.rpc.bind(client)
  const patched = client as unknown as Record<string, unknown>
  patched.from = (table: string) => timed(from(table) as unknown as object, `from ${table} @ ${callSite()}`)
  patched.rpc = (fn: string, params?: Record<string, unknown>) =>
    timed(rpc(fn, params) as unknown as object, `rpc ${fn} @ ${callSite()}`)
  return client
}

const args = process.argv.slice(2)
const flag = (name: string, fallback = ''): string => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}

interface Tenant { id: string; company_name: string }

type Loader = (scope: {
  supabase: SupabaseClient
  clientId: string
  reading: ReturnType<typeof readingHandle>
  params: Record<string, string>
  canEdit: boolean
}) => Promise<unknown>

const PAGES: [string, Loader][] = [
  ['Overview', (s) => loadOverview(s)],
  ['Subjects', (s) => loadSubjectsPage(s)],
  ['Voice', (s) => loadVoiceSurface(s)],
  ['Market', (s) => loadMarketSurface(s)],
  ['Competitive', (s) => loadCompetitiveSurface(s)],
  ['This week', (s) => loadWeek(s)],
]

async function time(name: string, clientId: string, load: Loader, detail: number) {
  calls.length = 0
  // TWO CLIENTS, as a page route has: the session client for `supabase` and a
  // separate service-role client for the reading handle. The reading layer's
  // request memo is keyed on the client object, so sharing one here would
  // report a saving a real page does not get.
  const supabase = instrumented()
  const scope = { supabase, clientId, reading: readingHandle(clientId, instrumented()), params: {}, canEdit: false }
  const started = Date.now()
  let failure: string | null = null
  try {
    await load(scope)
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
  const total = Date.now() - started
  const made = [...calls]
  const summed = made.reduce((a, c) => a + c.ms, 0)
  console.log(`\n=== ${name} · ${total} ms · ${made.length} reads · ${summed} ms summed${failure ? ` · ERROR ${failure}` : ''}`)
  const byShape = new Map<string, { n: number; ms: number; rows: number }>()
  for (const call of made) {
    const held = byShape.get(call.label) ?? { n: 0, ms: 0, rows: 0 }
    byShape.set(call.label, { n: held.n + 1, ms: held.ms + call.ms, rows: held.rows + call.rows })
  }
  const ranked = [...byShape.entries()].sort((a, b) => b[1].ms - a[1].ms)
  for (const [shape, v] of ranked.slice(0, detail)) {
    console.log(`  ${String(v.ms).padStart(7)} ms  x${String(v.n).padStart(3)}  rows ${String(v.rows).padStart(6)}  ${shape}`)
  }
  if (ranked.length > detail) console.log(`  … ${ranked.length - detail} more read shapes`)
  return { name, total, reads: made.length, failure }
}

async function main() {
  const rounds = Number(flag('rounds', '1')) || 1
  const detail = Number(flag('detail', '20')) || 20
  const wantedPage = flag('page').toLowerCase()
  const wantedClient = flag('client')

  const { data, error } = await createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  ).from('clients').select('id, company_name').order('company_name')
  if (error) throw new Error(`clients: ${error.message}`)
  const tenants = ((data ?? []) as Tenant[]).filter((t) => !wantedClient || t.id === wantedClient)

  for (let round = 1; round <= rounds; round++) {
    const summary: { name: string; total: number; reads: number; failure: string | null }[] = []
    for (const tenant of tenants) {
      for (const [page, load] of PAGES) {
        if (wantedPage && wantedPage !== 'all' && page.toLowerCase() !== wantedPage) continue
        summary.push(await time(`${tenant.company_name} · ${page}`, tenant.id, load, detail))
      }
    }
    // The first round in a process pays for TLS and for the instance waking;
    // it is printed so nobody mistakes it for the page's cost.
    const how = round === 1 && rounds > 1 ? 'COLD — TLS and the instance waking' : 'warm'
    console.log(`\n=== SUMMARY (round ${round} of ${rounds}, ${how}) ===`)
    for (const s of summary) {
      console.log(`  ${String(s.total).padStart(7)} ms  ${String(s.reads).padStart(4)} reads  ${s.name}${s.failure ? ` ERROR ${s.failure}` : ''}`)
    }
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  },
)
