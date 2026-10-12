// A month's four department briefs for one workspace, by hand: the pipeline's
// `briefs:*` steps (lib/reports/briefs/step.ts) in one process. The fallback
// their alert names, and the backfill for a month that closed before the
// steps existed (September 2026: scripts/backfill-briefs-september.sh).
//
//   node --env-file=.env.local --import tsx scripts/monthly-briefs.ts \
//     --client <uuid> --month YYYY-MM --run <uuid> [--out <dir>] [--designed <dir>] [--plan] [--write [--replace] [--from <dir>]]
//
// --run is the run that closed the month: the briefs are stored under it, as
// the pipeline stores them under its own run.
//
// DRY BY DEFAULT. Nothing is written to any database: not the briefs, not the
// ledger, not one `ai_call_log` row. The model calls are still made and paid
// for (about $2 to $2.50 a workspace: the research most of it), and the four
// briefs are printed (and written to --out as Markdown, quotes resolved, and
// JSON, quotes as refs). A dry build is also DRAWN, as the product draws it
// (the canvas's pages, scripts/brief-render-local.ts), into --designed
// (default ~/Documents/Heinrich/Verbatim/Briefs-YYYY-MM-designed/<tenant>/):
// for each brief `<role>.json` (`{ data, texts }`: the brief with its quotes
// as refs, and the words each ref resolves to, kept local), `<role>.pdf` and
// `<role>-NN.png` a page, so the month can be read designed before it is
// stored; and `set.json`, what --from needs to store exactly these briefs
// (lib/reports/briefs/saved.ts: the client, the run, when it was read, the
// set's spend and each role's ledger fields, the evidence ids, the pages
// drawn, the In short check's record, the month's ideas). A thin role is
// saved too, never drawn. A page that clips is named; the build still
// finishes, and says whether --from will take the folder. It never draws
// into a folder that holds a build already: pass --designed <a new folder>.
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
// supabase/migrations/20261107093000_monthly_briefs.sql first). A --write
// calls the models again, so its words are not a dry build's.
//
// --write --from <dir> stores a dry build's saved briefs AS THEY ARE, with no
// model call: the same snapshots and ledger rows --write stores, under the
// same one-per-client-month-role rule and --replace. Before it stores
// anything it checks every saved brief: it parses against this code's
// stored-brief shape, it is the client's and the month's named (and the
// run's), its status, evidence ids and pages are what the dry build saved,
// its In short still holds to what its pages print, and it draws under the
// current renderer with no clipping. Any check that fails, and nothing is
// stored. The words (`texts`) are never stored: a brief stores refs.
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

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { longMonth } from '../lib/format'
import { renderBriefLocal } from './brief-render-local'
import { rowWindow, type WindowColumns } from '../lib/pipeline/run-bookkeeping'
import { monthStartOf } from '../lib/reading/month-key'
import { collectQuoteRefs } from '../lib/renderables/quotes-freeze'
import {
  groundBriefResearch, loadBriefSetInputs, questionsFor, researchBriefSet, writeBriefSet, type BriefSet,
} from '../lib/reports/briefs/build'
import { briefMarkdown } from '../lib/reports/briefs/markdown'
import { ROLE_SECTIONS, printsSection, sectionTitle } from '../lib/reports/briefs/sections'
import { BRIEF_AFTER_RESEARCH_USD, BRIEF_SET_BUDGET_USD } from '../lib/reports/briefs/step'
import { SAVED_SET_FILE, checkSavedSet, savedSetOf, type SavedFile } from '../lib/reports/briefs/saved'
import { briefPrints, monthBriefsWritten, monthlyBriefsApplied, storeBriefSet } from '../lib/reports/briefs/store'
import { BRIEF_NAME, BRIEF_ROLES, type BriefRole, type MonthlyBriefData } from '../lib/reports/briefs/types'
import { closesMonth, endedMonthOf, themedRunAsOf } from '../lib/written/longrun'

