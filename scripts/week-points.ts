import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import type { SupabaseClient } from '@supabase/supabase-js'

import { PASS_A_MIN_COMMENTS_BY_PLATFORM, PASS_A_MIN_COMMENTS_DEFAULT, SEALAND_CLIENT_ID } from '../lib/config'
import type { ConfigChange } from '../lib/config-log'
import { assertProject, modeLine, parseScriptArgs, type ScriptArgs } from '../lib/ops/market-first-args'
import { changesFromLog } from '../lib/reading/comparability'
import { KIND_LABELS } from '../lib/reading/kinds'
import {
  captureWeekPoints, insertKeptWeeks, keepReportLines, supabaseCaptureReader, supabaseKeepStore, TABLE_WEEK_LINE_POINTS,
  TABLE_WEEK_LINE_READS, WeekTablesMissing, type KeepReport, type KeepStore,
} from '../lib/reading/week-keep'
import {
  WEEK_LINE_AGES, weekKindLabel, type WeekLineObject, type WeekPointRow, type WeekRead,
} from '../lib/reading/week-line'
import { firstPair, reachedCuts, weekLineCheck, weekLineCheckNote, type WeekFill } from '../lib/reading/week-line-check'
import { addDays, isoWeekOf, marketWeekRowOf, type MarketWeekRow, type MarketWeekRowRaw } from '../lib/reading/weeks'
import { subjectCalibration } from '../lib/subjects/calibration-state'
import { createAdminClient, selectAll } from '../lib/supabase-admin'
import { weekLineConfigFor } from '../lib/week-line-config'

// Keep each week's same-age point, write the check note, and write kept points
// (market-first decision M, part 2; WP3.13; plan §4.0 "Scripts").
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
//   --apply --from-file <a.json[,b.json]>
//                         THE ONE WRITE. Inserts the kept reads and points of
//                         each file into week_line_reads / week_line_points,
//                         oldest capture first, if absent: a key already held
//                         is never written twice and is reported (a second
//                         --apply of the same file inserts nothing and says
//                         so). What is written is the file's own computed_at
//                         and run ids, never this paste's clock. A file is
//                         applied only to the project it was captured on.
//
// ONE COPY. --keep's reads are lib/reading/week-keep.ts `captureWeekPoints`,
// and --apply's writes are its `insertKeptWeeks`: the same two functions
// WP3.4's `comparability` step calls from deploy 4, so the paste and the run
// cannot keep a week two different ways.
//
// SAFE BY FLAGS. Read-only unless --apply. --project is required, must be one
// of the two allow-listed refs, and must match the Supabase URL the script was
// started with, or nothing is read or written (lib/ops/market-first-args.ts).
// It never prompts, so it works through `!`.
//
// --test-target (with --apply only): write to a LOCAL throwaway cluster
// (MF_TEST_DB_URL, host 127.0.0.1 or localhost, refused otherwise) through
// psql as service_role, with the SQL PostgREST itself sends for an upsert that
// ignores duplicates (INSERT … SELECT … FROM jsonb_populate_recordset … ON
// CONFLICT DO NOTHING RETURNING). It is how --apply is tested before a paste
// (scripts/pg-shim/week-points-apply.sh); --project and the URL guard still
// apply.
//
// THE READS (plan: at most 4 or 5 a capture; the production read ration, §7.6).
//   --keep:  pipeline_runs (1); market_week_volumes over the weeks to keep at
//            their shared cut (1: a week at 14 days and the week before it at
//            21 share their Monday); the Pass A prompt version in force at the
//            age run, from ai_call_log (1); market_week_readings per week and
//            age (1 each). On Mon 19 Oct that is 4; on Mon 26 Oct and
//            Mon 2 Nov, with two weeks to keep, 5 (`WEEK_CAPTURE_READS_MAX`).
//   --check: config_changes (1); subjects, for the rows' names and
//            calibration (1); market_week_volumes at a cut no kept file holds
//            (0 to 2).
//   --apply: none, and one read of the held reads' computed_at when a key is
//            found held.
// MF4's functions and tables must exist (applied Tue 6 Oct). Where they do
// not, the script says so, keeps and writes nothing, and exits 3.
//
// A STAGING DRY RUN reads staging's own weeks: --first-week and --at move the
// line's first week and the clock (staging only; staging holds data to 20 Sep).
//
//   node --env-file=.env.local --import tsx scripts/week-points.ts --project <ref> --keep \
//     --out ~/.claude/plans/verbatim-market-first/data/week-points-<date>.json [--held <a.json,…>] [--ages 14,21] [--at <ISO>]
//   node --env-file=.env.local --import tsx scripts/week-points.ts --project <ref> --check \
//     --files <a.json,b.json> --out ~/.claude/plans/verbatim-market-first/status/week-line-check-<date>.md [--no-fill] [--at <ISO>]
//   node --env-file=.env.local --import tsx scripts/week-points.ts --project mkwjlckescdveosvrvaq --apply \
//     --from-file ~/.claude/plans/verbatim-market-first/data/week-points-2026-10-19.json,~/.claude/plans/verbatim-market-first/data/week-points-2026-10-26.json

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

