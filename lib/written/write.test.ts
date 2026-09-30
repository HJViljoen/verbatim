import { zodResponseFormat } from 'openai/helpers/zod'
import { describe, expect, it } from 'vitest'

import { directionHits } from '../calibration'
import { SEALAND_CLIENT_ID } from '../config'
import { candidate, fact, pool, ref } from './test-fixtures'
import {
  buildWeekReadPrompts, DELETED_WORDS, weekReadSchema, WEEK_READ_PROMPT_VERSION, writerFigures, type WeekWriterArgs,
} from './write'

// The writer's prompt and schema (plan T3), on fixtures.

const COTOPAXI = candidate({
  id: 'C1',
  label: 'Price feels hard to justify',
  description: 'People question whether a premium bag is worth it.',
  kinds: ['objection', 'question'],
  dominantKind: 'objection',
  subjectId: 'price',
  isNew: true,
  notes: ['Questions whether the bag is worth the price.', 'Compares the price with a cheaper pack.'],
  quoteRefs: [ref('secret-evidence-id', 't1')],
  weekVideos: 14,
  monthK: 40,
})
const PRAISE = candidate({ id: 'C2', label: 'Praise for practical travel', kinds: ['praise'], dominantKind: 'praise' })

const STANDING = [
  fact({ subjectId: 'comfort', name: 'Comfort', rank: 4, contents: ['Straps dig in'], notes: ['Straps dig into the shoulders.'] }),
  fact({ subjectId: 'price', name: 'Price', calibration: 'provisional', rank: 2, notes: ['Weighs price against lifespan.'] }),
  fact({ subjectId: 'looks', name: 'Looks', rank: 1 }), // no material: not asked about
  fact({ subjectId: 'repair', name: 'Repair & warranty', calibration: 'failed', notes: ['Should never be shown.'] }),
]

function args(over: Partial<WeekWriterArgs> = {}): WeekWriterArgs {
  const p = pool([COTOPAXI, PRAISE, candidate({ id: 'C3' })])
  return { company: 'Sealand', pool: p, standing: STANDING, previous: { headlines: ['Buyers test the straps first'] }, figures: writerFigures(p), ...over }
}

describe('the schema', () => {
  it('is strict structured output, in thinking order', () => {
    const format = zodResponseFormat(weekReadSchema(), 'week_read')
    expect(format.json_schema.strict).toBe(true)
    const schema = format.json_schema.schema as { properties: Record<string, unknown>; required: string[] }
    expect(Object.keys(schema.properties)).toEqual(['findings', 'in_short', 'standing'])
    expect(schema.required).toEqual(['findings', 'in_short', 'standing'])
    const finding = (schema.properties.findings as { items: { properties: Record<string, unknown> } }).items
    expect(Object.keys(finding.properties)).toEqual(['headline', 'saw', 'means', 'for', 'based_on', 'quote_from'])
    expect(Object.keys((finding.properties.for as { properties: Record<string, unknown> }).properties)).toEqual(['sales', 'marketing', 'content', 'leadership'])
  })

  it('parses a whole answer and refuses a partial one', () => {
    const ok = {
      findings: [{ headline: 'h', saw: 's', means: 'm', for: { sales: '', marketing: '', content: '', leadership: 'l' }, based_on: ['C1'], quote_from: null }],
      in_short: 'i',
      standing: [{ subject_id: 'S1', sentence: 'x' }],
    }
    expect(weekReadSchema().safeParse(ok).success).toBe(true)
    expect(weekReadSchema().safeParse({ ...ok, findings: [{ ...ok.findings[0], for: { sales: '' } }] }).success).toBe(false)
  })

  it('records its version', () => {
    expect(WEEK_READ_PROMPT_VERSION).toBe('week_read_v2')
  })

  it('describes each department line as what the finding tells that team, never a restatement (T3b)', () => {
    const schema = zodResponseFormat(weekReadSchema(), 'week_read').json_schema.schema as { properties: { findings: { items: { properties: { for: { properties: Record<string, { description: string }> } } } } } }
    const lines = schema.properties.findings.items.properties.for.properties
    expect(lines.sales.description).toContain('what buyers will raise about this, and how they put it')
    expect(lines.marketing.description).toContain('what the market values or doubts here, in the words people use')
    expect(lines.content.description).toContain('what people ask about or stop on here that the team could answer or show')
    expect(lines.leadership.description).toContain('what this says about the business')
    for (const d of Object.values(lines)) {
      expect(d.description).toContain('would only restate the finding')
      expect(d.description).toContain('never what the team should do')
    }
  })
})

describe('the figure table the writer may cite', () => {
  it('is each candidate\'s week and month to date, as keys with labels', () => {
    const f = writerFigures(pool([COTOPAXI]))
    expect(Object.keys(f)).toEqual(['c1_week', 'c1_month'])
    expect(f.c1_week).toEqual({ label: 'videos this week in which people talked about "Price feels hard to justify"', value: '14', kind: 'count' })
    expect(f.c1_month.label).toBe('videos in September so far in which people talked about "Price feels hard to justify"')
  })
})

