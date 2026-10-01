// The two written reads as a person reads them in a dry run: the week's report
// (scripts/week-read.ts) and the long-run read (scripts/longrun-read.ts), and
// the backfill that writes both (scripts/backfill-platform.ts). Moved here
// unchanged from the two scripts so the three print the same thing. Not client
// copy: the small print says what each line rests on.

import { longMonth } from '../lib/format'
import type { QuoteResolution } from '../lib/quotes'
import { WHAT_THEY_SELL } from '../lib/pages/market-frame'
import { coverPlainText } from '../lib/reports/cover'
import { rankOptions } from '../lib/written/compose'
import { companyLines } from '../lib/written/company'
import { monthsPhrase, type BuiltLongRun } from '../lib/written/longrun'
import { inMonth } from '../lib/written/month'
import type { BuiltWeekRead, WeekReadInputs } from '../lib/written/step'
import { quoteValue } from '../lib/written/substance'
import { firstHeardThisWeek, type PoolCandidate, type QuoteRef, type WeekReadDataV2, type WhoPart } from '../lib/written/types'

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

export function renderWeekRead(company: string, runId: string, built: BuiltWeekRead, words: Map<string, QuoteResolution>, mode: string, context: WeekReadInputs['context']): string {
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
      ? `${fig('market_week_videos')} videos and ${fig('market_week_comments')} comments in your market this week · ${fig('market_month_videos')} videos and ${fig('market_month_comments')} comments ${inMonth(d.month, d.monthComplete)}`
      : '_(not read)_',
    '',
    `<sub>Market = the category and the tracked brands, the client's own posts out (the standing levels' base). The category alone: ${built.pool.weekVideos} videos and ${built.pool.weekComments} comments this week, ${built.pool.monthVideos} videos ${inMonth(built.pool.month, built.pool.monthComplete)}.</sub>`,
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
  out.push(`### About ${company} (the writer's context for "What it means")`, '')
  if (context) {
    out.push(companyLines(company, context, d.month, d.monthComplete), '', `<sub>Own posts (dated by the post): ${context.posts.week ?? '—'} this week, ${context.posts.month ?? '—'} ${inMonth(d.month, d.monthComplete)}.</sub>`, '')
  } else out.push('_(none: the writer was told nothing about the company)_', '')
  out.push('### The subjects', '')
  for (const f of built.standing) {
    out.push(`- **${f.name}** [${f.calibration}, rung ${f.rung}, rank ${f.rank || '-'}] level ${f.level ? `${f.level.k} of ${f.level.n}` : 'none'} · contents: ${f.contents.join(' · ') || 'none'} · ${f.notes.length} note(s)`)
    for (const n of f.notes) out.push(`  - ${n}`)
  }
  return out.join('\n')
}

/** A split as the page prints it. */
function whoRows(parts: readonly WhoPart[], company: string, noun: string | null): string[] {
  return parts.map((p) => {
    const name = p.about === 'client' ? company : p.about === 'market' ? `Other ${noun ?? 'brands'} in your market` : p.about.slice('rival:'.length)
    return `| ${name} | ${p.videos} |`
  })
}

export function renderLongRun(company: string, clientId: string, built: BuiltLongRun, mode: string): string {
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
