import { describe, expect, it } from 'vitest'
import { applyCheck, briefAnswered, briefSubjects, BRIEF_DECIDING_SUBJECTS } from './check'
import type { WriterOutput } from './write'

const finding = (headline: string): WriterOutput['findings'][number] => ({
  headline, saw: 'What we saw.', means: 'What it means.', practice: [], sure_note: '', based_on: ['G1'], quote_from: null, continued_from: null,
})
const written: WriterOutput = {
  in_short: { summary: 'Summary.' },
  findings: [finding('Comfort decides the long-term user'), finding('Price never comes up'), finding('The clinic decides the sale')],
  competitors: [], persona_lines: [], care: [], not_sure_yet: [],
}

describe('applyCheck', () => {
  it('drops the contradicted finding with the reason, keeps the rest in order, flags the build', () => {
    const out = applyCheck(written, [
      { headline: 'Comfort decides the long-term user', verdict: 'echoes', theySay: null },
      { headline: 'Price never comes up', verdict: 'contradicts', theySay: 'price is raised in most purchase threads' },
      { headline: 'The clinic decides the sale', verdict: 'silent', theySay: null },
    ])
    expect(out.written.findings.map((f) => f.headline)).toEqual(['Comfort decides the long-term user', 'The clinic decides the sale'])
    expect(out.dropped).toEqual([{ headline: 'Price never comes up', reason: 'the conversation contradicts it: price is raised in most purchase threads' }])
    expect(out.flagged).toBe(true)
  })
  it('silence and echoes drop nothing and do not flag', () => {
    const out = applyCheck(written, written.findings.map((f) => ({ headline: f.headline, verdict: 'silent' as const, theySay: null })))
    expect(out.written.findings).toHaveLength(3)
    expect(out.flagged).toBe(false)
  })
})

describe('briefAnswered', () => {
  const brief = 'Review how the conversation about comfort and fit moved this month, for the marketing lead'

  it('reads the brief for what it is about, not for how it asks', () => {
    expect(briefSubjects(brief)).toEqual(['conversation', 'comfort', 'fit', 'moved', 'marketing', 'lead'])
    expect(briefSubjects('')).toEqual([])
    expect(briefSubjects(null)).toEqual([])
  })

  it('passes a document that takes the brief up, and names what a document missed', () => {
    const answered = briefAnswered(brief, {
      ...written,
      findings: [{ ...written.findings[0], headline: 'Comfort decides the long-term user', saw: 'Owners describe the fit changing by evening.' }],
    })
    expect(answered.answered).toBe(true)
    expect(answered.missed).not.toContain('comfort')
    expect(answered.missed).toContain('marketing')
  })

  it('fails only the document that went somewhere else entirely', () => {
    const elsewhere = briefAnswered('Review the athlete campaign and what the sponsorship did for the brand.', {
      ...written,
      findings: [{ ...written.findings[0], headline: 'Insurance decides who gets a device', saw: 'Coverage rules are the barrier people describe.' }],
      in_short: { summary: 'Coverage and cost lead again.' },
    })
    expect(elsewhere.answered).toBe(false)
    expect(elsewhere.missed).toContain('athlete')
  })

  it('has nothing to say about a brief nobody wrote', () => {
    expect(briefAnswered('', written)).toEqual({ answered: true, subjects: [], missed: [] })
    expect(briefAnswered(null, written).answered).toBe(true)
  })

  it('reads the whole document, not only the findings, and a regular plural of a word it holds', () => {
    const out = briefAnswered('Say what the audience asks about the strap.', { ...written, asked: ['How long do the straps last: nobody answers it.'] })
    expect(out.subjects).toEqual(['audience', 'asks', 'strap'])
    expect(out.answered).toBe(true)
  })

  it('matches whole words, so a subject is not answered by a word that merely contains it', () => {
    const doc = { ...written, in_short: { summary: 'The benefit is a profit outfit, and the leading brands are unfitted.' }, findings: [] }
    // fit / lead / led are all substrings of the summary above and none of
    // them is what the brief asked about.
    const out = briefAnswered('Comfort and fit, for the marketing lead', doc)
    expect(out.missed).toContain('fit')
    expect(out.missed).toContain('lead')
    expect(out.answered).toBe(false)
  })

  it('rests on the brief\'s own first words, not on the reader named at the end', () => {
    expect(BRIEF_DECIDING_SUBJECTS).toBe(3)
    // "marketing" is the fourth subject and is all this document mentions.
    const out = briefAnswered('Comfort and fit and durability, for the marketing team', {
      ...written, findings: [], in_short: { summary: 'A marketing note about pricing.' },
    })
    expect(out.missed).not.toContain('marketing')
    expect(out.answered).toBe(false)
  })
})
