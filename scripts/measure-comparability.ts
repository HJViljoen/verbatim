import { SEALAND_CLIENT_ID } from '../lib/config'
import { assertProject, modeLine, parseScriptArgs } from '../lib/ops/market-first-args'
import {
  isMissingObject, monthVideosFromExport, readConfigChanges, readExportFile, readKeywordRows, readMonthComments, readMonthVideos,
  readProvenanceFile, readProvenanceTable, readRuns, readVerdicts, readVideos, snapshotOf, type Pages, type ProvenanceExportFile,
} from '../lib/provenance/load'
import {
  CODE_REACH_METHOD, freshPairRows, freshReachRows, measureContext, measurePairs, PAIR_METHOD_VERSION, reachRowsOf,
  type HeldPair, type HeldReach,
} from '../lib/provenance/measure'
import type { ProvenanceSnapshot } from '../lib/provenance/reconstruct'
import { createAdminClient, selectAll } from '../lib/supabase-admin'

// Were two months read the same way? The measured inputs of the month-pair
// judge (market-first decision D, plan §4.2 PairRow, WP1.4; Heinrich's third
// --apply paste on Wed 30 Sep, then again on Mon 5 and Mon 12 Oct after each run).
//
// For each pair (default (Jul, Aug) and (Aug, Sep)) it writes, with --apply
// --project <ref>, one `month_pair_comparability` row, append-only (the newest
// computed_at wins), holding:
//   - search-outside, per month: the videos NOT surfaced by any search that ran
//     unchanged through both months, in every completed gather (a gather that
//     fell short is named and left to gather health; lib/provenance/searches.ts
//     decidingGathers), over the
//     CATEGORY, the population themes are grouped in and the one the research
//     states its figures over (206 of 625, GC F29); the market's figures are
//     printed beside them;
//   - each change of ours in the span that is not a search change, with its
//     reach per month over both populations (`population` on each entry, as
//     lib/reading/comparability.ts reads it): the relevance-gate fix (the
//     month's videos a gate verdict admitted unjudged, source 'default') and
//     attribution v3 (the month's videos first stored after it, whose filing it
//     decided). Any other change of ours in the span has no measure here; it
//     is printed, and the judge counts it as 10% on each view it moves (it
//     refuses them). A change that moves no view (`affects` empty: a segment
//     rule, VIEWS_BY_SURFACE.segment, or an attention-panel freeze) never
//     enters the judge's span, so it is printed as refusing nothing. A capped update
//     (log-tracking-eras --capped-run, an `other` row with field
//     'gather_capped') is not a change of ours at all: it is run health, a
//     gather flag that flags a pair and never refuses it (decision D rule 6;
//     the 26 Sep default R-c, lib/reading/gather-flags.ts from deploy 2). It
//     is printed as that, gets no entry and no reach row, and its shortfall is
//     in the row's gather figures;
//   - depth: the median dated comments a video in each month's market
//     (market_month_depth's figure);
//   - gather health per month: gathers run, partial or failed, and planned
//     searches not run (each run's config_snapshot);
//   - late capture: the earlier month's category comments first captured after
//     it ended (GC F30: August 4,923 of 10,188 on staging);
//   - WP1.8's one figure (added_only_curr of market_videos_curr): the later
//     month's MARKET videos whose search evidence is non-empty and made up only
//     of searches first run in that month, the provenance's 'ambiguous' rows
//     never counted (lib/provenance/searches.ts addedOnlyOf; the ruling of 26
//     Sep: 356 of 654 on staging). It is what "about half of September came
//     from searches we added in September" prints, on the market's base. The
//     strict search-outside count above is decision D's rule 2 and nothing
//     else. Null (not measured) where no provenance row is held yet: run
//     reconstruct-provenance first. The category's figure is printed here as a
//     check and never stored;
// and one `config_change_reach` row per measured change, month and population,
// once even where two pairs share the month (lib/provenance/searches.ts
// oneReachRowEach). A row identical to the newest one held is not written
// again.
//
// READ THROUGH the later month's latest update, found exactly as the judge
// finds it (lib/reading/pairs.ts laterMonthOf: completed or partial runs by
// completed_at), so the row is read while that is still the latest update and
// reads as unmeasured after the next one. The searches are those of every
// gather up to that update.
//
// A PAIR IS REFUSED when no update has read its later month yet (no gather on
// or after its first day): so no (Sep, Oct) row can be written on 30 Sep. A
// later month still in progress IS measured: the judge refuses a so-far month
// by itself (rule 1).
//
// READ-ONLY BY DEFAULT and never prompts. A staging dry run takes --export and
// --provenance where MF1 is not applied, and --gate-fix-at / --attribution-at
// stand in for the change rows log-tracking-eras writes.
//
//   node --env-file=.env.local --import tsx scripts/measure-comparability.ts --project <ref> \
//     [--pairs 2026-07:2026-08,2026-08:2026-09] [--prod-snapshot <file>] [--staging-export <file>] \
//     [--export <file>] [--provenance <file>] [--gate-fix-at <ISO>] [--attribution-at <ISO>] [--apply]

