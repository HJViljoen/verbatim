import { describe, expect, it } from 'vitest'

import { CURATION_GATE } from '../curation'
import { substituteFigures } from '../reports/cover'
import { composeWeekRead, contextLine, evidenceOf, marketFigureTable, monthEvidenceOf, pickFindingQuote, sureOf, type ComposeWeekArgs } from './compose'
import type { ScrubbedWeekRead } from './scrub'
import { candidate, fact, option, pool, ref, SEP, WINDOW, written } from './test-fixtures'
import type { PoolCandidate, WeekMarketFigures } from './types'
import { writerFigures, writerSubjects } from './write'

// The composer's rules, on fixtures (plan T3): the floor, the cap, the order,
// the quote, the lines code writes, the thin week. No model, no database.

type Finding = ScrubbedWeekRead['findings'][number]
const finding = (o: Partial<Finding> & { based_on: string[] }): Finding => ({
  headline: o.headline ?? 'Buyers weigh the price against how long a bag lasts',
  saw: o.saw ?? 'Buyers describe the thing plainly.',
  means: o.means ?? 'It matters because it decides the sale.',
  based_on: o.based_on,
  quote_from: o.quote_from ?? null,
})

function compose(candidates: PoolCandidate[], findings: Finding[], over: Partial<ComposeWeekArgs> & { market?: WeekMarketFigures } = {}) {
  const p = pool(candidates, over.market ? { market: over.market } : {})
  const standing = over.standing ?? []
  return composeWeekRead({
    pool: p,
    standing,
    written: written({ findings, week_in_one_line: 'The week turns on price.' }),
    subjects: writerSubjects(standing),
    writerFigures: writerFigures(p),
    model: 'gpt-5.4',
    costUsd: 0.2,
    ...over,
  })
}

describe('evidence and how sure', () => {
  it('counts distinct lenient-gated videos across the cited candidates: a shared video once, never a sum', () => {
    const a = candidate({ id: 'C1', videoIds: ['v1', 'v2', 'v3', 'v4'], monthVideoIds: ['v1', 'v2', 'v3', 'v4', 'm1', 'm2'] })
    const b = candidate({ id: 'C2', videoIds: ['v3', 'v4', 'v5'], monthVideoIds: ['v3', 'v4', 'v5', 'm2', 'm3'] })
    expect(evidenceOf([a, b])).toBe(5) // not 7
    expect(monthEvidenceOf([a, b])).toBe(8) // not 11
  })

  it('counts the lenient videos, not the strict ones', () => {
    const c = candidate({ id: 'C1', videoIds: ['v1', 'v2', 'v3', 'v4', 'v5'], gatedVideoIds: ['v1'] })
    expect(evidenceOf([c])).toBe(5)
  })

  it("is the document engine's rule in videos: under five does not print, and Strong evidence needs the product's line on both counts", () => {
    expect(sureOf(1, 4, 10)).toBeNull()
    expect(sureOf(1, 5, 10)).toBe('reasonable')
    expect(sureOf(2, 12, 30)).toBe('reasonable')
    const line = CURATION_GATE.confirmedMinVideos
    expect(sureOf(1, line, line)).toBe('strong')
    expect(sureOf(2, line + 5, line - 1)).toBe('reasonable') // the week printed beside it would disprove it
    expect(sureOf(1, line - 1, line + 10)).toBe('reasonable')
  })
})

