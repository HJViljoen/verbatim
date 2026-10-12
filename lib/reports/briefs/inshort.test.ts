import { describe, expect, it } from 'vitest'

import { briefFixture, item } from '../../../components/briefs/fixture'
import { collectQuoteRefs } from '../../renderables/quotes-freeze'
import { planDeck } from './deck'
import { applyInShort, buildInShortPrompts, inShortItems, inShortStillHolds, printedLines, printedPages, sameWords, summarySentences } from './inshort'
import type { BriefQuote, MonthlyBriefData } from './types'

// In short says only what prints (the September dry build, 12 Oct): the
// pages the check reads, the sentences it is asked about, and what code does
// with its answer. No model: the answer is handed in.

/** Every quote's words in a fixture brief (its quotes carry them). */
const voices = (d: MonthlyBriefData): string[] => {
  const out: string[] = []
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) { x.forEach(walk); return }
    if (!x || typeof x !== 'object') return
    const o = x as Partial<BriefQuote> & Record<string, unknown>
    if (typeof o.ref === 'string' && typeof o.text === 'string' && o.text) out.push(o.text)
    Object.values(o).forEach(walk)
  }
  walk(d)
  return out
}

describe('the printed pages the In short check reads', () => {
  it('are the pages as they print: never a section the canvas draws no page for, a page left out as thin, or a voice\'s words', () => {
    const d = briefFixture('sales')
    d.sections.push({ key: 'sales.deciders', title: 'Who else is in the decision', groups: [{ items: [item('Insurers', 'Insurers and family shape the purchase.')] }] })
    const care = d.sections.find((s) => s.key === 'sales.care')!
    care.groups[0].items = care.groups[0].items.slice(0, 1)
    const lines = printedLines(printedPages(d))
    const all = lines.join('\n')
    expect(all).not.toContain('Insurers and family')
    expect(all).not.toContain(care.groups[0].items[0].text)
    expect(planDeck(d).left.map((l) => l.key)).toContain('sales.care')
    expect(collectQuoteRefs(d).length).toBeGreaterThan(0)
    for (const words of voices(d)) expect(all).not.toContain(words.slice(0, 40))
    // A finding prints its headline, what was heard and what it means.
    const f = d.findings[0]
    expect(lines).toContain(f.headline)
    expect(lines).toContain(f.saw[0])
    expect(lines.some((l) => l.endsWith(f.means))).toBe(true)
  })

  it('a line naming another brief prints as its row and the page\'s footnote', () => {
    const d = briefFixture('sales')
    const lines = printedLines(printedPages(d))
    expect(lines).toContain('“A story that feels off” is argued in full in the Marketing brief.')
    expect(lines.some((l) => l.startsWith('A story that feels off |'))).toBe(true)
  })

  it('numbers the set\'s sentences across the set in role order, and asks about each against its own brief\'s pages', () => {
    const briefs = (['leadership', 'sales'] as const).map((r) => briefFixture(r))
    const items = inShortItems(briefs)
    expect(items.map((i) => i.id)).toEqual(items.map((_i, k) => `S${k + 1}`))
    expect(items[0].role).toBe('sales')
    expect(items.filter((i) => i.role === 'sales').map((i) => i.sentence)).toEqual(summarySentences(briefs[1].inShort.summary))
    const p = buildInShortPrompts({ company: 'Acme', briefs: briefs.map((d) => ({ role: d.role, pages: printedPages(d) })), items })
    expect(p.user.indexOf('# Sales brief')).toBeLessThan(p.user.indexOf('# Leadership brief'))
    expect(p.user).toContain(`S1 ${items[0].sentence}`)
    for (const d of briefs) for (const words of voices(d)) expect(p.user).not.toContain(words.slice(0, 40))
    expect(p.system).not.toMatch(/—/)
  })
})

