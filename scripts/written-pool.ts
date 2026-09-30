// The written read's week pool for one run, printed (plan "writing back", T1).
// READ-ONLY: it calls the pool's loader and the product's own readers, writes
// nothing to any database and spends no OpenAI or Apify money.
//
//   node --env-file=.env.local --import tsx scripts/written-pool.ts \
//     --client <uuid> --run <uuid> [--show-quotes] [--out scratch/pool.json]
//
// WHAT IT CHECKS, beyond printing the pool:
//  · the workings: how many category themes of the run sat on three or more
//    videos in the window (research C's "raw" column), beside how many of them
//    the strict gate left eligible (C's "strict" column);
//  · EVERY listed quote passes the quote gate when judged again INDEPENDENTLY:
//    its words through the render path (`fetchQuoteResolutionsByRefs`, the
//    ref spine), its video through the quote-context evidence path
//    (`readQuoteContext` by evidence id, segments on the service role), its
//    comment's date read again, and the theme's own kind read again. A quote
//    that fails exits non-zero.
//
// .env.local IS PRODUCTION. One run is about a hundred small statements. Like
// the other readers it probes first (a timed read of the one client row) and
// will not go on if that takes over 3 s or fails: wait fifteen minutes.

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { gateFor, readQuoteContext } from '../lib/quote-context'
import { quoteGate } from '../lib/quote-gate'
import { fetchQuoteResolutionsByRefs } from '../lib/quotes'
import { parseRef } from '../lib/renderables/quotes-freeze'
import { loadWindowReading } from '../lib/reading/read'
import { INDUSTRY_AUDIENCE } from '../lib/rivals'
import { loadWeekPool, POOL_CAP, POOL_MIN_VIDEOS } from '../lib/written/pool'
import type { WeekPool } from '../lib/written/types'

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
        `       gated ${c.gatedVideos} · week ${c.weekVideos} · month ${c.monthK} of ${c.monthN}` +
        ` · kinds ${c.kinds.join(', ') || '—'} · lenses ${c.lenses.join(', ')}` +
        ` · subject ${c.subjectId ?? 'none'} · ${c.isNew ? 'NEW' : 'heard before'} · ${c.quoteRefs.length} quote(s) · ${c.notes.length} note(s)`,
    )
  }
}

/** The run's category themes on at least three videos in the window: the same
 *  memoised window read the pool made, so it costs no statement. */
async function workings(db: SupabaseClient, pool: WeekPool): Promise<number | null> {
  const read = await loadWindowReading(db, pool.clientId, { from: pool.window.from, to: pool.window.to, runId: pool.runId, audiences: [INDUSTRY_AUDIENCE] })
  return read.themes ? read.themes.filter((t) => t.audience === INDUSTRY_AUDIENCE && t.videos >= POOL_MIN_VIDEOS).length : null
}

/** Every listed quote, judged again on an independent read path. */
async function recheckQuotes(db: SupabaseClient, pool: WeekPool, show: boolean): Promise<number> {
  const listed = pool.candidates.flatMap((c) => c.quoteRefs.map((q) => ({ c, q })))
  if (listed.length === 0) {
    console.log('\nNo quote listed.')
    return 0
  }
  const evidenceIds = listed.map(({ q }) => {
    const parsed = parseRef(q.ref)
    if (!parsed || parsed.kind !== 'e') throw new Error(`unexpected ref ${q.ref}`)
    return parsed.id
  })
  // The theme's own kind, read again.
  const kindRes = await db.from('theme_observations').select('theme_id, category')
    .eq('client_id', pool.clientId).eq('run_id', pool.runId).in('theme_id', pool.candidates.map((c) => c.themeId))
  if (kindRes.error) throw new Error(`recheck kinds: ${kindRes.error.message}`)
  const kindOf = new Map(((kindRes.data ?? []) as { theme_id: string; category: string | null }[]).map((r) => [String(r.theme_id), r.category]))
  const [texts, ctx] = await Promise.all([
    fetchQuoteResolutionsByRefs(db, listed.map(({ q }) => q.ref), { onReadError: 'throw' }),
    readQuoteContext(db, pool.clientId, { evidenceIds }, db),
  ])
  const commentIds = evidenceIds.map((id) => ctx.commentOfEvidence(id)).filter((id): id is string => Boolean(id))
  const dateRes = await db.from('comments').select('id, comment_date').eq('client_id', pool.clientId).in('id', commentIds)
  if (dateRes.error) throw new Error(`recheck dates: ${dateRes.error.message}`)
  const dateOf = new Map(((dateRes.data ?? []) as { id: string; comment_date: string | null }[]).map((r) => [String(r.id), r.comment_date]))

  let failures = 0
  console.log(`\nRe-checking ${listed.length} quote(s) on an independent read path:`)
  listed.forEach(({ c, q }, i) => {
    const id = evidenceIds[i]
    const text = texts.get(q.ref)
    const video = ctx.forEvidence(id)
    const commentId = ctx.commentOfEvidence(id)
    const date = commentId ? dateOf.get(commentId) ?? null : null
    const inWindow = date != null && Date.parse(date) >= Date.parse(pool.window.from) && Date.parse(date) < Date.parse(pool.window.to)
    const category = video != null && video.isClient !== true && video.isCompetitor !== true
    const verdict = text
      ? quoteGate({ text: text.text, lang: text.lang ?? null, english: text.english ?? null, video }, gateFor(pool.clientId, { claim: c.label, requireRelevance: true, kind: kindOf.get(c.themeId) ?? null }))
      : null
    const ok = verdict?.ok === true && inWindow && category && video?.segment !== 'maker'
    if (!ok) failures++
    const why = !text ? 'did not resolve' : verdict && !verdict.ok ? verdict.reason : !inWindow ? `dated ${date} outside the window` : !category ? 'not a category video' : video?.segment === 'maker' ? 'maker video' : ''
    console.log(`  ${ok ? 'pass' : 'FAIL'} ${c.id} ${q.ref} ${q.date} ${q.platform} segment=${video?.segment ?? 'unread'}${why ? ` (${why})` : ''}`)
    if (show && text) console.log(`         “${text.text}”${text.english ? `  [EN: ${text.english}]` : ''}`)
  })
  console.log(failures === 0 ? 'Every listed quote passes the gate again.' : `${failures} quote(s) FAILED the re-check.`)
  return failures
}

async function main() {
  const clientId = flag('client')
  const runId = flag('run')
  if (!clientId || !runId) {
    console.error('Usage: scripts/written-pool.ts --client <uuid> --run <uuid> [--show-quotes] [--out <file>]')
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

  const failures = await recheckQuotes(db, pool, has('show-quotes'))
  const out = flag('out')
  if (out) {
    writeFileSync(resolve(process.cwd(), out), `${JSON.stringify(pool, null, 2)}\n`)
    console.log(`\nWrote the pool to ${out}`)
  }
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
