import { readFileSync } from 'node:fs'

import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { RUN_MODEL_BUDGET_USD, SUBJECT_READS_BUDGET_USD, SUBJECT_READS_RUN_MARGIN_USD } from '../config'
import type { SubjectPlacement } from '../pages/subject-place'
import { AFTER_GATHER_STEPS } from '../reading/week-line'
import { weeklyReadSnapshotData } from '../reports/weekly-read-build'
import { fakeDb } from '../test/fake-db'
import { sealandRead } from '../test/weekly-read-fixture'
import { WeekReadTimeoutError } from './deadline'
import type { DatedEvidence } from './evidence'
import { subjectReadOf } from './published'
import { scrubWeekText } from './scrub'
import {
  buildSubjectReadPrompts, finishSubjectRead, headlineRefused, SpendGate, type HeadlineRefusal, subjectReadAttemptMaxUsd, subjectReadSchema, subjectReadMaterial, subjectReadsCapLeft, subjectReadsData,
  subjectReadsHeadroom, subjectReadsRoom, thinSubjectRead, SUBJECT_READ_MAX_OUTPUT_TOKENS, SUBJECT_READ_PROMPT_VERSION, type SubjectReadMaterial, type SubjectReadTheme,
} from './subject-reads'
import {
  buildSubjectReads, generateSubjectRead, keepsRead, readDaysOf, runSubjectReadsStep, saveSubjectReads, SubjectReadBudgetError, SubjectReadWriteError,
  type BuiltSubjectReads, type SubjectReadInputs, type SubjectReadsStepDeps,
} from './subject-reads-step'
import type { SubjectRead, SubjectReadsData, WeekReadData } from './types'
import type { ParseClient } from './write-model'
import { INTENSITY_RULE } from './write'

// A TRACKED SUBJECT'S OWN READ (14 Oct): grouped by the pages' placement, from
// the market's gated talk, written by one call per ready subject with enough
// to say (a thin one gets code's line), scrubbed as the week read is, stored
// on the run's week read row, and an additive step in its own position.

const CLIENT = '00000000-0000-4000-8000-0000000000c0'
const RUN = '00000000-0000-4000-8000-0000000000a1'
const OCT = '2026-10-01'
const WINDOW = { from: '2026-10-04T11:45:54.031Z', to: '2026-10-11T04:00:32.885Z' }
const admin = {} as SupabaseClient

const ev = (o: { i: number; insight: string; day: number; text?: string; audience?: string; lane?: string; segment?: string; redacted?: boolean }): DatedEvidence => ({
  insightId: o.insight,
  kind: 'pain_point',
  description: `People say thing ${o.insight}.`,
  evidenceId: `e${o.i}`,
  rank: 1,
  commentId: `c${o.i}`,
  commentDate: `2026-10-${String(o.day).padStart(2, '0')}T10:00:00.000Z`,
  author: `a${o.i}`,
  text: o.redacted ? '' : o.text ?? 'My insurance turned down the knee and the appeal took months of paperwork.',
  ...(o.redacted ? { redacted: true } : {}),
  video: { uuid: `v${o.i}`, platform: 'tiktok', videoId: `n${o.i}`, audience: o.audience ?? 'industry-other', lane: o.lane ?? 'full', accountName: `acct${o.i}` },
  context: { platform: 'tiktok', videoId: `n${o.i}`, caption: 'c', hashtags: [], topics: [], accountName: `acct${o.i}`, isClient: false, isCompetitor: false, competitorName: null, source: 'discovered', segment: o.segment ?? 'market' },
})

const SUBJECT = { id: 'cost', name: 'Cost & access', description: 'Comments about what prosthetic devices cost, insurance, medical aid and funding.' }

/** Three tiers: Cost (ready), Fit (open). A conversation of four insights,
 *  three Cost's, is Cost's; one where Fit holds three and Cost one is Fit's. */
const PLACED: SubjectPlacement = {
  names: new Map([['cost', 'Cost & access'], ['fit', 'Fit & comfort']]),
  order: ['cost'],
  subjectsOf: new Map(['i1', 'i2', 'i3', 'i9', 'i5'].map((i) => [i, ['cost']])),
  pending: { order: ['fit'], subjectsOf: new Map(['i6', 'i7', 'i8'].map((i) => [i, ['fit']])) },
  failed: null,
}
const THEMES: SubjectReadTheme[] = [
  { themeId: 't-ins', label: 'Insurance refusals', description: 'Appeals against refused cover.', kind: 'pain_point', memberIds: ['i1', 'i2', 'i3', 'i4'] },
  { themeId: 't-fit', label: 'Socket fit', description: 'How a socket sits.', kind: 'pain_point', memberIds: ['i5', 'i6', 'i7', 'i8'] },
]
const MEMBERS = new Set(['i1', 'i2', 'i3', 'i9', 'i5'])
const MARKET = new Set(['industry-other', 'competitor:Ottobock'])

const material = (evidence: DatedEvidence[]): SubjectReadMaterial =>
  subjectReadMaterial({ clientId: CLIENT, subject: SUBJECT, members: MEMBERS, evidence, market: MARKET, themes: THEMES, placed: PLACED })

const RICH_EVIDENCE = [
  ev({ i: 1, insight: 'i1', day: 2 }), ev({ i: 2, insight: 'i2', day: 3, text: 'Medical aid will not fund a microprocessor knee, so the cost is on us.' }),
  ev({ i: 3, insight: 'i3', day: 6, text: 'The funding paperwork for a new socket took half a year.' }),
  ev({ i: 4, insight: 'i9', day: 7, text: 'Insurance covers the liner but the cost of the foot is ours.' }),
  // Fit's conversation holds one Cost member: its talk is loose, not inside.
  ev({ i: 5, insight: 'i5', day: 8, text: 'The insurance would not cover a new socket after my fit changed.' }),
  // Not the market (the client's own post), not the read lane, a maker's video, a demographic citation: none counts.
  ev({ i: 6, insight: 'i1', day: 8, audience: 'client' }), ev({ i: 7, insight: 'i2', day: 8, lane: 'light' }),
  ev({ i: 8, insight: 'i3', day: 8, segment: 'maker' }), ev({ i: 9, insight: 'i9', day: 8, redacted: true }),
]

describe('subjectReadMaterial: the pages\' grouping, the market\'s gated talk', () => {
  it('places conversations by placeSubject: a ready subject\'s own; one an open subject takes is not inside it', () => {
    const m = material(RICH_EVIDENCE)
    expect(m.conversations.map((c) => c.themeId)).toEqual(['t-ins'])
    expect(m.conversations[0]).toMatchObject({ label: 'Insurance refusals', videos: 3, notes: expect.arrayContaining(['People say thing i1.', 'People say thing i2.', 'People say thing i3.']) })
    // Its members' talk outside its conversations is loose.
    expect(m.loose).toEqual(expect.arrayContaining(['People say thing i9.', 'People say thing i5.']))
    expect(m).toMatchObject({ videos: 5, heard: true, enough: true })
  })

  it('never counts the client\'s own posts, another lane, a maker\'s video or a demographic citation', () => {
    const m = material(RICH_EVIDENCE.slice(5))
    expect(m).toMatchObject({ videos: 0, heard: false, enough: false, conversations: [], loose: [] })
  })

  it('is thin under three videos or two notes', () => {
    expect(material(RICH_EVIDENCE.slice(0, 2)).enough).toBe(false)
    expect(material(RICH_EVIDENCE.slice(0, 3)).enough).toBe(true)
  })
})

