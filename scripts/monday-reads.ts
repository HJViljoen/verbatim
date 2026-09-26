import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { SEALAND_CLIENT_ID, SUBREDDIT_MAX_KNOWN } from '../lib/config'
import { MARKET_FIRST_PROJECTS, assertProject, parseScriptArgs, type ScriptArgs } from '../lib/ops/market-first-args'
import {
  SEALAND_NAME, anyOf, boardOf, calibrationStates, carriesOnlyCurrent, currentSearchTerms, dayOf, evidenceByVideo, excerpt,
  freshPath, inCategory, inMarket, isFinalRun, matchKindTally, membershipPlan, ofN, onlyFrom, pickTargetRun, pooledBy, runsOnDays,
  schedulesVerdict, searchSetDiff, searchesPerPlatform, termsFirstSearchedSince, themeSegments, videoNameHits, videosNamed,
  type BoardTheme, type TextVideo, type ThemeSegments,
} from '../lib/ops/monday-reads'
import { firstSearched, gathersOf, termDelta, type KeywordRow } from '../lib/provenance/searches'
import { activeCommunities } from '../lib/reading/comparability'
import { pooledDenominators } from '../lib/reading/market'
import { marketRivalAudiences } from '../lib/reading/reading-view'
import { INDUSTRY_AUDIENCE, audienceOf } from '../lib/rivals'
import { createAdminClient } from '../lib/supabase-admin'
import type { ProvenanceExport } from './export-provenance'

// Heinrich's ONE read-only Monday command, after the Sun 27 Sep 06:00 run and
// before the deploy-1 push (market-first plan WP1.0, WP1.8, §5.5, §5.6; run by
// ~/.claude/plans/verbatim-market-first/run/mon-readonly.sh, never on its own
// in a paste that has not checked the tag).
//
// WHAT IT READS, in four parts, one query in flight, every page counted:
//   c  the deploy-1 prechecks: Sealand's runs since 19 Sep (the clustering_key
//      of the 20, 24 and 27 Sep runs; the 27 Sep run's status and errors), any
//      run still in flight on any tenant, and Sealand's report_schedules (every
//      row off, 451aa647 among them);
//   a  WP1.0's grounding: the provenance SNAPSHOT first (full-lane videos with
//      their source_keywords; gate verdicts and keyword rows since the staging
//      export's last row), then the month tables (denominators Jun–Sep; subject,
//      kind and audience readings Aug–Sep; the top 40 category themes of Sep and
//      Aug with their registry labels), the run's theme observations (match
//      kinds: how many identities it minted), subjects and calibration,
//      attention panels, config_changes since 1 Sep, the search set and the
//      communities, the tracked rivals, and the evidence quotes of the top five
//      themes not led by makers, with each comment's account;
//   b  WP1.8's production measures: makers and noise on the top September
//      themes under production ids (the v1 rule computed here, as MF1 would),
//      the themes at 10+ not led by makers, the lead and its new-search share,
//      the pooled market figures, "{measured} of September's videos came from
//      searches we added in September", the legacy share, and the name line;
//   d  the six month tables' Sealand row counts and latest read_at, the
//      baseline before Wednesday's applies.
//
// READ-ONLY, ALWAYS. There is no write path in this file: --apply and --write
// are refused, and it writes local files only (the snapshot, the grounding
// JSON, the summary). --project is required and allow-listed
// (lib/ops/market-first-args.ts), and it refuses before any read when the
// Supabase URL is another project's. It never prompts, so it works through `!`.
//
// THE RATION (plan §7.6). A timed probe first: over 3 s, or an error, and it
// stops ("wait fifteen minutes"). Every PostgREST request is one page, counted
// against its part's cap (--max-pages c=6,a=28,b=16,d=14); a part that reaches
// its cap stops reading and says which figures it did not read. Pages are
// spared where one read can carry more: labels and quote comments come
// embedded (each by its one foreign key), a count rides on a row read, the
// match kinds stop at the first 'exact', and the membership reads go across
// platforms. Two requests over 3 s in a row stop everything (§7.11), keeping
// what was already written.
// A step that fails (a column this project does not have) is recorded and the
// next step runs, so one surprise never costs the snapshot.
//
//   node --env-file=.env.local --import tsx scripts/monday-reads.ts --confirm --project <ref> \
//     --snapshot-out <file> --grounding-out <file> --summary-out <file> \
//     [--staging-export <WP0.1 file>] [--run <id>] [--run-day 2026-09-27] [--parts c,a,b,d] [--max-pages c=6,a=28,b=16,d=14]
//   … --check-host --project <ref>              prints the project the env points at; reads nothing
//   … --dump-summary <loader-dump file> --project <ref>   the size headline from a loader dump; local only

const NAME = 'monday-reads'
const MONTH = '2026-09-01'
const NEXT_MONTH = '2026-10-01'
const PREV_MONTH = '2026-08-01'
const RUNS_SINCE = '2026-09-19T00:00:00Z'
const CHANGES_SINCE = '2026-09-01T00:00:00Z'
const SCHEDULE_ID = '451aa647'
const PAGE = 1000
const IN_CHUNK = 100
const SLOW_MS = 3_000
const TOP_THEMES = 40
const QUOTE_THEMES = 5
const QUOTE_INSIGHTS_PER_THEME = 40
const QUOTES_PER_THEME = 8
const QUOTE_CANDIDATES_PER_THEME = 20
const DEFAULT_CAPS: Record<string, number> = { probe: 1, c: 6, a: 28, b: 16, d: 14 }
const SIX_TABLES = ['month_denominators', 'month_theme_readings', 'month_subject_readings', 'month_kind_readings', 'month_audience_stats', 'month_evidence_refs'] as const

// ---- The reader: one query in flight, every page counted ---------------------------------

class RationReached extends Error {}
class TooSlow extends Error {}

type Res<T> = { data: T[] | null; error: unknown; count?: number | null }
type Ranged<T> = { range: (from: number, to: number) => PromiseLike<Res<T>> }
const errText = (e: unknown): string => (e as { message?: string })?.message ?? String(e)

interface ReadLog { part: string; label: string; pages: number; rows: number; ms: number; slowest: number; counted?: number }

class Reader {
  part = 'probe'
  used: Record<string, number> = {}
  log: ReadLog[] = []
  private streak = 0
  constructor(readonly caps: Record<string, number>) {}

  private async request<R>(label: string, run: () => PromiseLike<R>): Promise<{ r: R; ms: number }> {
    const cap = this.caps[this.part] ?? 0
    if ((this.used[this.part] ?? 0) >= cap) throw new RationReached(`part ${this.part} reached its ration of ${cap} pages before "${label}"`)
    const t = Date.now()
    const r = await run()
    const ms = Date.now() - t
    this.used[this.part] = (this.used[this.part] ?? 0) + 1
    if (ms > SLOW_MS) {
      this.streak++
      console.log(`  ! ${label}: ${ms} ms (over ${SLOW_MS} ms)`)
      if (this.streak >= 2) throw new TooSlow(`two reads in a row over ${SLOW_MS} ms (the last: "${label}", ${ms} ms). Stopped (plan §7.11). Wait fifteen minutes.`)
    } else this.streak = 0
    return { r, ms }
  }

  private note(label: string, pages: number, rows: number, total: number, slowest: number, counted: number | null = null): void {
    this.log.push({ part: this.part, label, pages, rows, ms: total, slowest, ...(counted != null ? { counted } : {}) })
    console.log(`  · ${label}: ${rows} rows${counted != null ? ` (of ${counted} counted)` : ''}, ${pages} page${pages === 1 ? '' : 's'}, ${total} ms`)
  }

  /** Every row, a page of 1,000 at a time. */
  async rows<T>(label: string, build: () => Ranged<T>): Promise<T[]> {
    return (await this.paged(label, build)).rows
  }

  /** Pages of 1,000 until a short one, or until `until` says a page (with the
   *  count a `count: 'exact'` select carries) leaves nothing to learn. */
  async paged<T>(label: string, build: () => Ranged<T>, until?: (page: readonly T[], count: number | null) => boolean): Promise<{ rows: T[]; count: number | null }> {
    const out: T[] = []
    let count: number | null = null
    let pages = 0
    let total = 0
    let slowest = 0
    for (let from = 0; ; from += PAGE) {
      const { r, ms } = await this.request(label, () => build().range(from, from + PAGE - 1))
      pages++
      total += ms
      slowest = Math.max(slowest, ms)
      if (r.error) throw new Error(`${label}: ${errText(r.error)}`)
      const data = r.data ?? []
      if (count == null && typeof r.count === 'number') count = r.count
      out.push(...data)
      if (data.length < PAGE || until?.(data, count)) break
    }
    this.note(label, pages, out.length, total, slowest)
    return { rows: out, count }
  }

