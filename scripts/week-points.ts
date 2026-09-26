import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import type { SupabaseClient } from '@supabase/supabase-js'

import { PASS_A_MIN_COMMENTS_BY_PLATFORM, PASS_A_MIN_COMMENTS_DEFAULT, SEALAND_CLIENT_ID } from '../lib/config'
import type { ConfigChange } from '../lib/config-log'
import { assertProject, modeLine, parseScriptArgs } from '../lib/ops/market-first-args'
import { changesFromLog } from '../lib/reading/comparability'
import { KIND_LABELS } from '../lib/reading/kinds'
import {
  keepWeekPoints, WEEK_LINE_AGES, weekKindLabel, weeksToKeep, type KeepCandidate, type WeekLineObject,
  type WeekPointRow, type WeekRead, type WeekReadingRow, type WeekRun,
} from '../lib/reading/week-line'
import { firstPair, reachedCuts, weekLineCheck, weekLineCheckNote, type WeekFill } from '../lib/reading/week-line-check'
import { addDays, isoWeekOf, marketWeekRowOf, type MarketWeekRow, type MarketWeekRowRaw } from '../lib/reading/weeks'
import { subjectCalibration } from '../lib/subjects/calibration-state'
import { createAdminClient, selectAll } from '../lib/supabase-admin'
import { weekLineConfigFor } from '../lib/week-line-config'

// Keep each week's same-age point, and write the check note (market-first
// decision M, part 2; WP3.13 part A; plan §4.0 "Scripts").
//
//   --keep --out <file>   every week that reached its age (14 and 21 days
//                         while the age is open) at the LATEST completed
//                         update, read at its cut, written to a local file
//                         with its conditions and run ids. A capture must run
//                         between its age update and the next Sunday's, or
//                         that week's point is lost for good (readings keep
//                         moving after capture). Weeks already in --held
//                         files are skipped.
//   --check --files <a.json,b.json> --out <note.md>
//                         the Mon 26 Oct check note (and its Mon 2 Nov
//                         re-run): the fill against the 3% line, the six
//                         conditions for the first pair, and the results
//                         exactly as they would print.
//
// READ-ONLY, ALWAYS, IN THIS BUILD. `--apply --project <ref> --from-file …`
// (insert-if-absent into week_line_reads / week_line_points) comes with
// WP3.13's Stage 3a build, once MF4's tables exist; here --apply is refused.
// It writes only the local --out file. It never prompts, so it works through
// `!`. --project must be one of the two allow-listed refs and must match the
// Supabase URL it was started with, or nothing is read.
//
// THE READS (plan: at most 4 a capture; the production read ration, §7.6).
//   --keep:  pipeline_runs (1); market_week_volumes over the weeks to keep at
//            their shared cut (1: a week at 14 days and the week before it at
//            21 share their Monday); market_week_readings per week and age
//            (1 each); the Pass A prompt version in force at the age run, from
//            ai_call_log (1). On Mon 19 Oct that is 4; on Mon 26 Oct and
//            Mon 2 Nov, with two weeks to keep, 5.
//   --check: config_changes (1); subjects, for the rows' names and
//            calibration (1); market_week_volumes at a cut no kept file holds
//            (0 to 2).
// MF4's two functions must exist (applied Tue 6 Oct). Where they do not, the
// script says so and keeps nothing.
//
// A STAGING DRY RUN reads staging's own weeks: --first-week and --at move the
// line's first week and the clock (staging only; staging holds data to 20 Sep).
//
//   node --env-file=.env.local --import tsx scripts/week-points.ts --project <ref> --keep \
//     --out ~/.claude/plans/verbatim-market-first/data/week-points-<date>.json [--held <a.json,…>] [--ages 14,21] [--at <ISO>]
//   node --env-file=.env.local --import tsx scripts/week-points.ts --project <ref> --check \
//     --files <a.json,b.json> --out ~/.claude/plans/verbatim-market-first/status/week-line-check-<date>.md [--no-fill] [--at <ISO>]

const NAME = 'week-points'
const FILE_KIND = 'week-points'
const FILE_VERSION = 1
const STAGING = 'zfmxrrugaihxpubunleu'