describe('the prompt', () => {
  const { system, user, subjects } = buildWeekReadPrompts(args())

  it('is the company\'s consumer researcher, writing for everyone at the company, about its market', () => {
    expect(system).toContain('You are the consumer researcher at Sealand.')
    expect(system).toContain('for everyone at Sealand')
    // The fixtures' client is not Sealand's id: the generic words.
    expect(system).toContain("The market is the people worldwide buying and talking about what Sealand sells, not only Sealand's own customers.")
    expect(buildWeekReadPrompts(args({ clientId: SEALAND_CLIENT_ID })).system).toContain("buying and talking about bags like Sealand's")
  })

  it('carries the house style and §0a', () => {
    expect(system).toContain('Never "we", "our", "us" or "you"')
    expect(system).toContain('never an instruction')
    expect(system).toContain('Intelligence, not advice')
    expect(system).toContain('The market only.')
    expect(system).toMatch(/Never mention data, sources, samples, coverage, searches, updates, platforms, this service, a tool, a model, AI or Verbatim/)
    expect(system).toContain('Never say how big a theme is or how it ranks against another')
    expect(system).toContain('Never explain why something is not said')
    expect(system).toContain('Never type a digit')
    expect(system).toContain('Do not use intensity or frequency words')
    expect(system).toContain('You may NOT say which WAY anything is going')
    expect(system).toContain('No dashes between clauses')
    // Its own words hold to the rule it states.
    expect(system).not.toMatch(/[—–]/)
  })

  it('asks for one idea per finding, three or four when the candidates hold them, and headlines no broader than their evidence (T3b)', () => {
    expect(system).toContain('ONE IDEA EACH. Write three or four when the candidates hold that many distinct ideas, fewer only when they do not')
    expect(system).toContain('Never join two ideas into one finding')
    expect(system).toContain('Cite several candidates only when they say the same thing in different words')
    expect(system).toContain('Each candidate supports at most one finding.')
    expect(system).toContain('no broader than the cited candidates show')
  })

  it('asks for plain language and names the abstractions it does not want (T3b)', () => {
    expect(system).toContain('Plain language, for a busy person at Sealand reading on a phone. Short sentences. Concrete nouns')
    for (const w of ['a fit problem', 'legible', 'positioning', 'is tested against', 'lens']) expect(system).toContain(`"${w}"`)
    expect(system).toContain('A research read, not a memo: the analytical third person')
  })

  it('asks each department line for what that team hears, and "" over a restatement (T3b)', () => {
    expect(system).toContain('what buyers will raise with a salesperson about this, and how they frame it')
    expect(system).toContain('what the market values or doubts here, in the words people use for it')
    expect(system).toContain('what people ask about or stop on here that the content team could answer or show')
    expect(system).toContain('what the finding says about the business')
    expect(system).toContain('A line that only restates the finding for a department ("For content: bag talk centres on how it carries") says nothing: leave it ""')
    expect(system).toContain('never what the team should do')
    // The example writes all four, for a different market.
    for (const d of ['for.sales', 'for.marketing', 'for.content', 'for.leadership']) expect(system).toContain(d)
    expect(system).toContain('Code prints the real quote that best fits what you wrote')
  })

  it('writes its own example in the house style: no digit, no deleted word, no magnitude word', () => {
    const example = system.slice(system.indexOf('Example of one finding'))
    expect(example).not.toMatch(/\d/)
    expect(directionHits(example.replace(/"[^"]*Too broad[^"]*"/, ''))).toEqual([])
    expect(example).not.toMatch(/\b(very|many|most|strong|huge|significant)\b/i)
  })

  it('lists every word the direction rule deletes, and only those', () => {
    for (const w of DELETED_WORDS) {
      expect(directionHits(`The strap is ${w} here.`).length, w).toBeGreaterThan(0)
      expect(system).toContain(w)
    }
  })

  it('gives each candidate its id, label, description, kinds, departments, subject, the new flag and its notes', () => {
    expect(user).toContain('C1: "Price feels hard to justify"')
    expect(user).toContain('Description: People question whether a premium bag is worth it.')
    expect(user).toContain('Kinds of comment: objections (most), questions')
    expect(user).toContain('Speaks to: sales, content, leadership')
    expect(user).toContain('Evidence: enough to carry a finding alone') // six lenient-gated videos
    const thin = buildWeekReadPrompts(args({ pool: pool([candidate({ id: 'C1', gated: 3 }), PRAISE, candidate({ id: 'C3' })]) }))
    expect(thin.user).toContain('C1: "Theme C1"\n  Description: What C1 is about.\n  Kinds of comment: objections (most)\n  Speaks to: sales, leadership\n  Evidence: too little to carry a finding alone')
    expect(user).toContain('Part of the subject: Price')
    expect(user).toContain('First heard this month: yes')
    expect(user).toContain('- Questions whether the bag is worth the price.')
    expect(user).toContain('C2: "Praise for practical travel"')
    expect(user).toContain('Kinds of comment: praise (most)')
  })

  it('gives the subjects as words, a rank only where the size prints, no failed subject, nothing with no material', () => {
    expect(subjects.map((s) => [s.handle, s.fact.name])).toEqual([['S1', 'Comfort'], ['S2', 'Price']])
    expect(user).toContain('S1: Comfort (the fourth biggest subject in the market this month)')
    expect(user).toContain('Themes inside it this month: "Straps dig in"')
    expect(user).toContain('S2: Price\n') // provisional: no rank
    expect(user).not.toContain('Repair')
    expect(user).not.toContain('Should never be shown')
    expect(user).not.toMatch(/\bLooks\b/)
  })

  it('carries last week\'s headlines, and says so when there were none', () => {
    expect(user).toContain("Last week's headlines:\n- Buyers test the straps first")
    expect(system).toContain('Continuity')
    const none = buildWeekReadPrompts(args({ previous: null }))
    expect(none.user).toContain('Last week: no read.')
    expect(none.system).not.toContain('Continuity')
  })

  it('offers figure keys, never a value, and never a quote', () => {
    expect(user).toContain('[[c1_week]]: videos this week in which people talked about "Price feels hard to justify"')
    expect(user).not.toMatch(/\b14\b|\b40\b/)
    expect(user).not.toContain('secret-evidence-id')
    expect(user).not.toMatch(/\be:\S/) // no quote ref
    expect(`${system}\n${user}`).not.toMatch(/[—–]/)
  })
})
