import { scriptActor } from '../lib/config-log'
import { createAdminClient, selectAll } from '../lib/supabase-admin'
import {
  fillingMonths,
  freezeMonths,
  monthStartOf,
  monthsBetween,
  monthsToRefresh,
  readDenominators,
  readThemeReadings,
  windowOf,
} from '../lib/reading/monthly'
import type { DenominatorReading, ThemeReading } from '../lib/reading/types'

// The comment-dated monthly reading, read out loud — and, with --write, seeded
// (Phase 0 WP3, 2026-09-15).
//
// Every theme number on screen today is a per-RUN reading of a cumulative
// corpus. This prints the other one: one clustering, read month by month, dated
// by when the comment was written. Read-only by default.
//
// --write seeds the back-read: every month the corpus reaches back to, written
// once. Months whose 30-day line has already passed are stored FROZEN and
// marked `back_read`, because that is what they are — a reading of today's
// corpus, not the reading anyone was given at the time, and nothing can
// recover the latter (an older run's citations are 20–44% eroded by the Pass A
// prune and the deleted rows are unrecoverable). The months still open are
// stored `filling` and the pipeline's freeze-months step takes them from there.
//
// The seed reads ONE run's clustering — by default the tenant's latest, the
// same one the product is showing — so every month in the table is the same
// question asked of a different month, which is the whole point.
//
// --write refuses a tenant whose clustering could not be named, unless
// --denominators-only says so out loud: a seed that cannot say which clustering
// it read freezes every back-read month's denominators with no theme readings
// at all, and nothing ever revisits a frozen month (monthsToRefresh only walks
// back through FILLING ones). A second run would write the theme rows under a
// LATER clustering, which is the one thing these two tables exist to prevent.
//
//   node --env-file=.env.local --import tsx scripts/monthly-reading.ts [--client <uuid>] [--run <uuid>] [--all] [--write] [--denominators-only]

interface Args {
  clientId: string | null
  runId: string | null
  all: boolean
  write: boolean
  denominatorsOnly: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { clientId: null, runId: null, all: false, write: false, denominatorsOnly: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client') args.clientId = argv[++i]
    else if (argv[i] === '--run') args.runId = argv[++i]
    else if (argv[i] === '--all') args.all = true
    else if (argv[i] === '--write') args.write = true
    else if (argv[i] === '--denominators-only') args.denominatorsOnly = true
    else throw new Error(`unknown flag: ${argv[i]}`)
  }
  return args
}

const RECENT_MONTHS = 12

const mix = (m: Record<string, number>): string =>
  Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .map(([p, n]) => `${p} ${n}`)
    .join(' · ') || '—'

