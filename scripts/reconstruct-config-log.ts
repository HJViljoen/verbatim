import { createAdminClient, selectAll } from '../lib/supabase-admin'
import {
  changeLogBoundary,
  recordConfigChanges,
  reconstructedActor,
  type ConfigChangeInput,
} from '../lib/config-log'
import { SEALAND_CLIENT_ID as SEALAND } from '../lib/config'

// The history that predates the change log (Phase 0 WP2).
//
// Nothing recorded a configuration change before 2026-09-15, so everything
// earlier has to be INFERRED from what the pipeline happened to leave behind.
// Every row this writes carries source = 'reconstructed' and a note naming its
// evidence, because the difference between a record and an inference is the
// whole point of having a log at all.
//
// WHAT THE EVIDENCE CAN AND CANNOT SAY
//
//   keyword_performance   one row per (update, platform, term) — so the term set
//                         in force at each GATHER is exact, and the transitions
//                         between two gathers are exact. It cannot date a change
//                         inside the gap, and the gaps are large: Össur went 35
//                         days (5 Jul → 9 Aug) and Sealand 39 days (9 Jul → 17
//                         Aug) without gathering. A term added and removed inside
//                         one leaves nothing at all. It also starts late — the
//                         table arrived 2026-07-01, 15 Össur updates and ~86 days
//                         after that tenant's first one.
//   subreddits jsonb      each entry carries discovered_at and probe.at, the only
//                         real added-dates anywhere in tenant configuration. Dates
//                         only, no times; a re-probe overwrites the earlier
//                         probe.at; two updates on one day collapse to one entry.
//   videos.source         the first 'owned' / 'competitor_owned' row is a LOWER
//                         BOUND on when the handles were configured, nothing more.
//                         No write path for own_handles exists in the repo at all.
//   the repo's own git    three Sealand events are dated by a commit or by
//                         pg_stat_statements rather than by any table. They are
//                         listed below, each with what it is evidenced by.
//
// It cannot say anything at all about `platforms`, the volume knobs,
// `exclude_terms`, or who made any of it. Those are simply gone.
//
// Dry by default; --apply writes. Refuses to write twice for the same tenant.
//
//   node --env-file=.env.local --import tsx scripts/reconstruct-config-log.ts [--client <uuid>] [--apply]

/** Changes that no table records, each dated by something outside the database.
 *  Hard-coded because the evidence is hard-coded: a commit hash, a statement in
 *  pg_stat_statements' four-day window, a corpus that no longer matches its own
 *  theme registry. */
const KNOWN_EVENTS: (Omit<ConfigChangeInput, 'actor'> & { actorKind: 'script' | 'sql'; actorLabel: string })[] = [
  {
    clientId: SEALAND,
    changedAt: '2026-09-09T16:24:15.000Z',
    surface: 'rivals',
    field: 'competitor_names',
    before: ['Cotopaxi', 'Freitag', 'Patagonia', 'Poler', 'Topo Designs'],
    after: ['Cotopaxi', 'Freitag', 'Rareform'],
    source: 'reconstructed',
    actorKind: 'script',
    actorLabel: 'scripts/sealand-config-2026-09.ts --apply (commit 5000547)',
    note:
      'three rivals out (Patagonia, Poler, Topo Designs), one in (Rareform). Dated by the commit that ' +
      'carries the values, 2026-09-09 18:24:15 +0200; the subreddits it added in the same write are stamped ' +
      'discovered_at 2026-09-09. The BEFORE list is inferred: theme_registry still holds 63 competitor:Patagonia ' +
      'and 21 competitor:Topo Designs rows from the update that ran that morning, and keyword_performance shows ' +
      'patagonia/poler/topo designs searched at 10:30 and gone by 18:17. Its order is not evidenced.',
  },
  {
    clientId: SEALAND,
    changedAt: '2026-09-09T18:10:00.000Z',
    surface: 'entity_retag',
    field: null,
    before: null,
    after: null,
    rowsAffected: 253,
    source: 'reconstructed',
    actorKind: 'script',
    actorLabel: 'scripts/run-tagging.ts --write (method unknown)',
    note:
      'the corpus re-stamp that followed the rival change, and the thing that actually moved the numbers: ' +
      '254 stored videos had been found through patagonia/poler/topo designs, and 253 of them read industry ' +
      'today. 84 themes (63 Patagonia + 21 Topo Designs) stopped being produced with them. Bracketed, not ' +
      'dated: after the config commit at 16:24 and before 18:10, when the next update began work. The method ' +
      'is unknowable and matters — substring and gpt differ by up to 35x in rows touched. Nothing else records ' +
      'it: videos has no updated_at, attribution never reaches ai_call_log, and the script carries no run id.',
  },
  {
    clientId: SEALAND,
    changedAt: '2026-09-13T10:00:58.467Z',
    surface: 'terms',
    field: 'industry_keywords',
    before: null,
    after: ['handmade bag', 'sustainable fashion', 'travel gear'],
    source: 'reconstructed',
    actorKind: 'sql',
    actorLabel: 'postgres (hand-run SQL)',
    note:
      'three terms appended by a hand-typed UPDATE in the SQL editor — the tenth write path, and the one no ' +
      'code inventory can find. Evidenced by pg_stat_statements (a normalised UPDATE ... array_agg(DISTINCT ...) ' +
      'first seen 10:00:58.571, matching tracking_configs.updated_at 10:00:58.467 to 104 ms) and by the three ' +
      'terms first appearing in keyword_performance at 10:12. BEFORE is unknown: the statement appended to ' +
      'whatever was there. The four terms were candidates computed 24 minutes earlier, at 09:36.',
  },
  {
    clientId: SEALAND,
    changedAt: '2026-09-13T10:00:58.467Z',
    surface: 'terms',
    field: 'competitor_keywords',
    before: null,
    after: ['frtg'],
    source: 'reconstructed',
    actorKind: 'sql',
    actorLabel: 'postgres (hand-run SQL)',
    note: 'the fourth term of the same hand-run statement — see the industry_keywords row at this timestamp.',
  },
]

