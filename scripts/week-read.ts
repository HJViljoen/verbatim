// The week's written read for one run (plan "writing back", T4): the pool
// (T1), where the market stands (T2), the writer (T3), scrub, self-check and
// compose, printed as a readable rendering plus the stored JSON.
//
//   node --env-file=.env.local --import tsx scripts/week-read.ts \
//     --client <uuid> --run <uuid> [--out <file.md>] [--write [--replace]]
//
// DRY BY DEFAULT. Nothing is written to any database: the writer's and the
// self-check's `ai_call_log` rows are NOT written (the call is still paid for,
// about $0.20 on gpt-5.4), and no `week_reads` row. The rendering resolves each
// quote's words for reading; the stored read keeps refs only.
//
// --write stores the run's row (status ready, or thin), logging both calls to
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

import { longMonth } from '../lib/format'
import { fetchQuoteResolutionsByRefs, type QuoteResolution } from '../lib/quotes'
import { coverPlainText } from '../lib/reports/cover'
import type { WeekCheck } from '../lib/written/check'
import { buildWeekRead, finishWeekRead, loadWeekReadInputs, rowOf, type BuiltWeekRead, type WeekReadInputs } from '../lib/written/step'
import { loadWeekReadRow, saveWeekRead, weekReadsApplied } from '../lib/written/store'
import { DEPARTMENTS, type QuoteRef, type WeekReadData } from '../lib/written/types'
import { buildWeekReadPrompts, writerFigures } from '../lib/written/write'

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

/** A stored `[[key]]` body as a reader sees it. */
const plain = (body: string, data: WeekReadData): string => (body ? coverPlainText(body, data.figures) : '')

function quoteLines(q: QuoteRef | null, words: Map<string, QuoteResolution>): string[] {
  if (!q) return ['_(no quote)_']
  const w = words.get(q.ref)
  if (!w) return [`_(quote ${q.ref} did not resolve)_`]
  const lines = [`> "${w.text.replace(/\s+/g, ' ').trim()}"`]
  if (w.english && w.english !== w.text) lines.push(`> _(English: ${w.english.replace(/\s+/g, ' ').trim()})_`)
  lines.push(`> <sub>${q.ref} · ${q.platform ?? '?'} · ${q.date ?? '?'} · ${q.thread ?? '?'}</sub>`)
  return lines
}

