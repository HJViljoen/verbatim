// A month's four department briefs for one workspace, by hand: the pipeline's
// `briefs:*` steps (lib/reports/briefs/step.ts) in one process. The fallback
// their alert names, and the backfill for a month that closed before the
// steps existed (September 2026: scripts/backfill-briefs-september.sh).
//
//   node --env-file=.env.local --import tsx scripts/monthly-briefs.ts \
//     --client <uuid> --month YYYY-MM --run <uuid> [--out <dir>] [--plan] [--write [--replace]]
//
// --run is the run that closed the month: the briefs are stored under it, as
// the pipeline stores them under its own run.
//
// DRY BY DEFAULT. Nothing is written to any database: not the briefs, not the
// ledger, not one `ai_call_log` row. The model calls are still made and paid
// for (about $2 to $2.50 a workspace: the research most of it), and the four
// briefs are printed (and written to --out as Markdown, quotes resolved, and
// JSON, quotes as refs).
//
// --plan makes no model call and reads a handful of rows: the probe, whether
// the ledger is there, whether the month is written, and the run's window.
// Run it first: it says what --write would do, for nothing.
//
// --write builds and stores: each brief that prints as its report snapshot
// (quotes as refs, frozen), and the month's four `monthly_briefs` rows, ready
// or thin; the model calls are logged to `ai_call_log` under the research's
// run. It refuses a month whose set is written unless --replace is given, and
// a database without the ledger (apply
// supabase/migrations/20261107090000_monthly_briefs.sql first).
//
// THE RESEARCH READS THE NEWEST THEMED RUN. The `themes` table holds the
// newest run's themes only, so the Ask agent's research reads that run's,
// whichever run the briefs are stored under; on the week a month closes the
// two are the same run.
//
// .env.local IS PRODUCTION. One workspace is one pipeline step's worth of
// reads (the inputs, nineteen research questions three at a time, the
// evidence of every point once). It probes first (a timed read of the one
// client row) and will not go on if that takes over 3 s or fails. One
// workspace at a time; never beside another reader.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { longMonth } from '../lib/format'
import { rowWindow, type WindowColumns } from '../lib/pipeline/run-bookkeeping'
import { monthStartOf } from '../lib/reading/month-key'
import { collectQuoteRefs } from '../lib/renderables/quotes-freeze'
import {
  groundBriefResearch, loadBriefSetInputs, questionsFor, researchBriefSet, writeBriefSet,
} from '../lib/reports/briefs/build'
import { briefMarkdown } from '../lib/reports/briefs/markdown'
import { BRIEF_RESEARCH_BUDGET_USD } from '../lib/reports/briefs/step'
import { briefPrints, monthBriefsWritten, monthlyBriefsApplied, storeBriefSet } from '../lib/reports/briefs/store'
import { BRIEF_NAME, BRIEF_ROLES, type MonthlyBriefData } from '../lib/reports/briefs/types'
import { closesMonth, endedMonthOf, themedRunAsOf } from '../lib/written/longrun'

const args = process.argv.slice(2)
const flag = (name: string, fallback = ''): string => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}
const has = (name: string): boolean => args.includes(`--${name}`)
for (const a of args) {
  if (a.startsWith('--') && !['client', 'month', 'run', 'out', 'plan', 'write', 'replace'].includes(a.slice(2))) {
    console.error(`unknown flag: ${a}`)
    process.exit(2)
  }
}

function admin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
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

async function runWindowOf(db: SupabaseClient, clientId: string, runId: string): Promise<{ from: string; to: string } | null> {
  const res = await db.from('pipeline_runs').select('*').eq('client_id', clientId).eq('id', runId).maybeSingle()
  if (res.error) throw new Error(`run: ${res.error.message}`)
  if (!res.data) throw new Error(`no run ${runId} for this client`)
  const w = rowWindow(res.data as WindowColumns)
  return w?.start && w.end ? { from: w.start, to: w.end } : null
}

