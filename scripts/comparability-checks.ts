import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import type { SupabaseClient } from '@supabase/supabase-js'

import { SEALAND_CLIENT_ID } from '../lib/config'
import { assertProject, modeLine, parseScriptArgs } from '../lib/ops/market-first-args'
import {
  evidenceMap, isMissingObject, readExportFile, readKeywordRows, readMonthVideos, readProvenanceTable, readRuns,
  readVerdicts, readVideos, snapshotOf, type Pages,
} from '../lib/provenance/load'
import type { ProvenanceSnapshot } from '../lib/provenance/reconstruct'
import { gathersOf, isOutside, unchangedSearches, type MonthVideo } from '../lib/provenance/searches'
import { KIND_LABELS } from '../lib/reading/kinds'
import { laterMonthOf } from '../lib/reading/pairs'
import {
  mayPrintMoved, populationSet, RECHECK_METHOD_VERSION, RECHECK_POPULATIONS, recheckRows, sameCheck, themesToCheck,
  type CheckObject, type CheckRow, type LensRow, type PopulationSet, type PopulationVideo, type RecheckPopulation,
} from '../lib/reading/recheck'
import { subjectCalibration } from '../lib/subjects/calibration-state'
import { createAdminClient, selectAll } from '../lib/supabase-admin'

// The re-check on the whole of a refused month pair (market-first decision D's
// secondary line, WP2.3; plan §4.0 "Scripts"; MF2 part A). Heinrich runs it
// with --apply on Tue 6 Oct (after MF2 and the 4 Oct run) and on Mon 12 Oct
// (after the 11 Oct run). No model call.
//
// For the pair (default August, September) it builds each population's
// videos from the two months' market (market_month_videos), the searches both
// months ran (as measure-comparability decides them), the segments_v1 labels
// (segments_for_videos) and the first-found provenance, reads lens_readings
// (MF2) over each population and month, and plans one comparability_checks row
// per object and population (lib/reading/recheck.ts): the verdict, its
// outcome, both sides, and the population's maker and noise shares. equal_age
// waits for WP3.4 (December): "checks pending".
//
// READ-ONLY BY DEFAULT, and it never prompts (it runs through `!`).
//   --project <ref>      required; one of the two allow-listed refs, and the
//                        Supabase URL must be that ref's (the host check).
//   --confirm            required to read PRODUCTION: it times a one-row
//                        probe first and stops over 3 s (plan §7.6).
//   --pair <prev:month>  default 2026-08:2026-09.
//   --plan-out <file>    also write the populations and the planned rows to a
//                        NEW local file.
//   --apply              write the planned rows, append-only; a row identical
//                        to the newest held for its key is not written again.
//                        Refused while the later month has not been read past
//                        its end.
//   --apply --check      every guard of --apply (MF2 there, the held rows
//                        read), then what would be written; writes nothing.
//   --max-reads <n>      stop before the n+1-th read (default 45).
//   --prod-snapshot / --staging-export <file>   first-found evidence files, as
//                        measure-comparability takes them.
//   --lens-file <file>   STAGING DRY RUN ONLY: lens_readings (MF2) is not on
//                        staging, so its rows come from this file, keyed
//                        "<population>|<month>" (population 'all' for the whole
//                        market); without it the dry run measures the
//                        populations and stops.
//
// THE READS (production, Sealand, about 36): the probe (1); videos, gate
// verdicts, keyword rows, runs and provenance (about 22 pages, the same reads
// measure-comparability makes); market_month_videos for both months (2);
// segments_for_videos (2); subjects (1); the latest themed run (1); theme
// labels (1); lens_readings for the whole market and three populations in
// both months (8); with --apply, the held rows (1).
//
//   cd ~/Documents/code/verbatim-mf-run && … node --env-file=.env.local --import tsx scripts/comparability-checks.ts \
//     --project mkwjlckescdveosvrvaq --confirm [--pair 2026-08:2026-09] [--prod-snapshot <file>] [--staging-export <file>] \
//     [--plan-out <file>] [--apply [--check]]