describe('composeWeekRead: which findings print', () => {
  it('resolves based_on, drops unknown ids, and holds a finding resting on none', () => {
    const read = compose([candidate({ id: 'C1' })], [
      finding({ based_on: ['C1', 'C9'] }),
      finding({ based_on: ['C7'], headline: 'Invented' }),
    ])
    expect(read.findings).toHaveLength(1)
    expect(read.findings[0].basedOn).toEqual(['th-c1'])
    expect(read.held).toContainEqual({ reason: 'rests on no candidate', headline: 'Invented' })
  })

  it('holds a finding under reasonable, whatever the writer says of it', () => {
    const read = compose([candidate({ id: 'C1', gated: 4 }), candidate({ id: 'C2', gated: 6 })], [
      finding({ based_on: ['C1'], headline: 'Thin' }),
      finding({ based_on: ['C2'], headline: 'Enough' }),
    ])
    expect(read.findings.map((f) => f.headline)).toEqual(['Enough'])
    expect(read.held).toContainEqual({ reason: 'below reasonable: 4 videos', headline: 'Thin' })
  })

  it('orders by evidence, prints at most four, and holds the rest', () => {
    const cs = [5, 9, 7, 12, 6].map((g, i) => candidate({ id: `C${i + 1}`, gated: g }))
    const read = compose(cs, cs.map((c) => finding({ based_on: [c.id], headline: `On ${c.id}` })))
    expect(read.findings.map((f) => f.headline)).toEqual(['On C4', 'On C2', 'On C3', 'On C5'])
    expect(read.held).toEqual([{ reason: 'past the first 4 findings', headline: 'On C1' }])
  })

  it('prints the same evidence once', () => {
    const read = compose([candidate({ id: 'C1' }), candidate({ id: 'C2' })], [
      finding({ based_on: ['C1', 'C2'], headline: 'First' }),
      finding({ based_on: ['C2', 'C1'], headline: 'Again' }),
    ])
    expect(read.findings.map((f) => f.headline)).toEqual(['First'])
    expect(read.held).toContainEqual({ reason: 'rests on the same evidence as another finding', headline: 'Again' })
  })

  it('holds what the self-check contradicts, with what the conversation says', () => {
    const read = compose([candidate({ id: 'C1' }), candidate({ id: 'C2' })], [
      finding({ based_on: ['C1'], headline: 'Buyers love the price' }),
      finding({ based_on: ['C2'], headline: 'Fit decides it' }),
    ], { contradicted: new Map([['Buyers love the price', 'people call it too expensive']]) })
    expect(read.findings.map((f) => f.headline)).toEqual(['Fit decides it'])
    expect(read.held).toContainEqual({ reason: 'the conversation contradicts it: people call it too expensive', headline: 'Buyers love the price' })
  })

  it('holds a finding whose headline or body did not survive the scrub', () => {
    const read = compose([candidate({ id: 'C1' }), candidate({ id: 'C2' })], [
      finding({ based_on: ['C1'], headline: '' }),
      finding({ based_on: ['C2'], headline: 'No body', saw: '' }),
    ])
    expect(read.findings).toEqual([])
    expect(read.held.map((h) => h.reason)).toEqual(['no headline survived the scrub', 'nothing it saw survived the scrub', 'no finding printed'])
    // Nothing printed, so nothing to sum up: the whole report is empty.
    expect(read).toMatchObject({ headline: '', story: [], implications: [], newThisWeek: [], watch: [] })
  })
})

describe('composeWeekRead: a thin week', () => {
  it('has no findings and says nothing about it; where the market stands still prints', () => {
    const standing = [fact({ subjectId: 's1', name: 'Comfort', rank: 1 }), fact({ subjectId: 's2', name: 'Repair', calibration: 'failed' })]
    const p = pool([candidate({ id: 'C1' })])
    const read = composeWeekRead({ pool: p, standing, written: null, subjects: [], writerFigures: writerFigures(p), model: '', costUsd: 0 })
    expect(read).toMatchObject({ version: 2, headline: '', story: [], implications: [], newThisWeek: [], watch: [], findings: [], held: [], month: SEP, promptVersion: 'week_read_v3', costUsd: 0 })
    expect(read.standing.map((s) => [s.name, s.line !== '', s.sentence])).toEqual([['Comfort', true, ''], ['Repair', false, '']])
  })
})

