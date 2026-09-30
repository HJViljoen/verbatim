// The written read's inputs for one run, printed (plan "writing back", T1 and
// T2). READ-ONLY: it calls the pool's and the standing's loaders and the
// product's own readers, writes nothing to any database and spends no OpenAI
// or Apify money.
//
//   node --env-file=.env.local --import tsx scripts/written-pool.ts \
//     --client <uuid> --run <uuid> [--standing] [--subjects-page] [--show-quotes] [--out scratch/pool.json]
//
// WHAT IT CHECKS, beyond printing:
//  · the workings: how many category themes of the run sat on three or more
//    videos in the window (research C's "raw" column), beside how many of them
//    the strict gate left eligible (C's "strict" column);
//  · EVERY listed quote passes the quote gate when judged again INDEPENDENTLY:
//    its words through the render path (`fetchQuoteResolutionsByRefs`, the
//    ref spine), its video through the quote-context evidence path
//    (`readQuoteContext` by evidence id, segments on the service role), its
//    comment's date and the theme's kind read again. A failure exits non-zero;
//  · `--standing`: each confirmed subject's fact and code sentence for the
//    pool's month (T2), its quote re-checked the same way;
//  · `--subjects-page`: the Subjects page's own loader for the same month,
//    once, and every standing level against its rail. A mismatch exits
//    non-zero.
//
// .env.local IS PRODUCTION. One run is about a hundred and fifty small
// statements (the Subjects page is one page load). Like the other readers it
// probes first (a timed read of the one client row) and will not go on if that
// takes over 3 s or fails: wait fifteen minutes.

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { loadSubjectsPage } from '../lib/pages/subjects'
import { gateFor, readQuoteContext } from '../lib/quote-context'
import { quoteGate, type GateOptions } from '../lib/quote-gate'
import { fetchQuoteResolutionsByRefs } from '../lib/quotes'
import { loadWindowReading, readingHandle } from '../lib/reading/read'
import { parseRef } from '../lib/renderables/quotes-freeze'
import { coverPlainText } from '../lib/reports/cover'
import { INDUSTRY_AUDIENCE } from '../lib/rivals'
import { loadActiveSubjects } from '../lib/subjects/membership'
import { nextMonth } from '../lib/reading/month-key'
import { loadWeekPool, POOL_CAP, POOL_MIN_VIDEOS } from '../lib/written/pool'
import { loadStanding, standingLine, subjectGate } from '../lib/written/standing'
import type { QuoteRef, StandingFact, WeekPool } from '../lib/written/types'

const args = process.argv.slice(2)
const flag = (name: string, fallback = ''): string => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}
const has = (name: string): boolean => args.includes(`--${name}`)

function admin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false },
  })
}

async function probe(db: SupabaseClient, clientId: string): Promise<string> {
  const started = Date.now()
  const { data, error } = await db.from('clients').select('id, company_name').eq('id', clientId).maybeSingle()
  const ms = Date.now() - started
  if (error) throw new Error(`probe: ${error.message} (${ms} ms): do not read this instance for fifteen minutes`)
  if (!data) throw new Error(`probe: no client ${clientId}`)
  console.log(`Probe: the client row answered in ${ms} ms.`)
  if (ms > 3_000) {
    console.error(`The probe took ${ms} ms (the line is 3,000). Wait fifteen minutes and probe again.`)
    process.exit(3)
  }
  return String((data as { company_name: string }).company_name)
}

function printPool(pool: WeekPool): void {
  console.log(`\nWindow ${pool.window.from} → ${pool.window.to}; month ${pool.month}`)
  console.log(`Category: ${pool.weekVideos} videos and ${pool.weekComments} comments in the window; ${pool.monthVideos} videos in the month to date.`)
  console.log(`${pool.candidates.length} candidate(s)${pool.thin ? ' — THIN' : ''}:`)
  for (const c of pool.candidates) {
    console.log(
      `  ${c.id.padEnd(4)} ${c.label}\n` +
        `       lenient ${c.lenientVideos} (month ${c.monthVideoIds.length}) · strict ${c.gatedVideos} · week ${c.weekVideos} · month ${c.monthK} of ${c.monthN}` +
        ` · kinds ${c.kinds.join(', ') || '—'} (mostly ${c.dominantKind ?? '—'}) · lenses ${c.lenses.join(', ')}` +
        ` · subject ${c.subjectId ?? 'none'} · ${c.isNew ? 'NEW' : 'heard before'} · ${c.quoteRefs.length} quote(s) of ${c.quoteOptions.length} option(s) · ${c.notes.length} note(s)`,
    )
  }
}

/** The run's category themes on at least three videos in the window: the same
 *  memoised window read the pool made, so it costs no statement. */