  /** One request (a `limit` read), one page. */
  async one<T>(label: string, query: PromiseLike<Res<T>>): Promise<T[]> {
    return (await this.oneCounted(label, query)).rows
  }

  /** One request, one page, with the count a `count: 'exact'` select carries
   *  (the rows the filter matches, not the rows returned). */
  async oneCounted<T>(label: string, query: PromiseLike<Res<T>>): Promise<{ rows: T[]; count: number | null }> {
    const { r, ms } = await this.request(label, () => query)
    if (r.error) throw new Error(`${label}: ${errText(r.error)}`)
    const count = typeof r.count === 'number' ? r.count : null
    this.note(label, 1, (r.data ?? []).length, ms, ms, count)
    return { rows: r.data ?? [], count }
  }

  timed(label: string): number | null {
    const hit = [...this.log].reverse().find((l) => l.label === label)
    return hit ? hit.ms : null
  }
}

function parseCaps(v: string | undefined): Record<string, number> {
  const caps = { ...DEFAULT_CAPS }
  if (!v) return caps
  for (const part of v.split(',')) {
    const [k, n] = part.split('=').map((s) => s.trim())
    const num = Number(n)
    if (!(k in caps) || !Number.isInteger(num) || num < 0) throw new Error(`${NAME}: --max-pages ${v}: say part=pages, parts ${Object.keys(caps).join(', ')}`)
    caps[k] = num
  }
  return caps
}

// ---- Row shapes ---------------------------------------------------------------------------

interface RunRow {
  id: string; status: string | null; started_at: string | null; completed_at: string | null; scheduled_for: string | null
  period: string | null; clustering_key: string | null; error_message: string | null; errors: unknown; steps_completed: string[] | null
  stalled: boolean | null; videos_scraped: number | null; window_start: string | null; window_end: string | null; config_snapshot?: unknown
}
interface VideoRow extends TextVideo {
  platform: string; video_id: string; analyzed_lane: string | null; first_seen: string; source: string | null; account_name: string | null
}
interface VerdictRow { run_id: string | null; platform: string; video_id: string; keyword: string | null; kept: boolean; source: string; created_at: string }
interface KpRow extends KeywordRow { bucket: string | null; videos_found?: number | null; gate_survived?: number | null }
interface MonthRow { month: string; audience: string; videos: number; comments: number; status?: string | null; clustering_key?: string | null; read_at?: string | null; frozen_at?: string | null; run_id?: string | null }
interface ThemeReadingRow extends MonthRow { theme_id: string }
interface StatRow { month: string; audience: string; judged: number; positive: number; negative: number; neutral: number; mixed: number; status?: string | null; read_at?: string | null; frozen_at?: string | null }
interface ObservationRow { theme_id: string; label: string | null; category: string | null; match_kind: string | null; match_score: number | null; evidence_count: number | null; member_insight_ids: string[] | null }
interface RegistryRow { id: string; canonical_label: string | null; bucket: string | null; status: string | null; first_seen_at: string | null }
interface SubjectRow { id: string; name: string; status: string | null; origin: string | null; calibrated_at: string | null; calibration_precision: number | string | null; calibration_n: number | string | null; calibration_judge_version: string | null }
interface ChangeRow { id: string; changed_at: string; surface: string; field: string | null; before: unknown; after: unknown; actor_kind: string | null; source: string | null; note: string | null; affects_months: string | null }
interface TrackingRow { brand_keywords: string[] | null; competitor_keywords: string[] | null; industry_keywords: string[] | null; competitor_names: string[] | null; platforms: string[] | null; subreddits: unknown; exclude_terms: string[] | null; report_period: string | null; report_day: string | null; updated_at: string | null }
interface ExportFile {
  exportedAt: string; clientId: string
  videos: { id: string; platform: string; video_id: string; source_keywords: string[] | null }[]
  videoMonths: { video_id: string; month: string; dated_comments: number }[]
  gateVerdicts: VerdictRow[]
  keywordPerformance: KeywordRow[]
  runs: { id: string; started_at: string | null; status: string | null }[]
}

const md5 = (x: unknown): string => createHash('md5').update(JSON.stringify(x)).digest('hex')
const maxAt = (xs: readonly { created_at: string }[]): string | null => xs.reduce<string | null>((m, x) => (m == null || x.created_at > m ? x.created_at : m), null)
const short = (id: string | null | undefined): string => (id ?? '-').slice(0, 8)
/** A many-to-one embed: PostgREST sends an object; the untyped client's inference says an array. */
const embedded = <T>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null))
/** A path under the plan folder, as the paste-back block prints it. */
const rel = (p: string): string => p.replace(`${process.env.HOME ?? ''}/.claude/plans/verbatim-market-first/`, '')
const pct = (x: number | null | undefined): string => (x == null ? 'not measured' : `${(100 * x).toFixed(1)}%`)
function chunks<T>(xs: readonly T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}
/** Never overwrite a file that already exists: the snapshot cannot be retaken
 *  (freshPath finds a free name; 'wx' refuses one taken since). */
function writeJson(path: string, value: unknown): string {
  mkdirSync(dirname(path), { recursive: true })
  const text = JSON.stringify(value, null, 1) + '\n'
  writeFileSync(path, text, { flag: 'wx' })
  return createHash('sha256').update(text).digest('hex')
}

// ---- The two modes that read nothing ------------------------------------------------------

function dumpSummary(path: string): void {
  const text = readFileSync(path, 'utf8')
  const found = new Set<string>()
  const figures: Record<string, unknown> = {}
  const walk = (v: unknown): void => {
    if (typeof v === 'string' && /^Your market in /.test(v)) found.add(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if ((k === 'market_videos' || k === 'market_comments') && !(k in figures)) figures[k] = x
        walk(x)
      }
    }
  }
  walk(JSON.parse(text))
  if (text.includes('"#error"')) console.log(`dump: THE LOADER THREW: ${String(JSON.parse(text)['#error']).slice(0, 200)}`)
  for (const s of [...found].slice(0, 3)) console.log(`dump headline: ${s}`)
  const fig = (k: string): string => {
    const x = figures[k] as { value?: unknown; text?: unknown } | number | undefined
    return typeof x === 'number' ? String(x) : x && typeof x === 'object' ? String(x.text ?? x.value ?? JSON.stringify(x)) : 'not found'
  }
  console.log(`dump figures: market_videos ${fig('market_videos')} · market_comments ${fig('market_comments')}`)
}

// ---- Main ---------------------------------------------------------------------------------