const NAME = 'comparability-checks'
const PRODUCTION = 'mkwjlckescdveosvrvaq'
const STAGING = 'zfmxrrugaihxpubunleu'
const PROBE_MAX_MS = 3000
const SEGMENT_CHUNK = 500
const CANDIDATE_KINDS = ['feature_request', 'purchase_intent'] as const

class Ration implements Pages {
  n = 0
  constructor(private readonly max: number) {}
  spend(k: number, what: string): void {
    this.n += k
    if (this.n > this.max) throw new Error(`${NAME}: the read ration (--max-reads ${this.max}) is spent at ${what}. Nothing written.`)
  }
}

const monthStart = (m: string): string => `${m.slice(0, 7)}-01`
const iso = (day: string): string => `${day}T00:00:00.000Z`
const pct = (x: number | null) => (x == null ? '-' : `${(x * 100).toFixed(1)}%`)

function writeNew(path: string, body: string): void {
  if (existsSync(path)) throw new Error(`${NAME}: ${path} exists; name a new file`)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
}

async function segmentsOf(admin: SupabaseClient, clientId: string, ids: readonly string[], ration: Ration): Promise<Map<string, PopulationVideo['segment']>> {
  const out = new Map<string, PopulationVideo['segment']>()
  for (let i = 0; i < ids.length; i += SEGMENT_CHUNK) {
    ration.spend(1, 'segments_for_videos')
    const { data, error } = await admin.rpc('segments_for_videos', { p_client: clientId, p_video_ids: ids.slice(i, i + SEGMENT_CHUNK) })
    if (error) throw new Error(`${NAME}: segments_for_videos: ${error.message}`)
    for (const r of (data ?? []) as { video_id: string; segment: string }[]) {
      out.set(r.video_id, r.segment === 'maker' || r.segment === 'noise' ? r.segment : 'market')
    }
  }
  return out
}

async function lensOf(admin: SupabaseClient, clientId: string, month: string, run: string | null, ids: readonly string[], minDated: number, ration: Ration, what: string): Promise<LensRow[]> {
  ration.spend(1, what)
  const rows = await selectAll<LensRow>(() =>
    admin.rpc('lens_readings', { p_client: clientId, p_month: month, p_run: run, p_video_ids: ids, p_min_dated_comments: minDated, p_captured_before: null })
      .order('audience').order('object_kind').order('object_id'))
  if (rows.length >= 1000) ration.spend(Math.ceil(rows.length / 1000) - 1, what)
  return rows.map((r) => ({ ...r, k: Number(r.k), n: Number(r.n) }))
}

