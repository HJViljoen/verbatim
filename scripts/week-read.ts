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

import { longMonth } from '../lib/format'
import { fetchQuoteResolutionsByRefs, type QuoteResolution } from '../lib/quotes'
import { coverPlainText } from '../lib/reports/cover'
import type { WeekCheck } from '../lib/written/check'
import { rankOptions } from '../lib/written/compose'
import type { QuoteFit } from '../lib/written/fit'
import { buildWeekRead, finishWeekRead, loadWeekReadInputs, rowOf, type BuiltWeekRead, type WeekReadInputs } from '../lib/written/step'
import { loadWeekReadRow, saveWeekRead, weekReadsApplied } from '../lib/written/store'
import { quoteValue } from '../lib/written/substance'
import { firstHeardThisWeek, type PoolCandidate, type QuoteRef, type WeekReadDataV2 } from '../lib/written/types'
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
const plain = (body: string, data: WeekReadDataV2): string => (body ? coverPlainText(body, data.figures) : '')

function quoteLines(q: QuoteRef | null, words: Map<string, QuoteResolution>): string[] {
  if (!q) return ['_(no quote)_']
  const w = words.get(q.ref)
  if (!w) return [`_(quote ${q.ref} did not resolve)_`]
  const lines = [`> "${w.text.replace(/\s+/g, ' ').trim()}"`]
  if (w.english && w.english !== w.text) lines.push(`> _(English: ${w.english.replace(/\s+/g, ' ').trim()})_`)
  lines.push(`> <sub>${q.ref} · ${q.platform ?? '?'} · ${q.date ?? '?'} · ${q.thread ?? '?'}</sub>`)
  return lines
}

/** One line of words for the workings. */
const said = (ref: string, words: Map<string, QuoteResolution>): string => {
  const w = words.get(ref)
  if (!w) return '(did not resolve)'
  const t = (w.english && w.english !== w.text ? w.english : w.text).replace(/\s+/g, ' ').trim()
  return t.length > 140 ? `${t.slice(0, 137)}…` : t
}

/** How a quote was chosen: every option of the candidates behind it, with its
 *  fit, its form and gate score, and the value that ranked it. */
function choiceLines(
  title: string,
  chosen: QuoteRef | null,
  cited: readonly PoolCandidate[],
  fit: ReadonlyMap<string, number> | null,
  words: Map<string, QuoteResolution>,
): string[] {
  const options = cited.flatMap((c) => c.quoteOptions.map((o) => ({ c, o })))
  if (options.length === 0) return []
  const ranked = rankOptions(options.map((x) => ({ ...x.o, c: x.c })), fit)
  const out = [`**${title}**`, '']
  for (const [i, o] of ranked.entries()) {
    const f = fit?.get(o.quote.ref)
    const v = quoteValue(f, o.substance)
    out.push(`${i + 1}. ${o.quote.ref === chosen?.ref ? '**chosen** ' : ''}${o.c.id} · fit ${f != null ? f.toFixed(3) : '—'} · ${o.substance ? `${o.substance.form}, gate ${o.substance.gate}` : 'no substance'} · value ${v.toFixed(3)} · "${said(o.quote.ref, words)}"`)
  }
  out.push('')
  return out
}

