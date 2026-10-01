// The long-run read for one month (pages build, 1 Oct): "What holds across
// {months}", the lead of Your market. The pool over the record window, the
// writer, scrub, self-check and compose (lib/written/longrun.ts), printed as
// the section reads plus the workings, and the stored JSON.
//
//   node --env-file=.env.local --import tsx scripts/longrun-read.ts \
//     --client <uuid> --month YYYY-MM [--run <uuid>] [--out <file.md>] [--write [--replace]]
//
// DRY BY DEFAULT. Nothing is written to any database: neither the writer's nor
// the self-check's `ai_call_log` rows (the calls are still paid for, about
// $0.15 to $0.25 on gpt-5.4), and no `week_reads` row.
//
// --write stores the month's row (`kind = 'month'`, ready or thin) under the
// run named by --run, or the newest delivered run, logging both calls as the
// pipeline's hook does (`maybeWriteLongRun`, inside `write-week-read`). It is a
// paste for Heinrich against production, and the fallback when the hook could
// not write it. It refuses to replace a month that has a ready read unless
// --replace is given.
//
//   --prompt-only --save-inputs <file.json>   reads the pool and the company,
//       prints the writer's two messages, saves what it read, and stops: no
//       model call, nothing written;
//   --inputs <file.json>   builds from the saved inputs instead of reading
//       them again (the self-check still reads the run's themes).
//
// --run also names the clustering the pool reads (the themed run); without it
// the newest run that produced themes.
//
// .env.local IS PRODUCTION. One run is the window reading over the months, one
// evidence read for at most sixty themes' insights, the brand mentions of the
// counted comments and the company's claims. It probes first (a timed read of
// the one client row) and will not go on if that takes over 3 s or fails.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { longMonth } from '../lib/format'
import { WHAT_THEY_SELL } from '../lib/pages/market-frame'
import { monthStartOf } from '../lib/reading/month-key'
import {
  buildLongRunRead, loadLongRunInputs, longRunRowOf, monthsPhrase,
  type BuiltLongRun, type LongRunInputs,
} from '../lib/written/longrun'
import { buildLongRunPrompts } from '../lib/written/longrun-write'
import { saveWeekRead, weekReadsApplied } from '../lib/written/store'
import type { WhoPart } from '../lib/written/types'

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

/** The newest delivered run (completed or partial), for the row's key. */
async function newestRun(db: SupabaseClient, clientId: string): Promise<string> {
  const res = await db.from('pipeline_runs').select('id, status, started_at')
    .eq('client_id', clientId).in('status', ['completed', 'partial'])
    .order('started_at', { ascending: false }).limit(1)
  if (res.error) throw new Error(`newest run: ${res.error.message}`)
  const id = (res.data ?? [])[0]?.id
  if (!id) throw new Error('no delivered run to store the read under')
  return String(id)
}

/** A split as the page prints it. */
function whoRows(parts: readonly WhoPart[], company: string, noun: string | null): string[] {
  return parts.map((p) => {
    const name = p.about === 'client' ? company : p.about === 'market' ? `Other ${noun ?? 'brands'} in your market` : p.about.slice('rival:'.length)
    return `| ${name} | ${p.videos} |`
  })
}

function render(company: string, clientId: string, built: BuiltLongRun, mode: string): string {
  const d = built.data
  const noun = WHAT_THEY_SELL[clientId] ?? null
  const phrase = monthsPhrase(d.months)
  const out: string[] = [
    `# ${company}: the long-run read for ${longMonth(d.month)} (${mode})`,
    '',
    `Clustering of run \`${built.pool.runId}\` · window ${d.window.from} to ${d.window.to} · status **${built.status}** · model ${d.model || 'none (no call)'} · ${d.promptVersion} · cost $${d.costUsd.toFixed(4)}${built.check ? ` (self-check $${built.check.costUsd.toFixed(4)}${built.check.ran ? '' : ', DID NOT RUN'})` : ''}`,
    '',
    '<sub>The section as it reads on Your market, then the workings. Small print is not client copy.</sub>',
    '',
    '---',
    '',
    `**WHAT HOLDS ACROSS ${phrase.toUpperCase()}**`,
    '',
  ]
  if (d.inShort) out.push(`> ${d.inShort}`, '')
  for (const [i, idea] of d.ideas.entries()) {
    out.push(`### ${i + 1}. ${idea.headline}`, '')
    for (const p of idea.body) out.push(p, '')
    out.push(`Heard in ${monthsPhrase(idea.months.filter((m) => m.videos > 0).map((m) => m.month))}, **${idea.videos}** videos`, '', '| About | Videos |', '|---|---|', ...whoRows(idea.who, company, noun), '')
    out.push(`<sub>${idea.sure} · by month: ${idea.months.map((m) => `${longMonth(m.month)} ${m.videos}`).join(', ')} · rests on ${idea.basedOn.map((t) => built.pool.candidates.find((c) => c.themeId === t)?.id ?? t).join(', ')}</sub>`, '')
  }
  if (d.ideas.length === 0) out.push('_(no idea prints: the block is omitted on the page)_', '')
  out.push('---', '', '## Workings', '')
  if (d.held.length) {
    out.push('### Held', '')
    for (const h of d.held) out.push(`- **${h.headline}**: ${h.reason}`)
    out.push('')
  }
  if (built.scrub) out.push(`Scrub: ${built.scrub.dropped} sentence(s) dropped (digits ${built.scrub.droppedDigits}, direction ${built.scrub.droppedDirection}, process ${built.scrub.droppedBanned}, change or advice ${built.scrub.droppedAdvice}).`, '')
  if (built.check) {
    out.push('### Self-check', '')
    for (const v of built.check.verdicts) out.push(`- ${v.verdict}: ${v.headline}`)
    out.push('')
  }
  if (built.raw) out.push('### The writer, before scrub', '', '```json', JSON.stringify(built.raw, null, 2), '```', '')
  out.push(`### The pool (${built.pool.candidates.length} candidates${built.pool.thin ? ', THIN' : ''}; months ${phrase})`, '')
  for (const c of built.pool.candidates) {
    const by = built.pool.months.map((m) => `${longMonth(m).slice(0, 3)} ${(c.monthVideoIds[m] ?? []).length}`).join(' · ')
    const who = c.who.map((p) => `${p.about} ${p.videos}`).join(', ')
    out.push(`**${c.id} "${c.label}"** · ${c.videoIds.length} videos (${by}) · kinds ${c.kinds.join(', ') || 'none'} · who: ${who}`)
    if (c.description) out.push('', `_${c.description}_`)
    out.push('', ...c.notes.map((n) => `- ${n}`), '')
  }
  return out.join('\n')
}