async function workings(db: SupabaseClient, pool: WeekPool): Promise<number | null> {
  const read = await loadWindowReading(db, pool.clientId, { from: pool.window.from, to: pool.window.to, runId: pool.runId, audiences: [INDUSTRY_AUDIENCE] })
  return read.themes ? read.themes.filter((t) => t.audience === INDUSTRY_AUDIENCE && t.videos >= POOL_MIN_VIDEOS).length : null
}

/** One quote to judge again: where it was listed, the gate it was chosen
 *  under, the period its comment must fall in, and whose videos it may sit
 *  under. */
interface Recheck {
  where: string
  quote: QuoteRef
  gate: GateOptions
  period: { from: string; to: string }
  audience: 'category' | 'market'
}

/** Every listed quote, judged again on an independent read path. */
async function recheckQuotes(db: SupabaseClient, clientId: string, listed: readonly Recheck[], show: boolean): Promise<number> {
  if (listed.length === 0) {
    console.log('\nNo quote listed.')
    return 0
  }
  const evidenceIds = listed.map(({ quote }) => {
    const parsed = parseRef(quote.ref)
    if (!parsed || parsed.kind !== 'e') throw new Error(`unexpected ref ${quote.ref}`)
    return parsed.id
  })
  const [texts, ctx] = await Promise.all([
    fetchQuoteResolutionsByRefs(db, listed.map(({ quote }) => quote.ref), { onReadError: 'throw' }),
    readQuoteContext(db, clientId, { evidenceIds }, db),
  ])
  const commentIds = evidenceIds.map((id) => ctx.commentOfEvidence(id)).filter((id): id is string => Boolean(id))
  const dateRes = await db.from('comments').select('id, comment_date').eq('client_id', clientId).in('id', commentIds)
  if (dateRes.error) throw new Error(`recheck dates: ${dateRes.error.message}`)
  const dateOf = new Map(((dateRes.data ?? []) as { id: string; comment_date: string | null }[]).map((r) => [String(r.id), r.comment_date]))

  let failures = 0
  console.log(`\nRe-checking ${listed.length} quote(s) on an independent read path:`)
  listed.forEach((item, i) => {
    const id = evidenceIds[i]
    const text = texts.get(item.quote.ref)
    const video = ctx.forEvidence(id)
    const commentId = ctx.commentOfEvidence(id)
    const date = commentId ? dateOf.get(commentId) ?? null : null
    const inPeriod = date != null && Date.parse(date) >= Date.parse(item.period.from) && Date.parse(date) < Date.parse(item.period.to)
    const placed = video != null && video.isClient !== true && (item.audience === 'market' || video.isCompetitor !== true)
    const verdict = text ? quoteGate({ text: text.text, lang: text.lang ?? null, english: text.english ?? null, video }, item.gate) : null
    const ok = verdict?.ok === true && inPeriod && placed && video?.segment !== 'maker'
    if (!ok) failures++
    const why = !text
      ? 'did not resolve'
      : verdict && !verdict.ok ? verdict.reason
      : !inPeriod ? `dated ${date} outside the period`
      : !placed ? `not a ${item.audience} video`
      : video?.segment === 'maker' ? 'maker video' : ''
    console.log(`  ${ok ? 'pass' : 'FAIL'} ${item.where} ${item.quote.ref} ${item.quote.date} ${item.quote.platform} segment=${video?.segment ?? 'unread'}${why ? ` (${why})` : ''}`)
    if (show && text) console.log(`         “${text.text}”${text.english ? `  [EN: ${text.english}]` : ''}`)
  })
  console.log(failures === 0 ? 'Every listed quote passes the gate again.' : `${failures} quote(s) FAILED the re-check.`)
  return failures
}

async function poolRechecks(db: SupabaseClient, pool: WeekPool): Promise<Recheck[]> {
  // The theme's own kind, read again.
  const ids = pool.candidates.map((c) => c.themeId)
  if (ids.length === 0) return []
  const res = await db.from('theme_observations').select('theme_id, category').eq('client_id', pool.clientId).eq('run_id', pool.runId).in('theme_id', ids)
  if (res.error) throw new Error(`recheck kinds: ${res.error.message}`)
  const kindOf = new Map(((res.data ?? []) as { theme_id: string; category: string | null }[]).map((r) => [String(r.theme_id), r.category]))
  return pool.candidates.flatMap((c) => c.quoteRefs.map((quote) => ({
    where: c.id,
    quote,
    gate: gateFor(pool.clientId, { claim: c.label, requireRelevance: true, kind: kindOf.get(c.themeId) ?? null }),
    period: pool.window,
    audience: 'category' as const,
  })))
}

