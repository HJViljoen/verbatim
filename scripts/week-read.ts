// The week's written read for one run (plan "writing back", T4; v3 30 Sep):
// the pool (T1), where the market stands (T2), the writer (T3: the report and
// the findings), scrub, self-check, the quotes' fit and compose, printed as a
// readable rendering (the report top to bottom, then the findings, then the
// workings) plus the stored JSON.
//
//   node --env-file=.env.local --import tsx scripts/week-read.ts \
//     --client <uuid> --run <uuid> [--out <file.md>] [--write [--replace]]
//
// DRY BY DEFAULT. Nothing is written to any database: the writer's, the
// self-check's and the quote fit's `ai_call_log` rows are NOT written (the
// calls are still paid for, about $0.10 to $0.20 on gpt-5.4, the fit's
// embeddings a fraction of a cent), and no `week_reads` row. The rendering
// resolves each quote's words for reading; the stored read keeps refs only.
//
// --write stores the run's row (status ready, or thin), logging every call to
// `ai_call_log` as the step does. It is a paste for Heinrich against
// production, and the fallback when the pipeline step failed or was not
// deployed before a Sunday. It refuses to replace a READY row unless
// --replace is given.
//
// --out <file.md> writes the rendering there and the JSON beside it
// (<file>.json).
//
// READING A PROMPT BEFORE PAYING FOR IT, without reading production twice:
//   --prompt-only --save-inputs <file.json>   reads the pool, the standing and
//       last week's headlines, prints the writer's two messages, saves what it
//       read, and stops: no model call, nothing written;
//   --inputs <file.json>   builds from the saved inputs instead of reading
//       them again (the quotes' words and the self-check still read);
//   --recompose <file.json>   takes a dry run's own JSON (--out's) and composes
//       its saved writer output and self-check again under the code as it is
//       now: no model call, and only the quotes' words are read.
//
// .env.local IS PRODUCTION. One run is the pool's and the standing's reads
// (about a hundred and fifty small statements) plus the quotes' words. It
// probes first (a timed read of the one client row) and will not go on if that
// takes over 3 s or fails: wait fifteen minutes.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { fetchQuoteResolutionsByRefs, type QuoteResolution } from '../lib/quotes'
import type { WeekCheck } from '../lib/written/check'
import type { QuoteFit } from '../lib/written/fit'
import { buildWeekRead, finishWeekRead, loadWeekReadInputs, rowOf, type BuiltWeekRead, type WeekReadInputs } from '../lib/written/step'
import { loadWeekReadRow, saveWeekRead, weekReadsApplied } from '../lib/written/store'
import { loadCompanyContext } from '../lib/written/company'
import type { WeekReadDataV2 } from '../lib/written/types'
import { buildWeekReadPrompts, writerFigures } from '../lib/written/write'
import { renderWeekRead } from './written-render'

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