/** Terms the KNOWN_EVENTS above already account for: the same change, better
 *  evidenced. Without this the gather-granular pass would log them a second
 *  time, three hours late and with no actor. */
const SUPERSEDED_TERMS = new Map<string, { terms: Set<string>; from: string; to: string }>([
  [SEALAND, {
    terms: new Set(['frtg', 'handmade bag', 'sustainable fashion', 'travel gear']),
    from: '2026-09-13T00:00:00.000Z',
    to: '2026-09-14T00:00:00.000Z',
  }],
])

interface Args { clientId: string | null; apply: boolean }

function parseArgs(argv: string[]): Args {
  const a: Args = { clientId: null, apply: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client') a.clientId = argv[++i]
    else if (argv[i] === '--apply') a.apply = true
    else throw new Error(`unknown flag: ${argv[i]}`)
  }
  return a
}

interface KeywordRow { client_id: string; run_id: string; keyword: string; created_at: string }
interface RunRow { client_id: string; started_at: string }
interface VideoSourceRow { client_id: string; source: string | null; scraped_at: string }

interface SubredditEntry {
  name?: string
  status?: string
  discovered_at?: string
  probe?: { at?: string; sampled?: number; kept?: number }
  strikes?: number
}

const days = (a: string, b: string) =>
  Math.round(Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()

  const [{ data: clients }, { data: configs }, keywords, runs, videos, existing] = await Promise.all([
    admin.from('clients').select('id, company_name').order('created_at'),
    admin.from('tracking_configs').select('client_id, own_handles, competitor_handles, subreddits'),
    selectAll<KeywordRow>(() =>
      admin.from('keyword_performance').select('client_id, run_id, keyword, created_at')
        .order('created_at', { ascending: true }).order('id', { ascending: true })),
    selectAll<RunRow>(() =>
      admin.from('pipeline_runs').select('client_id, started_at')
        .order('started_at', { ascending: true }).order('id', { ascending: true })),
    selectAll<VideoSourceRow>(() =>
      admin.from('videos').select('client_id, source, scraped_at')
        .in('source', ['owned', 'competitor_owned'])
        .order('scraped_at', { ascending: true }).order('id', { ascending: true })),
    // Tolerant on purpose: the useful time to read this output is BEFORE the
    // migration is applied, when the table it writes to does not exist yet.
    selectAll<{ client_id: string; source: string; changed_at: string }>(() =>
      admin.from('config_changes').select('client_id, source, changed_at').order('id', { ascending: true }),
    ).catch((e) => {
      console.log(`(config_changes is not there yet — ${e instanceof Error ? e.message : String(e)})\n`)
      return [] as { client_id: string; source: string; changed_at: string }[]
    }),
  ])

  const tenants = ((clients ?? []) as { id: string; company_name: string }[])
    .filter((c) => !args.clientId || c.id === args.clientId)
  if (!tenants.length) throw new Error(`no client ${args.clientId}`)
  const cfgOf = new Map(((configs ?? []) as Record<string, unknown>[]).map((c) => [c.client_id as string, c]))

  const rows: ConfigChangeInput[] = []
  const skipped: string[] = []

  for (const tenant of tenants) {
    const name = tenant.company_name
    const already = existing.filter((e) => e.client_id === tenant.id && e.source === 'reconstructed').length
    if (already) {
      skipped.push(`${name}: ${already} reconstructed row(s) already present — left alone`)
      continue
    }

    // ---- 1. Terms, at gather granularity ------------------------------------
    // One batch per (update) — every platform's rows are written together, so
    // the batch time is when that update's gather finished, which is what the
    // term set belonged to.
    const mine = keywords.filter((k) => k.client_id === tenant.id && !k.keyword.startsWith('r/'))
    const batches = new Map<string, { at: string; terms: Set<string> }>()
    for (const k of mine) {
      const b = batches.get(k.run_id) ?? { at: k.created_at, terms: new Set<string>() }
      if (k.created_at < b.at) b.at = k.created_at
      b.terms.add(k.keyword)
      batches.set(k.run_id, b)
    }
    const ordered = [...batches.entries()].sort((a, b) => (a[1].at < b[1].at ? -1 : 1))

    const tenantRuns = runs.filter((r) => r.client_id === tenant.id)
    const superseded = SUPERSEDED_TERMS.get(tenant.id)
    const supersedes = (term: string, at: string) =>
      Boolean(superseded && superseded.terms.has(term) && at >= superseded.from && at < superseded.to)

    if (ordered.length) {
      const [firstRun, first] = ordered[0]
      const blind = ordered.reduce((max, [, b], i) =>
        i === 0 ? max : Math.max(max, days(ordered[i - 1][1].at, b.at)), 0)
      const before = tenantRuns.filter((r) => r.started_at < first.at).length
      rows.push({
        clientId: tenant.id,
        surface: 'terms',
        field: null,
        before: null,
        after: [...first.terms].sort(),
        actor: reconstructedActor('keyword_performance'),
        runId: firstRun,
        source: 'reconstructed',
        changedAt: first.at,
        note:
          `the earliest term set any record can show. It is not when these terms were configured: ` +
          `${before} earlier update(s) ran before the first one that left a term record, the first of them on ` +
          `${tenantRuns[0]?.started_at.slice(0, 10) ?? 'an unknown date'}. Everything before this line is gone. ` +
          `Afterwards the record is per update, not per change: the longest stretch with no update at all is ` +
          `${blind} days, and a term added and removed inside one leaves nothing.`,
      })

      for (let i = 1; i < ordered.length; i++) {
        const [runId, batch] = ordered[i]
        const prev = ordered[i - 1][1]
        const gap = days(prev.at, batch.at)
        const bracket =
          `the update of ${prev.at.slice(0, 10)} and the one of ${batch.at.slice(0, 10)} (${gap} day(s) apart)`
        for (const term of [...batch.terms].sort()) {
          if (prev.terms.has(term) || supersedes(term, batch.at)) continue
          rows.push({
            clientId: tenant.id,
            surface: 'terms',
            field: null,
            before: null,
            after: [term],
            actor: reconstructedActor('keyword_performance'),
            runId,
            source: 'reconstructed',
            changedAt: batch.at,
            note: `"${term}" was first searched on ${batch.at.slice(0, 10)}. It was added between ${bracket}; which of those days, and by whom, is not recorded.`,
          })
        }
        for (const term of [...prev.terms].sort()) {
          if (batch.terms.has(term) || supersedes(term, batch.at)) continue
          rows.push({
            clientId: tenant.id,
            surface: 'terms',
            field: null,
            before: [term],
            after: null,
            actor: reconstructedActor('keyword_performance'),
            runId,
            source: 'reconstructed',
            changedAt: batch.at,
            note: `"${term}" was last searched on ${prev.at.slice(0, 10)} and was gone by ${batch.at.slice(0, 10)}. It was removed between ${bracket}.`,
          })
        }
      }
    }

    // ---- 2. Communities — the only surface with real dates -------------------
    const cfg = cfgOf.get(tenant.id) ?? {}
    const entries = (cfg.subreddits ?? []) as SubredditEntry[]
    for (const e of entries) {
      if (!e?.name) continue
      if (e.discovered_at) {
        rows.push({
          clientId: tenant.id,
          surface: 'subreddits',
          field: 'subreddits',
          before: null,
          after: { name: e.name, status: 'candidate' },
          actor: reconstructedActor('tracking_configs.subreddits[].discovered_at'),
          source: 'reconstructed',
          changedAt: `${e.discovered_at}T00:00:00.000Z`,
          note: `r/${e.name} was proposed on ${e.discovered_at}. A date, not a time — and two updates on one day collapse into this single stamp.`,
        })
      }
      if (e.probe?.at) {
        rows.push({
          clientId: tenant.id,
          surface: 'subreddits',
          field: 'subreddits',
          before: { name: e.name, status: 'candidate' },
          after: { name: e.name, status: e.status ?? 'unknown' },
          actor: reconstructedActor('tracking_configs.subreddits[].probe.at'),
          source: 'reconstructed',
          changedAt: `${e.probe.at}T00:00:00.000Z`,
          note:
            `r/${e.name} was probed on ${e.probe.at} and reads "${e.status ?? 'unknown'}" today` +
            `${typeof e.probe.kept === 'number' ? ` (${e.probe.kept} of ${e.probe.sampled ?? '?'} sampled posts kept)` : ''}. ` +
            'Only the most recent probe survives: a re-probe overwrites the earlier one, and a strike carries no date at all.',
        })
      }
    }

    // ---- 3. Handles — a lower bound and nothing else --------------------------
    for (const [source, field] of [['owned', 'own_handles'], ['competitor_owned', 'competitor_handles']] as const) {
      const first = videos.find((v) => v.client_id === tenant.id && v.source === source)
      if (!first) continue
      rows.push({
        clientId: tenant.id,
        surface: 'handles',
        field,
        before: null,
        after: (cfg[field] ?? {}) as Record<string, unknown>,
        actor: reconstructedActor(`videos.source = '${source}'`),
        source: 'reconstructed',
        changedAt: first.scraped_at,
        note:
          `${field} was populated by ${first.scraped_at.slice(0, 10)} at the latest — that is when the first ` +
          `${source} post arrived, and an account is only read once it is configured. The AFTER shown is the ` +
          `value configured TODAY, not necessarily the value set then; only the bound on the date is evidenced. ` +
          (field === 'own_handles'
            ? 'No write path for own_handles exists anywhere in the repo, so whatever set it was hand-run SQL.'
            : 'Its only writer is a per-tenant operator script.'),
      })
    }

    // ---- 4. The events no table records --------------------------------------
    for (const event of KNOWN_EVENTS.filter((e) => e.clientId === tenant.id)) {
      const { actorKind, actorLabel, ...rest } = event
      rows.push({
        ...rest,
        // The kind says WHO (a script, a person at a SQL prompt); the source says
        // how we know (inference, long afterwards). They are different questions.
        actor: { ...reconstructedActor(actorLabel), kind: actorKind, label: actorLabel },
      })
    }
  }

  rows.sort((a, b) => ((a.changedAt ?? '') < (b.changedAt ?? '') ? -1 : 1))

  const nameOf = new Map(((clients ?? []) as { id: string; company_name: string }[]).map((c) => [c.id, c.company_name]))
  console.table(rows.map((r) => ({
    when: (r.changedAt ?? '').slice(0, 16).replace('T', ' '),
    client: nameOf.get(r.clientId) ?? r.clientId.slice(0, 8),
    surface: r.surface,
    field: r.field ?? '—',
    change: summarise(r),
    actor: r.actor.kind,
  })))
  for (const s of skipped) console.log(`  ${s}`)
  console.log(`\n${rows.length} reconstructed row(s) · ${args.apply ? 'APPLY' : 'DRY RUN'}`)
  // The boundary is where the RECORD begins — the first row something actually
  // wrote down — not where this inference ends.
  const firstReal = existing
    .filter((e) => e.source !== 'reconstructed')
    .map((e) => e.changed_at)
    .sort()[0] ?? null
  console.log(`\n${changeLogBoundary(firstReal)}`)
  console.log(
    'Every row above is inference. Each one carries its evidence in `note`, and none of them names a person —\n' +
    'no record of who changed anything exists before the log itself.',
  )

  if (!args.apply) {
    console.log('\n(dry run — nothing written. Re-run with --apply.)')
    return
  }
  if (!rows.length) return
  const written = await recordConfigChanges(admin, rows)
  console.log(`\nwrote ${written} of ${rows.length}.`)
}

function summarise(r: ConfigChangeInput): string {
  const show = (v: unknown) =>
    v === null || v === undefined ? '—'
      : Array.isArray(v) ? v.join(', ')
        : typeof v === 'object' ? JSON.stringify(v)
          : String(v)
  if (r.surface === 'entity_retag') return `${r.rowsAffected} video(s) re-stamped`
  const before = show(r.before)
  const after = show(r.after)
  const clip = (s: string) => (s.length > 60 ? `${s.slice(0, 57)}…` : s)
  if (before === '—') return `+ ${clip(after)}`
  if (after === '—') return `− ${clip(before)}`
  return `${clip(before)} → ${clip(after)}`
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