async function main() {
  const clientId = flag('client')
  const monthArg = flag('month')
  if (!clientId || !/^\d{4}-\d{2}$/.test(monthArg)) {
    console.error('Usage: scripts/longrun-read.ts --client <uuid> --month YYYY-MM [--run <uuid>] [--out <file.md>] [--write [--replace]] [--prompt-only] [--save-inputs <file>] [--inputs <file>]')
    process.exit(2)
  }
  const month = monthStartOf(`${monthArg}-01T00:00:00.000Z`)
  const write = has('write')
  const db = admin()
  const company = await probe(db, clientId)
  const runArg = flag('run') || null
  console.log(`Client: ${company} (${clientId}); ${longMonth(month)}; ${write ? 'WRITE' : 'dry run (nothing is written to any database)'}`)

  let rowRun = runArg
  if (write) {
    if (!(await weekReadsApplied(db))) throw new Error('week_reads is not in this database: apply supabase/migrations/20261104090000_week_reads.sql first')
    const ready = await db.from('week_reads').select('run_id, created_at').eq('client_id', clientId).eq('kind', 'month').eq('month', month).eq('status', 'ready').limit(1)
    if (ready.error) throw new Error(`week_reads: ${ready.error.message}`)
    if ((ready.data ?? []).length > 0 && !has('replace')) {
      console.error(`${longMonth(month)} already has a ready long-run read (run ${ready.data?.[0]?.run_id}). Pass --replace to write another.`)
      process.exit(4)
    }
    rowRun = runArg ?? (await newestRun(db, clientId))
  }

  const saved = flag('inputs')
  const inputs: LongRunInputs = saved
    ? (JSON.parse(readFileSync(resolve(process.cwd(), saved), 'utf8')) as LongRunInputs)
    : await loadLongRunInputs(db, { clientId, month, company, runId: runArg })
  if (saved && (inputs.pool.clientId !== clientId || inputs.pool.month !== month)) throw new Error(`${saved} holds another client or month`)
  if (flag('save-inputs')) {
    writeFileSync(resolve(process.cwd(), flag('save-inputs')), `${JSON.stringify(inputs, null, 2)}\n`)
    console.log(`Saved the inputs to ${flag('save-inputs')}`)
  }
  if (has('prompt-only')) {
    const { pool } = inputs
    console.log(`\nPool over ${monthsPhrase(pool.months)}: ${pool.candidates.length} candidate(s)${pool.thin ? ' (THIN: no call would be made)' : ''}`)
    for (const c of pool.candidates) console.log(`  ${c.id} "${c.label}" ${c.videoIds.length} videos · ${pool.months.map((m) => `${m.slice(0, 7)} ${(c.monthVideoIds[m] ?? []).length}`).join(' · ')} · ${c.who.map((p) => `${p.about} ${p.videos}`).join(', ')}`)
    const { system, user } = buildLongRunPrompts({ company: inputs.company, pool, context: inputs.context })
    console.log(`\n=== SYSTEM (${system.length} chars) ===\n${system}\n\n=== USER (${user.length} chars) ===\n${user}`)
    return
  }

  const started = Date.now()
  const built = await buildLongRunRead(db, { clientId, month, company, runId: runArg, logRunId: rowRun ?? undefined, log: write, inputs })
  console.log(`Built in ${Math.round((Date.now() - started) / 1000)} s: ${built.status}, ${built.data.ideas.length} idea(s), ${built.data.held.length} held, $${built.data.costUsd.toFixed(4)}.`)

  const text = render(company, clientId, built, write ? 'WRITTEN' : 'DRY RUN, not stored')
  console.log(`\n${text}\n`)
  const json = JSON.stringify({ status: built.status, data: built.data, workings: { pool: built.pool, context: inputs.context, raw: built.raw, scrub: built.scrub, check: built.check && { ...built.check, contradicted: [...built.check.contradicted] } } }, null, 2)
  const outPath = flag('out')
  if (outPath) {
    const md = resolve(process.cwd(), outPath)
    const js = md.replace(/\.md$/, '') + '.json'
    writeFileSync(md, `${text}\n`)
    writeFileSync(js, `${json}\n`)
    console.log(`Wrote the rendering to ${md} and the JSON to ${js}`)
  }

  if (write && rowRun) {
    await saveWeekRead(db, longRunRowOf(clientId, rowRun, built))
    console.log(`Stored ${longMonth(month)}'s long-run read (${built.status}) under run ${rowRun}.`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