async function main() {
  const clientId = flag('client')
  const runId = flag('run')
  if (!clientId || !runId) {
    console.error('Usage: scripts/week-read.ts --client <uuid> --run <uuid> [--out <file.md>] [--write [--replace]] [--prompt-only] [--save-inputs <file>] [--inputs <file>] [--recompose <dry-run.json>]')
    process.exit(2)
  }
  const write = has('write')
  const db = admin()
  const company = await probe(db, clientId)
  console.log(`Client: ${company} (${clientId}); run ${runId}; ${write ? 'WRITE' : 'dry run (nothing is written to any database)'}`)

  if (write) {
    if (!(await weekReadsApplied(db))) throw new Error('week_reads is not in this database: apply supabase/migrations/20261104090000_week_reads.sql first')
    const existing = await loadWeekReadRow(db, runId)
    if (existing?.status === 'ready' && !has('replace')) {
      console.error(`Run ${runId} already has a ready read (${existing.created_at}). Pass --replace to write over it.`)
      process.exit(4)
    }
  }

  const again = flag('recompose')
  if (again && write) throw new Error('--recompose never writes: store a read built by a real call')
  const saved = again ? '' : flag('inputs')
  type SavedFit = Omit<QuoteFit, 'scores' | 'story'> & { scores: [number, [string, number][]][]; story?: [number, [string, number][]][] }
  type SavedRun = { data: WeekReadDataV2; workings: { pool: WeekReadInputs['pool']; standing: WeekReadInputs['standing']; context?: WeekReadInputs['context']; raw: BuiltWeekRead['raw']; check: (Omit<WeekCheck, 'contradicted'> & { contradicted: [string, string | null][] }) | null; fit?: SavedFit | null } }
  const prior = again ? (JSON.parse(readFileSync(resolve(process.cwd(), again), 'utf8')) as SavedRun) : null
  const inputs: WeekReadInputs = prior
    ? { company, pool: prior.workings.pool, standing: prior.workings.standing, previous: null, context: prior.workings.context ?? null }
    : saved
      ? (JSON.parse(readFileSync(resolve(process.cwd(), saved), 'utf8')) as WeekReadInputs)
      : await loadWeekReadInputs(db, { clientId, runId })
  if (saved && (inputs.pool.clientId !== clientId || inputs.pool.runId !== runId)) throw new Error(`${saved} holds another client or run`)
  // Inputs saved before the company context existed: read it now (a few light
  // reads) and extend the saved file, so the next build reads nothing again.
  if (saved && inputs.context === undefined && !inputs.pool.thin) {
    inputs.context = await loadCompanyContext(db, { clientId, window: inputs.pool.window })
    writeFileSync(resolve(process.cwd(), saved), `${JSON.stringify(inputs, null, 2)}\n`)
    console.log(`Read the company context and added it to ${saved}`)
  }
  if (flag('save-inputs')) {
    writeFileSync(resolve(process.cwd(), flag('save-inputs')), `${JSON.stringify(inputs, null, 2)}\n`)
    console.log(`Saved the inputs to ${flag('save-inputs')}`)
  }
  if (has('prompt-only')) {
    const { pool } = inputs
    console.log(`\nPool: ${pool.candidates.length} candidate(s)${pool.thin ? ' (THIN: no call would be made)' : ''}; standing: ${inputs.standing.length} subject(s); last week: ${inputs.previous ? inputs.previous.headlines.length : 'none'}`)
    for (const c of pool.candidates) console.log(`  ${c.id} "${c.label}" lenient ${c.lenientVideos} (month ${c.monthVideoIds.length}) · strict ${c.gatedVideos} · week ${c.weekVideos} · month ${c.monthK} · mostly ${c.dominantKind ?? '-'} · subject ${c.subjectId ?? 'none'} · ${c.quoteRefs.length} quote(s)`)
    for (const f of inputs.standing) console.log(`  ${f.name} [${f.calibration}, ${f.rung}] level ${f.level ? `${f.level.k} of ${f.level.n}` : 'none'} · ${f.contents.length} theme(s) · ${f.notes.length} note(s) · quote ${f.quoteRef ? 'yes' : 'no'}`)
    const { system, user } = buildWeekReadPrompts({ company: inputs.company, pool, standing: inputs.standing, previous: inputs.previous, figures: writerFigures(pool), context: inputs.context })
    console.log(`\n=== SYSTEM (${system.length} chars) ===\n${system}\n\n=== USER (${user.length} chars) ===\n${user}`)
    return
  }

  const started = Date.now()
  let built: BuiltWeekRead
  if (prior) {
    if (!prior.workings.raw || !prior.workings.check) throw new Error(`${again} holds no writer output to compose again (a thin week makes none)`)
    const savedFit = prior.workings.fit
    built = finishWeekRead({
      company,
      pool: inputs.pool,
      standing: inputs.standing,
      raw: prior.workings.raw,
      check: { ...prior.workings.check, contradicted: new Map(prior.workings.check.contradicted) },
      fit: savedFit
        ? { ...savedFit, scores: new Map(savedFit.scores.map(([i, x]) => [i, new Map(x)])), story: new Map((savedFit.story ?? []).map(([i, x]) => [i, new Map(x)])) }
        : null,
      costUsd: prior.data.costUsd,
    })
  } else {
    built = await buildWeekRead(db, { clientId, runId, log: write, inputs })
  }
  console.log(`Built in ${Math.round((Date.now() - started) / 1000)} s: ${built.status}, ${built.data.findings.length} finding(s), ${built.data.held.length} held, $${built.data.costUsd.toFixed(4)}.`)

  // Every quote the read prints, and every option it chose among (for the
  // workings' quote choice).
  const refs = [
    ...built.data.findings.map((f) => f.quote?.ref),
    ...built.data.story.map((p) => p.quote?.ref),
    ...built.data.standing.map((s) => s.quote?.ref),
    ...built.pool.candidates.flatMap((c) => c.quoteOptions.map((o) => o.quote.ref)),
  ].filter((r): r is string => Boolean(r))
  const words = refs.length ? await fetchQuoteResolutionsByRefs(db, [...new Set(refs)], { onReadError: 'throw' }) : new Map<string, QuoteResolution>()

  const text = renderWeekRead(company, runId, built, words, write ? 'WRITTEN' : again ? 'DRY RUN, not stored; composed again from the saved call' : 'DRY RUN, not stored', inputs.context)
  console.log(`\n${text}\n`)

  const fit = built.fit && { ...built.fit, scores: [...built.fit.scores].map(([i, x]) => [i, [...x]]), story: [...(built.fit.story ?? new Map())].map(([i, x]) => [i, [...x]]) }
  const json = JSON.stringify({ status: built.status, data: built.data, workings: { pool: built.pool, standing: built.standing, context: inputs.context ?? null, raw: built.raw, scrub: built.scrub, check: built.check && { ...built.check, contradicted: [...built.check.contradicted] }, fit } }, null, 2)
  const outPath = flag('out')
  if (outPath) {
    const md = resolve(process.cwd(), outPath)
    const js = md.replace(/\.md$/, '') + '.json'
    writeFileSync(md, `${text}\n`)
    writeFileSync(js, `${json}\n`)
    console.log(`Wrote the rendering to ${md} and the JSON to ${js}`)
  } else {
    console.log(json)
  }

  if (write) {
    await saveWeekRead(db, rowOf(clientId, runId, built))
    console.log(`Stored the run's week read (${built.status}).`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
