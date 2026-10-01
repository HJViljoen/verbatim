// The backfill (1 Oct evening; Heinrich: "Can we do full runs on previous
// data just so it shows up on the platform?"). What the pipeline would have
// written for the LATEST SETTLED RUN, on the data that is there, and a way to
// put it on the platform without emailing anyone.
//
//   node --env-file=.env.local --import tsx scripts/backfill-platform.ts \
//     --client <uuid> [--run <uuid>] [--out <file.md>] [--yes | --publish]
//
// Run it through ~/.claude/plans/verbatim-writing-back/run/backfill-platform.sh,
// which checks production first and keeps the log.
//
// WHAT IT WRITES, for one run (the newest delivered run with a window; Sealand:
// the 27 Sep run), each only where it is missing, so a second run writes
// nothing (idempotent):
//   1. the run's week read (`week_reads`, kind 'week'): exactly the pipeline's
//      `write-week-read` (lib/written/step.ts), its calls logged as the step's;
//   2. the long-run read of the run's reading month (`week_reads`, kind
//      'month', under the same run): `write-longrun-read`'s build, from the
//      first month the market cleared the floor through this one, marked
//      `partialThrough` (the run's last day), because the month has not
//      closed. A partial read does not stand as the month's
//      (`standsAsMonthRead`), so the run that closes the month still writes the
//      full one, which then takes its place;
//   3. the weekly read's held build for that run (a `report_snapshots` row and
//      its `report_sends` row, `ready`), as the schedule's review path makes it
//      (`holdWeeklyRead`), WITHOUT the review email.
//
// NOTHING ELSE. No week before the run (the chart's weeks span our search and
// relevance changes; the rule stands), no older week read (no page shows
// one), no subject recalibration (a definition change is Heinrich's), no
// email to anyone.
//
// THREE MODES.
//   (default) DRY: reads production, makes the model calls (logged nowhere),
//             prints what it would write, the full text of both reads for
//             Heinrich to read, and the cost. Writes nothing.
//   --yes     writes 1 to 3 (each only where missing). Emails nobody.
//   --publish puts the held build ON THE PLATFORM without its email
//             (`publishSend`, lib/schedules/publish.ts: `published_at`, and a
//             `config_changes` row naming this command). Its week read, and
//             the long-run read the same run wrote, then show on the client's
//             pages; Send in the Studio still emails it, as before. Separate
//             from --yes on purpose: Heinrich reads the text first.
//
// BOUNDED: one run and one month; every model call has a hard cap (twice the
// step's: writer 300 s, self-check 90 s, quote fit 40 s) and no SDK retry. It refuses on a Sunday before 13:00 SAST
// (the weekly run starts 06:00 and takes about 4.5 hours).
//
// It ends with a PASS/FAIL block to paste back.
//
// .env.local IS PRODUCTION. It probes first (a timed read of the one client
// row) and will not go on if that takes over 3 s or fails.

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { chunk } from '../lib/chunk'
import { scriptActor } from '../lib/config-log'
import { longMonth } from '../lib/format'
import { loadGatherConfig } from '../lib/gather/gather'
import { classifyRelevance } from '../lib/gather/relevance'
import { fetchQuoteResolutionsByRefs, type QuoteResolution } from '../lib/quotes'
import { monthStartOf } from '../lib/reading/month-key'
import { sendsWeeklyRead } from '../lib/schedules/artefact'
import { isMissingPublishColumns, onPlatform } from '../lib/schedules/platform-state'
import { holdWeeklyRead, publishSend } from '../lib/schedules/publish'
import type { ScheduleRow } from '../lib/schedules/types'
import { buildLongRunRead, longRunRowOf, monthsPhrase, type BuiltLongRun } from '../lib/written/longrun'
import { readingMonthOf } from '../lib/written/month'
import type { CallBudget, WeekReadCall } from '../lib/written/deadline'
import { buildWeekRead, loadWeekReadInputs, rowOf, type BuiltWeekRead } from '../lib/written/step'
import { saveWeekRead, weekReadsApplied } from '../lib/written/store'
import { selectAll } from '../lib/supabase-admin'
import type { LongRunReadData } from '../lib/written/types'
import { renderLongRun, renderWeekRead } from './written-render'

const args = process.argv.slice(2)
const flag = (name: string, fallback = ''): string => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}
const has = (name: string): boolean => args.includes(`--${name}`)

const COMMAND = 'scripts/backfill-platform.ts'

function admin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false },
  })
}

