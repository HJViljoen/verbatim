import { describe, expect, it } from 'vitest'

import { CURATION_GATE } from '../curation'
import { substituteFigures } from '../reports/cover'
import { composeWeekRead, contextLine, evidenceOf, pickFindingQuote, sureOf, type ComposeWeekArgs } from './compose'
import type { ScrubbedWeekRead } from './scrub'
import { candidate, fact, pool, ref, SEP } from './test-fixtures'
import type { PoolCandidate } from './types'
import { writerFigures, writerSubjects } from './write'

// The composer's rules, on fixtures (plan T3): the floor, the cap, the order,
// the quote, the lines code writes, the thin week. No model, no database.

type Finding = ScrubbedWeekRead['findings'][number]
const finding = (o: Partial<Finding> & { based_on: string[] }): Finding => ({
  headline: o.headline ?? 'Buyers weigh the price against how long a bag lasts',
  saw: o.saw ?? 'Buyers describe the thing plainly.',
  means: o.means ?? 'It matters because it decides the sale.',
  for: o.for ?? { sales: 'The objection is the first question.', marketing: '', content: '', leadership: 'It is the risk in the week.' },
  based_on: o.based_on,
  quote_from: o.quote_from ?? null,
})

function compose(candidates: PoolCandidate[], findings: Finding[], over: Partial<ComposeWeekArgs> = {}) {
  const p = pool(candidates)
  const standing = over.standing ?? []
  return composeWeekRead({
    pool: p,
    standing,
    written: { findings, in_short: 'The week turns on price.', standing: [] },
    subjects: writerSubjects(standing),
    writerFigures: writerFigures(p),
    model: 'gpt-5.4',
    costUsd: 0.2,
    ...over,
  })
}

describe('evidence and how sure', () => {
  it('counts distinct gated videos across the cited candidates: a shared video once', () => {
    const a = candidate({ id: 'C1', videoIds: ['v1', 'v2', 'v3', 'v4'] })
    const b = candidate({ id: 'C2', videoIds: ['v3', 'v4', 'v5'] })
    expect(evidenceOf([a, b])).toBe(5)
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
    expect(read.held.map((h) => h.reason)).toEqual(['no headline survived the scrub', 'nothing it saw survived the scrub'])
    expect(read.inShort).toBe('') // nothing printed, so nothing to sum up
  })
})

describe('composeWeekRead: a thin week', () => {
  it('has no findings and says nothing about it; where the market stands still prints', () => {
    const standing = [fact({ subjectId: 's1', name: 'Comfort', rank: 1 }), fact({ subjectId: 's2', name: 'Repair', calibration: 'failed' })]
    const p = pool([candidate({ id: 'C1' })])
    const read = composeWeekRead({ pool: p, standing, written: null, subjects: [], writerFigures: writerFigures(p), model: '', costUsd: 0 })
    expect(read).toMatchObject({ version: 1, inShort: '', findings: [], held: [], month: SEP, promptVersion: 'week_read_v1', costUsd: 0 })
    expect(read.standing.map((s) => [s.name, s.line !== '', s.sentence])).toEqual([['Comfort', true, ''], ['Repair', false, '']])
  })
})

describe('composeWeekRead: the lines code writes', () => {
  it('the evidence line is the lead candidate\'s week and its month so far, one object', () => {
    const lead = candidate({ id: 'C1', gated: 9, weekVideos: 14, monthK: 40, label: 'Price feels hard to justify' })
    const read = compose([lead, candidate({ id: 'C2', gated: 5 })], [finding({ based_on: ['C2', 'C1'] })])
    const f = read.findings[0]
    expect(f.videos).toEqual({ week: 14, month: 40 })
    expect(f.evidence).toBe('[[f1_week]] videos this week · [[f1_month]] in September so far')
    const text = substituteFigures(f.evidence, read.figures).map((p) => ('text' in p ? p.text : p.figure)).join('')
    expect(text).toBe('14 videos this week · 40 in September so far')
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

  it('keeps only the department lines with something to say', () => {
    const read = compose([candidate({ id: 'C1' })], [finding({ based_on: ['C1'] })])
    expect(read.findings[0].for).toEqual({ sales: 'The objection is the first question.', leadership: 'It is the risk in the week.' })
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
      written: {
        findings: [finding({ based_on: ['C1'] })],
        in_short: 'x',
        standing: [{ subject_id: 's2', sentence: 'Buyers weigh the price against how long a bag lasts.' }, { subject_id: 'S9', sentence: 'Nobody.' }],
      },
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
      for (const text of [f.headline, f.saw, f.means, ...Object.values(f.for), read.inShort]) {
        expect(text.replace(/\[\[[a-z0-9_]+\]\]/g, '')).not.toMatch(/\d/)
        for (const m of text.matchAll(/\[\[([a-z0-9_]+)\]\]/g)) expect(read.figures[m[1]]).toBeDefined()
      }
      for (const line of [f.evidence, f.context]) for (const m of line.matchAll(/\[\[([a-z0-9_]+)\]\]/g)) expect(read.figures[m[1]]).toBeDefined()
    }
    expect(JSON.stringify(read)).not.toMatch(/"text":"[^"]/)
  })
})
