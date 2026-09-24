// Dump every reading page's LOADER OUTPUT, for both tenants, on a frozen
// clock — so that "this change is invisible to a client" can be checked
// instead of argued. READ-ONLY: it calls the loaders, writes JSON to a
// directory you name, spends no OpenAI or Apify money and writes nothing to
// the database.
//
//   node --env-file=.env.local --import tsx scripts/loader-dump.ts --confirm \
//     --out scratch/dump-new
//   git worktree add ../base <baseline sha> && (cd ../base && npm ci)
//   … the same command in the baseline tree with --out scratch/dump-base
//   diff -r scratch/dump-base scratch/dump-new      # nothing = nothing changed
//
// WHY IT IS A SCRIPT. WP23 rewaved six loaders and the one defect it found in
// itself was found HERE and nowhere else: raising a chunk size in a shared read
// helper silently changed four of one tenant's "For sales" quotes, because the
// quote Map is keyed by the order evidence rows arrive and the chunk boundary
// decides that order. No test and no type could have caught it; the whole
// loader output, diffed, did. Any package that touches a loader, a chunk size,
// a read's order or a wave should be able to take this dump at both ends.
//
// WHAT IS COMPARED. Whatever the loader returns, serialised with object keys
// SORTED so that two trees are compared on content rather than on the order
// somebody happened to build an object in. `Date` is frozen (`--at`, default
// 2026-09-16T06:00:00Z) because every loader stamps `readingAt` from the wall
// clock and a page's whole month axis hangs off it. A loader that throws is
// written as its error message, which is itself a comparable fact.
//
// THIS IS A READ LOOP AND .env.local IS PRODUCTION. Twelve page loads a run
// (six pages, two tenants), 22-64 statements each — call it 500. Run it in a
// quiet window, once per tree, not per iteration. Like scripts/reading-timing.ts
// it will not start without `--confirm`, it probes the instance first and
// refuses to run if that probe takes over 3 s or errors, and it refuses a plan
// above `--max-loads` (12). On 16 September this instance was starved twice in
// one morning by several agents reading production at once, and the live app
// returned 504s to paying users.

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { readingHandle } from '../lib/reading/read'
import { loadOverview } from '../lib/pages/overview'
import { loadWeek } from '../lib/pages/week'
import { loadMarketSurface } from '../lib/pages/market-surface'
import { loadCompetitiveSurface } from '../lib/pages/competitive-surface'
import { loadVoiceSurface } from '../lib/pages/voice-surface'
import { loadSubjectsPage } from '../lib/pages/subjects'

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
  ['overview', (s) => loadOverview(s)],
  ['subjects', (s) => loadSubjectsPage(s)],
  ['voice', (s) => loadVoiceSurface(s)],
  ['market', (s) => loadMarketSurface(s)],
  ['competitive', (s) => loadCompetitiveSurface(s)],
  ['week', (s) => loadWeek(s)],
]

/** Freeze the wall clock. Every loader takes `readingAt` from `new Date()`, and
 *  two dumps taken a minute apart across a month boundary would differ for that
 *  reason alone — which is the one difference this script must not report. */
function freezeClock(at: string): void {
  const Real = Date
  const fixed = new Real(at)
  if (Number.isNaN(fixed.getTime())) throw new Error(`--at is not a date: ${at}`)
  // A proxy rather than a subclass, so `new Date(y, m, d)` and every other
  // overload still reach the real constructor untouched; only the no-argument
  // form and `Date.now()` are answered from the frozen instant.
  const frozen = new Proxy(Real, {
    construct: (target, argArray) =>
      argArray.length === 0 ? new Real(fixed.getTime()) : (Reflect.construct(target, argArray) as object),
    get: (target, prop, receiver) => (prop === 'now' ? () => fixed.getTime() : Reflect.get(target, prop, receiver)),
  })
  globalThis.Date = frozen as unknown as DateConstructor
}

/** JSON with every object's keys in sorted order, so the comparison is about
 *  values. Maps and Sets are spelled out rather than collapsing to `{}`. */
function canonical(value: unknown): unknown {
  if (value instanceof Map) return { '#map': [...value.entries()].map(([k, v]) => [k, canonical(v)]).sort() }
  if (value instanceof Set) return { '#set': [...value].map(canonical).sort() }
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonical((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

async function main() {
  const out = flag('out')
  const at = flag('at', '2026-09-16T06:00:00Z')
  const wantedPage = flag('page').toLowerCase()
  const wantedClient = flag('client')
  const maxLoads = Number(flag('max-loads', '12')) || 12
  if (!args.includes('--confirm')) {
    console.error(
      'loader-dump reads PRODUCTION in a loop (twelve page loads, ~500 statements) and will not start without --confirm.\n' +
        'Take it once per tree in a quiet window, not once per iteration. --page and --client narrow it.',
    )
    process.exit(2)
  }
  if (!out) {
    console.error('Say where to write: --out scratch/dump-new')
    process.exit(2)
  }

  // The probe, before anything else: the smallest read there is, timed. A slow
  // answer is an instance with nothing to spare, and the next thing this script
  // would do is ask it for five hundred statements.
  const started = Date.now()
  const { data, error } = await createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  ).from('clients').select('id, company_name').order('company_name')
  const probeMs = Date.now() - started
  if (error) throw new Error(`clients: ${error.message} (the probe failed in ${probeMs} ms — do not read this instance for fifteen minutes)`)
  console.log(`Probe: the client list answered in ${probeMs} ms.`)
  if (probeMs > 3_000) {
    console.error(`The probe took ${probeMs} ms (the line is 3,000). Wait fifteen minutes and probe again.`)
    process.exit(3)
  }

  const tenants = ((data ?? []) as Tenant[]).filter((t) => !wantedClient || t.id === wantedClient)
  const pages = PAGES.filter(([page]) => !wantedPage || wantedPage === 'all' || page === wantedPage)
  const loads = tenants.length * pages.length
  console.log(`Plan: ${loads} page loads, clock frozen at ${at}, into ${out}/`)
  if (loads > maxLoads) {
    console.error(`That is more than --max-loads (${maxLoads}). Narrow it with --page and --client, or raise it deliberately.`)
    process.exit(4)
  }

  // After the probe, so the probe itself is timed on the real clock.
  freezeClock(at)
  const dir = resolve(process.cwd(), out)
  mkdirSync(dir, { recursive: true })

  for (const tenant of tenants) {
    for (const [page, load] of pages) {
      const slug = `${tenant.company_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${page}.json`
      let body: unknown
      try {
        body = canonical(await load({
          supabase: createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''),
          clientId: tenant.id,
          reading: readingHandle(tenant.id, createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')),
          params: {},
          canEdit: false,
        }))
      } catch (e) {
        // An error is a comparable fact too: two trees that fail the same way
        // are still the same tree, and one that starts failing is the finding.
        body = { '#error': e instanceof Error ? e.message : String(e) }
      }
      writeFileSync(`${dir}/${slug}`, `${JSON.stringify(body, null, 2)}\n`)
      console.log(`  wrote ${slug}`)
    }
  }
  console.log(`\nNow take the same dump in the baseline tree and \`diff -r\` the two directories.`)
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  },
)