const args = process.argv.slice(2)
const flag = (name: string, fallback = ''): string => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}
const has = (name: string): boolean => args.includes(`--${name}`)
for (const a of args) {
  if (a.startsWith('--') && !['client', 'month', 'run', 'out', 'designed', 'plan', 'write', 'replace', 'from'].includes(a.slice(2))) {
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
  const fromDir = flag('from')
  if (!/^[0-9a-f-]{36}$/.test(clientId) || !/^\d{4}-\d{2}$/.test(monthArg) || !/^[0-9a-f-]{36}$/.test(runId) || (has('from') && !fromDir)) {
    console.error('Usage: scripts/monthly-briefs.ts --client <uuid> --month YYYY-MM --run <uuid> [--out <dir>] [--designed <dir>] [--plan] [--write [--replace] [--from <dir>]]')
    process.exit(2)
  }
  if (fromDir && (!has('write') || has('plan'))) {
    console.error('--from stores a saved dry build: pass --write --from <dir> (and not --plan).')
    process.exit(2)
  }
  const month = monthStartOf(`${monthArg}-01T00:00:00.000Z`)
  const write = has('write')
  const db = admin()
  const company = (await probe(db, clientId)).trim()
  console.log(`Client: ${company} (${clientId}); the ${longMonth(month)} briefs; run ${runId}; ${has('plan') ? 'PLAN (no model call, nothing written)' : fromDir ? `WRITE FROM ${resolve(process.cwd(), fromDir)} (no model call)` : write ? 'WRITE' : 'dry run (nothing is written to any database; the model calls are paid for)'}`)

  // The checks --write would make, and --plan stops after.
  const applied = await monthlyBriefsApplied(db)
  const written = applied ? await monthBriefsWritten(db, clientId, month) : false
  const window = await runWindowOf(db, clientId, runId)
  const closes = window && closesMonth(window) ? endedMonthOf(window) : null
  console.log(`Ledger (monthly_briefs): ${applied ? 'applied' : 'NOT in this database'}. ${longMonth(month)}: ${written ? 'written already' : 'not written'}. Run ${runId} ${closes ? `closes ${longMonth(closes)}` : 'closes no month'}${closes && closes !== month ? ' (not this one)' : ''}.`)
  if (write && !applied) throw new Error('monthly_briefs is not in this database: apply supabase/migrations/20261107093000_monthly_briefs.sql first')
  if (write && written && !has('replace')) {
    console.error(`${longMonth(month)}'s briefs are written already. Pass --replace to write them again.`)
    process.exit(4)
  }
  if (has('plan')) {
    if (!applied) console.log('\n--write refuses until supabase/migrations/20261107093000_monthly_briefs.sql is applied (app-setup.sh).')
    else if (written) console.log(`\n--write refuses: ${longMonth(month)} is written (--replace writes it again).`)
    console.log(`${applied && !written ? '\n' : ''}--write would write the ${longMonth(month)} Sales, Marketing, Content and Leadership briefs, under run ${runId}, for about $2 to $2.50 of model calls.`)
    return
  }
  if (fromDir) {
    await storeFrom(db, { clientId, month, runId, company, dir: resolve(process.cwd(), fromDir) })
    return
  }

  // Where a dry build is drawn: never over a build already there (the one
  // Heinrich reviewed is what --from stores).
  const designed = flag('designed') || (!write ? join(homedir(), 'Documents', 'Heinrich', 'Verbatim', `Briefs-${month.slice(0, 7)}-designed`, slugOf(company)) : '')
  const designedDir = designed ? resolve(process.cwd(), designed) : ''
  if (designedDir && holdsBuild(designedDir)) {
    console.error(`${designedDir} holds a build already (${SAVED_SET_FILE} or a brief's JSON). A dry build never draws over one: pass --designed <a new folder>.`)
    process.exit(4)
  }

  // The research reads the newest themed run (the themes table holds no other).
  const now = new Date()
  const researchRun = (await themedRunAsOf(db, clientId, now.toISOString())) ?? runId
  if (researchRun !== runId) console.warn(`The newest themed run is ${researchRun}, not ${runId}: the research reads its themes; the briefs are stored under ${runId}.`)
  const started = Date.now()
  const inputs = await loadBriefSetInputs(db, { clientId, month, now, runId: researchRun })
  const questions = questionsFor(inputs)
  console.log(`Inputs: ${inputs.company} · market ${inputs.market?.videos ?? '?'} videos · rivals ${inputs.rivals.join(', ') || 'none'} · ${questions.length} questions`)
  const research = await researchBriefSet(db, inputs, questions, { now, budgetUsd: BRIEF_SET_BUDGET_USD - BRIEF_AFTER_RESEARCH_USD, parallel: 3, persist: write })
  if (!research.window) throw new Error('the research has no window')
  console.log(`Research: ${research.answers.filter((a) => a.grounded.length > 0).length} of ${questions.length} questions answered · $${research.costUsd.toFixed(3)} · ${Math.round((Date.now() - started) / 1000)} s`)
  const grounded = await groundBriefResearch(db, inputs, research.answers, questions, research.window)
  const set = await writeBriefSet(db, inputs, questions, grounded, { log: write, researchCostUsd: research.costUsd })
  console.log(`Ideas: ${set.allocation.ideas.map((i) => `${i.id} → ${i.home} (${i.videos} videos): ${i.headline}`).join(' | ') || 'none'}`)
  if (set.allocation.held.length) console.log(`Held ideas: ${set.allocation.held.map((h) => `${h.headline} [${h.reason}]`).join(' | ')}`)
  console.log(`In short check: ${set.inShort.items.length} sentences read against the printed pages, ${set.inShort.dropped.length} dropped, $${set.inShort.costUsd.toFixed(4)}.`)
  for (const x of set.inShort.dropped) console.log(`  dropped from the ${BRIEF_NAME[x.role]}'s In short: "${x.sentence}"${x.missing ? ` (no page says: ${x.missing})` : ''}`)
  for (const [s, says] of set.check.summaries.contradicted) console.log(`  dropped from an In short, the conversation contradicts it: "${s}"${says ? ` (${says})` : ''}`)
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

  // Each brief's share of what the set cost (the ledger's `cost_usd`).
  const costByRole = Object.fromEntries(BRIEF_ROLES.map((r) => [r, set.costUsd / BRIEF_ROLES.length])) as Record<BriefRole, number>

  // The designed briefs, drawn as the product draws them, and saved for
  // --from: always on a dry build, and on --write where --designed is given.
  if (designedDir) await drawDesigned(set, { clientId, runId, month, company, asOf: now.toISOString(), costByRole }, designedDir)

  if (write) {
    const rows = await storeBriefSet(db, { clientId, runId, month, asOf: now.toISOString(), briefs, costUsd: costByRole })
    console.log(`\nStored the ${longMonth(month)} briefs under run ${runId}: ${rows.map((r) => `${r.role} ${r.status}${r.snapshot_id ? ` (${r.snapshot_id})` : ''}`).join(', ')}.`)
    console.log('They are in the Studio now, under Monthly briefs.')
  }
}

/** "Össur" → "ossur": a tenant's folder. */
function slugOf(company: string): string {
  return company.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tenant'
}

/** Does `dir` hold a build already: its set file, or a brief's JSON? */
function holdsBuild(dir: string): boolean {
  return existsSync(join(dir, SAVED_SET_FILE)) || BRIEF_ROLES.some((r) => existsSync(join(dir, `${r}.json`)))
}

/** The words of each ref a brief carries, from the set's own (`BriefSet.texts`:
 *  the pool's, and the rest read once, as the deck draws them). */
function textsFor(set: BriefSet, d: MonthlyBriefData): SavedFile['texts'] {
  const out: SavedFile['texts'] = {}
  for (const ref of collectQuoteRefs(d)) {
    const w = set.texts.get(ref)
    if (w?.text) out[ref] = { text: w.text, english: w.english ?? null, lang: w.lang ?? null }
  }
  return out
}

/** Read a saved build's files as they are (parsed as JSON, nothing more), and
 *  say what cannot be read. */
function readSaved(dir: string): { manifest: unknown; files: Partial<Record<BriefRole, unknown>>; problems: string[] } {
  const problems: string[] = []
  const json = (file: string): unknown => {
    try { return JSON.parse(readFileSync(join(dir, file), 'utf8')) } catch (e) { problems.push(`${file}: ${e instanceof Error ? e.message : String(e)}`); return undefined }
  }
  if (!existsSync(join(dir, SAVED_SET_FILE))) {
    problems.push(`${dir} has no ${SAVED_SET_FILE}: it was saved by a dry build before --from existed. Its briefs' JSON has the brief and its words, and lacks what --from stores by: the client and the run it is stored under, when it was read (the reading stamp), the set's spend and each role's share (the ledger's cost_usd; a brief's own costUsd is its writer's only), which roles were thin (a thin role was not saved at all), the evidence ids, the pages drawn, the In short check's record, and the month's ideas. Store from the next dry build's folder.`)
    return { manifest: undefined, files: {}, problems }
  }
  const manifest = json(SAVED_SET_FILE)
  const roles = (manifest as { roles?: Partial<Record<BriefRole, { file?: unknown }>> } | undefined)?.roles ?? {}
  const files: Partial<Record<BriefRole, unknown>> = {}
  for (const r of BRIEF_ROLES) {
    const file = typeof roles[r]?.file === 'string' && /^[a-z]+\.json$/.test(roles[r]!.file as string) ? roles[r]!.file as string : `${r}.json`
    if (existsSync(join(dir, file))) files[r] = json(file)
  }
  return { manifest, files, problems }
}

/**
 * --write --from: a saved dry build stored as it is, with no model call, or
 * nothing stored and why. The checks come first (lib/reports/briefs/saved.ts),
 * then each brief that prints is drawn under the current renderer (no PNG)
 * and must not clip; then the same store --write makes.
 */
async function storeFrom(db: SupabaseClient, a: { clientId: string; month: string; runId: string; company: string; dir: string }): Promise<void> {
  const read = readSaved(a.dir)
  const checked = read.problems.length ? { problems: [], set: null } : checkSavedSet(read, a)
  const problems = [...read.problems, ...checked.problems]
  const set = checked.set
  if (set) {
    const scratch = mkdtempSync(join(tmpdir(), 'briefs-from-'))
    for (const d of set.briefs.filter((x) => briefPrints(x))) {
      const r = await renderBriefLocal({ data: d, texts: set.texts[d.role] }, scratch, { name: d.role, built: set.manifest.asOf, png: false })
      if (r.clipped.length) problems.push(`the ${BRIEF_NAME[d.role]} clips under the current renderer: ${r.clipped.map((c) => `page ${c.page} by ${c.px}px`).join(', ')}`)
      else console.log(`Drawn: ${BRIEF_NAME[d.role]}, ${r.pages} pages, no clipping.`)
    }
  }
  if (!set || problems.length) {
    console.error(`\nNothing stored. The saved build in ${a.dir} did not pass:`)
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(5)
  }
  console.log(`The saved build passes every check: ${BRIEF_ROLES.map((r) => `${r} ${set.manifest.roles[r].status}`).join(', ')}; read ${set.manifest.asOf}; it cost $${set.manifest.costUsd.toFixed(3)}.`)
  const rows = await storeBriefSet(db, { clientId: a.clientId, runId: a.runId, month: a.month, asOf: set.manifest.asOf, briefs: set.briefs, costUsd: set.costUsd })
  console.log(`\nStored the ${longMonth(a.month)} briefs as reviewed, under run ${a.runId}: ${rows.map((r) => `${r.role} ${r.status}${r.snapshot_id ? ` (${r.snapshot_id})` : ''}`).join(', ')}.`)
  console.log('They are in the Studio now, under Monthly briefs.')
}

/**
 * The set drawn into `dir` and saved for --from: each role's `<role>.json`
 * (`{ data, texts }`, a thin role's too), `set.json`, and for each brief
 * that prints its PDF and a PNG a page. Then the round trip: the folder is
 * read back and put through the checks --from makes, so the build says
 * whether --from will take it.
 */
async function drawDesigned(set: BriefSet, a: { clientId: string; runId: string; month: string; company: string; asOf: string; costByRole: Record<BriefRole, number> }, dir: string): Promise<void> {
  mkdirSync(dir, { recursive: true })
  const saved = savedSetOf({
    clientId: a.clientId, company: set.inputs.company, month: a.month, runId: a.runId, asOf: a.asOf, costUsd: set.costUsd, costByRole: a.costByRole,
    ideas: set.allocation.ideas,
    briefs: BRIEF_ROLES.map((r) => ({ data: set.briefs[r].data, texts: textsFor(set, set.briefs[r].data), printed: set.briefs[r].printed })),
  })
  for (const r of BRIEF_ROLES) writeFileSync(join(dir, saved.manifest.roles[r].file), `${JSON.stringify(saved.files[r], null, 2)}\n`)
  writeFileSync(join(dir, SAVED_SET_FILE), `${JSON.stringify(saved.manifest, null, 2)}\n`)
  const clipped: string[] = []
  for (const r of BRIEF_ROLES) {
    const d = saved.files[r].data
    if (saved.manifest.roles[r].status !== 'ready') { console.log(`Not drawn: ${BRIEF_NAME[r]} is thin (saved, with what it held).`); continue }
    const out = await renderBriefLocal({ data: d, texts: saved.files[r].texts }, dir, { name: r, built: a.asOf, pdf: true })
    console.log(`Drawn: ${BRIEF_NAME[r]}, ${out.pages} pages${out.clipped.length ? `, CLIPPING on ${out.clipped.map((c) => `page ${c.page} (${c.px}px)`).join(', ')}` : ''}: ${out.pdf}`)
    if (out.clipped.length) clipped.push(`the ${BRIEF_NAME[r]} clips`)
    // The canvas's pages that do not print, and why: left out as thin, or
    // no section stood to draw (the held list says why).
    for (const l of out.left) console.log(`  left out: ${l.title} (${l.why})`)
    const built = new Set(d.sections.map((s) => s.key))
    for (const spec of ROLE_SECTIONS[r]) if (printsSection(spec.key) && !built.has(spec.key)) console.log(`  not built: ${sectionTitle(spec, d.company)} (nothing in it stood; see held)`)
  }
  console.log(`The designed briefs are in ${dir}.`)
  const back = readSaved(dir)
  const check = back.problems.length ? { problems: back.problems } : checkSavedSet(back, { clientId: a.clientId, month: a.month, runId: a.runId, company: a.company })
  const problems = [...check.problems, ...clipped]
  if (problems.length) {
    console.warn('--from would refuse this folder:')
    for (const p of problems) console.warn(`  - ${p}`)
  } else {
    console.log(`--from will take this folder: --client ${a.clientId} --month ${a.month.slice(0, 7)} --run ${a.runId} --write --from ${dir}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