describe('composeWeekRead: the lines code writes', () => {
  it('the evidence line counts what the finding rests on: the union of every cited candidate, this week and in the month so far', () => {
    const c1 = candidate({ id: 'C1', videoIds: ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'], monthVideoIds: ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'm1', 'm2', 'm3'], weekVideos: 14, monthK: 40, label: 'Price feels hard to justify' })
    const c2 = candidate({ id: 'C2', videoIds: ['v5', 'v6', 'v7', 'v8'], monthVideoIds: ['v5', 'v6', 'v7', 'v8', 'm3', 'm4'], weekVideos: 9, monthK: 30 })
    const read = compose([c1, c2], [finding({ based_on: ['C2', 'C1'], headline: 'Buyers doubt the price' })])
    const f = read.findings[0]
    // Eight distinct videos this week (not 6 + 4), twelve in the month (not 9 + 6),
    // and neither candidate's own theme count (14, 40).
    expect(f.videos).toEqual({ week: 8, month: 12 })
    expect(f.evidence).toBe('[[f1_week]] videos this week · [[f1_month]] in September so far')
    const text = substituteFigures(f.evidence, read.figures).map((p) => ('text' in p ? p.text : p.figure)).join('')
    expect(text).toBe('8 videos this week · 12 in September so far')
    expect(read.figures.f1_week.label).toBe('videos this week behind the finding "Buyers doubt the price"')
  })

  it('the context line is the subject\'s standing line, and First heard where every cited candidate is new', () => {
    const standing = [fact({ subjectId: 'price', name: 'Price', rank: 4, level: { k: 31, n: 852 } })]
    const read = compose([
      candidate({ id: 'C1', subjectId: 'price', isNew: true }),
      candidate({ id: 'C2', isNew: true }),
      candidate({ id: 'C3', isNew: false }),
    ], [
      finding({ based_on: ['C1'], headline: 'One' }),
      finding({ based_on: ['C2'], headline: 'Two' }),
      finding({ based_on: ['C3', 'C2'], headline: 'Three' }),
    ], { standing })
    const by = Object.fromEntries(read.findings.map((f) => [f.headline, f]))
    expect(by.One.context).toBe('Part of Price: [[subj_price_level]] of [[subj_price_n]] videos in your market in September, the fourth biggest subject. First heard in September.')
    expect(by.One.subjectId).toBe('price')
    expect(by.Two.context).toBe('First heard in September.')
    expect(by.Three).toMatchObject({ context: '', isNew: false })
    const text = substituteFigures(by.One.context, read.figures).map((p) => ('text' in p ? p.text : p.figure)).join('')
    expect(text).toBe('Part of Price: 4% of 852 videos in your market in September, the fourth biggest subject. First heard in September.')
  })

  it('names a subject only where the cited candidates agree on one', () => {
    const standing = [fact({ subjectId: 'price', name: 'Price', rank: 5 }), fact({ subjectId: 'comfort', name: 'Comfort', rank: 3 })]
    const read = compose([
      candidate({ id: 'C1', gated: 4, subjectId: 'comfort' }),
      candidate({ id: 'C2', gated: 3, subjectId: 'price' }),
      candidate({ id: 'C3', gated: 5 }),
      candidate({ id: 'C4', gated: 3, subjectId: 'price' }),
    ], [
      finding({ based_on: ['C1', 'C2'], headline: 'Two subjects' }),
      finding({ based_on: ['C3', 'C4'], headline: 'One subject' }),
    ], { standing })
    const by = Object.fromEntries(read.findings.map((f) => [f.headline, f]))
    expect(by['Two subjects']).toMatchObject({ subjectId: null, context: '' })
    expect(by['One subject'].subjectId).toBe('price') // the lead (C3) names none; C4 names Price
    expect(by['One subject'].context).toMatch(/^Part of Price: /)
  })

  it('a subject that prints no level adds nothing to the context line, and nothing says why', () => {
    expect(contextLine(fact({ subjectId: 's', name: 'Price', calibration: 'provisional' }), false, SEP)).toEqual({ body: '', figures: {} })
    expect(contextLine(fact({ subjectId: 's', name: 'Price', calibration: 'failed' }), false, SEP)).toEqual({ body: '', figures: {} })
  })

  it('marks Strong evidence only at the product\'s line', () => {
    const line = CURATION_GATE.confirmedMinVideos
    const read = compose([
      candidate({ id: 'C1', gated: line, weekVideos: line + 3 }),
      candidate({ id: 'C2', gated: 8 }),
    ], [finding({ based_on: ['C1'], headline: 'Big' }), finding({ based_on: ['C2'], headline: 'Small' })])
    expect(read.findings.map((f) => [f.headline, f.sure])).toEqual([['Big', 'strong'], ['Small', 'reasonable']])
  })

  it('stores no department lines (v3: the weekly is one general report)', () => {
    const read = compose([candidate({ id: 'C1' })], [finding({ based_on: ['C1'] })])
    expect(read.findings[0]).not.toHaveProperty('for')
  })
})

describe('composeWeekRead: quotes', () => {
  it('takes quote_from where the finding cites it, else the strongest cited candidate, and never prints one twice', () => {
    const c1 = candidate({ id: 'C1', gated: 9, quoteRefs: [ref('a1', 't1'), ref('a2', 't2')] })
    const c2 = candidate({ id: 'C2', gated: 7, quoteRefs: [ref('b1', 't3')] })
    const c3 = candidate({ id: 'C3', gated: 6, quoteRefs: [ref('c1', 't4')] })
    const read = compose([c1, c2, c3], [
      finding({ based_on: ['C1', 'C2'], quote_from: 'C2', headline: 'Named' }),
      finding({ based_on: ['C1'], quote_from: 'C3', headline: 'Not cited' }), // C3 is not cited: ignored
      finding({ based_on: ['C3', 'C1'], headline: 'Strongest' }),
    ])
    // Printed in evidence order: Named (16 videos), Strongest (15), Not cited (9).
    expect(read.findings.map((f) => f.headline)).toEqual(['Named', 'Strongest', 'Not cited'])
    const by = Object.fromEntries(read.findings.map((f) => [f.headline, f.quote?.ref]))
    expect(by.Named).toBe('e:b1')
    expect(by.Strongest).toBe('e:a1') // C1 is the strongest cited
    expect(by['Not cited']).toBe('e:a2') // C3 is not cited, so C1's; a1 is taken
    for (const f of read.findings) expect(f.quote?.text).toBe('')
  })

  it('with a fit, prints the option that best fits the finding, whichever cited candidate it comes from', () => {
    const c1 = candidate({ id: 'C1', gated: 9, quoteRefs: [ref('a1', 't1'), ref('a2', 't2')] })
    const c2 = candidate({ id: 'C2', gated: 7, quoteRefs: [ref('b1', 't3'), ref('b2', 't4')] })
    const read = compose([c1, c2], [finding({ based_on: ['C1', 'C2'], quote_from: 'C1', headline: 'Fits' })], {
      fit: new Map([[0, new Map([['e:a1', 0.31], ['e:a2', 0.42], ['e:b1', 0.35], ['e:b2', 0.58]])]]),
    })
    expect(read.findings[0].quote?.ref).toBe('e:b2') // not quote_from's first
  })

  it("the writer's quote_from breaks a tie, an unscored option ranks last, and no fit keeps the writer's order", () => {
    const c1 = candidate({ id: 'C1', quoteRefs: [ref('a1', 't1')] })
    const c2 = candidate({ id: 'C2', quoteRefs: [ref('b1', 't2'), ref('b2', 't3')] })
    const used = () => ({ refs: new Set<string>(), threads: new Set<string>() })
    const tie = new Map([['e:a1', 0.5], ['e:b1', 0.5]])
    expect(pickFindingQuote(c2, [c1, c2], used(), tie)?.ref).toBe('e:b1')
    expect(pickFindingQuote(c1, [c1, c2], used(), tie)?.ref).toBe('e:a1')
    expect(pickFindingQuote(null, [c1, c2], used(), new Map([['e:b2', 0.1]]))?.ref).toBe('e:b2')
    expect(pickFindingQuote(c2, [c1, c2], used(), new Map())?.ref).toBe('e:b1')
    expect(pickFindingQuote(c2, [c1, c2], used(), null)?.ref).toBe('e:b1')
  })

  it('chooses among every option, not only the three listed refs', () => {
    const refs = [ref('a1', 't1'), ref('a2', 't2'), ref('a3', 't3'), ref('a4', 't4'), ref('a5', 't5')]
    const c = candidate({ id: 'C1', quoteRefs: refs.slice(0, 3), quoteOptions: refs.map((q) => option(q)) })
    expect(pickFindingQuote(null, [c], { refs: new Set(), threads: new Set() }, new Map([['e:a5', 0.6], ['e:a1', 0.2]]))?.ref).toBe('e:a5')
  })

  it('holds a finding with no quote left to print: each prints a real quote', () => {
    const c1 = candidate({ id: 'C1', gated: 9, quoteRefs: [ref('a1', 't1')] })
    const c2 = candidate({ id: 'C2', gated: 7, quoteRefs: [] })
    const read = compose([c1, c2], [
      finding({ based_on: ['C1'], headline: 'First' }),
      finding({ based_on: ['C2', 'C1'], headline: 'Second' }),
    ])
    // Second (16 videos) prints first and takes a1; First is left with nothing.
    expect(read.findings.map((f) => [f.headline, f.quote?.ref])).toEqual([['Second', 'e:a1']])
    expect(read.held).toContainEqual({ reason: 'no quote left to print', headline: 'First' })
  })

  it('prefers a thread not heard yet, falls back to any unused ref, and prints none rather than a repeat', () => {
    const used = { refs: new Set(['e:x1']), threads: new Set(['youtube::t1']) }
    const c = candidate({ id: 'C1', quoteRefs: [ref('x1', 't1'), ref('x2', 't1'), ref('x3', 't9')] })
    expect(pickFindingQuote(null, [c], used)?.ref).toBe('e:x3')
    expect(pickFindingQuote(null, [c], used)?.ref).toBe('e:x2') // same thread, but unused
    expect(pickFindingQuote(null, [c], used)).toBeNull()
  })
})

describe('composeWeekRead: where the market stands', () => {
  it('lists every tracked subject in order; the writer\'s sentence by handle; a failed subject is the name alone', () => {
    const standing = [
      fact({ subjectId: 's1', name: 'Comfort', rank: 1, notes: ['Straps dig in.'], quoteRef: ref('q1', 't1') }),
      fact({ subjectId: 's2', name: 'Price', calibration: 'provisional', rank: 2, contents: ['Price feels hard to justify'], quoteRef: ref('q2', 't2') }),
      fact({ subjectId: 's3', name: 'Community', calibration: 'unread' }),
      fact({ subjectId: 's4', name: 'Repair', calibration: 'failed', quoteRef: ref('q4', 't4') }),
    ]
    const subjects = writerSubjects(standing)
    expect(subjects.map((s) => [s.handle, s.fact.name])).toEqual([['S1', 'Comfort'], ['S2', 'Price']])
    const read = compose([candidate({ id: 'C1' })], [finding({ based_on: ['C1'] })], {
      standing,
      subjects,
      written: written({
        findings: [finding({ based_on: ['C1'] })],
        week_in_one_line: 'x',
        standing: [{ subject_id: 's2', sentence: 'Buyers weigh the price against how long a bag lasts.' }, { subject_id: 'S9', sentence: 'Nobody.' }],
      }),
    })
    expect(read.standing.map((s) => ({ name: s.name, rung: s.rung, line: s.line !== '', sentence: s.sentence, quote: s.quote?.ref ?? null }))).toEqual([
      { name: 'Comfort', rung: 'level', line: true, sentence: '', quote: 'e:q1' },
      { name: 'Price', rung: 'none', line: false, sentence: 'Buyers weigh the price against how long a bag lasts.', quote: 'e:q2' },
      { name: 'Community', rung: 'none', line: false, sentence: '', quote: null },
      { name: 'Repair', rung: 'none', line: false, sentence: '', quote: null },
    ])
    // Every standing line's keys resolve against the stored table.
    for (const s of read.standing) for (const m of s.line.matchAll(/\[\[([a-z0-9_]+)\]\]/g)) expect(read.figures[m[1]]).toBeDefined()
  })
})

describe('composeWeekRead: what is stored', () => {
  it('carries no digit in the model\'s prose and no quote words; every key it prints resolves', () => {
    const read = compose([candidate({ id: 'C1', gated: 9 }), candidate({ id: 'C2', gated: 6 })], [
      finding({ based_on: ['C1'], saw: 'Buyers describe it. [[c1_week]] videos carried it.' }),
      finding({ based_on: ['C2'] }),
    ])
    for (const f of read.findings) {
      for (const text of [f.headline, f.saw, f.means, read.headline]) {
        expect(text.replace(/\[\[[a-z0-9_]+\]\]/g, '')).not.toMatch(/\d/)
        for (const m of text.matchAll(/\[\[([a-z0-9_]+)\]\]/g)) expect(read.figures[m[1]]).toBeDefined()
      }
      for (const line of [f.evidence, f.context]) for (const m of line.matchAll(/\[\[([a-z0-9_]+)\]\]/g)) expect(read.figures[m[1]]).toBeDefined()
    }
    expect(JSON.stringify(read)).not.toMatch(/"text":"[^"]/)
  })
})

// ---- The report (v3) -------------------------------------------------------------------

describe('composeWeekRead: the report rests on what prints (v3)', () => {
  // C1 and C2 carry findings; C3 carries none (the writer left it out); C4 is
  // too thin to carry one alone and the writer tried anyway.
  const cs = () => [
    candidate({ id: 'C1', gated: 8, quoteRefs: [ref('a1', 't1'), ref('a2', 't2'), ref('a3', 't3')] }),
    candidate({ id: 'C2', gated: 6, quoteRefs: [ref('b1', 't4'), ref('b2', 't5')] }),
    candidate({ id: 'C3', gated: 5, quoteRefs: [ref('c1', 't6'), ref('c2', 't7')] }),
    candidate({ id: 'C4', gated: 3, quoteRefs: [ref('d1', 't8')] }),
  ]
  const answer = (over: Partial<ReturnType<typeof written>> = {}) => written({
    findings: [
      finding({ based_on: ['C1'], headline: 'Buyers test a bag with weight in it' }),
      finding({ based_on: ['C2'], headline: 'Buyers weigh the price against lifespan' }),
      finding({ based_on: ['C4'], headline: 'Stretched' }),
    ],
    story: [
      { paragraph: 'The week was about living with a bag.', based_on: ['C1', 'C3'], quote_from: 'C1' },
      { paragraph: 'Price came up in the same terms.', based_on: ['C2'], quote_from: 'C2' },
      { paragraph: 'A thread nothing printed carries.', based_on: ['C3'], quote_from: 'C3' },
    ],
    implications: [
      { implication: 'The bag is judged a year after purchase.', based_on: ['C1', 'C2'] },
      { implication: 'An implication on nothing that prints.', based_on: ['C4'] },
      { implication: 'An implication on nothing at all.', based_on: ['C9'] },
    ],
    watch: [{ question: 'Whether buyers keep naming the same straps', based_on: ['C1'] }, { question: 'Whether a thin thread holds', based_on: ['C4'] }],
    week_in_one_line: 'Buyers judged bags this week by what they are like to live with.',
    ...over,
  })
  const run = (over: Partial<ComposeWeekArgs> = {}, w = answer()) => {
    const p = pool(cs())
    return composeWeekRead({ pool: p, standing: [], written: w, subjects: [], writerFigures: writerFigures(p), model: 'gpt-5.4', costUsd: 0.12, ...over })
  }

  it('prints the week line, the story, what it means and what to watch, each only where it rests on a printed finding', () => {
    const read = run()
    expect(read.findings.map((f) => f.headline)).toEqual(['Buyers test a bag with weight in it', 'Buyers weigh the price against lifespan'])
    expect(read.headline).toBe('Buyers judged bags this week by what they are like to live with.')
    expect(read.story.map((p) => [p.body, p.basedOn])).toEqual([
      ['The week was about living with a bag.', ['th-c1', 'th-c3']], // C3 rides along beside a printed finding
      ['Price came up in the same terms.', ['th-c2']],
    ])
    expect(read.implications).toEqual([{ body: 'The bag is judged a year after purchase.', basedOn: ['th-c1', 'th-c2'] }])
    expect(read.watch).toEqual([{ body: 'Whether buyers keep naming the same straps', basedOn: ['th-c1'] }])
    expect(read.held).toEqual(expect.arrayContaining([
      { reason: 'below reasonable: 3 videos', headline: 'Stretched' },
      { reason: 'rests on no printed finding', headline: 'A thread nothing printed carries.', section: 'story' },
      { reason: 'rests on no printed finding', headline: 'An implication on nothing that prints.', section: 'implication' },
      { reason: 'rests on no printed finding', headline: 'An implication on nothing at all.', section: 'implication' },
      { reason: 'rests on no printed finding', headline: 'Whether a thin thread holds', section: 'watch' },
    ]))
  })

  it('attaches a real quote where a paragraph points to a candidate it cites, at most two, never one a finding printed', () => {
    const read = run()
    const findingRefs = read.findings.map((f) => f.quote?.ref)
    expect(findingRefs).toEqual(['e:a1', 'e:b1'])
    // Each paragraph takes its candidate's next voice, on a thread not heard yet.
    expect(read.story.map((p) => p.quote?.ref ?? null)).toEqual(['e:a2', 'e:b2'])
    for (const p of read.story) expect(p.quote?.text).toBe('')
    // No quote's words anywhere in the stored read.
    expect(JSON.stringify(read)).not.toMatch(/"text":"[^"]/)

    const three = run({}, answer({
      story: [
        { paragraph: 'One.', based_on: ['C1'], quote_from: 'C1' },
        { paragraph: 'Two.', based_on: ['C2'], quote_from: 'C2' },
        { paragraph: 'Three.', based_on: ['C1'], quote_from: 'C1' },
        { paragraph: 'Four.', based_on: ['C1'], quote_from: 'C1' },
      ],
    }))
    expect(three.story.map((p) => p.quote?.ref ?? null)).toEqual(['e:a2', 'e:b2', null])
    expect(three.held).toContainEqual({ reason: 'past the first 3 paragraphs', headline: 'Four.', section: 'story' })
  })

  it('prints no quote where the paragraph points to a candidate it does not cite, or that candidate\'s voices are used up', () => {
    const read = run({}, answer({
      story: [
        { paragraph: 'Points elsewhere.', based_on: ['C1'], quote_from: 'C2' },
        { paragraph: 'Price once.', based_on: ['C2'], quote_from: 'C2' },
        { paragraph: 'Price again.', based_on: ['C2'], quote_from: 'C2' },
      ],
    }))
    // C2's finding took b1 and the first price paragraph b2: none is left.
    expect(read.story.map((p) => [p.body, p.quote?.ref ?? null])).toEqual([['Points elsewhere.', null], ['Price once.', 'e:b2'], ['Price again.', null]])
  })

  it("may quote a candidate that rides along beside a printed finding, from its own voices", () => {
    const read = run({}, answer({ story: [{ paragraph: 'A detail beside the straps.', based_on: ['C4', 'C1'], quote_from: 'C4' }] }))
    expect(read.story.map((p) => p.quote?.ref ?? null)).toEqual(['e:d1'])
  })

  it('fits a paragraph\'s quote to the paragraph, weighed with substance', () => {
    const read = run({ storyFit: new Map([[0, new Map([['e:a2', 0.2], ['e:a3', 0.6]])]]) })
    expect(read.story[0].quote?.ref).toBe('e:a3')
  })

  it('where the self-check contradicts the week line, the top finding\'s headline stands in', () => {
    const line = 'Buyers judged bags this week by what they are like to live with.'
    const read = run({ contradicted: new Map([[line, 'people talk about price first']]) })
    expect(read.headline).toBe('Buyers test a bag with weight in it.')
    expect(read.held).toContainEqual({ reason: 'the conversation contradicts it: people talk about price first', headline: line, section: 'week_line' })
    // And where the scrub took it.
    expect(run({}, answer({ week_in_one_line: '' })).headline).toBe('Buyers test a bag with weight in it.')
  })

  it('with no finding printed the whole report is empty, and the workings say why', () => {
    const read = run({}, answer({ findings: [finding({ based_on: ['C4'], headline: 'Stretched' })] }))
    expect(read.findings).toEqual([])
    expect(read).toMatchObject({ headline: '', story: [], implications: [], newThisWeek: [], watch: [] })
    expect(read.held.filter((h) => h.reason === 'no finding printed').map((h) => h.section)).toEqual(['week_line', 'story', 'story', 'story', 'implication', 'implication', 'implication', 'watch', 'watch'])
  })
})