const missingMf4 = (error: { message?: string; code?: string } | null, fn: string): boolean =>
  !!error && (error.code === 'PGRST202' || error.code === '42883' || (error.message ?? '').includes(fn))

async function rpc<T>(admin: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T[]> {
  readsUsed++
  const { data, error } = await admin.rpc(fn, args)
  if (error) {
    if (missingMf4(error, fn)) throw new WeekTablesMissing(fn)
    throw new Error(`${NAME}: ${fn}: ${error.message}`)
  }
  return (data ?? []) as T[]
}

function readKeptFiles(paths: readonly string[], clientId: string): (KeptFile & { path: string })[] {
  return paths.map((p) => {
    const f = JSON.parse(readFileSync(p, 'utf8')) as KeptFile
    if (f.kind !== FILE_KIND || f.version !== FILE_VERSION) throw new Error(`${NAME}: ${p} is not a ${FILE_KIND} v${FILE_VERSION} file`)
    if (f.clientId !== clientId) throw new Error(`${NAME}: ${p} holds client ${f.clientId}, not ${clientId}`)
    return { ...f, path: p }
  })
}

function writeOut(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
}

const list = (v: string | undefined): string[] => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])

async function keep(admin: SupabaseClient, args: ScriptArgs, now: string, firstWeek: string): Promise<void> {
  const out = args.values.out
  if (!out) throw new Error(`${NAME}: --keep needs --out <file>`)
  if (existsSync(out)) throw new Error(`${NAME}: ${out} exists; a kept file is never overwritten`)
  const ages = (list(args.values.ages).length ? list(args.values.ages).map(Number) : [...WEEK_LINE_AGES]) as (14 | 21)[]
  if (!ages.every((a) => a === 14 || a === 21)) throw new Error(`${NAME}: --ages takes 14 and 21 only`)
  const held = new Set<string>()
  for (const f of readKeptFiles(list(args.values.held), args.clientId)) for (const r of f.reads) held.add(`${isoWeekOf(r.week)}|${r.ageDays}`)
  const cfg = weekLineConfigFor(args.clientId)!

  const got = await captureWeekPoints(supabaseCaptureReader(admin, args.clientId), {
    now, firstWeek, ages, held, methodVersion: cfg.methodVersion, laneRule: LANE_RULE,
  })
  readsUsed += got.readsUsed
  const latest = got.latestUpdate
  console.log(`clock ${now} · first week ${firstWeek} · latest update ${latest ? `${latest.id} (${latest.finishedAt})` : 'none'}`)
  if (got.note) console.log(`nothing to keep: ${got.note}`)
  for (const read of got.reads) {
    const rows = got.rows.filter((r) => r.week === read.week && r.ageDays === read.ageDays).length
    console.log(`kept the week of ${read.week} at ${read.ageDays} days (cut ${read.capturedBefore}, through ${read.readThroughRun}): ${read.videos} videos, ${read.comments} comments, mean ${read.meanDated.toFixed(2)}, median ${read.medianDated}, bands ${read.bands.join('/')}, unchecked ${read.unchecked}, older ${read.olderVideos}, updates ${read.runsInWeek} then ${read.runsAfter.join(', ')}${read.lateRun ? ', one late' : ''}, ${rows} point rows`)
  }
  const file: KeptFile = {
    kind: FILE_KIND, version: FILE_VERSION, project: args.project, clientId: args.clientId, capturedAt: now,
    latestUpdate: latest, reads: got.reads, rows: got.rows, volumes: got.volumes, reads_used: readsUsed, note: got.note,
  }
  writeOut(out, `${JSON.stringify(file, null, 2)}\n`)
  console.log(`wrote ${out} · read-only: nothing written to the database · reads: ${readsUsed}`)
}

