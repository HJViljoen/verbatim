import { zodResponseFormat } from 'openai/helpers/zod'
import { describe, expect, it } from 'vitest'

import { directionHits } from '../calibration'
import { SEALAND_CLIENT_ID } from '../config'
import { candidate, fact, pool, ref, WINDOW } from './test-fixtures'
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
  const format = zodResponseFormat(weekReadSchema(), 'week_read')
  const schema = format.json_schema.schema as { properties: Record<string, { items?: { properties: Record<string, { description?: string }> }; description?: string }>; required: string[] }

  it('is strict structured output, in thinking order: the findings, then the report built on them, the one line last but the subjects', () => {
    expect(format.json_schema.strict).toBe(true)
    const order = ['findings', 'story', 'implications', 'new_this_week', 'watch', 'week_in_one_line', 'standing']
    expect(Object.keys(schema.properties)).toEqual(order)
    expect(schema.required).toEqual(order)
    expect(Object.keys(schema.properties.findings.items!.properties)).toEqual(['headline', 'saw', 'means', 'based_on', 'quote_from'])
    expect(Object.keys(schema.properties.story.items!.properties)).toEqual(['paragraph', 'based_on', 'quote_from'])
    expect(Object.keys(schema.properties.implications.items!.properties)).toEqual(['implication', 'based_on'])
    expect(Object.keys(schema.properties.new_this_week.items!.properties)).toEqual(['candidate', 'sentence'])
    expect(Object.keys(schema.properties.watch.items!.properties)).toEqual(['question', 'based_on'])
  })

  it('has no department lines (v3: the weekly is one general report)', () => {
    expect(schema.properties.findings.items!.properties).not.toHaveProperty('for')
    expect(JSON.stringify(schema)).not.toMatch(/\b(sales|marketing|leadership)\b/i)
  })

  it('parses a whole answer and refuses a partial one', () => {
    const ok = {
      findings: [{ headline: 'h', saw: 's', means: 'm', based_on: ['C1'], quote_from: null }],
      story: [{ paragraph: 'p', based_on: ['C1'], quote_from: 'C1' }],
      implications: [{ implication: 'i', based_on: ['C1'] }],
      new_this_week: [],
      watch: [{ question: 'Whether it holds', based_on: ['C1'] }],
      week_in_one_line: 'w',
      standing: [{ subject_id: 'S1', sentence: 'x' }],
    }
    expect(weekReadSchema().safeParse(ok).success).toBe(true)
    const { story: _story, ...noStory } = ok
    expect(weekReadSchema().safeParse(noStory).success).toBe(false)
    expect(weekReadSchema().safeParse({ ...ok, implications: [{ implication: 'i' }] }).success).toBe(false)
  })

  it('records its version', () => {
    expect(WEEK_READ_PROMPT_VERSION).toBe('week_read_v3')
  })

  it('describes each report section as the owner approved it (30 Sep)', () => {
    expect(schema.properties.story.description).toContain('the week told as ONE story in two or three paragraphs, weaving the findings together')
    expect(schema.properties.story.description).toContain('never a list')
    expect(schema.properties.story.items!.properties.quote_from.description).toContain('At most two paragraphs point to one')
    expect(schema.properties.implications.items!.properties.implication.description).toContain('Intelligence, never an instruction')
    expect(schema.properties.new_this_week.description).toContain('only candidates marked "First heard this week: yes". Empty when none is marked so.')
    expect(schema.properties.watch.items!.properties.question.description).toContain('starting with "Whether"')
    expect(schema.properties.watch.items!.properties.question.description).toContain('Never a forecast, a direction or advice')
    expect(schema.properties.week_in_one_line.description).toContain("The week's headline claim, one sentence")
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

  it('asks for one idea per finding, headlines no broader than their evidence, and never a forced pair to reach the floor (v3)', () => {
    expect(system).toContain('ONE IDEA EACH')
    expect(system).toContain('Fewer findings is fine.')
    expect(system).toContain('Never cite a second candidate just to give a finding enough evidence')
    expect(system).toContain('a candidate about comfort and one about pockets are two ideas')
    expect(system).toContain('A thin candidate with no such twin is not a finding')
    expect(system).toContain('Never join two ideas into one finding')
    expect(system).toContain('Each candidate supports at most one finding.')
    expect(system).toContain('no broader than the cited candidates show')
    // The floor stays: the writer still hears which candidates can carry one.
    expect(system).toContain('Each candidate says whether its evidence can carry a finding alone.')
  })

  it('asks for plain language and names the abstractions it does not want (T3b)', () => {
    expect(system).toContain('Plain language, for a busy person at Sealand reading on a phone. Short sentences. Concrete nouns')
    for (const w of ['a fit problem', 'legible', 'positioning', 'is tested against', 'lens']) expect(system).toContain(`"${w}"`)
    expect(system).toContain('A research report, not a memo: the analytical third person')
  })

  it('asks for a report someone would forward, top to bottom, built on the findings (v3)', () => {
    expect(system).toContain('it must read as a report worth forwarding: one account of the week with a point to it, not a list of topics')
    expect(system).toContain('Work out the findings first: the report is built on them.')
    // What happened: one story, woven, at most two voices.
    expect(system).toContain('the week told as ONE story in two or three paragraphs')
    expect(system).toContain('Never one paragraph per finding in turn, never a list in prose')
    expect(system).toContain("Build it from your findings' candidates.")
    expect(system).toContain('a paragraph that rests on no finding is deleted')
    expect(system).toContain('at most 2 paragraphs point to a voice')
    expect(system).toContain('Never write a quotation yourself.')
    // What it means: intelligence, not instructions.
    expect(system).toContain('"What it means for Sealand", two or three lines')
    expect(system).toContain('Intelligence, not instructions: say what is true about the business, never what Sealand should do.')
    for (const w of ['"should"', '"could"', '"needs to"', '"consider"', '"an opportunity"']) expect(system).toContain(w)
    // New this week: only what code marked.
    expect(system).toContain('ONLY candidates marked "First heard this week: yes"')
    expect(system).toContain('never present anything else as first heard')
    // Worth watching: an open question, never a forecast.
    expect(system).toContain('Each is a short clause starting with "Whether"')
    expect(system).toContain('Never a forecast ("will", "likely", "expect", "set to"), never a direction, never advice.')
    // The one line.
    expect(system).toContain("the week's headline claim in one sentence of plain words")
    expect(system).toContain('Code prints the real quote that best fits what you wrote')
  })

  it('has no department lines anywhere (v3)', () => {
    expect(system).not.toMatch(/for\.(sales|marketing|content|leadership)/)
    expect(system).not.toMatch(/\bdepartments?\b/i)
    expect(user).not.toContain('Speaks to:')
  })

  it('writes its own example in the house style: no digit, no deleted word, no magnitude word, no advice', () => {
    const example = system.slice(system.indexOf('An example of the register'))
    expect(example).toContain('A story paragraph:')
    expect(example).toContain('An implication:')
    expect(example).toContain('A watch line:')
    expect(example).toContain('A week line:')
    expect(example).not.toMatch(/\d/)
    expect(directionHits(example)).toEqual([])
    expect(example).not.toMatch(/\b(very|many|most|strong|huge|significant)\b/i)
    // Its one advice line is the one it marks as wrong.
    expect(example.match(/\bshould\b/g)).toHaveLength(1)
    expect(example).toContain('Not: "The company should show the clean in its videos."')
  })

  it('lists every word the direction rule deletes, and only those', () => {
    for (const w of DELETED_WORDS) {
      expect(directionHits(`The strap is ${w} here.`).length, w).toBeGreaterThan(0)
      expect(system).toContain(w)
    }
  })

  it('gives each candidate its id, label, description, kinds, evidence, subject, when it was first heard and its notes', () => {
    expect(user).toContain('C1: "Price feels hard to justify"')
    expect(user).toContain('Description: People question whether a premium bag is worth it.')
    expect(user).toContain('Kinds of comment: objections (most), questions')
    expect(user).toContain('Evidence: enough to carry a finding alone') // six lenient-gated videos
    const thin = buildWeekReadPrompts(args({ pool: pool([candidate({ id: 'C1', gated: 3 }), PRAISE, candidate({ id: 'C3' })]) }))
    expect(thin.user).toContain('C1: "Theme C1"\n  Description: What C1 is about.\n  Kinds of comment: objections (most)\n  Evidence: too little to carry a finding alone')
    expect(user).toContain('Part of the subject: Price')
    expect(user).toContain('- Questions whether the bag is worth the price.')
    expect(user).toContain('C2: "Praise for practical travel"')
    expect(user).toContain('Kinds of comment: praise (most)')
  })

  it('marks first heard THIS WEEK only where the theme is new this month and first heard inside the window, and says which may go under new_this_week', () => {
    // COTOPAXI is new this month with no first-heard date: earlier this month, not this week.
    expect(user).toContain('  First heard earlier this month (not this week)')
    expect(user).toContain('First heard this week: none. new_this_week is empty.')
    const heard = candidate({ id: 'C2', label: 'Asks for a red one', isNew: true, firstHeard: '2026-09-22T10:00:00+00:00' })
    const before = candidate({ id: 'C3', isNew: true, firstHeard: '2026-09-05T10:00:00+00:00' })
    const old = candidate({ id: 'C4', isNew: false, firstHeard: '2026-09-22T10:00:00+00:00' })
    const p = buildWeekReadPrompts(args({ pool: pool([COTOPAXI, heard, before, old]) }))
    expect(p.user).toContain('C2: "Asks for a red one"')
    expect(p.user.split('C2: "Asks for a red one"')[1].split('\n\n')[0]).toContain('  First heard this week: yes')
    expect(p.user.split('C3: "Theme C3"')[1].split('\n\n')[0]).toContain('  First heard earlier this month (not this week)')
    expect(p.user.split('C4: "Theme C4"')[1].split('\n\n')[0]).not.toContain('First heard')
    expect(p.user).toContain('First heard this week: C2. Only these may go under new_this_week.')
    expect(WINDOW.from < '2026-09-22').toBe(true)
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