describe('composeWeekRead: new this week is code\'s to decide (v3)', () => {
  const inWeek = '2026-09-23T10:00:00+00:00'
  const earlier = '2026-09-04T10:00:00+00:00'
  const cs = () => [
    candidate({ id: 'C1', gated: 8 }),
    candidate({ id: 'C2', gated: 5, isNew: true, firstHeard: inWeek, label: 'Asks for the bag in red', videoIds: ['r1', 'r2', 'r3', 'r4', 'r5'], monthVideoIds: ['r1', 'r2', 'r3', 'r4', 'r5'] }),
    candidate({ id: 'C3', gated: 4, isNew: true, firstHeard: earlier }),
    candidate({ id: 'C4', gated: 4, isNew: false, firstHeard: inWeek }),
  ]
  const run = (items: { candidate: string; sentence: string }[]) => {
    const p = pool(cs())
    return composeWeekRead({
      pool: p,
      standing: [],
      written: written({ findings: [finding({ based_on: ['C1'] })], new_this_week: items, week_in_one_line: 'x.' }),
      subjects: [],
      writerFigures: writerFigures(p),
      model: 'gpt-5.4',
      costUsd: 0,
    })
  }

  it('prints only a candidate first heard this week: new this month AND first heard inside the window', () => {
    expect(WINDOW.from < inWeek && earlier < WINDOW.from).toBe(true)
    const read = run([
      { candidate: 'C2', sentence: 'People ask whether the bag comes in red.' },
      { candidate: 'C3', sentence: 'Heard earlier this month.' },
      { candidate: 'C4', sentence: 'Heard in an earlier month.' },
      { candidate: 'C9', sentence: 'Invented.' },
      { candidate: 'C2', sentence: 'The same again.' },
    ])
    expect(read.newThisWeek).toEqual([{
      themeId: 'th-c2',
      body: 'People ask whether the bag comes in red.',
      videos: { week: 5, month: 5 },
      evidence: '[[n1_week]] videos this week · [[n1_month]] in September so far',
    }])
    expect(read.figures.n1_week).toEqual({ label: 'videos this week behind the conversation "Asks for the bag in red"', value: '5', kind: 'count' })
    expect(read.held.filter((h) => h.section === 'new').map((h) => [h.headline, h.reason])).toEqual([
      ['Heard earlier this month.', 'not first heard this week'],
      ['Heard in an earlier month.', 'not first heard this week'],
      ['Invented.', 'names no candidate'],
      ['The same again.', 'the same conversation twice'],
    ])
  })

  it('is empty, and so omitted, when nothing was first heard this week', () => {
    expect(run([]).newThisWeek).toEqual([])
    expect(run([{ candidate: 'C3', sentence: 'Heard earlier this month.' }]).newThisWeek).toEqual([])
  })

  it('a first-heard line backs the report: a story paragraph resting on it prints', () => {
    const p = pool(cs())
    const read = composeWeekRead({
      pool: p,
      standing: [],
      written: written({
        findings: [finding({ based_on: ['C1'] })],
        new_this_week: [{ candidate: 'C2', sentence: 'People ask whether the bag comes in red.' }],
        story: [{ paragraph: 'Colour came up in its own right.', based_on: ['C2'], quote_from: null }],
        week_in_one_line: 'x.',
      }),
      subjects: [],
      writerFigures: writerFigures(p),
      model: 'gpt-5.4',
      costUsd: 0,
    })
    expect(read.story.map((s) => s.body)).toEqual(['Colour came up in its own right.'])
  })
})