async function check(admin: SupabaseClient, args: ScriptArgs, now: string, firstWeek: string): Promise<void> {
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

// ---- --apply ------------------------------------------------------------------------------------

const TABLES = new Set([TABLE_WEEK_LINE_READS, TABLE_WEEK_LINE_POINTS])
const IDENT_RE = /^[a-z_]+$/
const PG_PSQL = `${process.env.PG_BIN ?? '/opt/homebrew/opt/postgresql@17/bin'}/psql`

/** The local cluster --test-target writes to: MF_TEST_DB_URL, and only a
 *  127.0.0.1 or localhost host. */
function testTargetUrl(): string {
  const url = process.env.MF_TEST_DB_URL ?? ''
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    throw new Error(`${NAME}: --test-target needs MF_TEST_DB_URL (a local cluster). Nothing written.`)
  }
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`${NAME}: REFUSED: --test-target takes a local cluster only; host is '${host}'. Nothing written.`)
  }
  return url
}

/** The keep store on a local cluster, through psql as service_role (the role
 *  PostgREST's service key runs as), with PostgREST's own insert shape. */
function psqlKeepStore(url: string): KeepStore {
  const sql = (text: string): unknown => {
    const out = execFileSync(PG_PSQL, [url, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-'], {
      input: `set role service_role;\n${text}\n`,
      // Nothing from the caller's shell but PATH: no PG* variable or
      // DATABASE_URL can point psql anywhere but the local URL given.
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin' } as unknown as NodeJS.ProcessEnv,
      encoding: 'utf8',
    })
    // -q prints no command tag, so the output is the one JSON value (json_agg
    // puts a newline between elements, which JSON reads as whitespace).
    return JSON.parse(out.trim() || '[]')
  }
  const quoted = (json: string): string => {
    if (json.includes('$wk$')) throw new Error(`${NAME}: a kept row holds the quote tag; nothing written`)
    return `$wk$${json}$wk$`
  }
  return {
    async insertIfAbsent(table, rows, conflict, returning) {
      if (rows.length === 0) return []
      const cols = Object.keys(rows[0] as Record<string, unknown>)
      if (!TABLES.has(table) || ![...cols, ...conflict, ...returning].every((c) => IDENT_RE.test(c))) {
        throw new Error(`${NAME}: refusing to write ${table} (${cols.join(', ')})`)
      }
      const list = cols.join(', ')
      return sql(`with ins as (
  insert into public.${table} (${list})
  select ${list} from jsonb_populate_recordset(null::public.${table}, ${quoted(JSON.stringify(rows))}::jsonb)
  on conflict (${conflict.join(', ')}) do nothing
  returning ${returning.join(', ')})
select coalesce(json_agg(ins), '[]'::json) from ins;`) as Record<string, unknown>[]
    },
    async heldReads(clientId, keys) {
      if (keys.length === 0) return []
      const weeks = [...new Set(keys.map((k) => k.week))]
      if (!weeks.every((w) => /^\d{4}-\d{2}-\d{2}$/.test(w)) || !/^[0-9a-f-]{36}$/.test(clientId)) throw new Error(`${NAME}: malformed key`)
      const held = sql(`select coalesce(json_agg(t), '[]'::json) from (
  select week, age_days, method_version, computed_at, read_through_run from public.${TABLE_WEEK_LINE_READS}
  where client_id = '${clientId}' and week = any(array[${weeks.map((w) => `'${w}'`).join(', ')}]::date[])) t;`) as {
        week: string; age_days: number; method_version: string; computed_at: string; read_through_run: string | null
      }[]
      const wanted = new Set(keys.map((k) => `${k.week}|${k.ageDays}|${k.methodVersion}`))
      return held.filter((h) => wanted.has(`${h.week}|${h.age_days}|${h.method_version}`))
    },
  }
}