async function main(): Promise<void> {
  // Before the shared parser, whose --write sentence points at --apply, which this script refuses too.
  if (process.argv.slice(2).includes('--write')) throw new Error(`${NAME}: --write refused: this script reads and has no write path`)
  const args: ScriptArgs = parseScriptArgs(process.argv.slice(2), {
    name: NAME,
    values: ['snapshot-out', 'grounding-out', 'summary-out', 'staging-export', 'run', 'run-day', 'parts', 'max-pages', 'dump-summary'],
    flags: ['confirm', 'check-host'],
    defaultClient: SEALAND_CLIENT_ID,
  })
  if (args.apply) throw new Error(`${NAME}: --apply refused: this script reads and has no write path`)
  assertProject(args, process.env.NEXT_PUBLIC_SUPABASE_URL, NAME)
  const where = `${MARKET_FIRST_PROJECTS[args.project]} ${args.project}`
  if (args.flags.has('check-host')) {
    console.log(`host ${args.project} (${MARKET_FIRST_PROJECTS[args.project]}): nothing read`)
    return
  }
  if (args.values['dump-summary']) {
    dumpSummary(args.values['dump-summary'])
    return
  }
  if (!args.flags.has('confirm')) {
    console.error(`${NAME} reads ${where} (about 35 pages in four parts on staging, more on production) and will not start without --confirm.`)
    process.exit(2)
  }
  for (const k of ['snapshot-out', 'grounding-out', 'summary-out']) if (!args.values[k]) throw new Error(`${NAME}: --${k} <file> is required`)
  const parts = new Set((args.values.parts ?? 'c,a,b,d').split(',').map((s) => s.trim()))
  const caps = parseCaps(args.values['max-pages'])
  const runDay = args.values['run-day'] ?? '2026-09-27'
  const clientId = args.clientId
  const admin = createAdminClient()
  const reader = new Reader(caps)
  const started = new Date().toISOString()
  const errors: { part: string; step: string; error: string }[] = []
  const out: Record<string, unknown> = {}
  // Key lines go to the paste-back block; detail lines to the log and the grounding JSON only.
  const lines: { s: string; key: boolean }[] = []
  const say = (s: string): void => { lines.push({ s, key: true }) }
  const detail = (s: string): void => { lines.push({ s, key: false }) }

  console.log(`${NAME}: read-only on ${where}, client ${clientId} (nothing is written to the database)`)
  console.log(`  caps (pages): ${Object.entries(caps).map(([k, n]) => `${k}=${n}`).join(' ')} · parts ${[...parts].join(',')}`)

  const step = async <T>(part: string, name: string, fn: () => Promise<T>): Promise<T | null> => {
    reader.part = part
    try {
      return await fn()
    } catch (e) {
      if (e instanceof TooSlow) throw e
      const msg = errText(e)
      errors.push({ part, step: name, error: msg })
      console.log(`  ! ${name}: ${msg}`)
      return null
    }
  }

  const staging: ExportFile | null = (() => {
    const p = args.values['staging-export']
    if (!p) return null
    const d = JSON.parse(readFileSync(p, 'utf8')) as ExportFile
    if (d.clientId !== clientId) throw new Error(`${NAME}: ${p} is client ${d.clientId}, not ${clientId}`)
    return d
  })()
  if (staging) console.log(`  staging export: ${staging.videos.length} videos, exported ${staging.exportedAt}`)

  // ---- The probe --------------------------------------------------------------------------
  reader.part = 'probe'
  const probeAt = Date.now()
  const probe = await admin.from('clients').select('id').limit(1)
  const probeMs = Date.now() - probeAt
  reader.used.probe = 1
  reader.log.push({ part: 'probe', label: 'probe (clients, 1 row)', pages: 1, rows: probe.data?.length ?? 0, ms: probeMs, slowest: probeMs })
  if (probe.error) throw new Error(`${NAME}: the probe failed in ${probeMs} ms (${probe.error.message}). Do not read this instance for fifteen minutes.`)
  console.log(`  probe: ${probeMs} ms`)
  if (probeMs > SLOW_MS) {
    console.error(`${NAME}: the probe took ${probeMs} ms (the line is ${SLOW_MS}). Wait fifteen minutes and run again. Nothing else read.`)
    process.exit(3)
  }

  // Everything below is kept for the files even when a later read stops the run.
  let runs: RunRow[] = []
  let target = pickTargetRun([], runDay, null)
  let videos: VideoRow[] = []
  let verdicts: VerdictRow[] = []
  let kp: KpRow[] = []
  let snapshotPath: string | null = null
  let snapshotSha: string | null = null
  const summaryFacts: Record<string, string> = {}

  const finish = (stopped: string | null): void => {
    const pagesLine = Object.entries(reader.used).map(([k, n]) => `${k} ${n}/${caps[k] ?? '-'}`).join(' · ')
    const total = Object.values(reader.used).reduce((a, b) => a + b, 0)
    const slowest = Math.max(0, ...reader.log.map((l) => l.slowest))
    const header = [
      `MON-READONLY · ${where} · client ${short(clientId)} · ${started}`,
      ...(stopped ? [`STOPPED: ${stopped}`] : []),
    ]
    const gPath = freshPath(args.values['grounding-out'], existsSync)
    const tail = [
      `reads: ${pagesLine} = ${total} pages · slowest ${slowest} ms · PostgREST path (every read here uses it)`,
      `errors: ${errors.length === 0 ? 'none' : `${errors.length}: ${errors.map((e) => `${e.part}/${e.step}`).join('; ').slice(0, 300)}`}`,
      `grounding: ${rel(gPath)}`,
    ]
    const all = [...header, ...lines.map((l) => l.s), ...tail]
    const paste = [...header, ...lines.filter((l) => l.key).map((l) => l.s), ...tail]
    const grounding = {
      generatedAt: started, finishedAt: new Date().toISOString(), project: args.project, projectLabel: MARKET_FIRST_PROJECTS[args.project], clientId,
      stopped, targetRun: { id: target.run?.id ?? null, how: target.how, note: target.note }, caps, pagesByPart: reader.used, reads: reader.log, errors,
      snapshot: snapshotPath ? { path: snapshotPath, sha256: snapshotSha } : null, summary: all, facts: summaryFacts, ...out,
    }
    writeJson(gPath, grounding)
    mkdirSync(dirname(args.values['summary-out']), { recursive: true })
    writeFileSync(args.values['summary-out'], paste.join('\n') + '\n')
    console.log(`\n  grounding written to ${gPath}`)
    console.log(`  summary written to ${args.values['summary-out']}\n`)
    console.log(all.join('\n'))
  }

  try {
    // ---- c: the deploy-1 prechecks ------------------------------------------------------------
    if (parts.has('c') || parts.has('a') || parts.has('b')) {
      runs = (await step('c', 'pipeline_runs since 19 Sep', () => reader.rows<RunRow>('pipeline_runs (Sealand, since 19 Sep)', () =>
        admin.from('pipeline_runs')
          .select('id, status, started_at, completed_at, scheduled_for, period, clustering_key, error_message, errors, steps_completed, stalled, videos_scraped, window_start, window_end, config_snapshot')
          .eq('client_id', clientId).gte('started_at', RUNS_SINCE).order('started_at').order('id')))) ?? []
      target = pickTargetRun(runs, runDay, args.values.run ?? null)
      const t = target.run as RunRow | null
      const errs = Array.isArray(t?.errors) ? (t?.errors as unknown[]) : []
      out.c = {
        runs: runs.map(({ config_snapshot: _cs, ...r }) => r),
        target: t ? { id: t.id, status: t.status, started_at: t.started_at, completed_at: t.completed_at, scheduled_for: t.scheduled_for, clustering_key: t.clustering_key, error_message: t.error_message, errors: t.errors, steps_completed: t.steps_completed, stalled: t.stalled, videos_scraped: t.videos_scraped, period: t.period } : null,
        targetNote: target.note,
        keysByDay: runsOnDays(runs, ['2026-09-20', '2026-09-24', runDay]),
      }
      say(`target run: ${t ? `${short(t.id)} started ${t.started_at?.slice(0, 16)}Z · status ${t.status} · completed ${t.completed_at?.slice(0, 16) ?? '-'}Z · errors ${errs.length}${t.error_message ? ` (${t.error_message.slice(0, 80)})` : ''} · clustering_key ${t.clustering_key ?? 'null'}` : 'none'}${target.how === 'run-day' ? '' : ` · ${target.note}`}`)
      if (errs.length > 0) detail(`  run errors: ${errs.map((e) => String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 90)).slice(0, 3).join(' | ')}`)
      say(`clustering_key by run day: ${(out.c as { keysByDay: ReturnType<typeof runsOnDays> }).keysByDay.map((d) => `${d.day.slice(5)} ${d.runs.length === 0 ? 'no run' : d.runs.map((r) => `${short(r.id)} ${r.status} ${r.clustering_key ?? 'null'}`).join(', ')}`).join(' · ')}`)

      if (parts.has('c')) {
        const since = new Date(Date.now() - 3 * 86_400_000).toISOString()
        const inflight = await step('c', 'runs in flight', () => reader.rows<{ id: string; client_id: string; status: string | null; started_at: string | null }>('pipeline_runs (every tenant, not ended, last 3 days)', () =>
          admin.from('pipeline_runs').select('id, client_id, status, started_at')
            .not('status', 'in', '(completed,partial,failed,cancelled)').gte('started_at', since).order('started_at').order('id')))
        ;(out.c as Record<string, unknown>).inFlight = inflight
        say(`runs not ended (any tenant, 3 days): ${inflight == null ? 'not read' : inflight.length === 0 ? 'none' : inflight.map((r) => `${short(r.id)} client ${short(r.client_id)} ${r.status} since ${r.started_at?.slice(0, 16)}Z`).join(', ')}`)

        const schedules = await step('c', 'report_schedules', () => reader.rows<{ id: string; name: string | null; cadence: string | null; active: boolean | null; is_default: boolean | null; artefact: string | null; last_sent_at: string | null; updated_at: string | null }>('report_schedules (Sealand)', () =>
          admin.from('report_schedules').select('id, name, cadence, active, is_default, artefact, last_sent_at, updated_at').eq('client_id', clientId).order('created_at').order('id')))
        if (schedules) {
          const v = schedulesVerdict(schedules, SCHEDULE_ID)
          ;(out.c as Record<string, unknown>).schedules = { rows: schedules, verdict: v }
          summaryFacts.schedules = v.pass ? 'PASS' : 'FAIL'
          say(`schedules (Sealand): ${v.rows} row${v.rows === 1 ? '' : 's'}, all off: ${v.pass ? 'PASS' : 'FAIL'} · ${SCHEDULE_ID} ${v.found ? (v.active.some((id) => id.startsWith(SCHEDULE_ID)) ? 'ACTIVE' : 'off') : 'MISSING'}${v.active.length ? ` · active: ${v.active.map(short).join(', ')}` : ''}`)
        } else say('schedules (Sealand): not read')
      }

      // A run that has not ended is not read after: its first finds are still moving.
      if (target.run && target.how !== 'latest-final' && !isFinalRun(target.run.status)) {
        finish(`the ${runDay} run ${short(target.run.id)} has not ended (status ${target.run.status}). Nothing after the prechecks was read; run this again once it has.`)
        process.exit(5)
      }
    }

    // ---- a: the snapshot first, then the grounding reads ------------------------------------------
    const verdictCutoff = (staging && maxAt(staging.gateVerdicts)) ?? '2026-09-20T00:00:00Z'
    const kpCutoff = (staging && maxAt(staging.keywordPerformance)) ?? '2026-09-20T00:00:00Z'
    if (parts.has('a') || parts.has('b')) {
      videos = (await step('a', 'videos (full lane)', () => reader.rows<VideoRow>('videos (Sealand, full lane, with text)', () =>
        admin.from('videos')
          .select('id, platform, video_id, source_keywords, is_client, is_competitor, competitor_name, analyzed_lane, first_seen:scraped_at, source, account_name, caption, hashtags, topics')
          .eq('client_id', clientId).eq('analyzed_lane', 'full').order('id')))) ?? []
      verdicts = (await step('a', 'gate_verdicts since the export', () => reader.rows<VerdictRow>(`gate_verdicts (after ${verdictCutoff.slice(0, 19)}Z)`, () =>
        admin.from('gate_verdicts').select('run_id, platform, video_id, keyword, kept, source, created_at')
          .eq('client_id', clientId).gt('created_at', verdictCutoff).order('id')))) ?? []
      kp = (await step('a', 'keyword_performance since the export', () => reader.rows<KpRow>(`keyword_performance (after ${kpCutoff.slice(0, 19)}Z)`, () =>
        admin.from('keyword_performance').select('run_id, platform, keyword, bucket, videos_found, gate_survived, created_at')
          .eq('client_id', clientId).gt('created_at', kpCutoff).order('created_at').order('platform').order('keyword')))) ?? []

      if (parts.has('a') && videos.length > 0) {
        const snapVideos = videos.map((v) => ({
          id: v.id, platform: v.platform, video_id: v.video_id, source_keywords: v.source_keywords, is_client: v.is_client,
          is_competitor: v.is_competitor, competitor_name: v.competitor_name, analyzed_lane: v.analyzed_lane, first_seen: v.first_seen,
        }))
        const snapKp = kp.map((k) => ({ run_id: k.run_id, platform: k.platform, keyword: k.keyword, bucket: k.bucket, created_at: k.created_at }))
        const snapRuns = runs.map((r) => ({ id: r.id, started_at: r.started_at, status: r.status, period: r.period }))
        const snapshot: ProvenanceExport & { scope: Record<string, string>; checks: Record<string, unknown> } = {
          exportedAt: new Date().toISOString(),
          project: args.project,
          clientId,
          videos: snapVideos,
          videoMonths: [],
          gateVerdicts: verdicts,
          keywordPerformance: snapKp,
          runs: snapRuns,
          scope: {
            what: `WP1.0's provenance snapshot: how production held source_keywords after the ${runDay} run, read before the 4 Oct run overwrites them (plan WP1.0 reads 12 to 15). The shape is scripts/export-provenance.ts's, so reconstruct-provenance, log-tracking-eras and measure-comparability read it with --prod-snapshot.`,
            videos: 'full-lane videos only (WP1.0 reads 12 and 13); first_seen = videos.scraped_at',
            gateVerdicts: `created after ${verdictCutoff} (the staging export, WP0.1, holds every earlier one)`,
            keywordPerformance: `created after ${kpCutoff} (the staging export holds every earlier one)`,
            runs: `started on or after ${RUNS_SINCE}`,
            videoMonths: 'not read here (dated comments are the staging export\'s, to 20 Sep; MF1 reads the rest)',
            targetRun: `${target.run?.id ?? 'none'} (${target.note})`,
          },
          checks: {
            videos: { n: snapVideos.length, md5: md5(snapVideos) },
            gateVerdicts: { n: verdicts.length, md5: md5(verdicts) },
            keywordPerformance: { n: snapKp.length, md5: md5(snapKp) },
            runs: { n: snapRuns.length, md5: md5(snapRuns) },
          },
        }
        snapshotPath = freshPath(args.values['snapshot-out'], existsSync)
        snapshotSha = writeJson(snapshotPath, snapshot)
        console.log(`  snapshot written: ${snapshotPath}`)
        summaryFacts.snapshot = snapshotPath
      }
      say(`snapshot: ${snapshotPath ? `${rel(snapshotPath)} · sha256 ${snapshotSha?.slice(0, 16)} · videos ${videos.length} · verdicts ${verdicts.length} · keyword rows ${kp.length} · runs ${runs.length}` : 'NOT WRITTEN'}`)
    }

    // The gathers: the staging export's, to 20 Sep, and production's since.
    const runById = new Map<string, { id: string; status: string | null; config_snapshot?: unknown }>()
    for (const r of staging?.runs ?? []) runById.set(r.id, { id: r.id, status: r.status })
    for (const r of runs) runById.set(r.id, { id: r.id, status: r.status, config_snapshot: r.config_snapshot })
    const kpAll: KeywordRow[] = [...(staging?.keywordPerformance ?? []), ...kp]
    const gathers = gathersOf(kpAll, [...runById.values()])
    const gatherOf = (id: string | null | undefined) => gathers.find((g) => g.runId === id)
    const run20 = runs.find((r) => dayOf(r.started_at) === '2026-09-20' && isFinalRun(r.status)) ?? null

    const registry = new Map<string, RegistryRow>()
    let obsById = new Map<string, ObservationRow>()
    let sepThemes: ThemeReadingRow[] = []
    let augThemes: ThemeReadingRow[] = []
    let denominators: MonthRow[] = []
    let subjectRows: (MonthRow & { subject_id: string })[] = []
    let kindRows: (MonthRow & { kind: string })[] = []
    let statRows: StatRow[] = []
    let subjects: SubjectRow[] = []
    let changes: ChangeRow[] = []
    let tracking: TrackingRow | null = null
    let rivals: { name: string; retiredAt: string | null }[] = []
    let newRegime = false

    if (parts.has('a') || parts.has('b')) {
      denominators = (await step('a', 'month_denominators', () => reader.rows<MonthRow>('month_denominators (Jun–Sep)', () =>
        admin.from('month_denominators').select('month, audience, videos, comments, dual_mention, excluded_undated, status, origin, read_at, run_id, frozen_at, clustering_key')
          .eq('client_id', clientId).gte('month', '2026-06-01').lte('month', MONTH).order('month').order('audience')))) ?? []
      subjectRows = (await step('a', 'month_subject_readings', () => reader.rows<MonthRow & { subject_id: string }>('month_subject_readings (Aug–Sep)', () =>
        admin.from('month_subject_readings').select('month, audience, subject_id, videos, comments, excluded_on_camera, excluded_undated, status, read_at, run_id, judge_version, frozen_at')
          .eq('client_id', clientId).gte('month', PREV_MONTH).lte('month', MONTH).order('month').order('audience').order('subject_id')))) ?? []
      kindRows = (await step('a', 'month_kind_readings', () => reader.rows<MonthRow & { kind: string }>('month_kind_readings (Aug–Sep)', () =>
        admin.from('month_kind_readings').select('month, audience, kind, videos, comments, excluded_on_camera, excluded_undated, status, read_at, run_id, frozen_at')
          .eq('client_id', clientId).gte('month', PREV_MONTH).lte('month', MONTH).order('month').order('audience').order('kind')))) ?? []
      statRows = (await step('a', 'month_audience_stats', () => reader.rows<StatRow>('month_audience_stats (Aug–Sep)', () =>
        admin.from('month_audience_stats').select('month, audience, judged, positive, negative, neutral, mixed, judged_framing, panel_id, panel_videos, attention_comments, status, read_at, run_id, frozen_at')
          .eq('client_id', clientId).gte('month', PREV_MONTH).lte('month', MONTH).order('month').order('audience')))) ?? []
      // Each theme's registry row comes embedded (month_theme_readings.theme_id's one foreign
      // key), so the labels cost no page of their own.
      type WithRegistry = ThemeReadingRow & { theme_registry: RegistryRow | RegistryRow[] | null }
      const themesOf = (label: string, month: string) => reader.one<WithRegistry>(label,
        admin.from('month_theme_readings').select('month, audience, theme_id, videos, comments, status, read_at, run_id, frozen_at, clustering_key, theme_registry(id, canonical_label, bucket, status, first_seen_at)')
          .eq('client_id', clientId).eq('month', month).eq('audience', INDUSTRY_AUDIENCE).order('videos', { ascending: false }).order('theme_id').limit(TOP_THEMES))
      const withLabels = (rows: WithRegistry[] | null): ThemeReadingRow[] => (rows ?? []).map(({ theme_registry: reg, ...t }) => {
        const r = embedded(reg)
        if (r) registry.set(t.theme_id, r)
        return t
      })
      sepThemes = withLabels(await step('a', 'month_theme_readings Sep', () => themesOf('month_theme_readings (Sep, category, top 40, with registry labels)', MONTH)))
      augThemes = withLabels(await step('a', 'month_theme_readings Aug', () => themesOf('month_theme_readings (Aug, category, top 40, with registry labels)', PREV_MONTH)))
      if (target.run) {
        const runId = target.run.id
        // The run's match kinds: one read ordered by match_kind descending, carrying the exact
        // count; 'exact' sorts last, so with the count in hand the read stops at its first
        // 'exact' row (matchKindTally); without it, it reads every row.
        const kinds = await step('a', 'theme_observations match kinds', () => reader.paged<{ match_kind: string | null }>(`theme_observations match kinds (run ${short(runId)}, to the first exact)`, () =>
          admin.from('theme_observations').select('match_kind', { count: 'exact' })
            .eq('client_id', clientId).eq('run_id', runId).order('match_kind', { ascending: false }).order('id'),
        (page, count) => count != null && page.some((o) => o.match_kind === 'exact')))
        const tally = kinds ? matchKindTally(kinds.rows.map((o) => o.match_kind), kinds.count) : null
        // The board's own observations (September's top 40), with the members the quotes read.
        const obs = sepThemes.length === 0 ? [] : await step('a', 'theme_observations', () => reader.one<ObservationRow>(`theme_observations (run ${short(runId)}, September's top 40)`,
          admin.from('theme_observations').select('theme_id, label, category, match_kind, match_score, evidence_count, member_insight_ids')
            .eq('client_id', clientId).eq('run_id', runId).in('theme_id', sepThemes.map((t) => t.theme_id))))
        obsById = new Map((obs ?? []).map((o) => [o.theme_id, o]))
        const byKind = tally?.byKind ?? {}
        const prevFinal = runs.filter((r) => isFinalRun(r.status) && (r.started_at ?? '') < (target.run?.started_at ?? '')).pop() ?? null
        const tk = (target.run as RunRow).clustering_key ?? null
        newRegime = tk != null && (prevFinal == null || prevFinal.clustering_key !== tk)
        out.observations = { run: runId, total: tally?.total ?? null, byMatchKind: byKind, newRegime, previousRun: prevFinal?.id ?? null, previousKey: prevFinal?.clustering_key ?? null }
        say(`identities on the run: ${byKind.new ?? 0} new of ${tally?.total ?? 'unread'} observations (${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(', ')}) · opens a new clustering regime: ${newRegime ? 'yes' : 'no'}`)
      }
      subjects = (await step('a', 'subjects', () => reader.rows<SubjectRow>('subjects (Sealand)', () =>
        admin.from('subjects').select('id, name, status, origin, named_at, calibrated_at, calibration_precision, calibration_n, calibration_judge_version, superseded_by, updated_at')
          .eq('client_id', clientId).order('name').order('id')))) ?? []
      const panels = await step('a', 'attention_panels', () => reader.rows<{ id: string; frozen_at: string | null; cutoff: string | null; account_count: number | null; reason: string | null }>('attention_panels (Sealand)', () =>
        admin.from('attention_panels').select('id, frozen_at, cutoff, account_count, reason, created_by, created_at').eq('client_id', clientId).order('created_at').order('id')))
      changes = (await step('a', 'config_changes', () => reader.rows<ChangeRow>('config_changes (since 1 Sep)', () =>
        admin.from('config_changes').select('id, changed_at, surface, field, before, after, actor_kind, source, rows_affected, note, affects_audiences, affects_months, run_id')
          .eq('client_id', clientId).gte('changed_at', CHANGES_SINCE).order('changed_at').order('id')))) ?? []
      const trackingRows = await step('a', 'tracking_configs', () => reader.one<TrackingRow>('tracking_configs (Sealand)',
        admin.from('tracking_configs').select('brand_keywords, competitor_keywords, industry_keywords, competitor_names, platforms, subreddits, exclude_terms, report_period, report_day, updated_at')
          .eq('client_id', clientId).limit(1)))
      tracking = trackingRows?.[0] ?? null
      const competitors = await step('a', 'competitors', () => reader.rows<{ name: string; retired_at: string | null }>('competitors (Sealand)', () =>
        admin.from('competitors').select('name, retired_at').eq('client_id', clientId).order('name')))
      rivals = (competitors ?? []).length > 0
        ? (competitors ?? []).map((c) => ({ name: c.name, retiredAt: c.retired_at }))
        : (tracking?.competitor_names ?? []).map((name) => ({ name, retiredAt: null }))

      // What the grounding says, from those reads.
      const keysOf = (rows: readonly MonthRow[], m: string) => [...new Set(rows.filter((r) => r.month.startsWith(m.slice(0, 7))).map((r) => r.clustering_key ?? 'null'))]
      const statusOf = (rows: readonly MonthRow[], m: string) => [...new Set(rows.filter((r) => r.month.startsWith(m.slice(0, 7))).map((r) => r.status ?? 'null'))]
      const monthKeys = {
        denominators: { aug: keysOf(denominators, PREV_MONTH), sep: keysOf(denominators, MONTH) },
        themes: { aug: keysOf(augThemes, PREV_MONTH), sep: keysOf(sepThemes, MONTH) },
        status: { aug: statusOf(denominators, PREV_MONTH), sep: statusOf(denominators, MONTH) },
        readAt: { aug: denominators.filter((r) => r.month.startsWith('2026-08')).map((r) => r.read_at).sort().pop() ?? null, sep: denominators.filter((r) => r.month.startsWith('2026-09')).map((r) => r.read_at).sort().pop() ?? null },
      }
      say(`month keys (R1, C1): Aug ${monthKeys.denominators.aug.join('/')} (themes ${monthKeys.themes.aug.join('/')}) · Sep ${monthKeys.denominators.sep.join('/')} (themes ${monthKeys.themes.sep.join('/')}) · status Aug ${monthKeys.status.aug.join('/')}, Sep ${monthKeys.status.sep.join('/')} · read Aug ${monthKeys.readAt.aug?.slice(0, 16) ?? '-'}Z, Sep ${monthKeys.readAt.sep?.slice(0, 16) ?? '-'}Z`)

      const cal = subjects.map((s) => ({ id: s.id, name: s.name, status: s.status, precision: s.calibration_precision, n: s.calibration_n, judge: s.calibration_judge_version, calibrated_at: s.calibrated_at, ...calibrationStates(s) }))
      const tally = (k: 'wp11' | 'deployed') => cal.reduce<Record<string, number>>((m, c) => { m[c[k]] = (m[c[k]] ?? 0) + 1; return m }, {})
      say(`subjects: ${subjects.length} · WP1.1 states ${Object.entries(tally('wp11')).map(([k, n]) => `${k} ${n}`).join(', ') || '-'} · as deployed ${Object.entries(tally('deployed')).map(([k, n]) => `${k} ${n}`).join(', ') || '-'}`)
      detail(`  ${cal.map((c) => `${c.name} ${c.wp11}${c.precision != null ? ` (${Number(c.precision).toFixed(2)} on ${c.n ?? '?'})` : ''}`).join(' · ')}`)
      const latestPanel = (panels ?? []).at(-1)
      say(`attention panels: ${panels == null ? 'not read' : `${panels.length}${latestPanel ? ` (latest frozen ${latestPanel.frozen_at?.slice(0, 10) ?? '-'}, cutoff ${latestPanel.cutoff ?? '-'}, ${latestPanel.account_count ?? '?'} accounts)` : ''}`}`)
      const bySurface = changes.reduce<Record<string, number>>((m, c) => { m[c.surface] = (m[c.surface] ?? 0) + 1; return m }, {})
      detail(`config_changes since 1 Sep: ${changes.length} (${Object.entries(bySurface).map(([k, n]) => `${k} ${n}`).join(', ')}) · since the run read began: ${changes.filter((c) => c.changed_at >= (target.run?.started_at ?? '9')).length}`)

      const communities = activeCommunities(tracking?.subreddits ?? null)
      const known = Array.isArray(tracking?.subreddits) ? (tracking?.subreddits as unknown[]).length : null
      const terms = tracking ? currentSearchTerms(tracking, [...(communities ?? [])]) : new Set<string>()
      const termCount = tracking ? new Set([...(tracking.brand_keywords ?? []), ...(tracking.competitor_keywords ?? []), ...(tracking.industry_keywords ?? [])].map((t) => t.trim().toLowerCase())).size : null
      const tg = gatherOf(target.run?.id)
      const g20 = gatherOf(run20?.id)
      const diff = searchSetDiff(tg, g20)
      out.searches = {
        config: tracking ? { terms: termCount, platforms: tracking.platforms, communitiesActive: [...(communities ?? [])], communitiesKnown: known, maxKnown: SUBREDDIT_MAX_KNOWN, excludeTerms: tracking.exclude_terms?.length ?? 0, report_period: tracking.report_period, updated_at: tracking.updated_at } : null,
        targetRun: tg ? { at: tg.at, perPlatform: searchesPerPlatform(tg), planned: tg.planned?.size ?? null, missingFromPlan: tg.planned ? [...tg.planned].filter((s) => !tg.searches.has(s)).map((s) => s.replace('\u0000', ':')) : null } : null,
        run20: g20 ? { id: g20.runId, at: g20.at, perPlatform: searchesPerPlatform(g20) } : null,
        diffVs20Sep: diff,
        currentTerms: [...terms].sort(),
      }
      const pp = tg ? Object.entries(searchesPerPlatform(tg)).map(([p, n]) => `${p} ${n}`).join(', ') : ''
      say(`searches: run searched ${tg ? `${tg.searches.size} (${pp})` : 'not found in keyword_performance'} · same set as 20 Sep: ${diff == null ? 'not compared' : diff.same ? 'yes' : `NO (only now: ${diff.onlyA.slice(0, 4).join(', ') || '-'}; only 20 Sep: ${diff.onlyB.slice(0, 4).join(', ') || '-'})`} · short of its plan: ${tg?.planned ? [...tg.planned].filter((s) => !tg.searches.has(s)).length : 'no plan stored'}`)
      say(`search set now: ${termCount ?? '?'} terms · communities active ${communities ? communities.size : '?'}, known ${known ?? '?'} of ${SUBREDDIT_MAX_KNOWN} · rivals tracked ${rivals.filter((r) => !r.retiredAt).map((r) => r.name).join(', ') || 'none'}`)
      out.a = { monthKeys, subjects: cal, panels, changes, tracking, rivals, denominators, subjectRows, kindRows, statRows, sepThemes, augThemes, registry: Object.fromEntries(registry) }
    }

    // ---- b: WP1.8's production measures --------------------------------------------------------------
    const marketSet = new Set([...marketRivalAudiences(rivals), INDUSTRY_AUDIENCE])
    const byId = new Map(videos.map((v) => [v.id, v]))
    let board: ReturnType<typeof boardOf> | null = null
    const segById = new Map<string, ThemeSegments>()
    if (parts.has('b')) {
      // The market's size and its pooled levels (blocks 4 and 6), from part a's reads.
      const pooled = pooledDenominators(denominators.map((r) => ({ month: r.month, audience: r.audience, videos: r.videos, comments: r.comments })), [...marketSet].filter((a) => a !== INDUSTRY_AUDIENCE))
      const size = (m: string) => pooled.get(m) ?? null
      const allAud = (m: string) => denominators.filter((r) => r.month.startsWith(m.slice(0, 7))).reduce((s, r) => s + r.videos, 0)
      const sep = size(MONTH)
      const aug = size(PREV_MONTH)
      out.size = { sep, aug, allAudiences: { sep: allAud(MONTH), aug: allAud(PREV_MONTH) }, marketAudiences: [...marketSet] }
      say(`market size: Sep ${sep?.videos ?? '?'} videos, ${sep?.comments ?? '?'} comments (category ${sep?.category ?? '?'}, filed under a tracked rival ${sep?.rivalFiled ?? '?'}; every audience ${allAud(MONTH)}) · Aug ${aug?.videos ?? '?'} videos, ${aug?.comments ?? '?'} comments (category ${aug?.category ?? '?'})`)
      out.pooled = {
        kinds: pooledBy(kindRows, marketSet, (r) => r.kind, (r) => r.videos),
        subjects: pooledBy(subjectRows, marketSet, (r) => subjects.find((s) => s.id === r.subject_id)?.name ?? r.subject_id, (r) => r.videos),
        moods: Object.fromEntries(['judged', 'positive', 'negative', 'neutral', 'mixed'].map((f) => [f, pooledBy(statRows, marketSet, () => f, (r) => (r as unknown as Record<string, number>)[f])])),
      }
      const kindsSep = Object.entries((out.pooled as { kinds: Record<string, Record<string, number>> }).kinds['2026-09'] ?? {}).sort((a, b) => b[1] - a[1])
      detail(`kinds (market, Sep): ${kindsSep.length} · ${kindsSep.slice(0, 4).map(([k, n]) => `${k} ${ofN(n, sep?.videos)}`).join(' · ')}`)
      const mood = (f: string) => ((out.pooled as { moods: Record<string, Record<string, Record<string, number>>> }).moods[f]?.['2026-09']?.[f]) ?? null
      detail(`moods (market, Sep): judged ${mood('judged') ?? '?'} · positive ${mood('positive') ?? '?'} · negative ${mood('negative') ?? '?'} · neutral ${mood('neutral') ?? '?'} · mixed ${mood('mixed') ?? '?'}`)

      // Makers and noise on the top September themes, the v1 rule computed here.
      const refs = sepThemes.length === 0 ? null : await step('b', 'month_evidence_refs', () => reader.one<{ object_id: string; audience: string; video_ids: string[] | null }>('month_evidence_refs (Sep, category, top themes)',
        admin.from('month_evidence_refs').select('object_id, audience, video_ids')
          .eq('client_id', clientId).eq('month', MONTH).eq('object_kind', 'theme').eq('audience', INDUSTRY_AUDIENCE).in('object_id', sepThemes.map((t) => t.theme_id))))
      const refVideos = new Map((refs ?? []).map((r) => [r.object_id, r.video_ids ?? []]))
      const themes: BoardTheme[] = sepThemes.map((t) => {
        const seg = refs ? themeSegments(refVideos.get(t.theme_id) ?? [], byId) : null
        if (seg) segById.set(t.theme_id, seg)
        const o = obsById.get(t.theme_id)
        return { id: t.theme_id, label: registry.get(t.theme_id)?.canonical_label ?? o?.label ?? '(no label)', kind: o?.category ?? null, k: t.videos, matchKind: o?.match_kind ?? null, seg }
      })
      board = boardOf(themes, newRegime)
      const capped = sepThemes.length === TOP_THEMES && (sepThemes.at(-1)?.videos ?? 0) >= 10
      const top25 = themes.slice(0, 25).map((t) => ({ id: t.id, label: t.label, kind: t.kind, k: t.k, refs: t.seg?.refs ?? null, known: t.seg?.known ?? null, maker: t.seg?.maker ?? null, noise: t.seg?.noise ?? null, makerShare: t.seg?.makerShare ?? null, noiseShare: t.seg?.noiseShare ?? null, matchKind: t.matchKind, prevK: augThemes.find((a) => a.theme_id === t.id)?.videos ?? null }))
      say(`themes at 10+ (Sep, category): ${board.atFloor}${capped ? ' (or more: the top-40 read ends at 10+)' : ''} · led by makers ${board.makers.length} · led by noise ${board.noise.length} · on the board ${board.rows.length} · not led by makers ${board.atFloor - board.makers.length}`)
      for (const t of board.rows.slice(0, 3)) detail(`  ${t.label}: ${t.k} videos, makers ${pct(t.seg?.makerShare)}${t.seg && t.seg.known < t.seg.refs ? ` (${t.seg.known} of ${t.seg.refs} videos read)` : ''}`)
      out.themes = { top25, atFloor: board.atFloor, cappedRead: capped, makers: board.makers.map((t) => t.label), noise: board.noise.map((t) => t.label), rows: board.rows.map((t) => t.label), newRegime }

      // Our search additions, the legacy share, and September membership where the export cannot answer it.
      const evidence = evidenceByVideo({ now: videos, earlier: staging?.videos ?? [], verdicts: [...(staging?.gateVerdicts ?? []), ...verdicts] })
      const first = firstSearched(gathers)
      const addedSep = termsFirstSearchedSince(first, `${MONTH}T00:00:00Z`)
      const added13 = termsFirstSearchedSince(first, '2026-09-13T00:00:00Z')
      const changeOn = (day: string) => changes.filter((c) => c.changed_at.startsWith(day) && (c.surface === 'terms' || c.surface === 'subreddits'))
      const delta9 = termDelta(changeOn('2026-09-09') as unknown as Parameters<typeof termDelta>[0])
      const delta13 = termDelta(changeOn('2026-09-13') as unknown as Parameters<typeof termDelta>[0])
      const communities = activeCommunities(tracking?.subreddits ?? null)
      const current = tracking ? currentSearchTerms(tracking, [...(communities ?? [])]) : new Set<string>()
      const market = videos.filter((v) => inMarket(v, marketSet))
      const inC = new Set(market.filter((v) => onlyFrom(evidence.get(v.id), addedSep)).map((v) => v.id))
      const inC13 = new Set(market.filter((v) => onlyFrom(evidence.get(v.id), added13)).map((v) => v.id))
      const inL = new Set(market.filter((v) => anyOf(evidence.get(v.id), delta9.removed) && carriesOnlyCurrent(v.source_keywords, current)).map((v) => v.id))
      const nameVideos = market.map((v) => ({ v, hit: videoNameHits(v) })).filter((x) => x.hit.where.length > 0)
      const sepFromExport = new Set((staging?.videoMonths ?? []).filter((r) => r.month.startsWith(MONTH.slice(0, 7))).map((r) => r.video_id))

      // The name line first (one bounded query over September-dated comments), so a ration
      // reached by the membership reads below never costs it.
      const nameComments = await step('b', 'name line comments', () => reader.rows<{ id: string; platform: string; video_id: string; author: string | null; text: string | null; comment_date: string | null; likes: number | null; client_brand_mention: boolean | null }>('comments naming Sealand (dated in Sep)', () =>
        admin.from('comments').select('id, platform, video_id, author, text, comment_date, likes, client_brand_mention')
          .eq('client_id', clientId).gte('comment_date', `${MONTH}T00:00:00Z`).lt('comment_date', `${NEXT_MONTH}T00:00:00Z`).ilike('text', '%sealand%').order('id')))

      // September membership for the videos the export cannot place (first stored, or first
      // commented in September, after 20 Sep), in priority order: the {measured} population,
      // then the name line's videos, then the legacy share. One list, each video once, read
      // 100 videos a request across platforms (membershipPlan), so a ration that runs out cuts
      // the last group first. Each group says if it was cut short.
      const sepFound = new Set<string>()
      const checked = new Set<string>()
      const groupIds = [
        { name: 'measured', ids: inC as ReadonlySet<string> },
        { name: 'name line', ids: new Set(nameVideos.map((x) => x.v.id)) as ReadonlySet<string> },
        { name: 'legacy', ids: inL as ReadonlySet<string> },
      ]
      const plan = membershipPlan(groupIds, sepFromExport, byId, IN_CHUNK)
      for (const chunk of plan.chunks) {
        const platforms = [...new Set(chunk.map((v) => v.platform))].sort()
        const mix = platforms.map((p) => `${p} ${chunk.filter((v) => v.platform === p).length}`).join(', ')
        const rows = await step('b', 'September membership', () => reader.rows<{ platform: string; video_id: string }>(`comments dated in Sep (${chunk.length} videos the export cannot place: ${mix})`, () =>
          admin.from('comments').select('platform, video_id').eq('client_id', clientId).in('platform', platforms)
            .in('video_id', chunk.map((v) => v.video_id)).gte('comment_date', `${MONTH}T00:00:00Z`).lt('comment_date', `${NEXT_MONTH}T00:00:00Z`).order('id')))
        if (rows == null) continue
        for (const v of chunk) checked.add(v.id)
        for (const id of videosNamed(chunk, rows)) sepFound.add(id)
      }
      const groups = groupIds.map((g) => ({
        ...g,
        toCheck: plan.toCheck[g.name] ?? 0,
        complete: [...g.ids].every((id) => sepFromExport.has(id) || checked.has(id) || !byId.has(id)),
      }))
      const cut = (name: string): string => (groups.find((g) => g.name === name)?.complete === false ? ' · CUT SHORT (ration): a floor, not the figure' : '')
      const membershipRead = groups.every((g) => g.complete)
      const toCheck = groups.reduce((n, g) => n + g.toCheck, 0)
      const inSep = (id: string): boolean => sepFromExport.has(id) || sepFound.has(id)
      const countIn = (set: ReadonlySet<string>, pred: (v: VideoRow) => boolean) => [...set].filter((id) => inSep(id) && pred(byId.get(id) as VideoRow)).length
      const all = () => true
      const measured = { market: countIn(inC, all), category: countIn(inC, inCategory) }
      const only13 = { market: countIn(inC13, all), category: countIn(inC13, inCategory) }
      const legacy = { market: countIn(inL, all), category: countIn(inL, inCategory) }
      out.searchMeasures = {
        definitions: {
          measured: 'September market videos (full lane, the category plus tracked rivals, a comment dated in September) every one of whose surfacing terms (source_keywords in the staging export and now, every gate verdict keyword) was first searched on or after 1 Sep',
          only13: 'the same, with terms first searched on or after 13 Sep (WP0.1\'s 206 of 625 on staging, category)',
          legacy: 'September market videos surfaced by a term the 9 Sep change removed, whose source_keywords now carry only current searches',
          membership: `September membership: the staging export's dated comments (to 20 Sep), then this project's comments dated in September for the ${toCheck} candidates the export does not place${membershipRead ? '' : ' (INCOMPLETE: a membership read was cut short)'}`,
        },
        addedInSeptember: [...addedSep].sort(), addedFrom13Sep: [...added13].sort(),
        change9Sep: { added: [...delta9.added].sort(), removed: [...delta9.removed].sort() },
        change13Sep: { added: [...delta13.added].sort(), removed: [...delta13.removed].sort() },
        measured, only13, legacy,
        denominators: { market: sep?.videos ?? null, category: sep?.category ?? null },
        membership: groups.map((g) => ({ group: g.name, candidates: g.ids.size, checkedOnProduction: g.toCheck, complete: g.complete })), foundInSepOnProduction: sepFound.size,
        membershipComplete: membershipRead && staging != null,
      }
      summaryFacts.measured = `${measured.market}`
      say(`search additions: ${ofN(measured.market, sep?.videos)} of September's market videos came only from searches first run in September (category ${ofN(measured.category, sep?.category)})${staging ? '' : ' · NO STAGING EXPORT: evidence after 20 Sep only'}${cut('measured')}`)
      say(`  only 13 Sep+ terms: category ${ofN(only13.category, sep?.category)}, market ${only13.market}`)
      detail(`  first searched in Sep: ${[...addedSep].sort().join(', ') || '-'}`)
      say(`legacy share: ${ofN(legacy.market, sep?.videos)} (category ${legacy.category})${cut('legacy')} · removed on 9 Sep: ${[...delta9.removed].sort().join(', ') || 'none logged'}`)

      // The lead and its new-search share.
      const lead = board.lead
      if (lead) {
        const ids = [...new Set(refVideos.get(lead.id) ?? [])]
        const fromNew = ids.filter((id) => inC.has(id)).length
        out.lead = { id: lead.id, label: lead.label, kind: lead.kind, k: lead.k, makerShare: lead.seg?.makerShare ?? null, noiseShare: lead.seg?.noiseShare ?? null, newSearch: { fromNewSearches: fromNew, of: ids.length } }
        summaryFacts.lead = lead.label
        say(`lead: ${lead.label} · ${lead.k} videos · makers ${pct(lead.seg?.makerShare)} · from searches added in Sep ${ofN(fromNew, ids.length)}`)
      } else {
        out.lead = null
        say(`lead: none may lead (no row at 10+ with a measured maker share of a quarter or less)`)
      }

      const nameMs = reader.timed('comments naming Sealand (dated in Sep)')
      const vidByKey = new Map(videos.map((v) => [`${v.platform}\u0000${v.video_id}`, v]))
      const commentHits = (nameComments ?? []).map((c) => {
        const v = vidByKey.get(`${c.platform}\u0000${c.video_id}`)
        return { comment_id: c.id, video: v?.id ?? null, platform: c.platform, date: c.comment_date, author: c.author, likes: c.likes, flagged: c.client_brand_mention, inMarket: v ? inMarket(v, marketSet) : false, audience: v ? audienceOf(v) : 'not full lane', excerpt: excerpt(c.text, SEALAND_NAME, 200) }
      })
      const videoHits = nameVideos.filter((x) => inSep(x.v.id)).map((x) => ({ video: x.v.id, platform: x.v.platform, account: x.v.account_name, audience: audienceOf(x.v), where: x.hit.where, excerpt: x.hit.excerpt }))
      const commentVideos = new Set(commentHits.filter((h) => h.inMarket && h.video).map((h) => h.video as string))
      const union = new Set([...videoHits.map((h) => h.video), ...commentVideos])
      out.nameLine = { queryMs: nameMs, overThreeSeconds: nameMs != null && nameMs > SLOW_MS, videos: union.size, videoHits, commentHits, note: 'every hit is to be hand-read (Sealand the micronation, a ship, a place)' }
      say(`name line (Sep market): ${nameComments == null ? 'comments not read' : `${union.size} videos name Sealand (own text ${videoHits.length}; a September comment on ${commentVideos.size}; ${commentHits.filter((h) => h.inMarket).length} market comments)`} · query ${nameMs ?? '-'} ms${nameMs != null && nameMs > SLOW_MS ? ' (OVER 3 s: use the staging figure, to 20 Sep)' : ''}${cut('name line')} · every hit to hand-read`)

      // WP1.0 read 16: the evidence quotes of the top five themes not led by makers.
      const five = board.rows.slice(0, QUOTE_THEMES)
      if (five.length > 0 && target.run) {
        // The members came with the board's observations (part a), so they cost no page here.
        const insightTheme = new Map<string, string>()
        for (const t of five) for (const id of (obsById.get(t.id)?.member_insight_ids ?? []).slice(0, QUOTE_INSIGHTS_PER_THEME)) insightTheme.set(id, t.id)
        type QuoteComment = { id: string; author: string | null; comment_date: string | null; platform: string; video_id: string; likes: number | null }
        const evidenceRows: { id: string; audience_insight_id: string; comment_id: string | null; quote: string | null; relevance_rank: number | null; source: string | null; source_video_id: string | null; redacted: boolean | null; comments: QuoteComment | QuoteComment[] | null }[] = []
        // Each row's comment comes embedded (insight_evidence.comment_id's one foreign key).
        for (const chunk of chunks([...insightTheme.keys()], IN_CHUNK)) {
          const rows = await step('a', 'quote themes: evidence', () => reader.rows<(typeof evidenceRows)[number]>('insight_evidence (five themes, with each comment)', () =>
            admin.from('insight_evidence').select('id, audience_insight_id, comment_id, quote, relevance_rank, source, source_video_id, redacted, comments(id, author, comment_date, platform, video_id, likes)')
              .in('audience_insight_id', chunk).order('id')))
          evidenceRows.push(...(rows ?? []))
        }
        // Up to 20 candidates a theme by relevance (ties by evidence id, so how the requests
        // were cut never changes the pick; 100 comments, embedded above), then per theme
        // the quotes dated in the month and not from the video's own account first.
        const candidates = new Map<string, typeof evidenceRows>()
        for (const e of [...evidenceRows].filter((e) => e.comment_id && !e.redacted && e.quote).sort((a, b) => (a.relevance_rank ?? 99) - (b.relevance_rank ?? 99) || a.id.localeCompare(b.id))) {
          const theme = insightTheme.get(e.audience_insight_id) as string
          const list = candidates.get(theme) ?? []
          if (list.length < QUOTE_CANDIDATES_PER_THEME) list.push(e)
          candidates.set(theme, list)
        }
        const cById = new Map([...candidates.values()].flat().map((e) => embedded(e.comments)).filter((c): c is QuoteComment => c != null).map((c) => [c.id, c]))
        const fold = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
        out.quotes = five.map((t) => ({
          theme: t.label, id: t.id, k: t.k, makerShare: t.seg?.makerShare ?? null,
          quotes: (candidates.get(t.id) ?? []).filter((e) => cById.has(e.comment_id as string)).map((e) => {
            const c = cById.get(e.comment_id as string)
            // The video by the comment's own key (source_video_id is often empty), else by the evidence row's.
            const v = (c ? vidByKey.get(`${c.platform}\u0000${c.video_id}`) : undefined) ?? (e.source_video_id ? byId.get(e.source_video_id) : undefined)
            const datedInMonth = c?.comment_date ? c.comment_date.startsWith(MONTH.slice(0, 7)) : null
            const ownAccount = c && v ? fold(c.author) !== '' && fold(c.author) === fold(v.account_name) : null
            return {
              quote: (e.quote ?? '').slice(0, 400), rank: e.relevance_rank, author: c?.author ?? null, date: c?.comment_date ?? null,
              datedInMonth, platform: c?.platform ?? null, likes: c?.likes ?? null, videoAccount: v?.account_name ?? null,
              videoAudience: v ? audienceOf(v) : null, ownAccount,
            }
          }).sort((a, b) => Number(b.datedInMonth === true && b.ownAccount === false) - Number(a.datedInMonth === true && a.ownAccount === false) || (a.rank ?? 99) - (b.rank ?? 99))
            .slice(0, QUOTES_PER_THEME),
        }))
        const quoteList = out.quotes as { quotes: { datedInMonth: boolean | null; ownAccount: boolean | null }[] }[]
        const usable = quoteList.map((q) => q.quotes.filter((x) => x.datedInMonth && x.ownAccount === false).length)
        detail(`quotes (top five not led by makers): ${quoteList.map((q, i) => `${five[i].label.slice(0, 32)} ${usable[i]}`).join(' · ')} usable (dated in Sep, not the video's own account)`)
      }
    }

    // ---- d: the six month tables' baseline ----------------------------------------------------------------
    if (parts.has('d')) {
      const counts: Record<string, { rows: number | null; latestReadAt: string | null }> = {}
      // One request a table: the exact count of Sealand's rows rides on the latest read_at row.
      for (const table of SIX_TABLES) {
        const r = await step('d', `${table} rows and latest read_at`, () => reader.oneCounted<{ read_at: string | null }>(`${table} (Sealand rows, latest read_at)`,
          admin.from(table).select('read_at', { count: 'exact' }).eq('client_id', clientId).order('read_at', { ascending: false, nullsFirst: false }).limit(1)))
        counts[table] = { rows: r?.count ?? null, latestReadAt: r?.rows[0]?.read_at ?? null }
      }
      out.monthTables = counts
      say(`month tables (Sealand rows, latest read_at): ${SIX_TABLES.map((t) => `${t.replace('month_', '')} ${counts[t].rows ?? '?'}`).join(' · ')} · latest ${Object.values(counts).map((c) => c.latestReadAt ?? '').sort().pop()?.slice(0, 16) ?? '-'}Z`)
    }
    finish(null)
  } catch (e) {
    if (e instanceof TooSlow) {
      finish(e.message)
      process.exit(4)
    }
    throw e
  }
}

if (process.argv[1]?.endsWith('monday-reads.ts')) {
  main().catch((e) => {
    console.error(errText(e))
    process.exit(1)
  })
}
