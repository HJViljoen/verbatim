import { SEALAND_CLIENT_ID } from '../lib/config'
import { recordConfigChanges, scriptActor, type ConfigChange } from '../lib/config-log'
import { asChangeInput, type LoggedChangeInput } from '../lib/config-surfaces-mf1'
import { assertProject, modeLine, parseScriptArgs } from '../lib/ops/market-first-args'
import {
  evidenceMap, isMissingObject, monthVideosFromExport, readConfigChanges, readExportFile, readKeywordRows, readMonthVideos,
  readProvenanceFile, readProvenanceTable, readRuns, readVerdicts, readVideos, snapshotOf, type Pages,
  type ProvenanceExportFile,
} from '../lib/provenance/load'
import type { ProvenanceSnapshot } from '../lib/provenance/reconstruct'
import { gathersOf, populations, reachOf, termDelta, type MonthVideo } from '../lib/provenance/searches'
import { changesFromLog } from '../lib/reading/comparability'
import { createAdminClient, selectAll } from '../lib/supabase-admin'

// Our own changes, dated and measured (market-first plan WP1.4; the second of
// Heinrich's four --apply pastes on Wed 30 Sep, after reconstruct-provenance).
//
// WHAT IT WRITES, with --apply --project <ref>:
//   1. REACH ON THE EXISTING CHANGE ROWS. Every search change of ours (terms and
//      communities: the 9, 13 and 17 Sep changes on Sealand) already has trigger
//      or reconstructed rows. For each that moved a search (an exclusions-only
//      change moves none and gets no row), and each month asked for, a
//      `config_change_reach` row per population (market, category): the month's
//      videos found by the terms that change added or removed and nothing else
//      (lib/provenance/searches.ts reachOf), out of the month's videos
//      (market_month_videos). It points at the change's id, the one
//      changesFromLog gives it, so no duplicate change row is ever written. A
//      reach row identical to the newest one held (same counts, same
//      read-through gather) is not written again.
//   2. A NEW config_changes ROW ONLY WHERE NONE EXISTS:
//        gate_rule    the relevance-gate fix, dated --gate-fix-at
//        attribution  attribution v3, dated --attribution-at
//      both the fix branch's ACTUAL production deploy (never assumed), source
//      'reconstructed', this command as the actor, and a note in client words;
//      and, with --capped-run <run id>, an `other` row dated at that update: "an
//      update gathered less than usual because a spending cap was reached".
//   Heinrich approves each note's wording before the apply (Mon 28 Sep); the
//   dry run prints them.
//
// The re-tag, if applied, writes its own entity_retag row through the fix
// branch's tool; its reach is not measured here (the tool's moved set is not
// held anywhere this script can read).
//
// READ-ONLY BY DEFAULT and never prompts. Where MF1 is not applied (a staging
// dry run), --export <WP0.1 file> stands in for market_month_videos and
// --provenance <plan file> for video_provenance.
//
//   node --env-file=.env.local --import tsx scripts/log-tracking-eras.ts --project <ref> \
//     [--gate-fix-at <ISO>] [--attribution-at <ISO>] [--capped-run <uuid>] [--months 2026-07,2026-08,2026-09] \
//     [--prod-snapshot <file>] [--staging-export <file>] [--export <file>] [--provenance <file>] [--apply]

const NAME = 'log-tracking-eras'
export const REACH_METHOD = 'search_terms_v1'

/** The notes, in client words (no digit, no em dash, no pipeline word, and
 *  no direction word: plan §4.0; lib/provenance/change-notes.test.ts holds
 *  all four notes the Stage 1 scripts write to it). */
// The gate note says the unjudged videos stay in the counts, and no more: the
// only mark they get is `unjudged_admission` in video_segments.reason, which
// nothing displays and a tenant cannot select, so "and are marked" would claim
// what the product does not do (plan §7.11).
export const GATE_RULE_NOTE =
  'We corrected how we check that a video belongs to your market. Some videos found before the correction were let in without that check; they stay in the counts.'
// The attribution note names the change and nothing more. It read "We improved
// how we tell which brand a post is about, so fewer posts are filed under the
// wrong brand.": "improved" is a direction word (lib/calibration.ts
// DIRECTION_WORDS), and "fewer" claims a fall nothing in the product measures.
export const ATTRIBUTION_NOTE = 'We changed how we tell which brand a post is about.'
export const CAPPED_NOTE = 'An update gathered less than usual because a spending cap was reached.'

const SEARCH_CHANGE_SURFACES = ['terms', 'subreddits']

function isoOrThrow(name: string, v: string | undefined): string | null {
  if (v == null) return null
  const t = Date.parse(v)
  if (Number.isNaN(t) || !/^\d{4}-\d{2}-\d{2}T/.test(v)) throw new Error(`${NAME}: --${name} must be an ISO instant like 2026-09-26T14:05:00Z, got ${v}`)
  return new Date(t).toISOString()
}