/** The lane rule as the code holds it at capture: the comment floors that put a
 *  market video on the full lane. A change to them between two age runs refuses
 *  the pair ('reader'). */
const LANE_RULE = `min_comments:default=${PASS_A_MIN_COMMENTS_DEFAULT},${Object.entries(PASS_A_MIN_COMMENTS_BY_PLATFORM)
  .map(([p, n]) => `${p}=${n}`).join(',')}`

interface KeptFile {
  kind: typeof FILE_KIND
  version: typeof FILE_VERSION
  project: string
  clientId: string
  capturedAt: string
  latestUpdate: { id: string; finishedAt: string | null } | null
  reads: WeekRead[]
  rows: WeekPointRow[]
  /** The market_week_volumes rows each read was taken from, for the record. */
  volumes: MarketWeekRow[]
  reads_used: number
  note: string | null
}

let readsUsed = 0

async function readRuns(admin: SupabaseClient, clientId: string): Promise<WeekRun[]> {
  readsUsed++
  const rows = await selectAll<{ id: string; status: string; started_at: string | null; completed_at: string | null }>(() =>
    admin.from('pipeline_runs').select('id, status, started_at, completed_at').eq('client_id', clientId).order('started_at').order('id'))
  return rows.map((r) => ({ id: r.id, status: r.status, startedAt: r.started_at, finishedAt: r.completed_at }))
}

const missingMf4 = (error: { message?: string; code?: string } | null, fn: string): boolean =>
  !!error && (error.code === 'PGRST202' || error.code === '42883' || (error.message ?? '').includes(fn))

async function rpc<T>(admin: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T[]> {
  readsUsed++
  const { data, error } = await admin.rpc(fn, args)
  if (error) {
    if (missingMf4(error, fn)) {
      throw Object.assign(new Error(`${NAME}: ${fn} does not exist on this project: MF4 (supabase/migrations/…_market_first_weeks.sql) is not applied. Nothing written.`), { exitCode: 3 })
    }
    throw new Error(`${NAME}: ${fn}: ${error.message}`)
  }
  return (data ?? []) as T[]
}

async function promptVersionAt(admin: SupabaseClient, clientId: string, at: string | null): Promise<string> {
  readsUsed++
  let q = admin.from('ai_call_log').select('prompt_version, created_at').eq('client_id', clientId).eq('pass', 'pass_a')
  if (at) q = q.lte('created_at', at)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(1)
  if (error) throw new Error(`${NAME}: ai_call_log: ${error.message}`)
  return (data?.[0] as { prompt_version?: string } | undefined)?.prompt_version ?? 'unknown'
}

function readKeptFiles(paths: readonly string[], clientId: string): KeptFile[] {
  return paths.map((p) => {
    const f = JSON.parse(readFileSync(p, 'utf8')) as KeptFile
    if (f.kind !== FILE_KIND || f.version !== FILE_VERSION) throw new Error(`${NAME}: ${p} is not a ${FILE_KIND} v${FILE_VERSION} file`)
    if (f.clientId !== clientId) throw new Error(`${NAME}: ${p} holds client ${f.clientId}, not ${clientId}`)
    return f
  })
}

function writeOut(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
}

const list = (v: string | undefined): string[] => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])