function render(company: string, runId: string, built: BuiltWeekRead, words: Map<string, QuoteResolution>, mode: string): string {
  const d = built.data
  const month = longMonth(d.month)
  const cand = new Map(built.pool.candidates.map((c) => [c.themeId, c]))
  const ids = (themeIds: readonly string[]) => themeIds.map((t) => cand.get(t)?.id ?? t).join(', ')
  const fitNote = built.fit ? ` (quote fit $${built.fit.costUsd.toFixed(6)}: ${built.fit.findings} finding(s), ${built.fit.paragraphs ?? 0} paragraph(s), ${built.fit.stored} stored vector(s), ${built.fit.embedded} embedded now${built.fit.ran ? '' : `, DID NOT RUN: ${built.fit.error ?? '?'}`})` : ''
  const out: string[] = [
    `# ${company}: the week's report (${mode})`,
    '',
    `Run \`${runId}\` · window ${d.window.from} to ${d.window.to} · ${month} · status **${built.status}** · model ${d.model || 'none (no call)'} · ${d.promptVersion} · cost $${d.costUsd.toFixed(4)}${built.check ? ` (self-check $${built.check.costUsd.toFixed(4)})` : ''}${fitNote}`,
    '',
    '<sub>The report as it reads top to bottom, then the findings (the This week page), then the workings. Words in quotes are real comments, resolved for reading; the stored read keeps refs only. Small print under a line says what it rests on and is not client copy.</sub>',
    '',
    '## The week in one line',
    '',
    d.headline ? `**${d.headline}**` : '_(none)_',
    '',
    '## What happened',
    '',
  ]
  for (const p of d.story) {
    out.push(p.body, '', `<sub>rests on ${ids(p.basedOn)}</sub>`, '')
    if (p.quote) out.push(...quoteLines(p.quote, words), '')
  }
  if (d.story.length === 0) out.push('_(no story printed)_', '')

  out.push(`## What it means for ${company}`, '')
  for (const x of d.implications) out.push(`- ${x.body} <sub>(${ids(x.basedOn)})</sub>`)
  if (d.implications.length === 0) out.push('_(none printed)_')
  out.push('')

  if (d.newThisWeek.length > 0) {
    out.push('## New this week', '')
    for (const x of d.newThisWeek) out.push(`- ${x.body} _${plain(x.evidence, d)}_ <sub>(${ids([x.themeId])})</sub>`)
    out.push('')
  } else {
    out.push('<sub>New this week: omitted (no candidate was first heard this week).</sub>', '')
  }

  out.push('## Worth watching next week', '')
  for (const x of d.watch) out.push(`- ${x.body} <sub>(${ids(x.basedOn)})</sub>`)
  if (d.watch.length === 0) out.push('_(none printed)_')
  out.push('')

  const m = d.market
  const fig = (key: string) => d.figures[key]?.value ?? '—'
  out.push(
    '## The market this week (the Dashboard\'s figures)',
    '',
    m
      ? `${fig('market_week_videos')} videos and ${fig('market_week_comments')} comments in your market this week · ${fig('market_month_videos')} videos and ${fig('market_month_comments')} comments in ${month} so far`
      : '_(not read)_',
    '',
    `<sub>Market = the category and the tracked brands, the client's own posts out (the standing levels' base). The category alone: ${built.pool.weekVideos} videos and ${built.pool.weekComments} comments this week, ${built.pool.monthVideos} videos in the month so far.</sub>`,
    '',
    '---',
    '',
    '# The findings (the This week page)',
    '',
  )
  d.findings.forEach((f, i) => {
    out.push(`### ${i + 1}. ${f.headline}${f.sure === 'strong' ? '  · Strong evidence' : ''}`, '')
    out.push(f.saw, '')
    out.push(`**What it means.** ${f.means}`, '')
    out.push(...quoteLines(f.quote, words), '')
    out.push(`_${plain(f.evidence, d)}_`)
    if (f.context) out.push(`_${plain(f.context, d)}_`)
    out.push('')
    out.push(`<sub>Based on: ${f.basedOn.map((id) => { const c = cand.get(id); return c ? `${c.id} "${c.label}" (lenient ${c.lenientVideos}, strict ${c.gatedVideos}, week ${c.weekVideos}, mostly ${c.dominantKind ?? '?'})` : id }).join('; ')} · rests on ${f.videos.week} this week, ${f.videos.month} in the month · sure: ${f.sure} · subject: ${f.subjectId ?? 'none'} · new: ${f.isNew}</sub>`, '')
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
  for (const h of d.held) out.push(`- ${h.section ? `[${h.section}] ` : ''}${h.headline || '_(no text)_'}: ${h.reason}`)
  if (d.held.length === 0) out.push('- none')
  out.push('')
  if (built.scrub) out.push(`### Scrub`, '', `- sentences dropped: ${built.scrub.dropped} (digits ${built.scrub.droppedDigits}, direction ${built.scrub.droppedDirection}, how-it-was-made ${built.scrub.droppedBanned}, advice or forecast ${built.scrub.droppedAdvice ?? 0}); one-line fields dropped for length: ${built.scrub.droppedLong ?? 0}`, '')
  if (built.check) {
    out.push(`### Self-check${built.check.ran ? '' : ' (DID NOT RUN: findings kept unchecked)'}`, '')
    for (const v of built.check.verdicts) out.push(`- ${v.verdict}: ${v.headline}${built.check.contradicted.get(v.headline) ? ` (they say: ${built.check.contradicted.get(v.headline)})` : ''}`)
    out.push('')
  }

  // How each quote was chosen: fit plus substance (lib/written/substance.ts).
  out.push('### Quote choice (fit to the text + substance of the quote)', '')
  const byCid = new Map(built.pool.candidates.map((c) => [c.id.toUpperCase(), c]))
  const raw = built.raw
  if (raw) {
    // Findings, matched back to the writer's output by what they rest on
    // (compose reorders them; the same evidence prints once).
    const setOf = (themeIds: readonly string[]) => [...new Set(themeIds)].sort().join('|')
    for (const [i, w] of raw.findings.entries()) {
      const cited = w.based_on.map((x) => byCid.get(String(x).trim().toUpperCase())).filter((c): c is PoolCandidate => Boolean(c))
      const printed = d.findings.find((f) => setOf(f.basedOn) === setOf(cited.map((c) => c.themeId)))
      out.push(...choiceLines(`Finding: ${w.headline}`, printed?.quote ?? null, cited, built.fit?.scores.get(i) ?? null, words))
    }
    for (const [i, w] of raw.story.entries()) {
      const c = w.quote_from ? byCid.get(w.quote_from.toUpperCase()) : undefined
      if (!c) continue
      const printed = d.story.find((p) => p.body && w.paragraph.includes(p.body.slice(0, 40)))
      out.push(...choiceLines(`Story paragraph ${i + 1} (quote from ${c.id})`, printed?.quote ?? null, [c], built.fit?.story?.get(i) ?? null, words))
    }
  }

  if (built.raw) {
    out.push('### The writer, before scrub', '')
    out.push('```json', JSON.stringify(built.raw, null, 2), '```', '')
  }
  out.push(`### The pool (${built.pool.candidates.length} candidates${built.pool.thin ? ', THIN' : ''}; the category: the week ${built.pool.weekVideos} videos, the month ${built.pool.monthVideos}; the market: ${m ? `week ${m.week.videos ?? '—'} videos / ${m.week.comments ?? '—'} comments, month ${m.month.videos ?? '—'} / ${m.month.comments ?? '—'}` : 'not read'})`, '')
  for (const c of built.pool.candidates) {
    const heard = firstHeardThisWeek(c, built.pool.window) ? 'FIRST HEARD THIS WEEK' : c.isNew ? `first heard this month (${c.firstHeard ?? '?'})` : 'heard before'
    out.push(`**${c.id} "${c.label}"** · lenient ${c.lenientVideos} (month ${c.monthVideoIds.length}) · strict ${c.gatedVideos} · week ${c.weekVideos} · month ${c.monthK} of ${c.monthN} · ${c.quoteOptions.length} quote option(s) · kinds ${c.kinds.join(', ') || 'none'} (mostly ${c.dominantKind ?? 'none'}) · subject ${c.subjectId ?? 'none'} · ${heard}`)
    if (c.description) out.push('', `_${c.description}_`)
    out.push('', ...c.notes.map((n) => `- ${n}`), '')
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
  type SavedFit = Omit<QuoteFit, 'scores' | 'story'> & { scores: [number, [string, number][]][]; story?: [number, [string, number][]][] }
  type SavedRun = { data: WeekReadDataV2; workings: { pool: WeekReadInputs['pool']; standing: WeekReadInputs['standing']; raw: BuiltWeekRead['raw']; check: (Omit<WeekCheck, 'contradicted'> & { contradicted: [string, string | null][] }) | null; fit?: SavedFit | null } }
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
    for (const c of pool.candidates) console.log(`  ${c.id} "${c.label}" lenient ${c.lenientVideos} (month ${c.monthVideoIds.length}) · strict ${c.gatedVideos} · week ${c.weekVideos} · month ${c.monthK} · mostly ${c.dominantKind ?? '-'} · subject ${c.subjectId ?? 'none'} · ${c.quoteRefs.length} quote(s)`)
    for (const f of inputs.standing) console.log(`  ${f.name} [${f.calibration}, ${f.rung}] level ${f.level ? `${f.level.k} of ${f.level.n}` : 'none'} · ${f.contents.length} theme(s) · ${f.notes.length} note(s) · quote ${f.quoteRef ? 'yes' : 'no'}`)
    const { system, user } = buildWeekReadPrompts({ company: inputs.company, pool, standing: inputs.standing, previous: inputs.previous, figures: writerFigures(pool) })
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

  const text = render(company, runId, built, words, write ? 'WRITTEN' : again ? 'DRY RUN, not stored; composed again from the saved call' : 'DRY RUN, not stored')
  console.log(`\n${text}\n`)

  const fit = built.fit && { ...built.fit, scores: [...built.fit.scores].map(([i, x]) => [i, [...x]]), story: [...(built.fit.story ?? new Map())].map(([i, x]) => [i, [...x]]) }
  const json = JSON.stringify({ status: built.status, data: built.data, workings: { pool: built.pool, standing: built.standing, raw: built.raw, scrub: built.scrub, check: built.check && { ...built.check, contradicted: [...built.check.contradicted] }, fit } }, null, 2)
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