function printStanding(facts: readonly StandingFact[], month: string): void {
  console.log(`\nWhere the market stands, ${month}: ${facts.length} subject(s)`)
  for (const f of facts) {
    const line = standingLine(f, month)
    console.log(
      `  #${f.rank || '-'} ${f.name} [${f.calibration}] rung=${f.rung} level ${f.level ? `${f.level.k} of ${f.level.n}` : 'none'}` +
        ` · verdict ${f.verdict ? f.verdict.state : 'none (no comparable pair)'} · direction ${f.direction ?? 'none'}` +
        ` · trail ${f.trail.filter((p) => p.k != null).map((p) => `${p.month.slice(0, 7)} ${p.k}/${p.n}`).join(', ')}`,
    )
    console.log(`       line: ${line.body ? coverPlainText(line.body, line.figures) : f.calibration === 'failed' ? '(name only)' : '(none: its figure does not print)'}`)
    console.log(`       contents: ${f.contents.join(' · ') || '—'} · ${f.notes.length} note(s) · quote ${f.quoteRef ? `${f.quoteRef.ref} ${f.quoteRef.date}` : 'none'}`)
  }
  const ready = facts.filter((f) => f.calibration === 'ready')
  console.log(`Ready subjects at the level: ${ready.filter((f) => f.rung === 'level').length} of ${ready.length}.`)
}

/** The Subjects page's rail, for the same month, against every standing level. */
async function compareSubjectsPage(db: SupabaseClient, clientId: string, facts: readonly StandingFact[], month: string): Promise<number> {
  const page = await loadSubjectsPage({ supabase: db, clientId, reading: readingHandle(clientId, db), params: { month: month.slice(0, 7) }, canEdit: false })
  if (!page) throw new Error('the Subjects page returned nothing')
  const railMonth = page.list.base?.month ?? '?'
  console.log(`\nThe Subjects page reads ${railMonth} (market n ${page.list.base?.n ?? '?'}):`)
  let mismatches = 0
  for (const f of facts) {
    if (!f.level) continue
    const row = page.list.rows.find((r) => r.id === f.subjectId)
    const same = row?.market != null && row.market.k === f.level.k && row.market.n === f.level.n
    if (!same) mismatches++
    console.log(`  ${same ? 'same' : 'DIFF'} ${f.name}: standing ${f.level.k} of ${f.level.n} · page ${row?.market ? `${row.market.k} of ${row.market.n}` : 'no figure'}`)
  }
  if (railMonth.slice(0, 7) !== month.slice(0, 7)) {
    console.log(`  The page read ${railMonth}, not ${month}.`)
    mismatches++
  }
  console.log(mismatches === 0 ? 'Every standing level equals the Subjects page.' : `${mismatches} difference(s) from the Subjects page.`)
  return mismatches
}

async function main() {
  const clientId = flag('client')
  const runId = flag('run')
  if (!clientId || !runId) {
    console.error('Usage: scripts/written-pool.ts --client <uuid> --run <uuid> [--standing] [--subjects-page] [--show-quotes] [--out <file>]')
    process.exit(2)
  }
  const db = admin()
  const company = await probe(db, clientId)
  console.log(`Client: ${company} (${clientId}); run ${runId}`)

  const pool = await loadWeekPool(db, { clientId, runId })
  printPool(pool)
  const raw = await workings(db, pool)
  const eligible = `${pool.candidates.length}${pool.candidates.length === POOL_CAP ? ' or more (capped)' : ''}`
  console.log(`\nWorkings: ${raw ?? '?'} category theme(s) on ${POOL_MIN_VIDEOS}+ videos in the window; ${eligible} eligible on the strict gate${pool.thin ? ' (thin)' : ''}.`)
  const rechecks = await poolRechecks(db, pool)

  let standing: StandingFact[] | null = null
  let mismatches = 0
  if (has('standing') || has('subjects-page')) {
    standing = await loadStanding(db, { clientId, month: pool.month, window: pool.window, asOf: new Date() })
    printStanding(standing, pool.month)
    const subjects = new Map((await loadActiveSubjects(db, clientId)).map((s) => [s.id, s]))
    for (const f of standing) {
      const s = subjects.get(f.subjectId)
      if (!f.quoteRef || !s) continue
      rechecks.push({
        where: f.name,
        quote: f.quoteRef,
        gate: subjectGate(clientId, s),
        period: { from: `${pool.month}T00:00:00.000Z`, to: `${nextMonth(pool.month)}T00:00:00.000Z` },
        audience: 'market',
      })
    }
    if (has('subjects-page')) mismatches = await compareSubjectsPage(db, clientId, standing, pool.month)
  }

  const failures = await recheckQuotes(db, clientId, rechecks, has('show-quotes'))
  const out = flag('out')
  if (out) {
    writeFileSync(resolve(process.cwd(), out), `${JSON.stringify({ pool, standing }, null, 2)}\n`)
    console.log(`\nWrote the pool${standing ? ' and the standing facts' : ''} to ${out}`)
  }
  process.exit(failures === 0 && mismatches === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