const NAME = 'measure-comparability'
// The computation is lib/provenance/measure.ts's (one copy, shared with the
// pipeline's `comparability` step from deploy 4, WP3.4); this script reads,
// prints and, with --apply, writes.
export const METHOD_VERSION = PAIR_METHOD_VERSION

const monthStart = (m: string): string => `${m.slice(0, 7)}-01`

async function main() {
  const args = parseScriptArgs(process.argv.slice(2), {
    name: NAME,
    values: ['pairs', 'prod-snapshot', 'staging-export', 'export', 'provenance', 'gate-fix-at', 'attribution-at'],
    defaultClient: SEALAND_CLIENT_ID,
  })
  assertProject(args, process.env.NEXT_PUBLIC_SUPABASE_URL, NAME)
  console.log(modeLine(args, NAME))
  // Each pair once, for the same reason as the reach rows: one insert cannot
  // hold a primary key twice.
  const pairs = [...new Map((args.values.pairs ?? '2026-07:2026-08,2026-08:2026-09').split(',').map((p) => {
    const [a, b] = p.split(':').map((m) => monthStart(m.trim()))
    if (!(a < b)) throw new Error(`${NAME}: --pairs ${p} is not an earlier:later month pair`)
    return [`${a}|${b}`, [a, b] as const] as const
  })).values()]
  const admin = createAdminClient()
  const pages: Pages = { n: 0 }

  const exportFile: ProvenanceExportFile | null = args.values.export ? readExportFile(args.values.export, args.clientId) : null
  const snapshots: ProvenanceSnapshot[] = []
  if (args.values['prod-snapshot']) snapshots.push(snapshotOf(readExportFile(args.values['prod-snapshot'], args.clientId), 'snapshot'))
  if (args.values['staging-export']) snapshots.push(snapshotOf(readExportFile(args.values['staging-export'], args.clientId), 'staging'))

  const [changes, videos, verdicts, keywordRows, runs] = await Promise.all([
    readConfigChanges(admin, args.clientId, pages),
    readVideos(admin, args.clientId, pages),
    readVerdicts(admin, args.clientId, pages),
    readKeywordRows(admin, args.clientId, pages),
    readRuns(admin, args.clientId, pages),
  ])
  const provenance = args.values.provenance
    ? readProvenanceFile(args.values.provenance)
    : await readProvenanceTable(admin, args.clientId, pages)
  if (provenance == null) console.log('  video_provenance is not there (MF1 not applied): first-found terms are not used; pass --provenance <plan file>')
  const now = new Date().toISOString()
  const ctx = measureContext({ clientId: args.clientId, now, changes, videos, verdicts, keywordRows, runs, provenance, snapshots })
  if (ctx.gathers.length === 0) throw new Error(`${NAME}: this client has no gather at all. Nothing to measure.`)

  // The two code changes may be stood in for on a dry run.
  for (const [surface, flag] of [['gate_rule', 'gate-fix-at'], ['attribution', 'attribution-at']] as const) {
    const at = args.values[flag]
    if (!at || ctx.ours.some((c) => c.surface === surface)) continue
    if (args.apply) throw new Error(`${NAME}: --${flag} stands in for a missing ${surface} row on a dry run only; run log-tracking-eras --apply first`)
    ctx.ours.push({ id: `(dry run: ${surface})`, surface, changedAt: new Date(at).toISOString(), note: null, affects: ['market', 'themes', 'brands', 'lens'] })
  }

  let measures
  try {
    measures = await measurePairs(ctx, {
      monthVideos: async (m) => {
        const fromDb = exportFile ? null : await readMonthVideos(admin, args.clientId, m, pages)
        return fromDb ?? (exportFile ? monthVideosFromExport(exportFile, m) : null)
      },
      monthComments: (m) => readMonthComments(admin, args.clientId, m, pages),
    }, pairs)
  } catch (e) {
    throw new Error(`${NAME}: ${e instanceof Error ? e.message : String(e)}`)
  }
  for (const m of measures) for (const line of m.lines) console.log(line)
  const pairRows = measures.flatMap((m) => (m.row ? [m.row] : []))

  // Adjacent pairs share a month, so a change inside both spans (the gate fix
  // and attribution v3, dated late in September, fall inside (Jul, Aug) and
  // (Aug, Sep)) is planned for August twice: one row per change, month and
  // population, or the insert fails on the primary key (oneReachRowEach).
  const { rows: reachRows, folded } = reachRowsOf(measures, ctx.updates)
  const foldedNote = folded > 0 ? `, after folding ${folded} repeats of a month two pairs share` : ''

  if (!args.apply) {
    console.log(`\nread-only: nothing written (${pairRows.length} pair rows and ${reachRows.length} reach rows planned${foldedNote}) · reads: ${pages.n} pages · at ${now}`)
    return
  }

  // Apply: skip what is already held exactly as it would be written.
  let heldPairs: HeldPair[]
  let heldReach: HeldReach[]
  try {
    heldPairs = await selectAll<HeldPair>(() => admin.from('month_pair_comparability').select('*').eq('client_id', args.clientId).order('computed_at').order('month'))
    heldReach = await selectAll(() => admin.from('config_change_reach')
      .select('change_id, month, population, videos_touched, videos_in_month, read_through_run')
      .eq('client_id', args.clientId).order('computed_at').order('change_id'))
    pages.n += Math.max(1, Math.ceil(heldPairs.length / 1000)) + Math.max(1, Math.ceil(heldReach.length / 1000))
  } catch (e) {
    if (isMissingObject(e, 'month_pair_comparability') || isMissingObject(e, 'config_change_reach')) {
      throw new Error(`${NAME}: MF1's tables are not on ${args.project}. Apply MF1 first. Nothing written.`)
    }
    throw e
  }
  const freshPairs = freshPairRows(heldPairs, pairRows)
  const freshReach = freshReachRows(heldReach, reachRows)
  if (freshPairs.length > 0) {
    const { error } = await admin.from('month_pair_comparability').insert(freshPairs)
    if (error) throw new Error(`${NAME}: pair rows not written: ${error.message}`)
  }
  if (freshReach.length > 0) {
    const { error } = await admin.from('config_change_reach').insert(freshReach.map((r) => ({
      client_id: args.clientId, ...r, method: CODE_REACH_METHOD,
    })))
    if (error) throw new Error(`${NAME}: reach rows not written (the pair rows were): ${error.message}`)
  }
  console.log(`\nAPPLIED: ${freshPairs.length} pair rows, ${freshReach.length} reach rows (${pairRows.length - freshPairs.length} and ${reachRows.length - freshReach.length} already held as they are${foldedNote}) · reads: ${pages.n} pages`)
}

if (process.argv[1]?.endsWith('measure-comparability.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