describe('composeWeekRead: the market\'s figures (v3, the Dashboard\'s)', () => {
  const MARKET: WeekMarketFigures = { week: { videos: 281, comments: 4910 }, month: { videos: 852, comments: 16040 } }

  it('stores them as numbers and as printed figures on the market base', () => {
    const read = compose([candidate({ id: 'C1' })], [finding({ based_on: ['C1'] })], { market: MARKET })
    expect(read.market).toEqual(MARKET)
    expect(read.figures.market_week_videos).toEqual({ label: 'videos in your market this week', value: '281', kind: 'count' })
    expect(read.figures.market_week_comments).toEqual({ label: 'comments in your market this week', value: '4,910', kind: 'count' })
    expect(read.figures.market_month_videos).toEqual({ label: 'videos in your market in September so far', value: '852', kind: 'count' })
    expect(read.figures.market_month_comments).toEqual({ label: 'comments in your market in September so far', value: '16,040', kind: 'count' })
  })

  it('prints only what was read, and a pool with none stores null', () => {
    expect(Object.keys(marketFigureTable({ week: { videos: 281, comments: null }, month: { videos: null, comments: null } }, SEP))).toEqual(['market_week_videos'])
    const read = compose([candidate({ id: 'C1' })], [finding({ based_on: ['C1'] })])
    expect(read.market).toBeNull()
    expect(Object.keys(read.figures).filter((k) => k.startsWith('market_'))).toEqual([])
  })
})