async function main() {
  const args = parseScriptArgs(process.argv.slice(2), {
    name: NAME,
    values: ['pair', 'plan-out', 'max-reads', 'prod-snapshot', 'staging-export', 'lens-file', 'at'],
    flags: ['confirm', 'check'],
    defaultClient: SEALAND_CLIENT_ID,
  })
  assertProject(args, process.env.NEXT_PUBLIC_SUPABASE_URL, NAME)
  const check = args.flags.has('check')
  if (check && !args.apply) throw new Error(`${NAME}: --check goes with --apply (it runs the apply's guards and writes nothing)`)
  if (args.values['lens-file'] && (args.project !== STAGING || args.apply)) throw new Error(`${NAME}: --lens-file is a staging dry run only (no --apply, --project ${STAGING})`)
  if (args.values.at && (args.project !== STAGING || args.apply)) throw new Error(`${NAME}: --at moves the clock on a staging dry run only`)
  if (args.project === PRODUCTION && !args.flags.has('confirm')) {
    throw new Error(`${NAME}: reading production needs --confirm (it probes first and keeps to the read ration). Nothing read.`)
  }
  const [prevMonth, month] = (args.values.pair ?? '2026-08:2026-09').split(':').map((m) => monthStart(m.trim()))
  if (!prevMonth || !month || !(prevMonth < month) || !/^\d{4}-\d{2}-01$/.test(prevMonth) || !/^\d{4}-\d{2}-01$/.test(month)) {
    throw new Error(`${NAME}: --pair takes <earlier YYYY-MM>:<later YYYY-MM>`)
  }
  const ration = new Ration(Number(args.values['max-reads'] ?? 45))
  const now = args.values.at ? new Date(args.values.at).toISOString() : new Date().toISOString()
  console.log(modeLine(args, NAME) + (check ? ' (--check: nothing is written)' : ''))
  console.log(`  pair (${prevMonth.slice(0, 7)}, ${month.slice(0, 7)}), method ${RECHECK_METHOD_VERSION}, clock ${now}`)
  const admin = createAdminClient()

  if (args.project === PRODUCTION) {
    const t0 = Date.now()
    ration.spend(1, 'the probe')
    const { error } = await admin.from('clients').select('id').eq('id', args.clientId).limit(1)
    const ms = Date.now() - t0
    if (error) throw new Error(`${NAME}: the probe failed (${error.message}). Back off 15 minutes.`)
    console.log(`  probe: ${ms} ms`)
    if (ms > PROBE_MAX_MS) throw new Error(`${NAME}: the probe took ${ms} ms (over ${PROBE_MAX_MS}). Back off 15 minutes (plan §7.6).`)
  }

  // The searches both months ran, exactly as measure-comparability reads them.
  const [videos, verdicts, kp, runs] = await Promise.all([
    readVideos(admin, args.clientId, ration), readVerdicts(admin, args.clientId, ration),
    readKeywordRows(admin, args.clientId, ration), readRuns(admin, args.clientId, ration),
  ])
  ration.spend(0, 'the gather reads')
  const provenance = await readProvenanceTable(admin, args.clientId, ration)
  ration.spend(0, 'video_provenance')
  if (provenance == null) console.log('  video_provenance is not there (MF1 not applied): first-found terms are not used')
  const snapshots: ProvenanceSnapshot[] = []
  if (args.values['prod-snapshot']) snapshots.push(snapshotOf(readExportFile(args.values['prod-snapshot'], args.clientId), 'snapshot'))
  if (args.values['staging-export']) snapshots.push(snapshotOf(readExportFile(args.values['staging-export'], args.clientId), 'staging'))
  const evidence = evidenceMap({ videos, provenance, snapshots, verdicts })
  const gathers = gathersOf(kp, runs)
  const updates = runs.filter((r) => (r.status === 'completed' || r.status === 'partial') && r.completed_at)
    .map((r) => ({ id: r.id, finishedAt: r.completed_at as string }))
  const later = laterMonthOf(month, now, updates)
  const update = later.latestUpdateRunId ? updates.find((u) => u.id === later.latestUpdateRunId)! : null
  const lastGather = update ? gathers.filter((g) => g.at <= update.finishedAt).at(-1) ?? null : null
  console.log(`  ${month.slice(0, 7)}: ${later.state}, ${later.readToEnd ? 'read past its end' : 'NOT read past its end'}, latest update ${update?.id ?? '(none)'}${update ? ` of ${update.finishedAt}` : ''}`)
  if (!later.readToEnd && args.apply && !check) {
    throw new Error(`${NAME}: ${month.slice(0, 7)} has not been read past its end: no re-check is written for a month still filling at its end (plan WP2.3). Nothing written.`)
  }
  if (!update || !lastGather) throw new Error(`${NAME}: no update has read ${month.slice(0, 7)} yet. Nothing to check.`)
  const unchanged = unchangedSearches(gathers, iso(prevMonth), lastGather.runId)
  console.log(`  searches unchanged through both months: ${[...new Set([...unchanged].map((k) => k.split('\u0000')[1]))].sort().join(', ') || '(none)'}`)

  // Each month's market videos, with what decides their populations.
  const sides: Record<'prev' | 'curr', MonthVideo[]> = { prev: [], curr: [] }
  for (const [side, m] of [['prev', prevMonth], ['curr', month]] as const) {
    const set = await readMonthVideos(admin, args.clientId, m, ration)
    ration.spend(0, `market_month_videos ${m}`)
    if (!set) throw new Error(`${NAME}: market_month_videos is not on ${args.project}: MF1 is not applied. Nothing written.`)
    sides[side] = set
  }
  const segments = await segmentsOf(admin, args.clientId, [...new Set([...sides.prev, ...sides.curr].map((v) => v.id))], ration)
  const popVideos = (vs: readonly MonthVideo[]): PopulationVideo[] => vs.map((v) => ({
    id: v.id, dated: v.dated, segment: segments.get(v.id) ?? 'market',
    outside: isOutside(v, evidence.get(v.id), unchanged), ambiguous: provenance?.get(v.id)?.method === 'ambiguous',
  }))
  const pv = { prev: popVideos(sides.prev), curr: popVideos(sides.curr) }
  const sets = RECHECK_POPULATIONS.map((p) => ({ prev: populationSet(pv.prev, p), curr: populationSet(pv.curr, p) }))
  const buyers = (vs: readonly PopulationVideo[]) => vs.filter((v) => v.segment === 'market').length
  console.log(`\n  the market: ${prevMonth.slice(0, 7)} ${pv.prev.length} videos · ${month.slice(0, 7)} ${pv.curr.length}`)
  for (const s of sets) {
    const line = (x: PopulationSet) => `${x.ids.length} videos (base ${x.base}: makers ${x.makers}, off-topic ${x.noise}${x.population === 'same_searches_clean' ? `, left out as ambiguous ${x.ambiguous}` : ''})`
    const floor = Math.min(s.prev.ids.length, s.curr.ids.length) < 100 ? '  → under 100 on a side' : ''
    console.log(`  ${s.curr.population.padEnd(19)} ${prevMonth.slice(0, 7)} ${line(s.prev)} · ${month.slice(0, 7)} ${line(s.curr)}${floor}`)
  }
  console.log(`  equal_age           checks pending (both months at the same age after they ended: WP3.4, from December)`)
  const bPrev = buyers(pv.prev)
  console.log(`  buyers only (no makers, no off-topic): ${prevMonth.slice(0, 7)} ${bPrev} · ${month.slice(0, 7)} ${buyers(pv.curr)}${bPrev < 100 ? `  → too few in ${new Date(iso(prevMonth)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })} to check` : ''}`)

  // The objects: the market's kinds, its ready subjects, mood, and the themes.
  ration.spend(1, 'subjects')
  const { data: subs, error: sErr } = await admin.from('subjects')
    .select('id, name, status, calibrated_at, calibration_precision, calibration_n, calibration_judge_version').eq('client_id', args.clientId)
  if (sErr) throw new Error(`${NAME}: subjects: ${sErr.message}`)
  type SubjectRow = { id: string; name: string; status: string; calibrated_at: string | null; calibration_precision: number | string | null; calibration_n: number | string | null; calibration_judge_version: string | null }
  const live = ((subs ?? []) as SubjectRow[]).filter((s) => s.status !== 'retired')
  const ready = live.filter((s) => subjectCalibration(s) === 'ready')
  const notReady = live.filter((s) => subjectCalibration(s) !== 'ready')
  if (notReady.length) console.log(`\n  subjects with no verdict (not ready, decision C): ${notReady.map((s) => `${s.name} (${subjectCalibration(s)})`).join(', ')}`)
  ration.spend(1, 'the latest themed run')
  const { data: themed, error: tErr } = await admin.from('theme_observations').select('run_id, run_date').eq('client_id', args.clientId)
    .order('run_date', { ascending: false }).limit(1)
  if (tErr) throw new Error(`${NAME}: theme_observations: ${tErr.message}`)
  const themeRun = (themed?.[0] as { run_id?: string } | undefined)?.run_id ?? null
  console.log(`  themes read under the latest themed run: ${themeRun ?? '(none)'}`)

  // lens_readings: the whole market (follows_depth's reference, the theme
  // list) and each population, in both months.
  const allIds = { prev: pv.prev.map((v) => v.id), curr: pv.curr.map((v) => v.id) }
  const lensFile = args.values['lens-file'] ? JSON.parse(readFileSync(args.values['lens-file'], 'utf8')) as Record<string, LensRow[]> : null
  const lens = async (population: RecheckPopulation | 'all', m: string, ids: readonly string[], minDated: number): Promise<LensRow[] | null> => {
    if (lensFile) return lensFile[`${population}|${m}`] ?? null
    try {
      return await lensOf(admin, args.clientId, m, themeRun, ids, minDated, ration, `lens_readings ${population} ${m.slice(0, 7)}`)
    } catch (e) {
      if (isMissingObject(e, 'lens_readings')) return null
      throw e
    }
  }
  const wholePrev = await lens('all', prevMonth, allIds.prev, 1)
  if (wholePrev == null) {
    console.log(`\n  lens_readings is not on ${args.project} (MF2 not applied)${lensFile ? ' and not in --lens-file' : ''}: the populations are measured above; the checks are pending. Nothing written.`)
    if (args.values['plan-out']) writeNew(args.values['plan-out'], JSON.stringify({ kind: 'comparability-checks-plan', version: 1, project: args.project, clientId: args.clientId, prevMonth, month, themeRun, readThroughRun: update.id, populations: sets, rows: [] }, null, 2))
    if (args.apply && !check) throw new Error(`${NAME}: apply MF2 first.`)
    return
  }
  const wholeCurr = (await lens('all', month, allIds.curr, 1)) ?? []
  const popLens = []
  for (const s of sets) {
    const prev = await lens(s.curr.population, prevMonth, s.prev.ids, s.prev.minDated)
    const curr = await lens(s.curr.population, month, s.curr.ids, s.curr.minDated)
    popLens.push({ sets: s, lens: { prev: prev ?? [], curr: curr ?? [] } })
  }
  const themeIds = themesToCheck(wholePrev, wholeCurr)
  const labels = new Map<string, string>()
  if (themeIds.length && !lensFile) {
    ration.spend(1, 'theme labels')
    const { data } = await admin.from('theme_registry').select('id, canonical_label').in('id', themeIds)
    for (const r of (data ?? []) as { id: string; canonical_label: string | null }[]) labels.set(r.id, r.canonical_label ?? r.id)
  }
  const kindIds = [...new Set([...wholePrev, ...wholeCurr].filter((r) => r.object_kind === 'kind').map((r) => r.object_id))]
    .sort((a, b) => Object.keys(KIND_LABELS).indexOf(a) - Object.keys(KIND_LABELS).indexOf(b))
  const objects: CheckObject[] = [
    ...kindIds.map((id) => ({ kind: 'kind' as const, id, label: KIND_LABELS[id] ?? id })),
    ...ready.map((s) => ({ kind: 'subject' as const, id: s.id, label: s.name })),
    { kind: 'mood', id: 'positive', label: 'Positive' },
    ...themeIds.map((id) => ({ kind: 'theme' as const, id, label: labels.get(id) ?? id })),
  ]
  const rows = recheckRows({
    clientId: args.clientId, prevMonth, month, objects, whole: { prev: wholePrev, curr: wholeCurr },
    populations: popLens, readThroughRun: update.id,
  })

  // The report.
  const show = (r: CheckRow) => `${r.k_prev} of ${r.n_prev} → ${r.k_curr} of ${r.n_curr}: ${r.outcome}${r.verdict.changePts != null ? ` (${r.verdict.changePts > 0 ? '+' : ''}${r.verdict.changePts} pts, band ${r.verdict.bandPts})` : ''}`
  console.log('\n  the two candidates:')
  for (const kind of CANDIDATE_KINDS) {
    for (const r of rows.filter((x) => x.object_kind === 'kind' && x.object_id === kind)) {
      console.log(`    ${KIND_LABELS[kind].padEnd(22)} ${r.population.padEnd(19)} ${show(r)} · makers ${pct(r.population_makers)}, off-topic ${pct(r.population_noise)}`)
    }
  }
  console.log('    (about a third of buying-interest remarks sit on makers\' videos, and "I want to make this" is filed as buying interest)')
  const byOutcome = new Map<string, number>()
  for (const r of rows) byOutcome.set(`${r.population}|${r.outcome}`, (byOutcome.get(`${r.population}|${r.outcome}`) ?? 0) + 1)
  console.log(`\n  ${rows.length} rows (${objects.length} objects × ${sets.length} populations): ${[...byOutcome].map(([k, n]) => `${k} ${n}`).join(' · ')}`)
  for (const r of rows.filter(mayPrintMoved)) console.log(`    MOVED on the searches both months ran (provisional): ${r.object_kind} ${r.verdict.objectLabel} ${show(r)}`)
  for (const r of rows.filter((x) => x.outcome === 'follows_depth')) console.log(`    follows depth: ${r.object_kind} ${r.verdict.objectLabel} ${show(r)}`)

  if (args.values['plan-out']) {
    writeNew(args.values['plan-out'], JSON.stringify({
      kind: 'comparability-checks-plan', version: 1, project: args.project, clientId: args.clientId, prevMonth, month,
      themeRun, readThroughRun: update.id, createdAt: now, populations: sets, rows,
    }, null, 2))
    console.log(`\n  plan written: ${args.values['plan-out']} (${rows.length} rows)`)
  }
  if (!args.apply) {
    console.log(`\nread-only: nothing written (${rows.length} rows planned) · reads: ${ration.n}`)
    return
  }

  // Apply: skip a row identical to the newest one held for its key.
  let held: (Pick<CheckRow, 'population' | 'object_kind' | 'object_id' | 'k_prev' | 'n_prev' | 'k_curr' | 'n_curr' | 'outcome' | 'read_through_run' | 'method_version' | 'population_makers' | 'population_noise'> & { computed_at: string })[]
  try {
    held = await selectAll(() => admin.from('comparability_checks')
      .select('population, object_kind, object_id, k_prev, n_prev, k_curr, n_curr, outcome, read_through_run, method_version, population_makers, population_noise, computed_at')
      .eq('client_id', args.clientId).eq('prev_month', prevMonth).eq('month', month).order('computed_at').order('object_id'))
    ration.spend(Math.max(1, Math.ceil(held.length / 1000)), 'the held rows')
  } catch (e) {
    if (!isMissingObject(e, 'comparability_checks')) throw e
    if (!check) throw new Error(`${NAME}: comparability_checks is not on ${args.project}: apply MF2 first. Nothing written.`)
    console.log('  comparability_checks is not there (MF2 not applied): read as empty for --check')
    held = []
  }
  const newest = new Map<string, (typeof held)[number]>()
  for (const h of held) newest.set(`${h.population}|${h.object_kind}|${h.object_id}`, h)
  const fresh = rows.filter((r) => {
    const h = newest.get(`${r.population}|${r.object_kind}|${r.object_id}`)
    return !(h && sameCheck(h, r))
  })
  if (check) {
    console.log(`\n--check: would insert ${fresh.length} rows (${rows.length - fresh.length} held as they are) · reads: ${ration.n}. Nothing written.`)
    return
  }
  for (let i = 0; i < fresh.length; i += 500) {
    const { error } = await admin.from('comparability_checks').insert(fresh.slice(i, i + 500))
    if (error) throw new Error(`${NAME}: insert failed (re-run: rows held as they are are skipped): ${error.message}`)
  }
  console.log(`\nAPPLIED: ${fresh.length} rows (${rows.length - fresh.length} held as they are) · reads: ${ration.n}`)
}

if (process.argv[1]?.endsWith('comparability-checks.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