describe('what code does with the check\'s answer', () => {
  it('drops a sentence no printed page carries, whole, keeps the rest in order, and holds what it dropped', () => {
    const d = briefFixture('sales')
    const items = inShortItems([d])
    expect(items).toHaveLength(3)
    const out = applyInShort([d], items, { sentences: [
      { sentence: 'S1', printed: true, missing: '' },
      { sentence: 's2', printed: false, missing: 'Northpeak and long life' },
    ] })
    expect(out.briefs[0].inShort.summary).toBe(items[0].sentence)
    expect(out.kept.sales).toEqual([items[0].sentence])
    expect(out.dropped.map((x) => x.sentence)).toEqual([items[1].sentence, items[2].sentence])
    expect(out.briefs[0].held.slice(-2).map((h) => h.reason)).toEqual(['no printed page says it: Northpeak and long life', 'the In short check gave no answer for it'])
    // The brief handed in is not changed.
    expect(d.inShort.summary).toBe(briefFixture('sales').inShort.summary)
  })

  it('keeps a brief whose every sentence prints as it is', () => {
    const d = briefFixture('content')
    const items = inShortItems([d])
    const out = applyInShort([d], items, { sentences: items.map((i) => ({ sentence: i.id, printed: true, missing: '' })) })
    expect(out.briefs[0]).toBe(d)
    expect(out.dropped).toEqual([])
  })

  it('an In short the check empties loses its page, as a page missing its main piece does', () => {
    const d = briefFixture('marketing')
    const items = inShortItems([d])
    const out = applyInShort([d], items, { sentences: items.map((i) => ({ sentence: i.id, printed: false, missing: 'x' })) })
    expect(out.briefs[0].inShort.summary).toBe('')
    expect(planDeck(out.briefs[0]).pages.some((p) => p.body.kind === 'in_short')).toBe(false)
    expect(planDeck(out.briefs[0]).left).toEqual([{ key: 'in_short', title: 'In short', why: 'missing: the summary' }])
  })

  it('a stored brief holds to the check only where every sentence passed it and every line it read still prints', () => {
    const d = briefFixture('leadership')
    const record = { read: printedLines(printedPages(d)), kept: summarySentences(d.inShort.summary) }
    expect(inShortStillHolds(d, record)).toEqual({ holds: true, why: null })
    expect(inShortStillHolds({ ...d, inShort: { ...d.inShort, summary: `${d.inShort.summary} Northpeak wins on price.` } }, record).why).toMatch(/did not pass: "Northpeak wins on price\."/)
    expect(inShortStillHolds(d, { ...record, read: [...record.read, 'A line on no page.'] }).why).toMatch(/no longer prints under the current deck: "A line on no page\."/)
    expect(inShortStillHolds({ ...d, inShort: { ...d.inShort, summary: '' } }, { read: ['A line on no page.'], kept: [] }).holds).toBe(true)
  })

  it('a record read before the footnote\'s quote marks were drawn still holds; a changed line still does not', () => {
    const d = briefFixture('marketing')
    const believe = d.sections.find((s) => s.key === 'marketing.believe')!
    believe.groups[0].items[0] = { ...believe.groups[0].items[0], title: 'Everyday wear is unclear', tag: 'Argued in the Content brief' }
    const now = printedLines(printedPages(d))
    expect(now.some((l) => l.startsWith('“Everyday wear is unclear” is argued in full in the Content brief.'))).toBe(true)
    // The lines as the September v2 build's check read them.
    const before = now.map((l) => l.replace(/[“”]/g, ''))
    expect(before.some((l) => l.startsWith('Everyday wear is unclear is argued in full in the Content brief.'))).toBe(true)
    const kept = summarySentences(d.inShort.summary)
    expect(inShortStillHolds(d, { read: before, kept })).toEqual({ holds: true, why: null })
    // A name that no longer prints is still a line gone.
    expect(inShortStillHolds(d, { read: [...before, 'Everyday fit is unclear is argued in full in the Content brief.'], kept }).why).toMatch(/no longer prints under the current deck: "Everyday fit is unclear/)
    expect(sameWords('“Everyday wear is unclear” is argued in full in the Content brief.')).toBe('Everyday wear is unclear is argued in full in the Content brief.')
  })
})
