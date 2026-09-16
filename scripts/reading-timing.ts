// Time every database read a reading page's loader makes, against whatever
// database .env.local points at. READ-ONLY: it calls the page loaders and
// throws their answers away, spends no OpenAI or Apify money, and writes
// nothing.
//
//   node --env-file=.env.local --import tsx scripts/reading-timing.ts --confirm
//   … --page "this week" --rounds 2 --client <uuid> --detail 30
//
// THIS IS A READ LOOP AND .env.local IS PRODUCTION. Read the numbers before
// running it: one page load makes 22-64 statements, and the loop is
// rounds x tenants x pages, so the unnarrowed `--rounds 2` is 24 page loads —
// roughly 1,400 statements, issued as fast as the loaders can issue them, by a
// SERVICE-ROLE client with no statement timeout. On 16 September this instance
// was starved twice in one morning by exactly that pattern (several agents
// reading at once, this harness among them) and the live app returned 504s to
// paying users. So:
//
//   * it will not start without `--confirm`;
//   * it probes first — one small read, timed — and REFUSES to run if that
//     takes more than 3 s or errors, because a slow probe is an instance that
//     has nothing to spare (come back in fifteen minutes);
//   * it refuses a plan above `--max-loads` (default 6 page loads). Narrow with
//     `--page` and `--client` rather than raising it; a whole-sweep comparison
//     is a deliberate act and should be typed out as one.
//
// The cheapest useful invocation is one page, one tenant, two rounds, and the
// second round is the one to read: 2 page loads, ~80 statements.
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
  // TWO CLIENT OBJECTS, as a page route has: one for `supabase` and a separate
  // one for the reading handle. That part is not cosmetic — the reading layer's
  // request memo is keyed on the client OBJECT, so sharing one here would
  // report a saving a real page does not get.
  //
  // BUT BOTH CARRY THE SERVICE-ROLE KEY, AND A PAGE'S DO NOT. `supabase` in a
  // route is the session client: the `authenticated` role, under RLS, with
  // statement_timeout = 8s. Here it bypasses both. So this harness measures
  // ROUND TRIPS AND WAVE SHAPE, which is what it was written for, and it cannot
  // see an RLS regression, a missing column grant or a statement that times out
  // for a tenant but not for the service role — including on the discard read,
  // which this package widened on exactly that path. A run that is clean here
  // is not a page that works; open the page.
  //
  // (An anon-key client would not fix it: with no JWT, RLS returns nothing and
  // every loader below would time an empty database.)
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

/** Reads per page load, measured 16 September — for the plan this prints before
 *  it asks to be let through. Overview 39-42, Subjects 22-24, Voice 37-40,
 *  Market 30-31, Competitive 26-30, This week 53-64. */
const READS_PER_LOAD = 40

async function main() {
  const rounds = Number(flag('rounds', '1')) || 1
  const detail = Number(flag('detail', '20')) || 20
  const wantedPage = flag('page').toLowerCase()
  const wantedClient = flag('client')
  const maxLoads = Number(flag('max-loads', '6')) || 6
  const confirmed = args.includes('--confirm')

  if (!confirmed) {
    console.error(
      'reading-timing reads PRODUCTION in a loop (22-64 statements a page load) and will not start without --confirm.\n' +
        'Narrow it first: --page overview --client <uuid> --rounds 2 is 2 loads, ~80 statements.\n' +
        'The header says why: this pattern starved the instance on 16 September and the app returned 504s.',
    )
    process.exit(2)
  }

  // THE PROBE, BEFORE ANYTHING ELSE. The smallest read there is, timed. A slow
  // answer here is not this script's problem to work around — it is an instance
  // with nothing to spare, and the next thing this script would do is ask it
  // for a thousand statements. Stop, and come back in fifteen minutes.
  const probeStarted = Date.now()
  const { data, error } = await createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  ).from('clients').select('id, company_name').order('company_name')
  const probeMs = Date.now() - probeStarted
  if (error) throw new Error(`clients: ${error.message} (the probe failed in ${probeMs} ms — do not read this instance for fifteen minutes)`)
  console.log(`Probe: the client list answered in ${probeMs} ms.`)
  if (probeMs > 3_000) {
    console.error(
      `The probe took ${probeMs} ms (the line is 3,000). This instance has nothing to spare; a timing sweep now is\n` +
        'what takes the app down rather than what measures it. Wait fifteen minutes and probe again.',
    )
    process.exit(3)
  }

  const tenants = ((data ?? []) as Tenant[]).filter((t) => !wantedClient || t.id === wantedClient)
  const pagesPerRound = PAGES.filter(([page]) => !wantedPage || wantedPage === 'all' || page.toLowerCase() === wantedPage).length
  const loads = rounds * tenants.length * pagesPerRound
  console.log(`Plan: ${loads} page loads (${rounds} round(s) x ${tenants.length} tenant(s) x ${pagesPerRound} page(s)), roughly ${loads * READS_PER_LOAD} statements.`)
  if (loads > maxLoads) {
    console.error(
      `That is more than --max-loads (${maxLoads}). Narrow it with --page and --client, or say --max-loads ${loads}\n` +
        'deliberately — a full sweep of both tenants is ~1,400 statements and belongs in a quiet window.',
    )
    process.exit(4)
  }

  // Said on every run, because a table of milliseconds invites more trust than
  // this harness earns: both of its clients are service-role, so nothing below
  // exercises RLS, the column grants or `authenticated`'s statement timeout.
  console.log('Both clients here are SERVICE ROLE: this times round trips and wave shape, not RLS, grants or the tenant timeout.')

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
