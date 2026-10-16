import { zodResponseFormat } from 'openai/helpers/zod'
import { describe, expect, it } from 'vitest'

import { directionHits } from '../calibration'
import { SEALAND_CLIENT_ID } from '../config'
import type { CompanyContext } from './company'
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

  it('records its version: v4, the implications from the buyer\'s side (16 Oct)', () => {
    expect(WEEK_READ_PROMPT_VERSION).toBe('week_read_v4')
  })

  it('describes each report section as the owner approved it (30 Sep)', () => {
    expect(schema.properties.story.description).toContain('the week told as ONE story in two or three paragraphs, weaving the findings together')
    expect(schema.properties.story.description).toContain('never a list')
    expect(schema.properties.story.items!.properties.quote_from.description).toContain('At most two paragraphs point to one')
    expect(schema.properties.implications.items!.properties.implication.description).toContain('Intelligence, never an instruction')
    expect(schema.properties.implications.items!.properties.implication.description).toContain("What the week's talk means for the company, from the buyer's side (what people take for granted, still need settled, the part the talk turns on, or a workaround they praise), the company's claims context only and never a line's opening")
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
    // The first dry v3 read lost its lead finding to "…not by brand loyalty".
    expect(system).toContain('Never frame a claim by what the market does NOT do')
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
    expect(system).toContain('each must read on its own: a reader who never sees one paragraph still follows the next')
    expect(system).toContain('never by pointing back ("that shortlist"')
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
    expect(example).toContain('An implication, from the buyer\'s side and particular to the company, never the story again: "Owners of the company\'s own machines name its milk wand as the part of the morning clean they would change. A buyer looking at its range asks the time that clean takes, and the wand that rinses itself is the feature its owners recommend."')
    // The claim-first line is the counter-example now (v4), named as one; so are the story told again and a line true of any rival.
    expect(example).toContain('Not, the company\'s claim first, where it says its machines last a decade: "The company sells its machines on a decade of use.')
    expect(example).toContain('Not, the story told again: "Owners described the drip tray, the milk wand and the descale, and judged the machine by the routine."')
    expect(example).toContain('Not, true of any rival: "Machines are judged on upkeep."')
    // The fix round (16 Oct): the implication does not retell the finding or the story it sits beside.
    const implication = example.slice(example.indexOf('An implication'), example.indexOf('Not, the story told again'))
    expect(implication).not.toMatch(/drip tray|descale|routine/)
    expect(example).toContain('A watch line:')
    expect(example).toContain('A week line:')
    expect(example).not.toMatch(/\d/)
    expect(directionHits(example)).toEqual([])
    // Its report lines model no contrast ("…, not by the coffee", "rather
    // than choosing one"): the first dry v3 read copied the shape.
    const reportLines = example.slice(example.indexOf('A story paragraph:'))
    expect(reportLines).not.toMatch(/\brather than\b|, not (?:by|the)\b/)
    expect(example).not.toMatch(/\b(very|many|most|strong|huge|significant)\b/i)
    // Its one advice line is the one it marks as wrong.
    expect(example.match(/\bshould\b/g)).toHaveLength(1)
    expect(example).toContain('Not, advice: "The company should show the clean in its videos."')
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

describe('what it means for the company: about Sealand in particular, never the category (the lead, 30 Sep), from the buyer\'s side (v4, 16 Oct)', () => {
  const context: CompanyContext = {
    sells: { noun: 'bags', description: null, keywords: ['backpack', 'travel bag'] },
    claims: ['Bags are made from upcycled materials.'],
    posts: { week: 0, month: 4 },
  }
  const { system, user } = buildWeekReadPrompts(args({ context }))

  it("hands the writer the company's own context, as its own voice and never the market's", () => {
    expect(user).toContain('About Sealand (context for "What it means for Sealand"; none of this is what the market said):')
    expect(user).toContain('  - Bags are made from upcycled materials.')
    expect(user).toContain('Sealand published no post of its own this week. Sealand published posts of its own in September so far.')
    expect(user).not.toMatch(/\b4\b/)
    expect(system).toContain("This is Sealand's own voice, not the market's: never present it as anything buyers said.")
    expect(buildWeekReadPrompts(args()).user).toContain('About Sealand: nothing recorded beyond its name.')
  })

  it('v4: each implication is the insight from the buyer\'s side, particular to the company\'s market and buyers; the claims are context only, never a line\'s opening (16 Oct)', () => {
    expect(system).toContain('"What it means for Sealand", two or three lines (at most 3), each at most two short sentences: the insight a marketing lead at Sealand takes away from the week, never a recap of the story.')
    expect(system).toContain("Write each line from the buyer's side of the week's talk, on the one of these its candidates show most clearly:")
    for (const angle of [
      'what people in this market take for granted about what Sealand sells;',
      'what they doubt or still need settled before buying, shown by a question they ask or a problem they name;',
      'the part of the product the talk turns on (a named part, a material, a size or a finish, in the words people in this market use), and in what role: the thing people ask about, praise, blame or work around;',
      'a fix, a part or a product people praise, named for what it is and for what they praise in it, never set against something else ("cheaper", "an alternative", "instead of").',
    ]) expect(system).toContain(angle)
    expect(buildWeekReadPrompts(args({ clientId: SEALAND_CLIENT_ID })).system).toContain("what people in this market take for granted about bags like Sealand's;")
    // Össur's 11 Oct read opened all three lines on its own marketing ("Össur says its bionic devices mimic natural movement…").
    expect(system).toContain("Never about Sealand's own words. Sealand's claims (under About Sealand) are context only: at most one clause of a line may say whether the week's talk bears a claim out or tests it. Never open a line with a claim, with what Sealand says or with what it sells; never make a claim the subject of a line; never restate one.")
    expect(system).toContain('a doubt is a question asked or a problem named, never a feeling you infer')
    expect(system).toContain('Never frame a point by what something is not ("not only", "rather than the look")')
    expect(system).toContain('No abstract closing line ("sits inside the product story", "a story about identity"): name the thing, and end on the concrete point.')
    // The fix round's real dry run (16 Oct) still opened a line by listing the story's questions again.
    expect(system).toContain("Each line adds what the story does not say: never list again the things people asked about or named in the story or the findings. Name the one thing the point turns on, and say what it means for Sealand's buyers.")
    // The lead's 30 Sep ruling, kept in buyer-side words (the fix round, 16 Oct).
    expect(system).toContain("About Sealand in particular, never about the category in general: each line says something particular to Sealand's market and buyers, such as the products Sealand sells (by name where the candidates name them), the parts of them people name, or what Sealand's own customers say. A line that would be as true of any rival is not an implication for Sealand: make it particular or leave it out. The claims stay context only, at most one clause.")
    // v3's instruction to name the claim and say what the week means for it is gone.
    expect(system).not.toContain("Connect the week's findings to what Sealand sells and to what it says about itself")
    expect(system).not.toContain('name the claim or the product and say what the finding means for it')
    expect(system).not.toMatch(/alternative people praise|workaround or alternative/)
    // Unchanged: claims are not evidence, and nothing said is everything said.
    expect(system).toContain('Never say how a claim was received or whether buyers believe it unless a candidate says so')
    expect(system).toContain('never say the market ignores, overlooks or does not mention something')
    // The rest of the report keeps its v3 instructions.
    expect(system).toContain('2. story: "What happened", the week told as ONE story in two or three paragraphs (at most 3).')
    expect(system).toContain('6. week_in_one_line: the week\'s headline claim in one sentence of plain words, under 160 characters')
  })

  it('asks for literal words, naming the idioms the first dry v3 read used', () => {
    expect(system).toContain('Literal words, never an idiom or a figure of speech')
    for (const idiom of ['credible in the hand', 'right on the eye', 'a tool that still has to please', 'blunt tests', 'in the same breath']) expect(system).toContain(`"${idiom}"`)
  })
})