async function keep(admin: SupabaseClient, args: ReturnType<typeof parseScriptArgs>, now: string, firstWeek: string): Promise<void> {
  const out = args.values.out
  if (!out) throw new Error(`${NAME}: --keep needs --out <file>`)
  if (existsSync(out)) throw new Error(`${NAME}: ${out} exists; a kept file is never overwritten`)
  const ages = (list(args.values.ages).length ? list(args.values.ages).map(Number) : [...WEEK_LINE_AGES]) as (14 | 21)[]
  if (!ages.every((a) => a === 14 || a === 21)) throw new Error(`${NAME}: --ages takes 14 and 21 only`)
  const held = new Set<string>()
  for (const f of readKeptFiles(list(args.values.held), args.clientId)) for (const r of f.reads) held.add(`${isoWeekOf(r.week)}|${r.ageDays}`)

  const runs = await readRuns(admin, args.clientId)
  const done = runs.filter((r) => (r.status === 'completed' || r.status === 'partial') && r.finishedAt && Date.parse(r.finishedAt) <= Date.parse(now))
  const latest = done.sort((a, b) => Date.parse(b.finishedAt!) - Date.parse(a.finishedAt!))[0] ?? null
  const candidates = weeksToKeep({ runs, now, firstWeek, ages, held })
  const cfg = weekLineConfigFor(args.clientId)!

  const file: KeptFile = {
    kind: FILE_KIND, version: FILE_VERSION, project: args.project, clientId: args.clientId, capturedAt: now,
    latestUpdate: latest ? { id: latest.id, finishedAt: latest.finishedAt } : null,
    reads: [], rows: [], volumes: [], reads_used: 0, note: null,
  }
  console.log(`clock ${now} · first week ${firstWeek} · latest update ${latest ? `${latest.id} (${latest.finishedAt})` : 'none'}`)
  if (candidates.length === 0) {
    file.note = 'No week reached its age at the latest update.'
    console.log(`nothing to keep: ${file.note}`)
  } else {
    const byCut = new Map<string, KeepCandidate[]>()
    for (const c of candidates) byCut.set(c.cutoff, [...(byCut.get(c.cutoff) ?? []), c])
    const volumes = new Map<string, MarketWeekRow[]>()
    for (const [cutoff, group] of byCut) {
      const weeks = group.map((c) => c.week).sort()
      const raw = await rpc<MarketWeekRowRaw>(admin, 'market_week_volumes', {
        p_client: args.clientId, p_from: weeks[0], p_to: addDays(weeks[weeks.length - 1], 7), p_captured_before: cutoff,
      })
      volumes.set(cutoff, raw.map(marketWeekRowOf))
    }
    const promptVersion = await promptVersionAt(admin, args.clientId, candidates[0].ageRun.finishedAt)
    for (const c of candidates) {
      const readings = await rpc<WeekReadingRow>(admin, 'market_week_readings', { p_client: args.clientId, p_week: c.week, p_age_days: c.ageDays })
      const vols = (volumes.get(c.cutoff) ?? []).filter((r) => r.week === c.week)
      const { read, rows } = keepWeekPoints({
        candidate: c, runs, volumes: vols, readings, promptVersion, laneRule: LANE_RULE, methodVersion: cfg.methodVersion, computedAt: now,
      })
      file.reads.push(read)
      file.rows.push(...rows)
      file.volumes.push(...vols)
      console.log(`kept the week of ${c.week} at ${c.ageDays} days (cut ${c.cutoff}, through ${c.ageRun.id}): ${read.videos} videos, ${read.comments} comments, mean ${read.meanDated.toFixed(2)}, median ${read.medianDated}, bands ${read.bands.join('/')}, unchecked ${read.unchecked}, older ${read.olderVideos}, updates ${read.runsInWeek} then ${read.runsAfter.join(', ')}${read.lateRun ? ', one late' : ''}, ${rows.length} point rows`)
    }
  }
  file.reads_used = readsUsed
  writeOut(out, `${JSON.stringify(file, null, 2)}\n`)
  console.log(`wrote ${out} · read-only: nothing written to the database · reads: ${readsUsed}`)
}