/** The weekday and the hour on the clock in Cape Town. */
function sast(now = new Date()): { weekday: string; hm: number; label: string } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Johannesburg', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const hm = Number(get('hour')) * 100 + Number(get('minute'))
  return { weekday: get('weekday'), hm, label: `${get('weekday')} ${get('hour')}:${get('minute')} SAST` }
}

/** A sentence in the reads that states a count: a digit, or a number word.
 *  The writers have no numbers and the scrub drops a digit's sentence, so
 *  this is the backstop the lead asked for ("no September counts a partial
 *  month would understate"). Pure. */
export function countSentences(texts: readonly string[]): string[] {
  const NUMBER = /\b(?:\d[\d,.]*|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundreds?|thousands?|dozens?|half|a third|a quarter)\b/i
  return texts.flatMap((t) => t.split(/(?<=[.!?])\s+/)).filter((s) => NUMBER.test(s))
}

/** The script's caps: twice the step's, because a script is not inside
 *  Vercel's 300 s and a slow afternoon on the writer (one call over the step's
 *  150 s on 1 Oct) must not cost a whole dry run. Still a hard cap per call,
 *  and still no silent retry. */
const SCRIPT_CAPS: Record<WeekReadCall, number> = { writer: 300_000, check: 90_000, embed: 40_000 }
const SCRIPT_BUDGET: CallBudget = { optionsFor: (call) => ({ timeout: SCRIPT_CAPS[call], maxRetries: 0 }) }

/** Monday (UTC) of the ISO week holding this instant, `YYYY-MM-DD`. Pure. */
export function isoMonday(iso: string): string {
  const d = new Date(iso)
  const day = (d.getUTCDay() + 6) % 7
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10)
}

/**
 * THE VIDEOS LET IN UNJUDGED (the lead's question about the week chart, 1 Oct):
 * every market-lane video whose only relevance verdict is the fail-open
 * `default` (a GPT batch that failed before the 24 Sep fix), judged now by
 * today's check (`classifyRelevance`, gpt-4.1-mini, one call per sixty), and
 * which of them have comments dated in `week`. READ-ONLY: the verdicts are
 * printed, never stored. Bounded at `cap` videos.
 */
async function measureUnchecked(db: SupabaseClient, clientId: string, week: string, cap = 1000): Promise<{ text: string[]; costUsd: number; inWeek: number; inWeekRejected: number; total: number; rejected: number }> {
  type Gv = { platform: string; video_id: string; source: string; kept: boolean }
  const gv = await selectAll<Gv>(() => db.from('gate_verdicts').select('platform, video_id, source, kept').eq('client_id', clientId).order('created_at') as unknown as { range: (a: number, b: number) => PromiseLike<{ data: Gv[] | null; error: unknown }> })
  const judged = new Set(gv.filter((g) => g.source !== 'default').map((g) => `${g.platform}:${g.video_id}`))
  const unjudged = [...new Set(gv.filter((g) => g.source === 'default' && g.kept).map((g) => `${g.platform}:${g.video_id}`))].filter((k) => !judged.has(k))
  type V = { id: string; platform: string; video_id: string; account_name: string | null; caption: string | null; hashtags: string[] | null; analyzed_lane: string | null; is_client: boolean | null }
  const videos: V[] = []
  const byPlatform = new Map<string, string[]>()
  for (const k of unjudged) { const [p, ...id] = k.split(':'); byPlatform.set(p, [...(byPlatform.get(p) ?? []), id.join(':')]) }
  for (const [platform, ids] of byPlatform) {
    for (const part of chunk(ids, 100)) {
      const r = await db.from('videos').select('id, platform, video_id, account_name, caption, hashtags, analyzed_lane, is_client').eq('client_id', clientId).eq('platform', platform).in('video_id', part)
      if (r.error) throw new Error(`videos: ${r.error.message}`)
      videos.push(...((r.data ?? []) as V[]))
    }
  }
  const market = videos.filter((v) => v.analyzed_lane === 'full' && v.is_client !== true).slice(0, cap)
  const to = new Date(Date.parse(`${week}T00:00:00Z`) + 7 * 86_400_000).toISOString()
  const inWeek = new Set<string>()
  const mByPlatform = new Map<string, string[]>()
  for (const v of market) mByPlatform.set(v.platform, [...(mByPlatform.get(v.platform) ?? []), v.video_id])
  for (const [platform, ids] of mByPlatform) {
    for (const part of chunk(ids, 100)) {
      const r = await db.from('comments').select('video_id').eq('client_id', clientId).eq('platform', platform).in('video_id', part)
        .gte('comment_date', `${week}T00:00:00Z`).lt('comment_date', to).limit(5000)
      if (r.error) throw new Error(`comments: ${r.error.message}`)
      for (const c of (r.data ?? []) as { video_id: string }[]) inWeek.add(`${platform}:${c.video_id}`)
    }
  }
  const config = await loadGatherConfig(clientId)
  const result = await classifyRelevance(market.map((v) => ({ video_id: `${v.platform}:${v.video_id}`, account_name: v.account_name ?? '', caption: v.caption ?? '', hashtags: v.hashtags ?? [] })), { method: 'gpt', config })
  const verdict = (v: V) => result.verdicts.get(`${v.platform}:${v.video_id}`)
  const rejected = market.filter((v) => verdict(v)?.relevant === false)
  const weekVideos = market.filter((v) => inWeek.has(`${v.platform}:${v.video_id}`))
  const weekRejected = weekVideos.filter((v) => verdict(v)?.relevant === false)
  const still = market.filter((v) => verdict(v)?.source === 'default').length
  const text = [
    `Market-lane videos whose only relevance verdict is the fail-open default: ${market.length} (of ${unjudged.length} unjudged videos in all).`,
    `Today's check keeps ${market.length - rejected.length - still} and drops ${rejected.length}${still ? `; ${still} could not be judged now either (${result.failedBatches} failed batch(es))` : ''}.`,
    `Of them, ${weekVideos.length} have comments dated in the week of ${week}: today's check keeps ${weekVideos.length - weekRejected.length} and drops ${weekRejected.length}.`,
    ...weekRejected.map((v) => `  - drops ${v.platform} ${v.video_id}: "${(v.caption ?? '').replace(/\s+/g, ' ').slice(0, 100)}" (${verdict(v)?.reason ?? ''})`),
    `Cost of judging them now: $${result.costUsd.toFixed(4)}. Nothing was stored.`,
  ]
  return { text, costUsd: result.costUsd, inWeek: weekVideos.length, inWeekRejected: weekRejected.length, total: market.length, rejected: rejected.length }
}