async function main() {
  const { clientId, runId: runOverride, all, write, denominatorsOnly } = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: clients, error: clientErr } = await admin
    .from('clients')
    .select('id, company_name')
    .order('created_at', { ascending: true })
  if (clientErr) throw new Error(`clients: ${clientErr.message}`)
  const tenants = (clients ?? []).filter((c) => !clientId || c.id === clientId)
  if (tenants.length === 0) throw new Error(clientId ? `no client ${clientId}` : 'no clients')

  console.log(`${write ? 'WRITE' : 'DRY RUN'} · ${now}\n`)

  for (const tenant of tenants) {
    const id = tenant.id as string
    const name = tenant.company_name as string

    // The clustering to read the months with: this tenant's latest, unless one
    // was named. A month read with someone else's run is not comparable to one
    // read with this one.
    let runId = runOverride
    let runDate: string | null = null
    {
      // Checked, like every other read here: a dropped error would make "this
      // read failed" look exactly like "this tenant has no clustering yet",
      // and under --write the difference is a permanent freeze with no
      // numerators in it.
      const { data, error: obsErr } = await admin
        .from('theme_observations')
        .select('run_id, created_at')
        .eq('client_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
      if (obsErr) throw new Error(`theme_observations: ${obsErr.message}`)
      const latest = (data ?? [])[0] as { run_id: string | null; created_at: string } | undefined
      if (!runOverride) runId = latest?.run_id ?? null
      runDate = latest?.created_at?.slice(0, 10) ?? null
    }

    // How far back the corpus reaches. Comments, not videos: the reading is
    // dated by when the comment was written, and a 2020 comment on a 2020 post
    // arrived here in one of this year's scrapes.
    const { data: earliestRows, error: earliestErr } = await admin
      .from('comments')
      .select('comment_date')
      .eq('client_id', id)
      .not('comment_date', 'is', null)
      .order('comment_date', { ascending: true })
      .limit(1)
    if (earliestErr) throw new Error(`comments: ${earliestErr.message}`)
    const earliest = (earliestRows ?? [])[0]?.comment_date as string | undefined
    if (!earliest) {
      console.log(`${name} — no dated comments yet, nothing to read.\n`)
      continue
    }

    const months = monthsBetween(earliest, now)
    const window = windowOf(months)
    if (!window) continue

    const denominators = await readDenominators(admin, id, window)
    const themes: ThemeReading[] = runId ? await readThemeReadings(admin, id, runId, window) : []

    // Labels, for the "biggest theme this month" column. theme_registry holds
    // the stable identity and its latest label; the label is what churns, so it
    // is printed as decoration and never used as a key.
    const labels = new Map<string, string>()
    if (themes.length > 0) {
      const rows = await selectAll<{ id: string; canonical_label: string | null }>(() =>
        admin.from('theme_registry').select('id, canonical_label').eq('client_id', id).order('id', { ascending: true }),
      )
      for (const r of rows) labels.set(r.id, r.canonical_label ?? '(unlabelled)')
    }

    const open = monthsToRefresh(now, await fillingMonths(admin, id))
    const openSet = new Set(open)

    const shown = all ? months : months.slice(-RECENT_MONTHS)
    const shownSet = new Set(shown)
    const table = denominators
      .filter((d: DenominatorReading) => shownSet.has(monthStartOf(d.month)))
      .map((d) => {
        const month = monthStartOf(d.month)
        const mine = themes.filter((t) => monthStartOf(t.month) === month && t.audience === d.audience)
        const top = [...mine].sort((a, b) => b.videos - a.videos)[0]
        return {
          month: month.slice(0, 7),
          audience: d.audience,
          videos: d.videos,
          comments: d.comments,
          platforms: mix(d.platform_mix),
          'names a rival': d.dual_mention,
          undated: d.excluded_undated,
          themes: mine.length,
          'biggest theme': top ? `${labels.get(top.theme_id) ?? top.theme_id} (${top.videos})` : '—',
          state: openSet.has(month) ? 'still filling' : 'closed',
        }
      })

    console.log(
      `${name} — ${months.length} months, ${denominators.length} audience-months, ` +
      `${themes.length} theme-months` +
      (runId ? ` · clustering: run ${runId.slice(0, 8)}${runDate ? ` (${runDate})` : ''}` : ' · no clustering yet, denominators only'),
    )
    console.log(`  reading window ${window.from.slice(0, 10)} → ${window.to.slice(0, 10)} · still open: ${open.join(' ') || 'none'}`)
    if (!all && months.length > shown.length) {
      console.log(`  showing the last ${RECENT_MONTHS} months; --all for every month back to ${months[0].slice(0, 7)}`)
    }
    console.table(table)

    const plan = await freezeMonths(admin, { clientId: id, runId, months, now, dryRun: true })
    console.log(
      `  a seed would write ${plan.denominators.written} denominator rows ` +
      `(${plan.denominators.frozen} frozen at once, back-read) and ${plan.themes.written} theme rows ` +
      `(${plan.themes.frozen} frozen at once); ` +
      `${plan.denominators.keptFrozen + plan.themes.keptFrozen} stored rows are already frozen and would be left alone.`,
    )
    if (plan.skippedKindMoodAttention) {
      console.log('  kinds, mood and attention: skipped — 20260918094000_kind_mood_attention.sql is not applied here.')
    } else {
      console.log(
        `  …and ${plan.kinds.written} kind rows (${plan.kinds.frozen} frozen at once) and ` +
        `${plan.stats.written} mood/attention rows (${plan.stats.frozen} frozen at once), read over ` +
        `${plan.panelId ? `panel ${plan.panelId}` : 'no attention panel — the attention half would read nothing'}.`,
      )
    }
    const held = plan.denominators.heldStale + plan.themes.heldStale + plan.kinds.heldStale + plan.stats.heldStale
    if (held > 0) {
      console.log(
        `  ${held} stored filling rows would be held rather than dropped: a reading came back empty, ` +
        'which is a reading that did not happen, not a month that emptied.',
      )
    }
    const late = plan.denominators.refusedLate + plan.themes.refusedLate + plan.kinds.refusedLate + plan.stats.refusedLate
    if (late > 0) {
      console.log(
        `  ${late} fresh rows would NOT be written: their audience-months have closed and this table ` +
        'already holds a reading of them. A late discovery is an accrual against a fresh reading, ' +
        'never an addition to a month that is already the record.',
      )
    }

    if (write) {
      // A freeze is permanent (`month_denominators_frozen_guard` refuses any
      // later UPDATE) and unrecoverable for the clustering it was meant to
      // record. Writing denominators with no clustering to attach numerators
      // to is therefore not a degraded seed, it is a wrong one — say so and
      // stop, rather than print one line among many and freeze the months.
      if (!runId && !denominatorsOnly) {
        throw new Error(
          `${name}: no clustering to read the months with, so --write would freeze ` +
          'denominators with no theme readings and nothing would ever revisit those months. ' +
          'Name one with --run <uuid>, or pass --denominators-only if that is genuinely what you want.',
        )
      }
      // The actor lets the seed freeze the tenant's first attention panel —
      // a configuration write, which never happens unattributed.
      const done = await freezeMonths(admin, {
        clientId: id, runId, months, now, actor: scriptActor('scripts/monthly-reading.ts --write'),
      })
      const side = (pick: (s: typeof done.themes) => number) =>
        pick(done.denominators) + pick(done.themes) + pick(done.kinds) + pick(done.stats)
      console.log(
        `  WROTE ${done.denominators.written} denominator rows, ${done.themes.written} theme rows, ` +
        `${done.kinds.written} kind rows and ${done.stats.written} mood/attention rows; ` +
        `${side((x) => x.keptFrozen)} frozen rows untouched, ` +
        `${side((x) => x.deleted)} stale filling rows dropped, ` +
        `${side((x) => x.heldStale)} held because a reading came back empty, ` +
        `${side((x) => x.refusedLate)} refused because their months have closed.` +
        `${done.panelFrozen ? ` An attention panel was frozen (${done.panelId}).` : ''}`,
      )
    }
    console.log()
  }

  console.log(
    write
      ? 'A back-read month is a reading of today\'s corpus, not the reading that was given at the time —\n' +
        'nothing can recover the latter. Every month after this seed is written while it is still open.'
      : 'DRY RUN — nothing written. Re-run with --write to seed the back-read.',
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
