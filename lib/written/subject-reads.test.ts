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
  buildSubjectReadPrompts, finishSubjectRead, SpendGate, subjectReadAttemptMaxUsd, subjectReadMaterial, subjectReadsCapLeft, subjectReadsData,
  subjectReadsHeadroom, subjectReadsRoom, thinSubjectRead, SUBJECT_READ_MAX_OUTPUT_TOKENS, SUBJECT_READ_PROMPT_VERSION, type SubjectReadMaterial, type SubjectReadTheme,
} from './subject-reads'
import {
  buildSubjectReads, generateSubjectRead, keepsRead, readDaysOf, runSubjectReadsStep, saveSubjectReads, SubjectReadBudgetError, SubjectReadWriteError,
  type BuiltSubjectReads, type SubjectReadInputs, type SubjectReadsStepDeps,
} from './subject-reads-step'
import type { SubjectRead, SubjectReadsData, WeekReadData } from './types'
import type { ParseClient } from './write-model'

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
    expect(SUBJECT_READ_PROMPT_VERSION).toBe('subject_read_v2')
    expect(system).toContain('the insight a marketing lead at Össur takes away, never a summary of the saying paragraphs')
    expect(system).toContain('Write it from the buyer\'s side of the talk')
    for (const angle of [
      'what people here take for granted about a device like Össur\'s',
      'what they doubt or still need settled before buying, shown by a question they ask or a problem they name',
      'the part of a device like Össur\'s the talk turns on',
      'a cheaper route, a workaround or a rival people praise, said as what they praise',
    ]) expect(system).toContain(angle)
    // Its own claims are context, never the subject: the v1 reads opened on them.
    expect(system).toContain('Never open with a claim, never make one the subject, never restate one.')
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
    expect(built.data).toMatchObject({ status: 'ready', month: OCT, promptVersion: 'subject_read_v2' })
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