async function check(admin: SupabaseClient, args: ReturnType<typeof parseScriptArgs>, now: string, firstWeek: string): Promise<void> {
  const out = args.values.out
  if (!out) throw new Error(`${NAME}: --check needs --out <note.md>`)
  const files = readKeptFiles(list(args.values.files), args.clientId)
  const reads = files.flatMap((f) => f.reads)
  const rows = files.flatMap((f) => f.rows)
  const cfg = { ...weekLineConfigFor(args.clientId)!, firstWeek }

  readsUsed++
  const changeRows = await selectAll<ConfigChange>(() =>
    admin.from('config_changes').select('*').eq('client_id', args.clientId).order('changed_at').order('id'))
  const changes = changesFromLog(changeRows)

  readsUsed++
  const { data: subjects, error: subjectsError } = await admin.from('subjects')
    .select('id, name, status, calibrated_at, calibration_precision, calibration_n, calibration_judge_version')
    .eq('client_id', args.clientId)
  if (subjectsError) throw new Error(`${NAME}: subjects: ${subjectsError.message}`)
  const objects: WeekLineObject[] = [
    ...Object.keys(KIND_LABELS).map((k) => ({ objectKind: 'kind' as const, objectId: k, label: weekKindLabel(k) })),
    ...(subjects ?? []).filter((s) => s.status !== 'retired').map((s) => ({
      objectKind: 'subject' as const, objectId: s.id as string, label: s.name as string, calibration: subjectCalibration(s),
    })),
  ]

  // The fill: every cut the pair's weeks have reached that no kept file holds.
  const fills: WeekFill[] = []
  if (!args.flags.has('no-fill')) {
    const pair = firstPair(cfg.firstWeek)
    const missing = [pair.prevWeek, pair.week].flatMap((week) => reachedCuts(week, now)
      .filter((c) => !reads.some((r) => isoWeekOf(r.week) === week && r.ageDays === c.ageDays && r.comments != null))
      .map((c) => ({ week, ...c })))
    const byCut = new Map<string, string[]>()
    for (const m of missing) byCut.set(m.cutoff, [...(byCut.get(m.cutoff) ?? []), m.week])
    for (const [cutoff, weeks] of byCut) {
      const sorted = [...new Set(weeks)].sort()
      const vols = (await rpc<MarketWeekRowRaw>(admin, 'market_week_volumes', {
        p_client: args.clientId, p_from: sorted[0], p_to: addDays(sorted[sorted.length - 1], 7), p_captured_before: cutoff,
      })).map(marketWeekRowOf)
      for (const week of sorted) {
        const m = missing.find((x) => x.week === week && x.cutoff === cutoff)!
        fills.push({ week, ageDays: m.ageDays, comments: vols.filter((r) => r.week === week).reduce((a, r) => a + r.comments, 0) })
      }
    }
  }

  const rivalAudiences = [...new Set(rows.map((r) => r.audience).filter((a) => a.startsWith('competitor:')))]
  const result = weekLineCheck({ now, cfg, reads, rows, changes, rivalAudiences, fills, objects })
  const latest = files.map((f) => f.latestUpdate?.finishedAt ?? null).filter((x): x is string => !!x).sort().pop() ?? null
  const note = weekLineCheckNote(result, { project: args.project, client: args.clientId, latestUpdate: latest })
  writeOut(out, note)
  console.log(note)
  console.log(`wrote ${out} · read-only: nothing written to the database · reads: ${readsUsed}`)
}

async function main(): Promise<void> {
  const args = parseScriptArgs(process.argv.slice(2), {
    name: NAME,
    values: ['out', 'files', 'held', 'ages', 'at', 'first-week'],
    flags: ['keep', 'check', 'no-fill'],
    defaultClient: SEALAND_CLIENT_ID,
  })
  if (args.apply) {
    throw new Error(`${NAME}: --apply is refused in this build. It comes with WP3.13's Stage 3a build, once MF4's tables exist; nothing read.`)
  }
  const keepMode = args.flags.has('keep')
  if (keepMode === args.flags.has('check')) throw new Error(`${NAME}: say --keep or --check, one of them`)
  if ((args.values['first-week'] || args.values.at) && args.project !== STAGING) {
    throw new Error(`${NAME}: --first-week and --at are for a staging dry run only`)
  }
  assertProject(args, process.env.NEXT_PUBLIC_SUPABASE_URL, NAME)
  console.log(modeLine(args, NAME))
  const cfg = weekLineConfigFor(args.clientId)
  if (!cfg) {
    console.log(`${NAME}: client ${args.clientId} keeps no same-age line (no WEEK_LINE entry). Nothing to do.`)
    return
  }
  const now = args.values.at ?? new Date().toISOString()
  if (Number.isNaN(Date.parse(now))) throw new Error(`${NAME}: --at ${now} is not an instant`)
  const firstWeek = args.values['first-week'] ? isoWeekOf(args.values['first-week']) : cfg.firstWeek
  const admin = createAdminClient()
  if (keepMode) await keep(admin, args, now, firstWeek)
  else await check(admin, args, now, firstWeek)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit((e as { exitCode?: number })?.exitCode ?? 1)
})
