import { aboutName, marketLabelsOf, type AboutPart } from '../../brands/labels'
import { fmtInt, longMonth } from '../../format'
import { monthsPhrase } from '../../written/month'
import { FINDINGS_AFTER } from './sections'
import type { BriefFinding, BriefQuote, BriefSection, MonthlyBriefData } from './types'
import { BRIEF_LENS, BRIEF_NAME } from './types'

// A brief as a reader reads it, in Markdown (pure): the dry drafts' reading
// copy, before the designed renderers exist. Quotes resolve here and nowhere
// earlier: the brief holds refs, and `textOf` hands this the words. Every
// number on the page is code's; every quote says where it was heard and whose
// talk it was.

const PLATFORM: Readonly<Record<string, string>> = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', reddit: 'Reddit' }

/** "Japanese" for "ja"; the tag itself where the runtime has no name for it. */
export function languageName(lang: string | null | undefined): string | null {
  if (!lang) return null
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(lang.trim())
    return name && name !== lang ? name : lang
  } catch {
    return lang
  }
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const shortDate = (date: string | null): string | null => {
  if (!date) return null
  const d = new Date(`${date.slice(0, 10)}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`
}

/** Where a quote was heard and whose talk it was: "Reddit · 26 Sep · about
 *  Cotopaxi · translated from Japanese". */
export function quoteSource(q: BriefQuote, company: string, noun: string | null): string {
  const about = q.about === 'client'
    ? q.ownPost ? `on ${company}'s own post` : `about ${company}`
    : q.about === 'market' ? marketLabelsOf(noun).inline : `about ${aboutName(q.about, { client: company })}`
  const lang = languageName(q.lang)
  return [PLATFORM[(q.platform ?? '').toLowerCase()] ?? q.platform ?? null, shortDate(q.date), about, lang ? `translated from ${lang}` : null].filter(Boolean).join(' · ')
}

/** Who the talk was about, with each part's videos: "12 videos: other bags in
 *  your market 9 · Cotopaxi 2 · Sealand 1". */
export function whoLine(videos: number, who: readonly AboutPart[], company: string, noun: string | null): string {
  const market = marketLabelsOf(noun).inline
  // Most first, as a split by audience prints on the pages.
  const sorted = [...who].filter((p) => p.videos > 0).sort((a, b) => b.videos - a.videos)
  const name = (p: AboutPart) => (p.about === 'market' ? market : p.about === 'client' ? `about ${company}` : `about ${aboutName(p.about, { client: company })}`)
  const parts = sorted.map((p) => `${name(p)} ${fmtInt(p.videos)}`)
  return `${fmtInt(videos)} ${videos === 1 ? 'video' : 'videos'}${parts.length > 1 ? `: ${parts.join(' · ')}` : sorted.length === 1 ? `, ${name(sorted[0])}` : ''}`
}

type TextOf = (ref: string) => { text: string; english: string | null; lang: string | null } | null

function quoteBlock(q: BriefQuote | null | undefined, textOf: TextOf, company: string, noun: string | null): string[] {
  if (!q) return []
  const t = textOf(q.ref)
  if (!t) return []
  const words = (t.english ?? t.text).replace(/\s+/g, ' ').trim()
  return [`> "${words}"`, `> ${quoteSource(q, company, noun)}`, '']
}

function findingBlock(f: BriefFinding, role: MonthlyBriefData['role'], textOf: TextOf, company: string, noun: string | null): string[] {
  const heard = f.months.filter((m) => m.videos > 0).map((m) => m.month)
  return [
    `## ${f.headline}`,
    '',
    ...f.saw.flatMap((p) => [p, '']),
    `**${BRIEF_LENS[role]}.** ${f.means}`,
    '',
    ...(f.practice.length ? ['**In practice**', ...f.practice.map((p) => `- ${p}`), ''] : []),
    ...f.quotes.flatMap((q) => quoteBlock(q, textOf, company, noun)),
    `_Heard in ${monthsPhrase(heard)}, on ${whoLine(f.videos, f.who, company, noun)}._`,
    '',
  ]
}

function sectionBlock(s: BriefSection, textOf: TextOf, company: string, noun: string | null): string[] {
  const out: string[] = [`## ${s.title}`, '']
  if (s.lead) out.push(s.lead, '')
  for (const g of s.groups) {
    if (g.label) out.push(`**${g.label}**`, '')
    for (const i of g.items) {
      const title = i.title ? `${i.title}${i.tag === 'you' ? ' (you)' : ''}` : ''
      const head = title ? `**${/[.!?]$/.test(title) ? title : `${title}.`}** ` : ''
      const tag = i.tag && i.tag !== 'you' ? ` _(${i.tag}.)_` : ''
      const who = i.videos != null && i.who ? ` _(${whoLine(i.videos, i.who, company, noun)})_` : ''
      out.push(`- ${head}${i.text}${i.detail ? ` ${i.detail}` : ''}${tag}${who}`)
    }
    out.push('')
    for (const l of g.lines ?? []) out.push(l, '')
  }
  for (const l of s.lines ?? []) out.push(l, '')
  for (const v of s.voices ?? []) {
    const t = textOf(v.ref)
    if (t) out.push(`- "${(t.english ?? t.text).replace(/\s+/g, ' ').trim()}" _(${quoteSource(v, company, noun)})_`)
  }
  if (s.voices?.length) out.push('')
  out.push(...quoteBlock(s.quote, textOf, company, noun))
  return out
}

export function briefMarkdown(d: MonthlyBriefData, textOf: TextOf, noun: string | null): string {
  const co = d.company
  const out: string[] = [
    `# ${BRIEF_NAME[d.role]} · ${co} · ${longMonth(d.month)} ${d.month.slice(0, 4)}`,
    '',
    '## In short',
    '',
    d.inShort.summary,
    '',
    ...d.inShort.figures.map((f) => `**${f.value}** ${f.label}`).flatMap((l) => [l, '']),
  ]
  if (d.inShort.also.length) {
    out.push('**Also this month, in the other briefs**', '', ...d.inShort.also.map((a) => `- ${BRIEF_NAME[a.brief]}: ${a.headline}`), '')
  }
  const after = FINDINGS_AFTER[d.role]
  const findings = d.findings.flatMap((f) => findingBlock(f, d.role, textOf, co, noun))
  let placed = after == null || !d.sections.some((s) => s.key === after)
  if (placed) out.push(...findings)
  for (const s of d.sections) {
    out.push(...sectionBlock(s, textOf, co, noun))
    if (!placed && s.key === after) { out.push(...findings); placed = true }
  }
  if (!placed) out.push(...findings)
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}