interface RunRow { id: string; status: string; started_at: string; completed_at: string | null; window_start: string | null; window_end: string | null }

const lines: string[] = []
const say = (s = '') => { lines.push(s); console.log(s) }

async function main() {
  const clientId = flag('client')
  if (!/^[0-9a-f-]{36}$/.test(clientId)) {
    console.error(`Usage: ${COMMAND} --client <uuid> [--run <uuid>] [--out <file.md>] [--yes | --publish]`)
    process.exit(2)
  }
  const write = has('yes')
  const publish = has('publish')
  if (write && publish) throw new Error('--yes and --publish are separate steps: write, read the text, then publish')
  const mode = publish ? 'PUBLISH' : write ? 'WRITE' : 'DRY RUN'
  const block: string[] = []
  const fail: string[] = []
  const clock = sast()
  block.push(`mode: ${mode} · ${clock.label}`)
  if (clock.weekday === 'Sun' && clock.hm < 1300) {
    console.error(`It is ${clock.label}: Sunday before 13:00, the weekly run may still be running. Nothing was read or written.`)
    process.exit(5)
  }

  const db = admin()
  const started = Date.now()
  const { data: client, error: probeErr } = await db.from('clients').select('id, company_name').eq('id', clientId).maybeSingle()
  const probeMs = Date.now() - started
  if (probeErr) throw new Error(`probe: ${probeErr.message} (${probeMs} ms): do not read this instance for fifteen minutes`)
  if (!client) throw new Error(`probe: no client ${clientId}`)
  if (probeMs > 3_000) {
    console.error(`The probe took ${probeMs} ms (the line is 3,000). Wait fifteen minutes and probe again.`)
    process.exit(3)
  }
  const company = String((client as { company_name: string }).company_name)
  say(`# Backfill: ${company} (${mode})`)
  say()
  say(`Probe: the client row answered in ${probeMs} ms.`)
  if (!(await weekReadsApplied(db))) throw new Error('week_reads is not in this database')

  // ---- The run: the newest delivered run with a window, or --run ----------------------------
  const runRes = await db.from('pipeline_runs').select('id, status, started_at, completed_at, window_start, window_end')
    .eq('client_id', clientId).in('status', ['completed', 'partial']).not('window_end', 'is', null)
    .order('started_at', { ascending: false }).limit(10)
  if (runRes.error) throw new Error(`runs: ${runRes.error.message}`)
  const runs = (runRes.data ?? []) as RunRow[]
  const run = flag('run') ? runs.find((r) => r.id === flag('run')) : runs[0]
  if (!run || !run.window_start || !run.window_end) throw new Error(flag('run') ? `run ${flag('run')} is not one of the client's ten newest delivered runs with a window` : 'no delivered run with a window')
  const window = { from: run.window_start, to: run.window_end }
  const reading = readingMonthOf(window)
  const month = monthStartOf(`${reading.month}T00:00:00.000Z`)
  const through = new Date(run.window_end).toISOString().slice(0, 10)
  say(`Run \`${run.id}\` (${run.status}, started ${run.started_at.slice(0, 16)}): window ${window.from.slice(0, 16)} to ${window.to.slice(0, 16)}, reading month ${longMonth(month)}.`)
  block.push(`client: ${company} (${clientId})`)
  block.push(`run: ${run.id} · window ${window.from.slice(0, 16)} to ${window.to.slice(0, 16)}`)

  // ---- What stands already ------------------------------------------------------------------
  const readsRes = await db.from('week_reads').select('run_id, kind, status, month, created_at, data->>partialThrough')
    .eq('client_id', clientId).or(`run_id.eq.${run.id},and(kind.eq.month,month.eq.${month})`)
  if (readsRes.error) throw new Error(`week_reads: ${readsRes.error.message}`)
  const stored = (readsRes.data ?? []) as { run_id: string; kind: string; status: string; month: string | null; created_at: string; partialThrough: string | null }[]
  const weekRow = stored.find((r) => r.run_id === run.id && r.kind === 'week') ?? null
  const monthRow = stored.find((r) => r.kind === 'month' && r.month?.slice(0, 10) === month && (r.status === 'ready' || r.status === 'thin'))
    ?? stored.find((r) => r.run_id === run.id && r.kind === 'month') ?? null

  const schedRes = await db.from('report_schedules').select('*').eq('client_id', clientId)
  if (schedRes.error) throw new Error(`schedules: ${schedRes.error.message}`)
  const schedule = ((schedRes.data ?? []) as ScheduleRow[]).find((s) => s.active && sendsWeeklyRead(s)) ?? null
  type SendState = { id: string; status: string; snapshot_id: string | null; published_at?: string | null; subject: string | null }
  let send: SendState | null = null
  let publishColumns = true
  if (schedule) {
    let sendRes = await db.from('report_sends').select('id, status, snapshot_id, subject, published_at').eq('schedule_id', schedule.id).eq('run_id', run.id).maybeSingle()
    if (sendRes.error && isMissingPublishColumns(sendRes.error)) {
      publishColumns = false
      sendRes = await db.from('report_sends').select('id, status, snapshot_id, subject').eq('schedule_id', schedule.id).eq('run_id', run.id).maybeSingle()
    }
    if (sendRes.error) throw new Error(`sends: ${sendRes.error.message}`)
    send = sendRes.data as SendState | null
  }
  say()
  say('## What stands now')
  say()
  say(`- Week read for this run: ${weekRow ? `${weekRow.status}, written ${weekRow.created_at.slice(0, 16)}` : 'none'}`)
  say(`- Long-run read for ${longMonth(month)}: ${monthRow ? `${monthRow.status} (run ${monthRow.run_id.slice(0, 8)}${monthRow.partialThrough ? `, partial through ${monthRow.partialThrough}` : ''})` : 'none'}`)
  say(`- Weekly schedule: ${schedule ? `"${schedule.name}", review ${schedule.review ? 'on' : 'off'}, ${schedule.recipients.length} recipient(s)` : 'none active'}`)
  say(`- Its build for this run: ${send ? `${send.status}${send.published_at ? `, on the platform since ${send.published_at.slice(0, 16)}` : ''}` : 'none'}`)
  say(`- The platform state (migration 20261106090000): ${publishColumns ? 'in this database' : 'NOT in this database'}`)

  let cost = 0

  // ---- PUBLISH ------------------------------------------------------------------------------
  if (publish) {
    say()
    say('## Publishing to the platform (no email)')
    say()
    if (!publishColumns) fail.push('the platform state is not in production: apply migration 20261106090000_platform_publish.sql (with the code deploy) first')
    if (!schedule) fail.push('no active weekly-read schedule')
    if (!weekRow || weekRow.status !== 'ready') fail.push(`the run's week read is ${weekRow?.status ?? 'missing'}: run --yes first`)
    if (!send || !send.snapshot_id) fail.push('no held build for this run: run --yes first')
    if (fail.length === 0 && send) {
      const out = await publishSend(db, { clientId, sendId: send.id, scheduleId: schedule!.id, by: null, actor: scriptActor(`${COMMAND} --publish --client ${clientId} --run ${run.id}`) })
      if (out.status === 'published') say(`Published: "${send.subject ?? 'the weekly read'}" is on the platform (${out.publishedAt}). Nobody was emailed.`)
      else if (out.status === 'already') say(`Already on the platform (${out.why}). Nothing written.`)
      else fail.push(out.error)
      block.push(`published: ${out.status === 'refused' ? `REFUSED: ${out.error}` : out.status}`)
      block.push(`long-run read on the platform with it: ${monthRow?.run_id === run.id && monthRow.status === 'ready' ? 'yes' : 'no (none ready under this run)'}`)
    }
    return finish(block, fail, cost)
  }

  // ---- 1. The week read ---------------------------------------------------------------------
  say()
  say('---')
  say()
  let weekBuilt: BuiltWeekRead | null = null
  if (weekRow && weekRow.status !== 'failed') {
    say(`## 1. The week read: stands (${weekRow.status}), not written again`)
    block.push(`week read: stands (${weekRow.status})`)
  } else {
    const inputs = await loadWeekReadInputs(db, { clientId, runId: run.id, asOf: new Date(run.completed_at ?? run.window_end) })
    weekBuilt = await buildWeekRead(db, { clientId, runId: run.id, log: write, inputs, asOf: new Date(run.completed_at ?? run.window_end), budget: SCRIPT_BUDGET })
    cost += weekBuilt.data.costUsd + (weekBuilt.fit?.costUsd ?? 0)
    const refs = [
      ...weekBuilt.data.findings.map((f) => f.quote?.ref),
      ...weekBuilt.data.story.map((p) => p.quote?.ref),
      ...weekBuilt.data.standing.map((s) => s.quote?.ref),
      ...weekBuilt.pool.candidates.flatMap((c) => c.quoteOptions.map((o) => o.quote.ref)),
    ].filter((r): r is string => Boolean(r))
    const words = refs.length ? await fetchQuoteResolutionsByRefs(db, [...new Set(refs)], { onReadError: 'throw' }) : new Map<string, QuoteResolution>()
    say(`## 1. The week read: ${write ? 'WRITTEN' : 'would write'} (${weekBuilt.status}, ${weekBuilt.data.findings.length} finding(s), $${weekBuilt.data.costUsd.toFixed(4)})`)
    say()
    say(renderWeekRead(company, run.id, weekBuilt, words, write ? 'WRITTEN' : 'DRY RUN, not stored', inputs.context))
    if (write) await saveWeekRead(db, rowOf(clientId, run.id, weekBuilt))
    block.push(`week read: ${write ? 'written' : 'would write'} ${weekBuilt.status} · ${weekBuilt.data.findings.length} finding(s) · $${weekBuilt.data.costUsd.toFixed(4)}`)
    if (weekBuilt.status !== 'ready') fail.push(`the week read is ${weekBuilt.status}: nothing would go on the platform`)
  }

  // ---- 2. The long-run read -----------------------------------------------------------------
  say()
  say('---')
  say()
  if (monthRow && monthRow.status !== 'failed') {
    say(`## 2. The long-run read for ${longMonth(month)}: stands (${monthRow.status}, run ${monthRow.run_id.slice(0, 8)}), not written again`)
    block.push(`long-run read: stands (${monthRow.status}${monthRow.partialThrough ? `, partial through ${monthRow.partialThrough}` : ''})`)
  } else {
    const built: BuiltLongRun = await buildLongRunRead(db, { clientId, month, company, logRunId: run.id, log: write, asOf: new Date(run.completed_at ?? run.window_end), budget: SCRIPT_BUDGET })
    const data: LongRunReadData = { ...built.data, partialThrough: through }
    cost += data.costUsd
    say(`## 2. The long-run read for ${longMonth(month)}: ${write ? 'WRITTEN' : 'would write'} (${built.status}, ${data.ideas.length} idea(s), $${data.costUsd.toFixed(4)}; partial through ${through})`)
    say()
    say(renderLongRun(company, clientId, { ...built, data }, write ? 'WRITTEN' : 'DRY RUN, not stored'))
    // The lead's check: no sentence states a count. The writer has no numbers
    // and the scrub drops a digit's sentence; this is the backstop.
    const counted = countSentences([data.inShort, ...data.ideas.flatMap((i) => [i.headline, ...i.body])])
    say()
    say(`Count check (sentences that state a number): ${counted.length === 0 ? 'none' : counted.map((s) => `"${s}"`).join(' · ')}`)
    say(`What code prints beside each idea: "Heard in ${monthsPhrase(data.months)}, N videos" and who the videos are about, counted over the whole window (${data.window.from.slice(0, 10)} to ${data.window.to.slice(0, 10)}), on the comments to ${through}. No September-only count prints. The month-closing run writes the full read over it.`)
    if (counted.length > 0) fail.push(`the long-run read states a count in ${counted.length} sentence(s): not written`)
    if (write && counted.length === 0) await saveWeekRead(db, longRunRowOf(clientId, run.id, { status: built.status, data }))
    block.push(`long-run read: ${write && counted.length === 0 ? 'written' : 'would write'} ${built.status} · ${data.ideas.length} idea(s) over ${monthsPhrase(data.months)} · partial through ${through} · $${data.costUsd.toFixed(4)} · count sentences ${counted.length}`)
  }

  // ---- 3. The held build --------------------------------------------------------------------
  say()
  say('---')
  say()
  if (!schedule) {
    say('## 3. The held build: no active weekly-read schedule, nothing to build')
    block.push('held build: none (no active weekly-read schedule)')
  } else if (send) {
    say(`## 3. The held build: stands (${send.status}${send.published_at ? ', on the platform' : ''}), not built again`)
    block.push(`held build: stands (${send.status}${send.published_at ? ', on the platform' : ''})`)
  } else if (!write) {
    say(`## 3. The held build: would build it for "${schedule.name}" and hold it as ready, with NO review email and nothing to the ${schedule.recipients.length} recipient(s)`)
    block.push('held build: would build (ready, no email)')
  } else {
    const out = await holdWeeklyRead(db, { schedule, runId: run.id, company })
    if (out.status === 'held') say(`## 3. The held build: BUILT and held (send ${out.sendId}, "${out.subject}"). Nobody was emailed.`)
    else if (out.status === 'exists') say(`## 3. The held build: stands (${out.sendStatus})`)
    else { say(`## 3. The held build: ${out.status}: ${out.error}`); fail.push(`held build ${out.status}: ${out.error}`) }
    block.push(`held build: ${out.status}${out.status === 'held' ? ` (send ${out.sendId})` : ''}`)
  }

  // ---- The week chart's question (dry run only, read-only) ----------------------------------
  if (!write && !has('no-rejudge')) {
    const week = isoMonday(new Date(Date.parse(run.window_end) - 1).toISOString())
    say()
    say('---')
    say()
    say(`## The week of ${week}: the videos let in unjudged, judged by today's check (measured, not stored)`)
    say()
    const m = await measureUnchecked(db, clientId, week)
    for (const l of m.text) say(l)
    cost += m.costUsd
    block.push(`unjudged videos: ${m.total} in the market lane; today's check drops ${m.rejected} · week of ${week}: ${m.inWeek}, drops ${m.inWeekRejected} · $${m.costUsd.toFixed(4)} (not stored)`)
  }

  // ---- Publishing ---------------------------------------------------------------------------
  say()
  say(`Publishing is a separate step (--publish), after Heinrich has read the text above.${send && onPlatform({ status: send.status, published_at: send.published_at }) ? ' This build is on the platform already.' : ''}`)
  return finish(block, fail, cost)
}

function finish(block: string[], fail: string[], cost: number) {
  block.push(`model cost: $${cost.toFixed(4)}`)
  block.push(`result: ${fail.length === 0 ? 'PASS' : `FAIL: ${fail.join('; ')}`}`)
  say()
  say('==== BACKFILL ====')
  for (const l of block) say(l)
  say('==================')
  const out = flag('out')
  if (out) {
    writeFileSync(resolve(process.cwd(), out), `${lines.join('\n')}\n`)
    console.log(`Wrote the whole output to ${resolve(process.cwd(), out)}`)
  }
  if (fail.length > 0) process.exitCode = 1
}

if (process.argv[1]?.endsWith('backfill-platform.ts')) {
  main().catch((error) => {
    console.error(error)
    say()
    say('==== BACKFILL ====')
    say(`result: FAIL: ${error instanceof Error ? error.message : String(error)}`)
    say('==================')
    process.exit(1)
  })
}