async function main() {
  const args = parseScriptArgs(process.argv.slice(2), {
    name: NAME,
    values: ['gate-fix-at', 'attribution-at', 'capped-run', 'months', 'prod-snapshot', 'staging-export', 'export', 'provenance'],
    defaultClient: SEALAND_CLIENT_ID,
  })
  assertProject(args, process.env.NEXT_PUBLIC_SUPABASE_URL, NAME)
  console.log(modeLine(args, NAME))
  const gateFixAt = isoOrThrow('gate-fix-at', args.values['gate-fix-at'])
  const attributionAt = isoOrThrow('attribution-at', args.values['attribution-at'])
  // Each month once: a repeated month would plan a reach row twice, and one
  // insert statement cannot hold the same key twice.
  const months = [...new Set((args.values.months ?? '2026-07,2026-08,2026-09').split(',').map((m) => `${m.trim().slice(0, 7)}-01`))].sort()
  const admin = createAdminClient()
  const pages: Pages = { n: 0 }

  const exportFile: ProvenanceExportFile | null = args.values.export ? readExportFile(args.values.export, args.clientId) : null
  const snapshots: ProvenanceSnapshot[] = []
  if (args.values['prod-snapshot']) snapshots.push(snapshotOf(readExportFile(args.values['prod-snapshot'], args.clientId), 'snapshot'))
  if (args.values['staging-export']) snapshots.push(snapshotOf(readExportFile(args.values['staging-export'], args.clientId), 'staging'))

  const [changes, videos, verdicts, kp, runs] = await Promise.all([
    readConfigChanges(admin, args.clientId, pages),
    readVideos(admin, args.clientId, pages),
    readVerdicts(admin, args.clientId, pages),
    readKeywordRows(admin, args.clientId, pages),
    readRuns(admin, args.clientId, pages),
  ])
  const gathers = gathersOf(kp, runs)
  // Read with the latest update (a completed or partial run, by completed_at),
  // the update the change list names ("read with the {date} update").
  const readThrough = runs
    .filter((r) => (r.status === 'completed' || r.status === 'partial') && r.completed_at)
    .sort((a, b) => (a.completed_at! < b.completed_at! ? -1 : a.completed_at! > b.completed_at! ? 1 : 0))
    .at(-1)?.id ?? null
  const provenance = args.values.provenance
    ? readProvenanceFile(args.values.provenance)
    : await readProvenanceTable(admin, args.clientId, pages)
  if (provenance == null) console.log('  video_provenance is not there (MF1 not applied): first-found terms are not used; pass --provenance <plan file>')
  const evidence = evidenceMap({ videos, provenance, snapshots, verdicts })

  const monthSets = new Map<string, MonthVideo[]>()
  for (const m of months) {
    const fromDb = exportFile ? null : await readMonthVideos(admin, args.clientId, m, pages)
    const set = fromDb ?? (exportFile ? monthVideosFromExport(exportFile, m) : null)
    if (set == null) throw new Error(`${NAME}: market_month_videos is not there (MF1 not applied) and no --export was given. Nothing read further.`)
    monthSets.set(m, set)
  }
  console.log(`  read with the update ${readThrough ?? '(none)'} · months ${months.map((m) => `${m.slice(0, 7)} (${monthSets.get(m)!.length} market, ${populations(monthSets.get(m)!).category.length} category)`).join(', ')}`)

  // 1. The search changes of ours, and their reach.
  const byId = new Map(changes.map((c) => [c.id, c]))
  const ours = changesFromLog(changes).filter((c) => SEARCH_CHANGE_SURFACES.includes(c.surface) && c.changedAt >= months[0])
  const reach: { change_id: string; month: string; population: 'market' | 'category'; videos_touched: number; videos_in_month: number }[] = []
  for (const c of ours) {
    const rows = (c.rowIds ?? [c.id]).map((id) => byId.get(id)).filter((r): r is ConfigChange => r != null)
    const delta = termDelta(rows)
    const moved = [...delta.added].map((t) => `+${t}`).concat([...delta.removed].map((t) => `-${t}`))
    if (moved.length === 0) {
      // An exclusions-only terms change (termDelta skips exclude_terms) or a
      // community change that moved no active community: no search moved, so
      // there is nothing to measure. No row, rather than "brought in 0".
      console.log(`  change ${c.id} · ${c.changedAt.slice(0, 16)} · ${c.surface} · (no search moved: no reach row)`)
      continue
    }
    console.log(`  change ${c.id} · ${c.changedAt.slice(0, 16)} · ${c.surface} · ${moved.join(', ')}`)
    for (const m of months) {
      const pops = populations(monthSets.get(m)!)
      for (const population of ['market', 'category'] as const) {
        const touched = reachOf(delta, pops[population], evidence).length
        reach.push({ change_id: c.id, month: m, population, videos_touched: touched, videos_in_month: pops[population].length })
      }
      const mk = reach.at(-2)!
      const cat = reach.at(-1)!
      console.log(`      ${m.slice(0, 7)}: ${mk.videos_touched} of ${mk.videos_in_month} market · ${cat.videos_touched} of ${cat.videos_in_month} category`)
    }
  }

  // 2. The rows none exists for.
  const actor = scriptActor(`scripts/${NAME}.ts --apply`)
  const planned: LoggedChangeInput[] = []
  const has = (surface: string, field?: string) => changes.some((c) => (c.surface as string) === surface && (field == null || c.field === field))
  const defaultMonths = new Set<string>()
  const defaultIds = new Set(verdicts.filter((v) => v.kept && v.source === 'default').map((v) => `${v.platform}\u0000${v.video_id}`))
  for (const v of videos) if (defaultIds.has(`${v.platform}\u0000${v.video_id}`)) for (const [m, set] of monthSets) if (set.some((x) => x.id === v.id)) defaultMonths.add(m)
  const band = (ms: string[]): string | null => {
    if (ms.length === 0) return null
    const sorted = [...ms].sort()
    const last = new Date(`${sorted.at(-1)}T00:00:00Z`)
    const next = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1)).toISOString().slice(0, 10)
    return `[${sorted[0]},${next})`
  }
  if (has('gate_rule')) console.log('  gate_rule: a row exists; none written')
  else if (!gateFixAt) console.log('  gate_rule: not planned (--gate-fix-at <the fix deploy> not given)')
  else planned.push({ clientId: args.clientId, surface: 'gate_rule', field: 'relevance_gate', actor, source: 'reconstructed', changedAt: gateFixAt, note: GATE_RULE_NOTE, affects: { months: band([...defaultMonths]) } })
  if (has('attribution')) console.log('  attribution: a row exists; none written')
  else if (!attributionAt) console.log('  attribution: not planned (--attribution-at <the fix deploy> not given)')
  else planned.push({ clientId: args.clientId, surface: 'attribution', field: 'attribution_v3', actor, source: 'reconstructed', changedAt: attributionAt, note: ATTRIBUTION_NOTE })
  if (args.values['capped-run']) {
    const run = gathers.find((g) => g.runId === args.values['capped-run'])
    if (!run) throw new Error(`${NAME}: --capped-run ${args.values['capped-run']} is not a gather of this client`)
    if (changes.some((c) => c.surface === 'other' && c.field === 'gather_capped' && c.run_id === run.runId)) console.log('  capped run: a row exists; none written')
    else planned.push({ clientId: args.clientId, surface: 'other', field: 'gather_capped', actor, runId: run.runId, source: 'reconstructed', changedAt: run.at, note: CAPPED_NOTE })
  }
  for (const p of planned) console.log(`  new row: ${p.surface} at ${p.changedAt} · "${p.note}"${p.affects?.months ? ` · months ${p.affects.months}` : ''}`)

  if (!args.apply) {
    console.log(`read-only: nothing written (${reach.length} reach rows and ${planned.length} change rows planned) · reads: ${pages.n} pages`)
    return
  }

  // Apply: the change rows, then the reach rows not already held as they are.
  let held: { change_id: string; month: string; population: string; videos_touched: number; videos_in_month: number; read_through_run: string | null; computed_at: string }[]
  try {
    held = await selectAll(() => admin.from('config_change_reach')
      .select('change_id, month, population, videos_touched, videos_in_month, read_through_run, computed_at')
      .eq('client_id', args.clientId).order('computed_at').order('change_id'))
    pages.n += Math.max(1, Math.ceil(held.length / 1000))
  } catch (e) {
    if (isMissingObject(e, 'config_change_reach')) throw new Error(`${NAME}: config_change_reach does not exist on ${args.project}. Apply MF1 first. Nothing written.`)
    throw e
  }
  const wrote = await recordConfigChanges(admin, planned.map(asChangeInput))
  if (wrote !== planned.length) throw new Error(`${NAME}: ${planned.length - wrote} change rows were not written (see the log above). Reach not written.`)
  const newest = new Map<string, (typeof held)[number]>()
  for (const h of held) newest.set(`${h.change_id}|${h.month.slice(0, 10)}|${h.population}`, h)
  const fresh = reach.filter((r) => {
    const h = newest.get(`${r.change_id}|${r.month}|${r.population}`)
    return !(h && h.videos_touched === r.videos_touched && h.videos_in_month === r.videos_in_month && h.read_through_run === readThrough)
  })
  if (fresh.length > 0) {
    const { error } = await admin.from('config_change_reach').insert(fresh.map((r) => ({
      client_id: args.clientId, ...r, method: REACH_METHOD, read_through_run: readThrough,
    })))
    if (error) throw new Error(`${NAME}: reach rows not written: ${error.message}`)
  }
  console.log(`APPLIED: ${wrote} change rows, ${fresh.length} reach rows (${reach.length - fresh.length} already held as they are) · reads: ${pages.n} pages`)
}

if (process.argv[1]?.endsWith('log-tracking-eras.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