async function apply(args: ScriptArgs): Promise<void> {
  const paths = list(args.values['from-file'])
  if (paths.length === 0) throw new Error(`${NAME}: --apply needs --from-file <a.json[,b.json]>. Nothing written.`)
  const files = readKeptFiles(paths, args.clientId)
  for (const f of files) {
    if (f.project !== args.project) {
      throw new Error(`${NAME}: REFUSED: ${f.path} was captured on ${f.project}; it is applied only there, not on ${args.project}. Nothing written.`)
    }
  }
  const testTarget = args.flags.has('test-target')
  const store = testTarget ? psqlKeepStore(testTargetUrl()) : supabaseKeepStore(createAdminClient())
  if (testTarget) console.log(`${NAME}: TEST TARGET (a local throwaway cluster, not ${args.project})`)
  // Oldest capture first: where two files hold one key, the first capture of
  // it is the one kept (a later one is reported as held from another capture).
  const ordered = [...files].sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt))
  const total: KeepReport = { inserted: [], completed: [], held: [], points: { offered: 0, inserted: 0 } }
  for (const f of ordered) {
    const report = await insertKeptWeeks(store, { clientId: args.clientId, reads: f.reads, rows: f.rows })
    console.log(`${f.path} (captured ${f.capturedAt}):`)
    for (const line of keepReportLines(report)) console.log(`  ${line}`)
    total.inserted.push(...report.inserted)
    total.completed.push(...report.completed)
    total.held.push(...report.held)
    total.points.offered += report.points.offered
    total.points.inserted += report.points.inserted
  }
  const theFiles = files.length === 1 ? 'the file' : `the ${files.length} files`
  console.log(files.every((f) => f.reads.length === 0)
    ? `APPLIED: nothing inserted; ${theFiles} hold${files.length === 1 ? 's' : ''} no kept read (${ordered.map((f) => f.note ?? 'no note').join('; ')})`
    : total.inserted.length === 0 && total.points.inserted === 0
    ? `APPLIED: nothing inserted; every read in ${theFiles} is already held`
    : `APPLIED: ${total.inserted.length} read(s) and ${total.points.inserted} point row(s) inserted; ${total.completed.length + total.held.length} read(s) already held and left alone`)
}

async function main(): Promise<void> {
  const args = parseScriptArgs(process.argv.slice(2), {
    name: NAME,
    values: ['out', 'files', 'held', 'ages', 'at', 'first-week', 'from-file'],
    flags: ['keep', 'check', 'no-fill', 'test-target'],
    defaultClient: SEALAND_CLIENT_ID,
  })
  const keepMode = args.flags.has('keep')
  const checkMode = args.flags.has('check')
  if (args.apply) {
    if (keepMode || checkMode) throw new Error(`${NAME}: --apply writes kept files and reads nothing: say --apply or --keep or --check, one of them`)
    if (args.values.at || args.values['first-week']) throw new Error(`${NAME}: --at and --first-week are for a staging dry run, not --apply`)
  } else {
    if (args.flags.has('test-target')) throw new Error(`${NAME}: --test-target goes with --apply only`)
    if (keepMode === checkMode) throw new Error(`${NAME}: say --keep or --check, one of them`)
    if ((args.values['first-week'] || args.values.at) && args.project !== STAGING) {
      throw new Error(`${NAME}: --first-week and --at are for a staging dry run only`)
    }
  }
  assertProject(args, process.env.NEXT_PUBLIC_SUPABASE_URL, NAME)
  console.log(modeLine(args, NAME))
  const cfg = weekLineConfigFor(args.clientId)
  if (!cfg) {
    console.log(`${NAME}: client ${args.clientId} keeps no same-age line (no WEEK_LINE entry). Nothing to do.`)
    return
  }
  if (args.apply) return apply(args)
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