function render(company: string, runId: string, built: BuiltWeekRead, words: Map<string, QuoteResolution>, mode: string): string {
  const d = built.data
  const month = longMonth(d.month)
  const cand = new Map(built.pool.candidates.map((c) => [c.themeId, c]))
  const out: string[] = [
    `# ${company}: the week's read (${mode})`,
    '',
    `Run \`${runId}\` · window ${d.window.from} to ${d.window.to} · ${month} · status **${built.status}** · model ${d.model || 'none (no call)'} · ${d.promptVersion} · cost $${d.costUsd.toFixed(4)}${built.check ? ` (self-check $${built.check.costUsd.toFixed(4)})` : ''}`,
    '',
    '## In short',
    '',
    d.inShort || '_(none)_',
    '',
    '## This week in your market',
    '',
  ]
  d.findings.forEach((f, i) => {
    out.push(`### ${i + 1}. ${f.headline}${f.sure === 'strong' ? '  · Strong evidence' : ''}`, '')
    out.push(f.saw.split('\n\n').join('\n\n'), '')
    out.push(`**What it means.** ${f.means}`, '')
    for (const dep of DEPARTMENTS) if (f.for[dep]) out.push(`- **For ${dep}:** ${f.for[dep]}`)
    out.push('')
    out.push(...quoteLines(f.quote, words), '')
    out.push(`_${plain(f.evidence, d)}_`)
    if (f.context) out.push(`_${plain(f.context, d)}_`)
    out.push('')
    out.push(`<sub>Based on: ${f.basedOn.map((id) => { const c = cand.get(id); return c ? `${c.id} "${c.label}" (gated ${c.gatedVideos}, week ${c.weekVideos}, mostly ${c.dominantKind ?? '?'})` : id }).join('; ')} · sure: ${f.sure} · subject: ${f.subjectId ?? 'none'} · new: ${f.isNew}</sub>`, '')
  })
  if (d.findings.length === 0) out.push('_(no findings print)_', '')

  out.push('## Where your market stands', '')
  const shown = d.standing.filter((s) => s.line || s.sentence || s.quote)
  const nameOnly = d.standing.filter((s) => !s.line && !s.sentence && !s.quote)
  for (const s of shown) {
    out.push(`**${s.name}**${s.line ? `: ${plain(s.line, d)}` : ''} <sub>[${s.calibration}, rung ${s.rung}]</sub>`)
    if (s.sentence) out.push('', s.sentence)
    out.push('', ...quoteLines(s.quote, words), '')
  }
  if (nameOnly.length) out.push(`Also following: ${nameOnly.map((s) => s.name).join(', ')}. <sub>[${nameOnly.map((s) => s.calibration).join(', ')}]</sub>`, '')

  out.push('---', '', '## Workings (not client copy)', '')
  out.push(`### Held (${d.held.length})`, '')
  for (const h of d.held) out.push(`- ${h.headline || '_(no headline)_'}: ${h.reason}`)
  if (d.held.length === 0) out.push('- none')
  out.push('')
  if (built.scrub) out.push(`### Scrub`, '', `- sentences dropped: ${built.scrub.dropped} (digits ${built.scrub.droppedDigits}, direction ${built.scrub.droppedDirection}, how-it-was-made ${built.scrub.droppedBanned})`, '')
  if (built.check) {
    out.push(`### Self-check${built.check.ran ? '' : ' (DID NOT RUN: findings kept unchecked)'}`, '')
    for (const v of built.check.verdicts) out.push(`- ${v.verdict}: ${v.headline}${built.check.contradicted.get(v.headline) ? ` (they say: ${built.check.contradicted.get(v.headline)})` : ''}`)
    out.push('')
  }
  if (built.raw) {
    out.push('### The writer, before scrub', '')
    out.push('```json', JSON.stringify(built.raw, null, 2), '```', '')
  }
  out.push(`### The pool (${built.pool.candidates.length} candidates${built.pool.thin ? ', THIN' : ''}; the week ${built.pool.weekVideos} category videos, the month ${built.pool.monthVideos})`, '')
  for (const c of built.pool.candidates) {
    out.push(`**${c.id} "${c.label}"** · gated ${c.gatedVideos} · week ${c.weekVideos} · month ${c.monthK} of ${c.monthN} · kinds ${c.kinds.join(', ') || 'none'} (mostly ${c.dominantKind ?? 'none'}) · lenses ${c.lenses.join(', ')} · subject ${c.subjectId ?? 'none'} · ${c.isNew ? 'first heard this month' : 'heard before'}`)
    if (c.description) out.push('', `_${c.description}_`)
    out.push('', ...c.notes.map((n) => `- ${n}`), '')
    for (const q of c.quoteRefs) out.push(...quoteLines(q, words))
    out.push('')
  }
  out.push('### The subjects', '')
  for (const f of built.standing) {
    out.push(`- **${f.name}** [${f.calibration}, rung ${f.rung}, rank ${f.rank || '-'}] level ${f.level ? `${f.level.k} of ${f.level.n}` : 'none'} · contents: ${f.contents.join(' · ') || 'none'} · ${f.notes.length} note(s)`)
    for (const n of f.notes) out.push(`  - ${n}`)
  }
  return out.join('\n')
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
  type SavedRun = { data: WeekReadData; workings: { pool: WeekReadInputs['pool']; standing: WeekReadInputs['standing']; raw: BuiltWeekRead['raw']; check: (Omit<WeekCheck, 'contradicted'> & { contradicted: [string, string | null][] }) | null } }
  const prior = again ? (JSON.parse(readFileSync(resolve(process.cwd(), again), 'utf8')) as SavedRun) : null
  const inputs: WeekReadInputs = prior
    ? { company, pool: prior.workings.pool, standing: prior.workings.standing, previous: null }
    : saved
      ? (JSON.parse(readFileSync(resolve(process.cwd(), saved), 'utf8')) as WeekReadInputs)
      : await loadWeekReadInputs(db, { clientId, runId })
  if (saved && (inputs.pool.clientId !== clientId || inputs.pool.runId !== runId)) throw new Error(`${saved} holds another client or run`)
  if (flag('save-inputs')) {
    writeFileSync(resolve(process.cwd(), flag('save-inputs')), `${JSON.stringify(inputs, null, 2)}\n`)
    console.log(`Saved the inputs to ${flag('save-inputs')}`)
  }
  if (has('prompt-only')) {
    const { pool } = inputs
    console.log(`\nPool: ${pool.candidates.length} candidate(s)${pool.thin ? ' (THIN: no call would be made)' : ''}; standing: ${inputs.standing.length} subject(s); last week: ${inputs.previous ? inputs.previous.headlines.length : 'none'}`)
    for (const c of pool.candidates) console.log(`  ${c.id} "${c.label}" gated ${c.gatedVideos} · week ${c.weekVideos} · month ${c.monthK} · mostly ${c.dominantKind ?? '-'} · subject ${c.subjectId ?? 'none'} · ${c.quoteRefs.length} quote(s)`)
    for (const f of inputs.standing) console.log(`  ${f.name} [${f.calibration}, ${f.rung}] level ${f.level ? `${f.level.k} of ${f.level.n}` : 'none'} · ${f.contents.length} theme(s) · ${f.notes.length} note(s) · quote ${f.quoteRef ? 'yes' : 'no'}`)
    const { system, user } = buildWeekReadPrompts({ company: inputs.company, pool, standing: inputs.standing, previous: inputs.previous, figures: writerFigures(pool) })
    console.log(`\n=== SYSTEM (${system.length} chars) ===\n${system}\n\n=== USER (${user.length} chars) ===\n${user}`)
    return
  }

  const started = Date.now()
  let built: BuiltWeekRead
  if (prior) {
    if (!prior.workings.raw || !prior.workings.check) throw new Error(`${again} holds no writer output to compose again (a thin week makes none)`)
    built = finishWeekRead({
      pool: inputs.pool,
      standing: inputs.standing,
      raw: prior.workings.raw,
      check: { ...prior.workings.check, contradicted: new Map(prior.workings.check.contradicted) },
      costUsd: prior.data.costUsd,
    })
  } else {
    built = await buildWeekRead(db, { clientId, runId, log: write, inputs })
  }
  console.log(`Built in ${Math.round((Date.now() - started) / 1000)} s: ${built.status}, ${built.data.findings.length} finding(s), ${built.data.held.length} held, $${built.data.costUsd.toFixed(4)}.`)

  const refs = [
    ...built.data.findings.map((f) => f.quote?.ref),
    ...built.data.standing.map((s) => s.quote?.ref),
    ...built.pool.candidates.flatMap((c) => c.quoteRefs.map((q) => q.ref)),
  ].filter((r): r is string => Boolean(r))
  const words = refs.length ? await fetchQuoteResolutionsByRefs(db, [...new Set(refs)], { onReadError: 'throw' }) : new Map<string, QuoteResolution>()

  const text = render(company, runId, built, words, write ? 'WRITTEN' : again ? 'DRY RUN, not stored; composed again from the saved call' : 'DRY RUN, not stored')
  console.log(`\n${text}\n`)

  const json = JSON.stringify({ status: built.status, data: built.data, workings: { pool: built.pool, standing: built.standing, raw: built.raw, scrub: built.scrub, check: built.check && { ...built.check, contradicted: [...built.check.contradicted] } } }, null, 2)
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