async function main() {
  const clientId = flag('client')
  const monthArg = flag('month')
  const runId = flag('run')
  if (!/^[0-9a-f-]{36}$/.test(clientId) || !/^\d{4}-\d{2}$/.test(monthArg) || !/^[0-9a-f-]{36}$/.test(runId)) {
    console.error('Usage: scripts/monthly-briefs.ts --client <uuid> --month YYYY-MM --run <uuid> [--out <dir>] [--plan] [--write [--replace]]')
    process.exit(2)
  }
  const month = monthStartOf(`${monthArg}-01T00:00:00.000Z`)
  const write = has('write')
  const db = admin()
  const company = await probe(db, clientId)
  console.log(`Client: ${company} (${clientId}); the ${longMonth(month)} briefs; run ${runId}; ${has('plan') ? 'PLAN (no model call, nothing written)' : write ? 'WRITE' : 'dry run (nothing is written to any database; the model calls are paid for)'}`)

  // The checks --write would make, and --plan stops after.
  const applied = await monthlyBriefsApplied(db)
  const written = applied ? await monthBriefsWritten(db, clientId, month) : false
  const window = await runWindowOf(db, clientId, runId)
  const closes = window && closesMonth(window) ? endedMonthOf(window) : null
  console.log(`Ledger (monthly_briefs): ${applied ? 'applied' : 'NOT in this database'}. ${longMonth(month)}: ${written ? 'written already' : 'not written'}. Run ${runId} ${closes ? `closes ${longMonth(closes)}` : 'closes no month'}${closes && closes !== month ? ' (not this one)' : ''}.`)
  if (write && !applied) throw new Error('monthly_briefs is not in this database: apply supabase/migrations/20261107090000_monthly_briefs.sql first')
  if (write && written && !has('replace')) {
    console.error(`${longMonth(month)}'s briefs are written already. Pass --replace to write them again.`)
    process.exit(4)
  }
  if (has('plan')) {
    console.log(`\nWould write: the ${longMonth(month)} Sales, Marketing, Content and Leadership briefs, under run ${runId}, for about $2 to $2.50 of model calls.`)
    return
  }

  // The research reads the newest themed run (the themes table holds no other).
  const now = new Date()
  const researchRun = (await themedRunAsOf(db, clientId, now.toISOString())) ?? runId
  if (researchRun !== runId) console.warn(`The newest themed run is ${researchRun}, not ${runId}: the research reads its themes; the briefs are stored under ${runId}.`)
  const started = Date.now()
  const inputs = await loadBriefSetInputs(db, { clientId, month, now, runId: researchRun })
  const questions = questionsFor(inputs)
  console.log(`Inputs: ${inputs.company} · market ${inputs.market?.videos ?? '?'} videos · rivals ${inputs.rivals.join(', ') || 'none'} · ${questions.length} questions`)
  const research = await researchBriefSet(db, inputs, questions, { now, budgetUsd: BRIEF_RESEARCH_BUDGET_USD, parallel: 3, persist: write })
  if (!research.window) throw new Error('the research has no window')
  console.log(`Research: ${research.answers.filter((a) => a.grounded.length > 0).length} of ${questions.length} questions answered · $${research.costUsd.toFixed(3)} · ${Math.round((Date.now() - started) / 1000)} s`)
  const grounded = await groundBriefResearch(db, inputs, research.answers, questions, research.window)
  const set = await writeBriefSet(db, inputs, questions, grounded, { log: write, researchCostUsd: research.costUsd })
  console.log(`Ideas: ${set.allocation.ideas.map((i) => `${i.id} → ${i.home} (${i.videos} videos): ${i.headline}`).join(' | ') || 'none'}`)
  if (set.allocation.held.length) console.log(`Held ideas: ${set.allocation.held.map((h) => `${h.headline} [${h.reason}]`).join(' | ')}`)
  console.log(`Built in ${Math.round((Date.now() - started) / 1000)} s, $${set.costUsd.toFixed(3)} in all.`)

  const briefs: MonthlyBriefData[] = BRIEF_ROLES.map((r) => set.briefs[r].data)
  const textOf = (ref: string) => set.quotes.textOf(ref)
  const outDir = flag('out')
  if (outDir) mkdirSync(resolve(process.cwd(), outDir), { recursive: true })
  for (const d of briefs) {
    const md = briefMarkdown(d, textOf, inputs.noun)
    console.log(`\n${'='.repeat(80)}\n${BRIEF_NAME[d.role]}: ${briefPrints(d) ? `${d.findings.length} finding(s), ${d.sections.length} section(s), ${collectQuoteRefs(d).length} quote(s)` : 'THIN (nothing stood; not shown)'}; ${d.held.length} held\n${'='.repeat(80)}\n${md}`)
    if (outDir) {
      writeFileSync(join(resolve(process.cwd(), outDir), `${d.role}_brief.md`), md)
      writeFileSync(join(resolve(process.cwd(), outDir), `${d.role}_brief.json`), `${JSON.stringify(d, null, 2)}\n`)
    }
  }

  if (write) {
    const shared = set.costUsd / BRIEF_ROLES.length
    const rows = await storeBriefSet(db, { clientId, runId, month, asOf: now.toISOString(), briefs, costUsd: Object.fromEntries(BRIEF_ROLES.map((r) => [r, shared])) })
    console.log(`\nStored the ${longMonth(month)} briefs under run ${runId}: ${rows.map((r) => `${r.role} ${r.status}${r.snapshot_id ? ` (${r.snapshot_id})` : ''}`).join(', ')}.`)
    console.log('They are in the Studio now, under Monthly briefs.')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