describe('the writer\'s prompt', () => {
  const m = material(RICH_EVIDENCE)
  const { system, user } = buildSubjectReadPrompts({ company: 'Össur', clientId: CLIENT, month: OCT, complete: false, material: m, context: null })
  /** The coffee example's positive text for one field: saying and means are
   *  one quotation each; the headlines are the three good ones, before the
   *  first counter-example. */
  const example = (field: string): string => {
    if (field === 'headline') {
      const line = system.split('\n').find((l) => l.startsWith('- headline, three good ones')) ?? ''
      return [...line.slice(0, line.indexOf('Not,')).matchAll(/"([^"]+)"/g)].map((x) => x[1]).join(' | ')
    }
    const line = system.split('\n').find((l) => l.startsWith(`- ${field}: "`)) ?? ''
    const start = `- ${field}: "`.length
    return line.slice(start, line.indexOf('"', start))
  }
  const GOOD_HEADLINES = ['Owners take good coffee for granted and count the cleaning time', 'The milk wand is the part owners blame for a slow clean', 'Owners praise a wand that rinses itself for the minutes it saves']

  it('asks for what people said, then what it means, with the week read\'s rules', () => {
    expect(system).toContain('1. saying: what people said about Cost & access this month')
    expect(system).toContain('2. means: what this talk means for Össur')
    expect(system).toMatch(/Intelligence, not instructions/)
    expect(system).toMatch(/You have NO numbers/)
    expect(system).toContain('Never write an amount, a price, a percentage or a count in words either: "fifty thousand euros" is a number too.')
    expect(system).toMatch(/Never a medical or clinical claim/)
    expect(system).toMatch(/Never mention how anything was found/)
    // The meaning rests on what it was given, compares nothing and leaves out what it is unsure of.
    expect(system).toMatch(/Every claim rests on the notes given, and on nothing else/)
    expect(system).toMatch(/never say how Össur's products reach people/)
    expect(system).toMatch(/No comparison of one channel, product, group or brand with another/)
    expect(system).toMatch(/When unsure .* leave it out/)
    expect(system).not.toMatch(/—/)
  })

  it('v2: the meaning is the insight from the buyer\'s side, the company\'s claims context only (Heinrich, 14 Oct)', () => {
    expect(system).toContain('the insight a marketing lead at Össur takes away, never a summary of the saying paragraphs')
    expect(system).toContain('Write it from the buyer\'s side of the talk')
    for (const angle of [
      'what people here take for granted about what Össur sells',
      'what they doubt or still need settled before buying, shown by a question they ask or a problem they name',
      'the part of the product the talk turns on (a named part, a material, a size or a finish, in the words people in this market use)',
      'a fix, a part or a product people praise, named for what it is and for what they praise in it, never set against something else ("cheaper", "an alternative", "instead of")',
    ]) expect(system).toContain(angle)
    // Its own claims are context, never the subject: the v1 reads opened on them.
    expect(system).toContain('Never open with a claim, never make one the subject, never restate one.')
    // Heinrich, 17 Oct: v2's one clause on a claim became a closing formula
    // (five of nine dry meanings ended "That tests {co}'s claim…"), so none.
    expect(system).toContain('never a sentence or a clause about a claim, never that the talk bears one out, tests it or supports it, and never a close on one ("That tests Össur\'s claim…")')
    expect(system).not.toMatch(/at most one clause/)
    expect(system).not.toMatch(/Connect what people said to what Össur sells and to what it says about itself/)
    // No inferred feeling, no "not X" framing, no abstract close.
    expect(system).toMatch(/a doubt is a question asked or a problem named, never a feeling you infer/)
    expect(system).toMatch(/Never frame a point by what something is not/)
    expect(system).toMatch(/No abstract role words .*End on the concrete point/)
    // "comes up" and "is new" read as a direction and delete their sentence:
    // the trial wordings lost one to "comes up" and one to "is new".
    expect(system).toMatch(/Never "comes up", "up" or "down"/)
    expect(system).toMatch(/never "is new" or "are new"/)
    expect(scrubWeekText('When someone is new to a prosthesis, peers answer.', 700, { allow: [] }).counts.droppedDirection).toBe(1)
    // The example models the insight, and names what not to write.
    expect(system).toMatch(/Not, the company's claim restated: /)
    expect(system).toMatch(/Not, an abstract close: /)
  })

  it('v3: tenant-neutral, for bags as for prostheses (the fresh check\'s three should-fixes, 16 Oct)', () => {
    expect(SUBJECT_READ_PROMPT_VERSION).toBe('subject_read_v3')
    const sealand = buildSubjectReadPrompts({ company: 'Sealand', clientId: 'ac16988e-c4f3-4baf-b388-73895852a554', month: OCT, complete: false, material: m, context: null }).system
    // The tenant's own category words where the product has them (WHAT_THEY_SELL), its name otherwise.
    expect(sealand).toContain('what people here take for granted about bags like Sealand\'s')
    expect(system).toContain('what people here take for granted about what Össur sells')
    for (const p of [system, sealand]) {
      // (1) No prosthetic part list, no prosthesis wording, for any tenant.
      expect(p).not.toMatch(/socket|the knee|liner|prosthe|a device like/i)
      expect(p).toContain('"someone buying for the first time"')
      // (3) No comparative invitation the comparison scrub would miss: "cheaper" is named only as what never to write.
      expect(p).not.toMatch(/a cheaper route|cheapest/)
      expect(p.match(/cheaper/g)).toHaveLength(1)
      expect(p).toContain('never set against something else ("cheaper", "an alternative", "instead of")')
      // The word list's alternatives survive the scrub it describes ("going up stairs" did not: "going up" is a movement frame).
      expect(p).toContain('"taking the stairs"')
      expect(p).not.toContain('going up stairs')
    }
    expect(scrubWeekText('People talk about taking the stairs.', 700, { allow: [] }).text).toBe('People talk about taking the stairs.')
    expect(scrubWeekText('People talk about going up stairs.', 700, { allow: [] }).text).toBe('')
    // (2) The coffee example keeps the rules it states: no inferred feeling, no "not X" frame, no rank.
    const means = example('means')
    expect(means).toBe('The milk wand carries the judgement on the morning clean. How long cleaning takes is settled before buying, even by owners who like the coffee, and a wand that rinses itself is the feature owners name to each other.')
    // The final round (16 Oct): seven of nine real meanings copied "… is taken for granted here. What still needs settling…".
    expect(means).not.toMatch(/taken for granted here|still needs settl/)
    expect(system).toContain('Take these in any order and in your own words: open on whichever point the notes make clearest, never on a set formula ("… is taken for granted here. What still needs settling…").')
    // The fix round (16 Oct): the meaning is not the saying again, and the headline summarises neither.
    expect(means).not.toMatch(/drip tray/)
    // Each good headline names at most the one part its point turns on, never the saying's list.
    for (const h of example('headline').split(' | ')) expect(h.match(/drip tray|milk wand|descale/g)?.length ?? 0, h).toBeLessThanOrEqual(1)
    expect(system).toContain('Not, the saying told again: "Owners describe the drip tray, the milk wand and the descale, and buyers ask how long the clean takes."')
    expect(system).toContain('Each part does its own job: saying tells what was said; means says what it adds up to for the business, without telling it again; headline is the one point.')
    for (const field of ['saying', 'means', 'headline']) {
      const text = example(field).replace(/ \| /g, '. ')
      expect(text.length).toBeGreaterThan(20)
      expect(text).not.toMatch(/forgive|\bbut not\b|\bnot\s+(?:a|an|the|only|one)\b|before anything else|\bthan\b|before they asked/i)
      // The example passes the scrub its own rules stand for.
      expect(scrubWeekText(text.replace(/\\n/g, ' '), 2_000, { allow: [] }).counts.dropped).toBe(0)
    }
    // The inferred feeling is now a counter-example, named as one.
    expect(system).toContain('Not, a feeling inferred and a "not X" frame: "Owners forgive the noise, but not a brush every morning."')
  })

  it('v3: asks for a headline, the subject\'s main point in one line from the buyer\'s side, under the meaning\'s rules', () => {
    expect(system).toContain('3. headline: the subject\'s main point in one line, written last. It is printed on its own above "means", with no figure beside it: the one point a reader takes away, never a summary of "saying" or of "means".')
    // The caps: asked for 80 and 12, held at 90 and 14 with no slack (the fix round).
    expect(system).toContain('At most about 12 words and 80 characters; a line over 14 words or 90 characters is deleted. A plain statement in sentence case (a capital on the first word and on names only), with no full stop or other mark at the end.')
    // The headline round (16 Oct): five of nine real headlines opened "Buyers ask", a report that questions exist.
    expect(system).toContain('The insight: what the talk SHOWS from the buyer\'s side, that is what decides it for buyers, what they take for granted, or which part carries their judgement. Name the thing they name.')
    expect(system).toContain('Never a report that people ask, talk or discuss: never open on "Buyers ask", "People ask", "People talk", "Buyers want … explained" or any other report of asking or talking. Say what the asking shows.')
    expect(system).not.toMatch(/a claim about what buyers do, ask or decide/)
    // The first v3 dry run (16 Oct) wrote three of five headlines as "Buyers judge … by …", the example's own frame.
    // The headline round's example "…decides the purchase once…" became the frame six of nine copied (the final round).
    expect(system).toContain('the subjects\' headlines are read side by side, so never a stock frame ("Buyers judge … by …", "… is judged by …", "… decides … once …"), and never the example\'s shape.')
    expect(example('headline')).not.toMatch(/\bjudge/i)
    // The second v3 dry run wrote Fit & comfort's as "Socket length, pressure and heat need settling" (16 Oct).
    expect(system).toContain('ONE point about the subject, never a list of three nouns ("Milk wand, descale and drip tray need settling").')
    // Three good headlines of three different shapes, never one to copy.
    expect(example('headline')).toBe(GOOD_HEADLINES.join(' | '))
    expect(system).toContain('(what is taken for granted)')
    expect(system).toContain('(the part that carries the judgement)')
    expect(system).toContain('(what people praise, and why)')
    expect(system).toContain('Not, a stock frame: "The morning clean decides the purchase once the coffee is good".')
    for (const good of GOOD_HEADLINES) {
      expect(scrubWeekText(good, 90, { allow: [], headline: true }).text).toBe(good)
      expect(headlineRefused(good, 'Cleaning and upkeep')).toBeNull()
      expect(good).not.toMatch(/^(?:Buyers|People|Owners) (?:ask|want|talk)/)
      expect(good.split(' ').length).toBeLessThanOrEqual(12)
      expect(good.length).toBeLessThanOrEqual(80)
    }
    expect(system).toContain('Never a label or a topic ("Cost & access", "Questions about Cost & access"), never the subject\'s name restated as a claim ("Cost & access matters to buyers"), and never Össur\'s own claim or a line about Össur\'s words.')
    // It promises deletion only for what code deletes (the fix round): an inferred feeling, a "not X" frame and a rank are "never".
    expect(system).toContain('Every rule for "means" and every house rule below holds here too. Never an inferred feeling, a "not X" frame, a size or a rank. A headline is deleted, and the subject prints without one, where it ends on a question mark or opens on "Does", "Is" or another such verb before its subject; is the subject\'s name alone; opens on people asking, talking, discussing or wondering ("Buyers ask", "People talk"); opens on an instruction ("Make the", "Show the"); holds a forecast ("will", "set to" before a verb), a comparison ("than", "as much as", "the best", "the most", one thing chosen or preferred "over" another, "prefer" one thing "to" another, "ahead of" a rival), the first or second person ("I", "we", "you"), a word the house style removes ("many", "most"), a digit, an amount in words, a direction word or, in a medical market, a medical claim.')
    expect(system).not.toContain('A headline that breaks one is deleted')
    expect(system).toMatch(/Not, a report of asking: "Buyers ask how long the clean takes before they buy"\. Not, a stock frame: .*Not, a summary and a list: .*Not, a question: .*Not, the subject's name restated: .*Not, the company's claim: /)
    // "coverage" alone is the method ban's word: Össur's Cost read lost a sentence to it.
    expect(system).toContain('- For insurance, write "insurance cover" or "insurance", never "coverage" on its own: a sentence with a bare "coverage" is deleted.')
    expect(scrubWeekText('Buyers ask about price, coverage and where to buy.', 500, { allow: [] }).text).toBe('')
    expect(scrubWeekText('Buyers ask about price, insurance cover and where to buy.', 500, { allow: [] }).text).toBe('Buyers ask about price, insurance cover and where to buy.')
    // The schema asks for it, in thinking order: what was said, what it means, then the line.
    expect(Object.keys(subjectReadSchema().shape)).toEqual(['saying', 'means', 'headline'])
    expect(subjectReadSchema().shape.headline.description).toMatch(/ONE claim about what the talk shows \(what decides it for buyers, what they take for granted, or which part carries their judgement\), never a report that people ask or talk, a plain statement in sentence case, at most about 12 words and 80 characters, no full stop at the end\. Never a question, never a list, never the subject's name restated, never the company's own claim\./)
  })

  it('the fix round: no comparison is allowed anywhere in it, and only what code deletes is promised as deleted', () => {
    // The shared intensity rule, less its sentence allowing a comparison the data shows.
    expect(INTENSITY_RULE).toContain('Do not use intensity or frequency words')
    expect(INTENSITY_RULE).not.toMatch(/Comparisons|allowed only where/)
    expect(system).toContain(INTENSITY_RULE)
    expect(system).not.toMatch(/allowed only where the input data directly shows them/)
    expect(system).toContain('never "as much as", "more than", "less than", "rather than" or any "than", never "the best" or "the most", never one thing "over" another. A sentence with "than" or "as much as" is deleted.')
    // "The affordable alternative people praise" (Össur's dry run): what is praised is named for what it is.
    expect(system).not.toMatch(/alternative people praise|a cheaper route|workaround or alternative/)
    for (const promise of [/inferred feeling[^.]*is deleted/, /"not X" frame[^.]*is deleted/]) expect(system).not.toMatch(promise)
  })

  it('hands it the conversations inside the subject and the notes, never a comment or a figure', () => {
    expect(user).toContain('The month: October so far.')
    expect(user).toContain('C1: "Insurance refusals"')
    expect(user).toContain('  - People say thing i1.')
    expect(user).toContain('Other things people said about Cost & access, outside those conversations, in paraphrase:')
    expect(user).not.toContain('My insurance turned down')
    // No count, no share: the writer has no figure to quote.
    expect(user).not.toMatch(/\b\d+\s*(?:videos?|comments?|%)/)
    expect(buildSubjectReadPrompts({ company: 'Össur', clientId: CLIENT, month: '2026-09-01', complete: true, material: m }).user).toContain('The month: September, the whole month.')
  })
})

describe('finishSubjectRead and the thin line', () => {
  const m = material(RICH_EVIDENCE)

  it('scrubs as the week read: a digit, a direction word, a sentence about how it was made, and advice in what it means', () => {
    const { read, scrub } = finishSubjectRead(m, {
      saying: [
        'People describe refusals as a long fight. Talk about cover is growing. They name three appeals.',
        'Parents file the paperwork. This report reads the comments.',
        'A third paragraph is never kept.',
      ],
      means: 'Össur sells knees through insurers. Össur should show the paperwork. It is likely to continue.',
    }, { company: 'Össur', allow: [] })
    expect(read).toEqual({
      subjectId: 'cost', name: 'Cost & access', status: 'ready',
      saying: ['People describe refusals as a long fight. They name three appeals.', 'Parents file the paperwork.'],
      means: 'Össur sells knees through insurers.',
      basedOn: ['t-ins'],
    })
    expect(scrub.dropped).toBeGreaterThanOrEqual(4)
  })

  it('drops a price written out in words like a digit (Össur\'s Cost & access read, 16 Oct), and keeps a bare count', () => {
    const { read, scrub } = finishSubjectRead(m, {
      saying: ['People describe prosthetic prices as out of reach, from bionic hands priced around fifty thousand euros to sockets priced near fifteen thousand dollars before insurance. They name one insurer and two appeals.'],
      means: 'Cover decides the fitting. A socket costs a few hundred dollars.',
    }, { company: 'Össur', allow: [] })
    expect(read.saying).toEqual(['They name one insurer and two appeals.'])
    expect(read.means).toBe('Cover decides the fitting.')
    expect(scrub).toEqual({ dropped: 2, leaked: true })
  })

  it('a sentence opening on a capital outside A to Z (Össur) is scrubbed on its own, never with its neighbour (the shared splitter, 14 Oct)', () => {
    const { read } = finishSubjectRead(m, { saying: ['People name the paperwork. Össur\'s knees are named too.'], means: 'Cover decides the fitting. Össur should show it.' }, { company: 'Össur', allow: [] })
    expect(read.saying).toEqual(['People name the paperwork. Össur\'s knees are named too.'])
    expect(read.means).toBe('Cover decides the fitting.')
    // The company told what it could do, its name opening on a capital \b does not read.
    expect(finishSubjectRead(m, { saying: ['P.'], means: 'Cover decides the fitting. Össur could show the paperwork.' }, { company: 'Össur', allow: [] }).read.means).toBe('Cover decides the fitting.')
  })

  it('caps at a sentence\'s end with the week read\'s slack: a meaning a little over the writer\'s cap is kept whole', () => {
    // About 470 characters, the writer told 420 (the offline test's length, 14 Oct).
    const means = 'For Össur, this talk sits beside its prosthetic legs and running blades, because people use peer examples to picture life with a first prosthesis and the kind of person they can become with it. The race posts and running club stories bear on Össur\'s claim that its running blades are made for amputee athletes of every level, and the questions around a first socket are asked of other amputees who wear one already.'
    const { read } = finishSubjectRead(m, { saying: ['P.'], means }, { company: 'Össur', allow: [] })
    expect(read.means).toBe(means)
    // Over the slack, whole sentences only: never one half said.
    const long = `${means} ${'Another sentence about the same runners and their clubs. '.repeat(4)}`.trim()
    const capped = finishSubjectRead(m, { saying: ['P.'], means: long }, { company: 'Össur', allow: [] }).read.means
    expect(capped.endsWith('.')).toBe(true)
    expect(capped.length).toBeLessThanOrEqual(Math.round(420 * 1.25))
  })

  it('the meaning makes no comparison: a sentence with one drops, on the sentence rule; what people said may compare', () => {
    // The offline test's second sentence, and the fresh check's example.
    const means = [
      'Össur\'s claim about its running blades bears on the race stories.',
      'The market meets prosthetic products through other amputees as much as through product claims.',
      'Össur\'s knees reach people through insurers more than through clinics.',
      'Buyers ask the appeal rather than the clinic.',
    ].join(' ')
    const { read, scrub } = finishSubjectRead(m, { saying: ['People name the race stories.'], means }, { company: 'Össur', allow: [] })
    expect(read.means).toBe('Össur\'s claim about its running blades bears on the race stories.')
    expect(scrub.dropped).toBe(3)
    // A comparison in what people said stays: it is theirs to make.
    expect(finishSubjectRead(m, { saying: ['People say a liner lasts longer than a sock.'], means: 'M.' }, { company: 'Össur', allow: [] }).read.saying).toEqual(['People say a liner lasts longer than a sock.'])
  })

  it('in a medical market the meaning drops a medical claim (the post ideas\' MEDICAL_CLAIMS); elsewhere it does not run', () => {
    const means = 'Össur says its liners keep the limb drier. A drier liner prevents sores on the residual limb.'
    expect(finishSubjectRead(m, { saying: ['P.'], means }, { company: 'Össur', allow: [], medical: true }).read.means).toBe('Össur says its liners keep the limb drier.')
    expect(finishSubjectRead(m, { saying: ['P.'], means }, { company: 'Össur', allow: [] }).read.means).toBe(means)
  })

  it('v3: the headline is kept as one line, its full stop gone; an answer with none stores none', () => {
    const { read, scrub } = finishSubjectRead(m, { saying: ['People name the appeal.'], means: 'Cover decides the fitting.', headline: '  The appeal decides when a knee is fitted.  ' }, { company: 'Össur', allow: [] })
    expect(read).toEqual({
      subjectId: 'cost', name: 'Cost & access', status: 'ready',
      saying: ['People name the appeal.'], means: 'Cover decides the fitting.', headline: 'The appeal decides when a knee is fitted',
      basedOn: ['t-ins'],
    })
    expect(scrub).toEqual({ dropped: 0, leaked: false, headline: 'kept' })
    // A v2 answer (no headline): the read and its scrub are exactly v2's.
    const v2 = finishSubjectRead(m, { saying: ['People name the appeal.'], means: 'Cover decides the fitting.' }, { company: 'Össur', allow: [] })
    expect('headline' in v2.read).toBe(false)
    expect(v2.scrub).toEqual({ dropped: 0, leaked: false })
    // Only its first sentence is a headline: a second never stands in for a first the scrub dropped.
    expect(finishSubjectRead(m, { saying: ['P.'], means: 'M.', headline: 'The appeal decides the fitting. Buyers ask twice.' }, { company: 'Össur', allow: [] }).read.headline).toBe('The appeal decides the fitting')
    expect('headline' in finishSubjectRead(m, { saying: ['P.'], means: 'M.', headline: 'It grew by ten. The appeal decides the fitting.' }, { company: 'Össur', allow: [] }).read).toBe(false)
  })

  it('v3: the headline takes the meaning\'s finish whole; whatever drops it, the read stores none', () => {
    const headlineOf = (headline: string, o: { medical?: boolean } = {}) =>
      finishSubjectRead(m, { saying: ['People name the appeal.'], means: 'Cover decides the fitting.', headline }, { company: 'Össur', allow: [], ...o })
    for (const [why, h] of [
      ['a digit', 'Buyers wait six weeks for 2 appeals'],
      ['an amount in words', 'A socket at fifteen thousand dollars decides the fitting'],
      ['a direction word', 'Talk about refused cover is growing'],
      ['advice', 'Össur should show the appeal'],
      ['the company told what it could do', 'Össur could show the appeal'],
      ['a forecast', 'Appeals are likely to decide the fitting'],
      ['a comparison', 'The appeal matters more than the knee'],
      ['the first person', 'Our buyers wait for the appeal'],
      ['how it was made', 'This report finds the appeal decides the fitting'],
      ['a question', 'Who pays for the knee?'],
      ['the subject\'s name alone', 'Cost & access.'],
      ['over its cap (no slack)', 'Buyers describe the appeal letters from the prosthetist and the paperwork for the second refusal'],
      ['over its word cap (no slack)', 'Owners name who pays and who signs and who files and who waits for it'],
    ] as const) {
      const { read, scrub } = headlineOf(h)
      expect('headline' in read, why).toBe(false)
      expect(scrub.headline, why).toBe('dropped')
      expect(read.means, why).toBe('Cover decides the fitting.')
    }
    // A medical claim drops it in a medical market, as it drops a sentence of the meaning.
    expect('headline' in headlineOf('A drier liner prevents sores', { medical: true }).read).toBe(false)
    expect(headlineOf('A drier liner prevents sores').read.headline).toBe('A drier liner prevents sores')
    expect(headlineRefused('cost & ACCESS!', 'Cost & access')).toBe('name')
    expect(headlineRefused('Is cover the point?', 'Cost & access')).toBe('question')
  })

  it('the caps hold with no slack: 90 characters and 14 words pass, one more of either drops', () => {
    const fits = 'Owners name who pays for the socket and who files the paperwork for it'
    expect(fits.split(' ')).toHaveLength(14)
    expect(finishSubjectRead(m, { saying: ['P.'], means: 'M.', headline: fits }, { company: 'Össur', allow: [] }).read.headline).toBe(fits)
    expect('headline' in finishSubjectRead(m, { saying: ['P.'], means: 'M.', headline: `${fits} today` }, { company: 'Össur', allow: [] }).read).toBe(false)
    const ninety = `Cover decides the socket ${'x'.repeat(90 - 'Cover decides the socket '.length)}`
    expect(ninety).toHaveLength(90)
    expect(finishSubjectRead(m, { saying: ['P.'], means: 'M.', headline: ninety }, { company: 'Össur', allow: [] }).read.headline).toBe(ninety)
    expect('headline' in finishSubjectRead(m, { saying: ['P.'], means: 'M.', headline: `${ninety}y` }, { company: 'Össur', allow: [] }).read).toBe(false)
  })

  it('the headline drops, high precision (the final round): the re-check\'s probes drop, its near misses stand', () => {
    const NAME = 'Durability & repair'
    const keep = (h: string, medical = false, name = NAME) =>
      finishSubjectRead({ ...m, name }, { saying: ['People say the zip broke.'], means: 'M.', headline: h }, { company: medical ? 'Össur' : 'Sealand', allow: [], medical }).read.headline
    // MUST DROP: [why, line]; 'scrub' where the shared finish drops it (a digit, an amount, a direction word, advice, the method ban, a magnitude word).
    const DROPS: [HeadlineRefusal | 'scrub', string][] = [
      ['report', 'Owners ask whether the zip can be repaired at home'], ['report', 'Buyers ask whether the 35L bag fits under a seat'],
      ['scrub', 'Owners name 3 zips that fail'], ['scrub', 'Buyers weigh fifty euros against a bag that lasts'], ['scrub', 'Thousands of owners ask about the zip'],
      ['scrub', 'A few hundred owners ask about the zip'],
      ['scrub', 'Talk about the zip is growing among owners'], ['scrub', 'Questions about repair keep rising'], ['direction', 'Buyers are increasingly asking about repair'],
      ['scrub', 'Interest in repair picked up among owners'],
      ['scrub', 'Sealand should show the zip in its videos'], ['scrub', 'An opportunity to show the repair service'], ['scrub', 'Sealand could lead with the repair service'],
      ['imperative', 'Lead with the repair service'], ['imperative', 'Highlight the repair service for buyers'], ['imperative', 'Make the repair service easy to find'],
      ['imperative', 'Show the stitching up close'], ['imperative', 'Consider the hip belt'], ['imperative', 'Try the bag packed before buying'],
      ['imperative', 'Use the hip belt on long days'], ['imperative', 'Keep the zip clean'], ['imperative', 'Answer the fit question first'], ['imperative', 'Give your straps a rest'],
      ['forecast', 'Buyers will likely ask about repair'], ['forecast', 'Buyers will ask about repair next season'], ['forecast', 'Repair is set to decide the next purchase'],
      ['forecast', 'Buyers won\'t wait for a restock'], ['scrub', 'Questions are going to centre on fit'],
      ['scrub', 'Buyers trust the zip more than the strap'], ['comparison', 'Buyers prefer rolltops to zipped bags'], ['scrub', 'The zip matters as much as the strap'],
      ['comparison', 'Buyers choose Fjallraven ahead of Sealand'], ['comparison', 'The best zip decides the purchase'], ['comparison', 'Buyers choose the duffle over the tote'],
      ['comparison', 'Buyers prefer the leather strap to the webbing'], ['comparison', 'Comfort comes ahead of looks'], ['comparison', 'The most praised part is the zip'],
      ['comparison', 'The best fit comes from repeat adjustments'], ['comparison', 'Sizes run ahead of colour in the questions'],
      ['scrub', 'We see buyers ask about the zip'], ['scrub', 'Our buyers ask about the zip'], ['person', 'You can see buyers ask about the zip'], ['person', 'I think buyers ask about the zip'],
      ['person', 'Your own body shape decides strap comfort'], ['person', 'My first leg stories carry the encouragement'], ['person', 'Did you know stories carry the encouragement'],
      ['question', 'Is the zip worth it?'], ['question', 'Does the zip last'], ['question', 'Will the zip last'], ['question', 'Buyers ask: "does the zip last?"'],
      ['question', 'Do buyers trust the zip'], ['question', 'Can a liner be washed at home?'],
      ['name', 'Durability & repair'], ['name', 'Durability and repair'], ['name', 'Repair and durability'], ['name', 'durability & REPAIR.'],
      ['name', 'Durability & repair matters to buyers'], ['name', 'Questions about durability & repair'],
      ['scrub', 'The data shows owners ask about repair'], ['scrub', 'Across platforms owners ask about repair'], ['scrub', 'This report finds owners ask about repair'],
      ['scrub', 'Fifty thousand euros. Buyers ask about the price'], ['report', 'Owners ask about the zip. Sealand should show it'],
      ['scrub', 'Owners who carry their laptop every day ask whether the padded sleeve and the hip belt and the zip hold up through a full year of commuting in the rain'],
      ['report', 'Owners ask about the zip…'], ['report', 'Owners ask about the zip — and the strap'],
      ['report', 'Buyers ask about zippers and suede before they buy'], ['report', 'People talk about the socket on long walks'], ['report', 'Customers discuss the price of the duffle'],
      ['report', 'Viewers wonder whether the clip is real'], ['report', 'Users asked about the battery'], ['report', 'Shoppers ask where the bag is sold'],
      ['report', 'People wonder less about price than fit'], ['report', 'Buyers ask nothing until the colour is right'],
      // GARBLED: the shared strip would change a word, so the headline drops rather than print changed.
      ['scrub', 'Many owners ask about the zip'], ['scrub', 'Most buyers ask about the zip'], ['scrub', 'A huge number of owners ask about the zip'],
      ['scrub', 'Most of the talk turns on the socket'], ['scrub', 'The socket matters most once the leg is fitted'], ['scrub', 'Owners value straps that hold over many trips'],
    ]
    for (const [why, h] of DROPS) {
      expect(keep(h), h).toBeUndefined()
      if (why !== 'scrub') expect(headlineRefused(h, NAME), h).toBe(why)
    }
    // A medical claim drops in a medical market only (Össur's flag).
    for (const h of ['The liner prevents sores on long walks', 'The socket relieves pain for new amputees', 'Doctors recommend the knee for active users', 'The foot is safe on ice']) {
      expect(keep(h, true), h).toBeUndefined()
      expect(keep(h, false), h).toBe(h)
    }
    // MUST STAND, whole and unchanged: the re-check's near misses (27 of them dropped before this round).
    const STANDS = [
      'People who ask about the socket want a fitting first', 'Comfort over a long day decides the strap', 'The bag has to fit under the seat ahead of a flight',
      'Fit is checked ahead of a flight', 'Fit is settled ahead of buying', 'Size is settled ahead of the order', 'Stock is checked ahead of purchase',
      'Buyers are won over by the lifelike finish', 'Owners value comfort over long trips', 'Owners rate the strap over a full day of travel',
      'People asking about the socket want a fitting first', 'Users talking about grip name the hand first', 'What is settled first is the fit',
      'What is taken for granted is good coffee', 'Where stock is short, buyers wait for a restock', 'When colour is wrong, the bag goes back',
      'How comfort is judged depends on body shape', 'How the socket is cast decides comfort', 'How a bag carries when packed decides the purchase',
      'Where it is sold decides the purchase', 'What decides the purchase is the zip', 'May travel puts carry on size first', 'Use during long trips tests the straps',
      'Use in the rain tests the zips', 'Build quality carries the price', 'Show pieces set the look buyers want', 'Keep cards, phone and keys within reach is the ask',
      'Start up cost decides access to a leg', 'Offer price sets the bar for a sale', 'Buyers take the socket fit for granted', 'Buyers\' questions turn on the zip',
      'Talk turns on the socket', 'People prefer sockets that adjust to the body', 'Buyers prefer a liner fitted to the residual limb', 'Buyers prefer to see the bag worn',
      'The will to walk again carries the stories', 'Free will shapes how people style a cover', 'The strap is set to the right length before a trip',
      'A strap set to length decides comfort', 'At least one spare liner is part of the routine', 'Owners trust a zip they can repair themselves',
      'A rival\'s zip is the part owners name', 'Weight over the hips decides comfort', 'Load over the shoulders decides comfort', 'Comfort over hours of wear decides the socket',
      'Comfort holds over the whole day only with a padded strap', 'Buyers choose a colour over the phone with the shop', 'Durability is judged over years of use',
      'Will power carries the rehab stories', 'Has-been bags still sell on colour', 'Can sizes decide what fits under the seat',
      'Which bag fits under the seat is settled by airline rules', 'Who pays for the socket decides access to a leg', 'Why a socket hurts is traced to sweat and heat',
      'Whose design it is matters less once the fit is right', 'IT workers carry laptops in the sleeve', 'Myoelectric hands are named for grip',
      'Makeshift legs are praised for weight', 'Durability and repair decide the order', 'Buyers want to know how long the daily clean takes',
      'Two zips and one strap decide whether owners keep the bag',
    ]
    for (const h of STANDS) {
      expect(headlineRefused(h, NAME), h).toBeNull()
      expect(keep(h), h).toBe(h)
    }
    // Two near misses pass these refusals but drop on an older shared rule, named here so the table claims no more than the path does:
    // "falls" is on the direction word list, and "the search" is the method ban's word.
    for (const h of ['Focus falls on the socket once the leg is fitted', 'Make and model decide the search']) {
      expect(headlineRefused(h, NAME), h).toBeNull()
      expect(keep(h), h).toBeUndefined()
    }
  })

  it('every headline the real dry runs wrote (16 Oct) still stands, Össur\'s under its medical rules, but for the "Buyers ask" reports the headline round drops', () => {
    const REAL: [string, string, boolean][] = [
      ['Cost & access', 'The socket, liner and insurance approval shape whether the leg is reachable', true],
      ['Cost & access', 'Socket cost and insurance approval stand between buyers and the prosthetic', true],
      ['Function & movement', 'The prosthetic foot and hand grip are where movement is tested', true],
      ['Function & movement', 'Buyers judge a prosthesis by balance, grip and long walks', true],
      ['Look & style', 'Leg covers and finishes settle what people notice first', true],
      ['Look & style', 'A leg cover is judged by realism, style and whether it draws notice', true],
      ['Fit & comfort', 'Buyers want socket and leg length adjustments explained', true],
      ['Community & encouragement', 'People value honest prosthetic stories with humour and support', true],
      ['Buying & delivery', 'People buy once stock, colour and size are settled', false],
      ['Looks & style', 'Upcycled bags still have to look good to be wanted', false],
      ['Fit & comfort', 'Socket length, pressure and heat need settling', true],
      ['Fit & comfort', 'Buyers judge the socket by pressure, sweat and leg length', true],
      ['Community & encouragement', 'New amputees look to other users for reassurance while learning to walk', true],
      ['Comfort', 'Shoulder straps and hip belts decide comfort once the bag is packed', false],
      ['Buying & delivery', 'Stock status and colour decide whether interest becomes an order', false],
      ['Looks & style', 'Buyers want reused materials to look beautiful and well made', false],
      ['Durability', 'Buyers settle toughness at the zip, stitching and suede', false],
      // The headline round's nine (v3c, 16 Oct night), every one kept.
      ['Cost & access', 'The socket bill and insurance approval decide access to a leg', true],
      ['Function & movement', 'Smooth movement convinces when balance, hips and grip make sense', true],
      ['Look & style', 'The look is settled between lifelike skin and visible design', true],
      ['Fit & comfort', 'The socket decides comfort once length and alignment feel right', true],
      ['Community & encouragement', 'Prosthetic stories turn on confidence, honesty and visible support', true],
      ['Comfort', 'Shoulder straps decide comfort once a bag is fully packed', false],
      ['Buying & delivery', 'Availability decides the purchase once the bag itself is wanted', false],
      ['Looks & style', 'Colour and finish decide whether reused bags look worth owning', false],
      ['Durability', 'Zips and suede carry trust once the bag looks built to last', false],
    ]
    for (const [name, h, medical] of REAL) {
      expect(headlineRefused(h, name), h).toBeNull()
      const { read } = finishSubjectRead({ ...m, name }, { saying: ['People name the zip.'], means: 'M.', headline: h }, { company: medical ? 'Össur' : 'Sealand', allow: [], medical })
      expect(read.headline, h).toBe(h)
    }
  })

  it('nits: a trailing ellipsis or colon goes; a held read\'s record never says the headline was kept', () => {
    for (const h of ['The appeal decides the fitting…', 'The appeal decides the fitting:', 'The appeal decides the fitting...']) {
      expect(finishSubjectRead(m, { saying: ['P.'], means: 'M.', headline: h }, { company: 'Össur', allow: [] }).read.headline).toBe('The appeal decides the fitting')
    }
    const held = finishSubjectRead(m, { saying: ['It grew by ten.'], means: 'M.', headline: 'The appeal decides the fitting' }, { company: 'Össur', allow: [] })
    expect(held.read.status).toBe('held')
    expect(held.scrub.headline).toBe('dropped')
  })

  it('v3: a held read has no headline, and code\'s thin line never has one', () => {
    const held = finishSubjectRead(m, { saying: ['It grew by ten.'], means: 'Össur sells knees.', headline: 'The appeal decides the fitting' }, { company: 'Össur', allow: [] }).read
    expect(held).toMatchObject({ status: 'held', saying: [] })
    expect('headline' in held).toBe(false)
    expect('headline' in thinSubjectRead(material(RICH_EVIDENCE.slice(0, 1)), { month: OCT, complete: false, allow: [] })).toBe(false)
  })

  it('held where nothing of what was said survives', () => {
    const { read } = finishSubjectRead(m, { saying: ['It grew by ten.'], means: 'Össur sells knees.' }, { company: 'Össur', allow: [] })
    expect(read).toMatchObject({ status: 'held', saying: [], means: '', reason: expect.any(String) })
  })

  it('thin: where its talk sat, or that it sat inside other conversations, or that the comments said nothing; never a count', () => {
    const one = material(RICH_EVIDENCE.slice(0, 1))
    expect(thinSubjectRead(one, { month: OCT, complete: false, allow: [] })).toEqual({
      subjectId: 'cost', name: 'Cost & access', status: 'thin', means: '', basedOn: ['t-ins'],
      saying: ['In October so far, talk about Cost & access sat in “Insurance refusals”.'],
    })
    const loose = material([RICH_EVIDENCE[4]])
    expect(thinSubjectRead(loose, { month: '2026-09-01', complete: true, allow: [] }).saying).toEqual(['In September, talk about Cost & access sat inside other conversations, with none of its own.'])
    // Never a claim of silence: the level counts comments this line cannot see.
    expect(thinSubjectRead(material([]), { month: OCT, complete: false, allow: [] }).saying).toEqual(['No read of Cost & access in October so far yet.'])
    expect(thinSubjectRead(material([]), { month: '2026-09-01', complete: true, allow: [] }).saying).toEqual(['No read of Cost & access in September yet.'])
    for (const m2 of [material([]), material(RICH_EVIDENCE.slice(5))]) expect(thinSubjectRead(m2, { month: OCT, complete: false, allow: [] }).saying.join(' ')).not.toMatch(/nothing|nobody|no one|never/i)
  })
})

describe('the money', () => {
  it('starts only with the cap and the margin left under the run\'s budget', () => {
    const need = SUBJECT_READS_BUDGET_USD + SUBJECT_READS_RUN_MARGIN_USD
    expect(subjectReadsHeadroom(RUN_MODEL_BUDGET_USD - need)).toBe(true)
    expect(subjectReadsHeadroom(RUN_MODEL_BUDGET_USD - need + 0.01)).toBe(false)
    expect(subjectReadsRoom(0)).toBe(SUBJECT_READS_BUDGET_USD)
    expect(subjectReadsRoom(RUN_MODEL_BUDGET_USD - 0.7)).toBeCloseTo(0.2, 6)
    expect(subjectReadsCapLeft(0.4)).toBeCloseTo(0.6, 6)
    expect(subjectReadsHeadroom(1, RUN_MODEL_BUDGET_USD, SUBJECT_READS_BUDGET_USD)).toBe(false)
  })

  it('an attempt\'s worst case is its prompt counted densely and the whole output ceiling', () => {
    expect(subjectReadAttemptMaxUsd({ system: '', user: '' })).toBeCloseTo((SUBJECT_READ_MAX_OUTPUT_TOKENS * 15) / 1e6, 6)
  })

  it('SpendGate: an attempt starts only where what is spent and held leaves room for its worst case', () => {
    const g = new SpendGate(0.3)
    expect(g.reserve(0.1)).toBe(true)
    expect(g.reserve(0.1)).toBe(true)
    expect(g.reserve(0.15)).toBe(false)
    g.settle(0.1, 0.02)
    expect(g.reserve(0.15)).toBe(true)
    expect(g.spent).toBeCloseTo(0.02, 6)
  })
})

const OUTPUT = { saying: ['People describe refusals as a long fight.'], means: 'Össur sells knees through insurers.' }
const parsed = (output: unknown, completion = 800) => ({ choices: [{ message: { parsed: output } }], usage: { prompt_tokens: 2_000, completion_tokens: completion } })

describe('generateSubjectRead: the written read\'s model, held to time and money', () => {
  const prompts = { system: 's', user: 'u' }

  it('one strict call on gpt-5.4 at the written read\'s effort, capped and never retried by the SDK; a second only for an answer that would not parse', async () => {
    const parse = vi.fn().mockResolvedValueOnce(parsed(null)).mockResolvedValueOnce(parsed(OUTPUT))
    const call = await generateSubjectRead(null, { clientId: CLIENT, runId: RUN, prompts, client: { chat: { completions: { parse } } } as unknown as ParseClient, spend: new SpendGate(1) })
    expect(call.attempts).toBe(2)
    expect(parse.mock.calls[0][0]).toMatchObject({ model: 'gpt-5.4', reasoning_effort: 'medium', max_completion_tokens: SUBJECT_READ_MAX_OUTPUT_TOKENS })
    expect(parse.mock.calls[0][1]).toEqual({ timeout: 100_000, maxRetries: 0 })
    expect(call.costUsd).toBeCloseTo((4_000 * 2.5 + 1_600 * 15) / 1e6, 6)
  })

  it('a timeout is thrown as one, never retried inside', async () => {
    const parse = vi.fn().mockRejectedValue(Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' }))
    await expect(generateSubjectRead(null, { clientId: CLIENT, runId: RUN, prompts, client: { chat: { completions: { parse } } } as unknown as ParseClient, spend: new SpendGate(1) }))
      .rejects.toBeInstanceOf(WeekReadTimeoutError)
    expect(parse).toHaveBeenCalledTimes(1)
  })

  it('makes no attempt its money cannot cover, and reports what the attempts spent', async () => {
    const parse = vi.fn()
    await expect(generateSubjectRead(null, { clientId: CLIENT, runId: RUN, prompts, client: { chat: { completions: { parse } } } as unknown as ParseClient, spend: new SpendGate(0.01) }))
      .rejects.toBeInstanceOf(SubjectReadBudgetError)
    expect(parse).not.toHaveBeenCalled()
    const twice = vi.fn().mockResolvedValue(parsed(null))
    const e = await generateSubjectRead(null, { clientId: CLIENT, runId: RUN, prompts, client: { chat: { completions: { parse: twice } } } as unknown as ParseClient, spend: new SpendGate(1) }).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(SubjectReadWriteError)
    expect((e as SubjectReadWriteError).spentUsd).toBeGreaterThan(0)
  })
})

const inputs = (subjects: SubjectReadMaterial[]): SubjectReadInputs => ({
  clientId: CLIENT, runId: RUN, company: 'Össur', month: OCT, complete: false, read: { from: `${OCT}T00:00:00.000Z`, to: WINDOW.to }, context: null, subjects, allow: [],
})
const rich = material(RICH_EVIDENCE)
const thin = { ...material(RICH_EVIDENCE.slice(0, 1)), subjectId: 'look', name: 'Look & style' }

describe('buildSubjectReads', () => {
  it('a call for a subject with enough to say, code\'s line for a thin one, an earlier attempt\'s read kept', async () => {
    const parse = vi.fn().mockResolvedValue(parsed(OUTPUT))
    const kept: SubjectRead = { subjectId: 'kept', name: 'Kept', status: 'ready', saying: ['Kept.'], means: '', basedOn: [] }
    const existing = subjectReadsData({ month: OCT, read: { from: OCT, to: WINDOW.to }, subjects: [kept], costUsd: 0.05 })
    const built = await buildSubjectReads(admin, {
      clientId: CLIENT, runId: RUN, month: OCT, window: WINDOW, log: false, client: { chat: { completions: { parse } } } as unknown as ParseClient,
      inputs: inputs([rich, thin, { ...rich, subjectId: 'kept', name: 'Kept' }]), existing,
    })
    expect(parse).toHaveBeenCalledTimes(1)
    expect(built.data.subjects.map((s) => [s.subjectId, s.status])).toEqual([['cost', 'ready'], ['look', 'thin'], ['kept', 'ready']])
    expect(built.data).toMatchObject({ status: 'ready', month: OCT, promptVersion: 'subject_read_v3' })
    expect(built.data.costUsd).toBeGreaterThan(0.05)
  })

  it('a subject whose call failed is failed, the rest stand; a transient failure is told apart', async () => {
    const parse = vi.fn().mockRejectedValue(Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' }))
    const built = await buildSubjectReads(admin, {
      clientId: CLIENT, runId: RUN, month: OCT, window: WINDOW, log: false, client: { chat: { completions: { parse } } } as unknown as ParseClient,
      inputs: inputs([rich, thin]),
    })
    expect(built.data.subjects.map((s) => s.status)).toEqual(['failed', 'thin'])
    expect(built.transient).toEqual(['cost'])
    expect(keepsRead(built.data.subjects[0])).toBe(false)
  })
})

describe('the store and the published read', () => {
  it('saveSubjectReads puts the reads on the run\'s week row and keeps the rest of it', async () => {
    const read = sealandRead({ headline: 'The week.' })
    const db = fakeDb({ week_reads: [{ client_id: CLIENT, run_id: RUN, kind: 'week', status: 'ready', data: read }] })
    const reads = subjectReadsData({ month: OCT, read: { from: OCT, to: WINDOW.to }, subjects: [{ subjectId: 'cost', name: 'Cost & access', status: 'ready', saying: ['P.'], means: 'M.', basedOn: [] }], costUsd: 0.04 })
    await saveSubjectReads(db.client as SupabaseClient, { clientId: CLIENT, runId: RUN, reads })
    const row = (db as unknown as { calls: { op: string; values?: { data: WeekReadData } }[] }).calls.find((c) => c.op === 'update')
    expect(row?.values?.data).toMatchObject({ headline: 'The week.', subjectReads: { month: OCT, subjects: [{ subjectId: 'cost' }] } })
  })

  it('subjectReadOf: the subject\'s written or thin read of the month the panel reads, else nothing', () => {
    const base = sealandRead({ headline: 'H' }) as WeekReadData
    const reads = subjectReadsData({
      month: OCT, read: { from: OCT, to: WINDOW.to }, costUsd: 0,
      subjects: [
        { subjectId: 'a', name: 'A', status: 'ready', saying: ['P.'], means: '', basedOn: [] },
        { subjectId: 'b', name: 'B', status: 'thin', saying: ['T.'], means: '', basedOn: [] },
        { subjectId: 'c', name: 'C', status: 'held', saying: [], means: '', basedOn: [] },
        { subjectId: 'd', name: 'D', status: 'failed', saying: [], means: '', basedOn: [] },
      ],
    })
    const read = { ...base, subjectReads: reads } as WeekReadData
    expect(subjectReadOf(read, 'a', OCT)?.status).toBe('ready')
    expect(subjectReadOf(read, 'b', '2026-10-15')?.status).toBe('thin')
    expect(subjectReadOf(read, 'c', OCT)).toBeNull()
    expect(subjectReadOf(read, 'd', OCT)).toBeNull()
    expect(subjectReadOf(read, 'a', '2026-09-01')).toBeNull()
    expect(subjectReadOf(base, 'a', OCT)).toBeNull()
    expect(subjectReadOf(null, 'a', OCT)).toBeNull()
  })

  it('subjectReadOf carries a v3 read\'s headline; a v1 or v2 read, stored with none, reads exactly as it was stored', () => {
    const base = sealandRead({ headline: 'H' }) as WeekReadData
    const v3 = { ...base, subjectReads: subjectReadsData({ month: OCT, read: { from: OCT, to: WINDOW.to }, costUsd: 0, subjects: [{ subjectId: 'a', name: 'A', status: 'ready', saying: ['P.'], means: 'M.', headline: 'The appeal decides the fitting', basedOn: [] }] }) } as WeekReadData
    expect(subjectReadOf(v3, 'a', OCT)).toMatchObject({ headline: 'The appeal decides the fitting', saying: ['P.'], means: 'M.' })
    for (const promptVersion of ['subject_read_v1', 'subject_read_v2'] as const) {
      const stored: SubjectReadsData = { version: 1, promptVersion, month: OCT, read: { from: OCT, to: WINDOW.to }, status: 'ready', model: 'gpt-5.4', costUsd: 0.1, subjects: [{ subjectId: 'a', name: 'A', status: 'ready', saying: ['P.'], means: 'M.', basedOn: [] }] }
      const r = subjectReadOf({ ...base, subjectReads: stored } as WeekReadData, 'a', OCT)
      expect(r).toEqual(stored.subjects[0])
      expect('headline' in (r as SubjectRead)).toBe(false)
    }
  })

  it('the weekly issue never carries them', () => {
    const read = { ...sealandRead({ headline: 'H' }), subjectReads: subjectReadsData({ month: OCT, read: { from: OCT, to: WINDOW.to }, subjects: [], costUsd: 0 }) } as WeekReadData
    const snap = weeklyReadSnapshotData({ company: 'Sealand', runId: RUN, read, writtenAt: '2026-10-11T06:00:00Z' })
    expect('subjectReads' in snap.read).toBe(false)
    expect(snap.read.findings).toEqual(read.findings)
  })

  it('reads the month\'s days to the run\'s end, or the month in full where the week carried past it', () => {
    expect(readDaysOf(OCT, WINDOW)).toEqual({ from: `${OCT}T00:00:00.000Z`, to: WINDOW.to, complete: false })
    expect(readDaysOf('2026-09-01', { from: '2026-09-27T04:03:00.000Z', to: '2026-10-04T04:02:00.000Z' })).toEqual({ from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z', complete: true })
  })
})

// ---- The step -------------------------------------------------------------------------

const readyRow = (subjectReads?: SubjectReadsData) => ({
  status: 'ready', month: OCT, window: WINDOW,
  data: { ...(sealandRead({ headline: 'H' }) as WeekReadData), ...(subjectReads ? { subjectReads } : {}) } as WeekReadData,
})

const builtOf = (subjects: SubjectRead[], transient: string[] = []): BuiltSubjectReads => ({
  data: subjectReadsData({ month: OCT, read: { from: OCT, to: WINDOW.to }, subjects, costUsd: 0.08 }),
  inputs: inputs([]), transient, called: subjects.length, raw: {}, scrub: {},
})
const READY: SubjectRead = { subjectId: 'cost', name: 'Cost & access', status: 'ready', saying: ['P.'], means: 'M.', basedOn: [] }
const FAILED: SubjectRead = { subjectId: 'fit', name: 'Fit & comfort', status: 'failed', saying: [], means: '', basedOn: [], reason: 'the subject call timed out' }

function deps(over: Partial<SubjectReadsStepDeps> = {}) {
  const saved: SubjectReadsData[] = []
  const alerts: string[] = []
  const d: SubjectReadsStepDeps = {
    enabled: vi.fn(() => true),
    company: vi.fn(async () => 'Össur'),
    row: vi.fn(async () => readyRow()) as unknown as SubjectReadsStepDeps['row'],
    build: vi.fn(async () => builtOf([READY])) as unknown as SubjectReadsStepDeps['build'],
    spent: vi.fn(async () => 2.4),
    readsSpent: vi.fn(async () => 0),
    save: vi.fn(async (_a, x: { reads: SubjectReadsData }) => { saved.push(x.reads) }) as unknown as SubjectReadsStepDeps['save'],
    alert: vi.fn(async (subject: string) => { alerts.push(subject); return { sent: true } }),
    ...over,
  }
  return { d, saved, alerts }
}

describe('runSubjectReadsStep: silent where it should be', () => {
  it('a TEST run reads nothing, writes nothing and tells nobody', async () => {
    const { d, saved, alerts } = deps()
    expect(await runSubjectReadsStep(admin, { clientId: CLIENT, runId: RUN, testRun: true }, d)).toMatchObject({ status: 'test_run', costUsd: 0 })
    expect(d.row).not.toHaveBeenCalled()
    expect([saved, alerts]).toEqual([[], []])
  })

  it('a tenant switched off reads nothing, writes nothing and tells nobody', async () => {
    const { d, saved, alerts } = deps({ enabled: vi.fn(() => false) })
    expect(await runSubjectReadsStep(admin, { clientId: CLIENT, runId: RUN, testRun: false }, d)).toMatchObject({ status: 'disabled', costUsd: 0 })
    expect(d.enabled).toHaveBeenCalledWith(CLIENT)
    expect(d.row).not.toHaveBeenCalled()
    expect([saved, alerts]).toEqual([[], []])
  })

  it('no week_reads table, or no ready week read for the run, spends nothing and tells nobody', async () => {
    for (const row of ['missing', null, { ...readyRow(), status: 'thin' }, { ...readyRow(), status: 'failed', data: null }] as const) {
      const { d, saved, alerts } = deps({ row: vi.fn(async () => row) as unknown as SubjectReadsStepDeps['row'] })
      const out = await runSubjectReadsStep(admin, { clientId: CLIENT, runId: RUN, testRun: false }, d)
      expect(out.status).toBe(row === 'missing' ? 'missing_migration' : 'no_week_read')
      expect(d.build).not.toHaveBeenCalled()
      expect(d.spent).not.toHaveBeenCalled()
      expect([saved, alerts]).toEqual([[], []])
    }
  })

  it('a run whose reads are all written (a retry after the save) spends nothing again', async () => {
    const { d, saved } = deps({ row: vi.fn(async () => readyRow(builtOf([READY]).data)) as unknown as SubjectReadsStepDeps['row'] })
    expect(await runSubjectReadsStep(admin, { clientId: CLIENT, runId: RUN, testRun: false }, d)).toMatchObject({ status: 'exists', written: 1 })
    expect(d.build).not.toHaveBeenCalled()
    expect(saved).toEqual([])
  })

  it('no ready subject stores nothing and tells nobody', async () => {
    const { d, saved, alerts } = deps({ build: vi.fn(async () => builtOf([])) as unknown as SubjectReadsStepDeps['build'] })
    expect(await runSubjectReadsStep(admin, { clientId: CLIENT, runId: RUN, testRun: false }, d)).toMatchObject({ status: 'no_subjects' })
    expect([saved, alerts]).toEqual([[], []])
  })
})

describe('runSubjectReadsStep: stores the reads, fail-soft in the week read\'s way', () => {
  it('stores the reads on the step\'s clock and money, and returns what it stored', async () => {
    const { d, saved, alerts } = deps()
    expect(await runSubjectReadsStep(admin, { clientId: CLIENT, runId: RUN, testRun: false }, d)).toEqual({ status: 'ready', written: 1, thin: 0, failed: 0, costUsd: 0.08 })
    expect(saved).toHaveLength(1)
    expect(alerts).toEqual([])
    const call = (d.build as unknown as { mock: { calls: [SupabaseClient, { log: boolean; budget?: unknown; maxUsd?: number; month: string; existing: unknown }][] } }).mock.calls[0][1]
    expect(call).toMatchObject({ log: true, month: OCT, maxUsd: SUBJECT_READS_BUDGET_USD, existing: null })
    expect(call.budget).toBeDefined()
  })

  it('a transient failure before the last attempt: what was written is saved, then thrown for Inngest to retry; nobody told', async () => {
    const { d, saved, alerts } = deps({ build: vi.fn(async () => builtOf([READY, FAILED], ['fit'])) as unknown as SubjectReadsStepDeps['build'] })
    await expect(runSubjectReadsStep(admin, { clientId: CLIENT, runId: RUN, testRun: false, lastAttempt: false }, d)).rejects.toThrow(/a retry may clear/)
    expect(saved).toHaveLength(1)
    expect(saved[0].subjects.map((s) => s.status)).toEqual(['ready', 'failed'])
    expect(alerts).toEqual([])
  })

  it('the retry writes only what is missing: the earlier attempt\'s reads go to the build as kept', async () => {
    const earlier = builtOf([READY, FAILED]).data
    const { d } = deps({ row: vi.fn(async () => readyRow(earlier)) as unknown as SubjectReadsStepDeps['row'] })
    await runSubjectReadsStep(admin, { clientId: CLIENT, runId: RUN, testRun: false }, d)
    const call = (d.build as unknown as { mock: { calls: [SupabaseClient, { existing: SubjectReadsData }][] } }).mock.calls[0][1]
    expect(call.existing).toBe(earlier)
  })

  it('on the last attempt a failed subject is stored failed, the rest stand, and the operator is told once', async () => {
    const { d, saved, alerts } = deps({ build: vi.fn(async () => builtOf([READY, FAILED], ['fit'])) as unknown as SubjectReadsStepDeps['build'] })
    expect(await runSubjectReadsStep(admin, { clientId: CLIENT, runId: RUN, testRun: false, lastAttempt: true }, d)).toMatchObject({ status: 'ready', written: 1, failed: 1 })
    expect(saved).toHaveLength(1)
    expect(alerts).toEqual(['Verbatim subject reads incomplete: Össur'])
    expect((d.alert as unknown as { mock: { calls: [string, string][] } }).mock.calls[0][1]).toContain(`scripts/subject-reads.ts --client ${CLIENT} --run ${RUN}`)
  })

  it('a step that fails outright on its last attempt stores a failed record and alerts once; before it, a transient one throws', async () => {
    const boom = deps({ build: vi.fn(async () => { throw new Error('written evidence: permission denied') }) as unknown as SubjectReadsStepDeps['build'] })
    expect(await runSubjectReadsStep(admin, { clientId: CLIENT, runId: RUN, testRun: false }, boom.d)).toMatchObject({ status: 'failed', error: 'written evidence: permission denied' })
    expect(boom.saved).toHaveLength(1)
    expect(boom.saved[0]).toMatchObject({ status: 'failed', subjects: [], error: 'written evidence: permission denied', month: OCT })
    expect(boom.alerts).toEqual(['Verbatim subject reads failed: Össur'])
    const flaky = deps({ build: vi.fn(async () => { throw new WeekReadTimeoutError('the subject call timed out (cap 100 s)') }) as unknown as SubjectReadsStepDeps['build'] })
    await expect(runSubjectReadsStep(admin, { clientId: CLIENT, runId: RUN, testRun: false, lastAttempt: false }, flaky.d)).rejects.toThrow(/timed out/)
    expect([flaky.saved, flaky.alerts]).toEqual([[], []])
  })

  it('a run without the headroom, or whose earlier attempts spent the cap: nothing built, one alert, never a throw', async () => {
    const poor = deps({ spent: vi.fn(async () => RUN_MODEL_BUDGET_USD - 1) })
    expect(await runSubjectReadsStep(admin, { clientId: CLIENT, runId: RUN, testRun: false, lastAttempt: false }, poor.d)).toMatchObject({ status: 'over_budget' })
    expect(poor.d.build).not.toHaveBeenCalled()
    expect(poor.alerts).toEqual(['Verbatim subject reads not written: Össur'])
    const spent = deps({ readsSpent: vi.fn(async () => SUBJECT_READS_BUDGET_USD) })
    expect(await runSubjectReadsStep(admin, { clientId: CLIENT, runId: RUN, testRun: false }, spent.d)).toMatchObject({ status: 'over_budget', error: expect.stringMatching(/earlier attempts already spent/) })
    expect(spent.d.build).not.toHaveBeenCalled()
  })
})

// ---- The pipeline ----------------------------------------------------------------------

/** Every step id of the pipeline in source order (scripts/pipeline-step-ids.sh's parse). */
function stepIds(src: string): string[] {
  const re = /\bstep\s*\.\s*(run|sendEvent)\s*\(/g
  const out: string[] = []
  while (re.exec(src) !== null) {
    let i = re.lastIndex
    let depth = 0
    let q: string | null = null
    let arg = ''
    for (; i < src.length; i++) {
      const c = src[i]
      if (q) {
        arg += c
        if (c === '\\') { arg += src[++i]; continue }
        if (q === '`' && c === '$' && src[i + 1] === '{') { depth++; arg += src[++i]; continue }
        if (c === q && depth === 0) q = null
        else if (q === '`' && c === '}' && depth > 0) depth--
        continue
      }
      if (c === "'" || c === '"' || c === '`') { q = c; arg += c; continue }
      if (c === '(' || c === '{' || c === '[') depth++
      if (c === ')' || c === '}' || c === ']') { if (depth === 0) break; depth-- }
      if (c === ',' && depth === 0) break
      arg += c
    }
    out.push(arg.replace(/\s+/g, ' ').trim().replace(/^['"]|['"]$/g, ''))
  }
  return out
}

describe('the pipeline carries write-subject-reads', () => {
  const src = readFileSync(new URL('../../inngest/functions/pipeline.ts', import.meta.url), 'utf8')
  const ids = stepIds(src)

  it('as one additive id in its own position: immediately after write-week-read, immediately before write-post-ideas (75 in all)', () => {
    expect(ids).toHaveLength(75)
    expect(ids.filter((id) => id === 'write-subject-reads')).toHaveLength(1)
    const at = ids.indexOf('write-subject-reads')
    expect(ids[at - 1]).toBe('write-week-read')
    expect(ids[at + 1]).toBe('write-post-ideas')
  })

  it('fail-soft: retried until its last attempt, told whether the run is a test, and its .catch only logs', () => {
    const body = src.slice(src.indexOf(".run('write-subject-reads'"), src.indexOf(".run('write-post-ideas'"))
    expect(body).toContain('runSubjectReadsStep(createAdminClient(), { clientId, runId, testRun: isTestRun({ id: runId, options }), lastAttempt: attempt >= (maxAttempts ?? 3) - 1 })')
    const at = body.indexOf('.catch(')
    const handler = body.slice(at, body.indexOf('})', at) + 2)
    expect(handler).toMatch(/console\.error\(`\[write-subject-reads\] out of retries/)
    expect(handler).toMatch(/return null/)
    expect(handler).not.toMatch(/sendAlertEmail|noteError/)
  })

  it('is listed after the gather, so no error of its can ever cut a week from the chart', () => {
    expect(AFTER_GATHER_STEPS).toContain('write-subject-reads')
  })
})
