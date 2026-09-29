import { describe, expect, it, vi } from 'vitest'

// `loadAskFront` is the one I/O function tested here: the front page's loader
// is replaced by a spy, so the test reads what Ask asked it for. Everything
// else in the module is the real one.
vi.mock('./overview', async (importOriginal) => ({ ...(await importOriginal<typeof import('./overview')>()), loadOverview: vi.fn() }))
import { freezeQuotes, resolveQuotes } from '../renderables/quotes-freeze'
import { agentFixture, refusedFixture } from '../../components/pages/agent/fixture'
import type { PlanCheckCard } from '../ask/plan-cards'
import {
  agentThreadSlides, answerFindings, askHistory, askPlanChip, askReadingFrom, askReads,
  claimsCrossed, documentPages, findingKey, NO_ASK_READING, type AgentThreadData,
  loadAskFront, numberThreadQuotes, type Turn,
} from './agent-thread'
import { loadOverview } from './overview'
import { marketFrontFixture } from '../../components/pages/overview/fixture'
import { SEALAND_ASK_READING } from '../../components/pages/agent/fixture'
import { CHANGES } from '../test/sealand-pairs'

const base: AgentThreadData = {
  threadId: 't1', kind: 'question', title: 'Why do people hesitate before buying a liner?', brand: 'Sealand', createdAt: '2026-08-22T10:00:00Z',
  turns: [{
    question: 'Why do people hesitate before buying a liner?', askedAt: '2026-08-22T10:00:00Z', prose: null, outcome: 'answered', updateAt: '2026-08-21T04:00:00Z',
    answer: {
      answer: 'Comfort and fit come up before price.', silent: false, nearest: [], judgement: [{ text: 'Lead with fit.', basedOn: ['G1'] }], runId: 'r', costUsd: 0.02,
      grounded: [{ id: 'G1', text: 'People worry about skin irritation.', insightIds: ['i1', 'i2'], themeRefs: [], conversationCount: 2, voices: 'client',
        quotes: [{ ref: 'c:c1', text: 'my skin gets so irritated', commentId: 'c1', videoId: null, n: 1 }, { ref: 'v:v1', text: 'fit was the deciding thing', commentId: null, videoId: 'v1', n: 2 }] }],
    },
  }],
  citations: [
    { n: 1, ref: 'c:c1', text: 'my skin gets so irritated', platform: 'youtube', date: '2026-07-01', href: 'https://youtu.be/x?lc=1', commentLevel: true },
    { n: 2, ref: 'v:v1', text: 'fit was the deciding thing', platform: 'tiktok', date: null, href: null, commentLevel: false },
  ],
  silentQuestions: [], document: null,
  basis: { updateAt: '2026-08-21T04:00:00Z', monthlyReadings: 66, embedded: 2872, total: 2872, lastEmbeddedAt: '2026-09-15T07:31:49.323Z' },
  measure: null,
  notAnswered: null,
  planChip: null,
  history: null,
  reads: askReads(NO_ASK_READING, null),
  bar: { question: 'What does the conversation say about this?', context: 'x', reading: null },
  about: [],
  window: 'all',
  method: { company: 'Sealand', period: 'Asked Sat 22 Aug', platforms: ['youtube', 'tiktok'], videos: null, comments: 2, note: 'x' },
}

describe('agent thread data', () => {
  it('freezes every quoted voice (answer and appendix share refs) and resolves back', () => {
    const { data: frozen, refs } = freezeQuotes(base)
    expect(refs.sort()).toEqual(['c:c1', 'v:v1'])
    expect(JSON.stringify(frozen)).not.toContain('irritated')
    const thawed = resolveQuotes(frozen, new Map([['c:c1', 'my skin gets so irritated'], ['v:v1', 'fit was the deciding thing']]))
    expect(thawed).toEqual(base)
  })

  it('drops an erased voice from both the answer and the appendix', () => {
    const { data: frozen } = freezeQuotes(base)
    const thawed = resolveQuotes(frozen, new Map([['v:v1', 'fit was the deciding thing']]))
    expect(thawed.turns[0].answer!.grounded[0].quotes.map((q) => q.n)).toEqual([2])
    expect(thawed.citations.map((c) => c.n)).toEqual([2])
    expect(thawed.citations[0].text).toBe('fit was the deciding thing')
  })

  it('paginates: one slide per turn, the appendix, and the silent list', () => {
    const slides = agentThreadSlides({ ...base, silentQuestions: ['Is price the main thing?'] })
    expect(slides.map((s) => s.keys[0])).toEqual(['agent.turn:0:0', 'agent.turn:0:more', 'agent.citations:0', 'agent.silent'])
    const many = { ...base, turns: [{ ...base.turns[0], answer: { ...base.turns[0].answer!, grounded: Array.from({ length: 6 }, (_, i) => ({ ...base.turns[0].answer!.grounded[0], id: `G${i}` })), judgement: [], nearest: [] } }] }
    expect(agentThreadSlides(many).map((s) => s.keys[0])).toEqual(['agent.turn:0:0', 'agent.turn:0:1', 'agent.turn:0:2', 'agent.citations:0'])
  })

  it('splits a document into slide-sized runs without cutting a span', () => {
    const segs = [{ text: 'a'.repeat(1500), ref: null }, { text: 'claim one', ref: 'C1' }, { text: 'b'.repeat(1500), ref: null }, { text: 'c'.repeat(100), ref: null }]
    expect(documentPages(segs, 2600)).toEqual([[0, 3], [3, 4]])
    expect(documentPages([], 2600)).toEqual([[0, 0]])
  })

  it('names a finding by the registry id it rests on, and never by a label', () => {
    const measured = agentFixture()
    // TWO grounded points since wave 2 extended the fixture: the one that moved
    // and the one that held (components/pages/agent/fixture.ts).
    expect(answerFindings(measured.turns)).toEqual([
      { findingId: '0:G1', registryIds: ['reg-wet-commute'] },
      { findingId: '0:G2', registryIds: ['reg-recycled'] },
    ])
    // A point written before its themes were registered measures nothing rather
    // than being joined by a label that churns ~88% run to run.
    const unregistered = agentFixture()
    unregistered.turns[0].answer!.grounded[0].themeRefs = [{ themeId: 't1', registryId: null, label: 'Durability' }]
    expect(answerFindings(unregistered.turns)[0]).toEqual({ findingId: '0:G1', registryIds: [] })
  })

  it('keys a follow-up\u2019s findings by its own turn, so turn 2\u2019s G1 is not turn 1\u2019s', () => {
    // The model's ref restarts at G1 on every answer. Two turns, both calling
    // their first point G1 and resting on DIFFERENT themes: both have to be
    // measured, or turn 2's prose is scrubbed against turn 1's figures.
    const d = agentFixture()
    const second = JSON.parse(JSON.stringify(d.turns[0])) as AgentThreadData['turns'][number]
    second.answer!.grounded[0].themeRefs = [{ themeId: 't2', registryId: 'reg-zip', label: 'The zip' }]
    expect(answerFindings([d.turns[0], second]).filter((f) => f.findingId.endsWith(':G1'))).toEqual([
      { findingId: '0:G1', registryIds: ['reg-wet-commute'] },
      { findingId: '1:G1', registryIds: ['reg-zip'] },
    ])
    expect(findingKey(1, 'G1')).toBe('1:G1')
  })

})

describe('the Ask fixtures', () => {
  it('measures an answer: a level with its own N, a banded verdict, an earned word', () => {
    const d = agentFixture()
    const f = d.measure!.findings[0]
    expect(f.value).toEqual({ k: 130, n: 1388 })
    expect(f.verdict!.state).toBe('moved')
    expect(f.verdict!.changePts).toBe(2.6)
    // The band is max(2 x SE, minBandPts) and minBandPts is 2, so no verdict in
    // this product can ever carry a band under 2.0. The fixture used to state
    // 1.8, which is a number the loader can never hand wave 2's badge.
    expect(f.verdict!.bandPts).toBe(2)
    expect(f.verdict!.bandPts!).toBeGreaterThanOrEqual(2)
    // Every figure comes off the same measurement, so the table and the verdict
    // cannot disagree.
    expect(f.figures.f1_band.value).toBe(f.verdict!.bandPts)
    expect(f.figures.f1_k.value).toBe(f.value.k)
    // The one reader whose flag is true may print the word — and only because
    // three consecutive readings in one regime earned it.
    expect(f.direction).toBe('growing')
    expect(f.series).toHaveLength(3)
    // No rival's months stand behind a claim about the client's own audience.
    expect(d.measure!.findings.every((x) => !x.audience.startsWith('competitor:'))).toBe(true)
    expect(d.measure!.caveats[0]).toBe('Interpretation, not counted.')
  })

  it('refuses honestly with nothing seeded: no measure, no zeroes, the prose intact', () => {
    const d = refusedFixture()
    expect(d.measure).toBeNull()
    expect(d.planChip).toBeNull()
    expect(d.reads.rows[0].line).toBe('not read for this month yet')
    expect(d.turns[0].answer!.grounded[0].quotes[0].text).toContain('Three winters')
    // The bar still prints: Ask's context is the basis, not a month reading.
    expect(d.bar.question).toBe('What does the conversation say about this?')
    expect(d.bar.context).toContain('Answers are given against the update of')
  })

  it('freezes and resolves a measured thread without losing the measurement', () => {
    const d = agentFixture()
    const { data: frozen, refs } = freezeQuotes(d)
    expect(refs).toEqual(['c:c1', 'c:c2'])
    const thawed = resolveQuotes(frozen, new Map(d.citations.map((c) => [c.ref, c.text])))
    expect(thawed).toEqual(d)
  })
})

// ── Block D wave 2 (E-ask): what the rail and the chip say ──────────────────

describe('what an answer reads (WP3.9)', () => {
  it('says the market, its two parts and the client’s own posts, one denominator a line', () => {
    const r = askReads(SEALAND_ASK_READING, 'days90')
    expect(r.rows).toEqual([
      { key: 'market', label: 'Your market', value: 655, line: 'videos in September so far; 626 in the category, where themes are grouped' },
      { key: 'brands', label: 'Brands you track', value: 29, line: 'of those 655, filed under a brand; read when a question names one' },
      { key: 'own', label: 'Your own posts', value: 9, line: 'with a reading in September so far, marked as yours and never counted as the market' },
    ])
    expect(r.facts).toEqual([
      { term: 'Window', value: 'the last 90 days' },
      { term: 'Months read', value: 'August, and September so far' },
      { term: 'Comparisons', value: 'the first read the same way: October against November, from the 6 Dec update' },
    ])
  })

  it('names both windows where no answer has chosen one, and all time where one did', () => {
    expect(askReads(SEALAND_ASK_READING, null).facts[0].value).toBe('the last 90 days, or all time')
    expect(askReads(SEALAND_ASK_READING, 'all').facts[0].value).toBe('all time')
  })

  it('says what is not read rather than printing a zero for it', () => {
    const r = askReads(NO_ASK_READING, null)
    expect(r.rows.map((x) => x.value)).toEqual([null, null, null])
    expect(r.rows[0].line).toBe('not read for this month yet')
    expect(r.facts[1].value).toBe('no month yet carries enough videos to compare on')
    expect(r.facts[2].value).toBe('none read the same way yet')
  })

  it('reads the market off the pages’ own rows: pooled, the client left out, months over the floor', () => {
    const den = (month: string, audience: string, videos: number) => ({ month, audience, videos, comments: 0 })
    const r = askReadingFrom({
      now: '2026-10-02T06:00:00.000Z',
      runs: [{ id: 'r1', started_at: '2026-09-27T04:00:00.000Z', completed_at: '2026-09-27T08:30:00.000Z' }],
      // Staging's August (351 in the category, 22 Cotopaxi, 4 Freitag: DR F11)
      // and production's September (626, 29 filed under a tracked brand; the
      // 29 are held under one rival here, the research does not split them),
      // the client's own 9, and July's 36 under the floor.
      denominators: [
        den('2026-07-01', 'industry-other', 36),
        den('2026-08-01', 'industry-other', 351), den('2026-08-01', 'competitor:Cotopaxi', 22), den('2026-08-01', 'competitor:Freitag', 4),
        den('2026-09-01', 'industry-other', 626), den('2026-09-01', 'competitor:Cotopaxi', 29), den('2026-09-01', 'client', 9),
      ],
      rivalAudiences: ['competitor:Cotopaxi', 'competitor:Freitag'],
      schedule: { report_period: 'weekly', report_day: 'sunday' },
      changes: CHANGES,
      rows: [],
    })
    expect(r.reading?.month).toBe('2026-09-01')
    expect(r.market).toEqual({ month: '2026-09-01', videos: 655, comments: 0, category: 626, rivalFiled: 29 })
    expect(r.own).toBe(9)
    expect(r.monthsRead).toEqual(['2026-08-01', '2026-09-01'])
    expect(r.earliest).toBe('2026-07-01')
    expect(r.next).toMatchObject({ prevMonth: '2026-10-01', month: '2026-11-01' })
  })
})

describe('earlier questions', () => {
  const rows = [
    { threadId: 'a', title: 'Newest', askedAt: '2026-09-28T08:00:00.000Z' },
    { threadId: 'b', title: 'Middle', askedAt: '2026-09-13T09:00:00.000Z', claimCrossed: true },
    { threadId: 'c', title: 'Older', askedAt: '2026-09-06T09:00:00.000Z' },
    { threadId: 'd', title: 'Last month', askedAt: '2026-08-20T09:00:00.000Z' },
  ]

  it('draws the newest three and says how many it had to draw from', () => {
    const h = askHistory(rows)
    expect(h.rows.map((r) => r.threadId)).toEqual(['a', 'b', 'c'])
    // `held` is a fact about the TILE — four rows to draw from, three drawn.
    // It was a count of the wall-clock month, which the list could never
    // agree with: three September rows counted, and the third one drawn is
    // August's.
    expect(h.held).toBe(4)
  })

  it('leaves the open thread out of the denominator as well as out of the list', () => {
    const h = askHistory(rows, 3, 'a')
    expect(h.rows.map((r) => r.threadId)).toEqual(['b', 'c', 'd'])
    expect(h.held).toBe(3)
  })

  it('dates the footer by the earliest question it holds, never by a start date', () => {
    // D14: both "since" dates in this product are earliest EVIDENCE.
    expect(askHistory(rows).earliest).toBe('2026-08-20T09:00:00.000Z')
    expect(askHistory([]).earliest).toBeNull()
  })

  it('flags only the row whose plan claim crossed', () => {
    expect(askHistory(rows).rows.map((r) => r.claimCrossed)).toEqual([false, true, false])
  })

  it('keeps "we did not read that plan" apart from "nothing crossed"', () => {
    // `loadPlanChecks` is capped at PLAN_CARDS_SHOWN while the row list is the
    // newest fifty threads, so a thread hanging off an older plan has no
    // answer here. Rendered as `false` it would read identically to a plan
    // whose claims genuinely held.
    const mixed = [
      { threadId: 'a', title: 'read, held', askedAt: '2026-09-20T09:00:00.000Z', claimCrossed: false },
      { threadId: 'b', title: 'not read', askedAt: '2026-09-19T09:00:00.000Z', claimCrossed: null },
      // Omitted, not null: no plan behind it, so there is nothing to cross.
      { threadId: 'c', title: 'no plan at all', askedAt: '2026-09-18T09:00:00.000Z' },
    ]
    expect(askHistory(mixed).rows.map((r) => r.claimCrossed)).toEqual([false, null, false])
  })
})

describe('what lights the "claim moved" flag', () => {
  const crossing = { from: 'Supported', to: 'Contradicted' }
  const toUntested = { from: 'Supported', to: 'Untested' }
  const fromUntested = { from: 'Untested', to: 'Contradicted' }

  it('counts a crossing between supported and contradicted, in both directions', () => {
    expect(claimsCrossed([crossing])).toBe(1)
    expect(claimsCrossed([{ from: 'Contradicted', to: 'Supported' }])).toBe(1)
  })

  it('does not count a move to or from untested', () => {
    // 2–4 of ~15 claims flip weekly on both tenants and most of those flips are
    // the retrieval finding (or not finding) a quotable comment — not the
    // conversation changing its mind. A chip that lights every update is
    // furniture; see AskHistoryRow.claimCrossed.
    expect(claimsCrossed([toUntested, fromUntested])).toBe(0)
  })

  it('does not count a verdict that did not move', () => {
    expect(claimsCrossed([{ from: 'Supported', to: 'Supported' }])).toBe(0)
    expect(claimsCrossed([])).toBe(0)
  })
})

describe('the ask box’s plan chip', () => {
  const card = {
    planId: 'pc-1',
    title: 'Summer 2026/27 campaign brief.pdf',
    uploadedOn: '2026-08-20T10:00:00.000Z',
    checkedOn: '2026-09-27',
    claims: [{ claim: 'a' }, { claim: 'b' }],
    summary: { supported: 1, contradicted: 1, untested: 0 },
    moved: [{ claim: 'a', from: 'Supported', to: 'Contradicted', on: 'moved 27 Sep' }],
    basis: '', floorLine: '', caveat: '', notice: null, href: '/dashboard/agent/th-2', empty: null,
  } as unknown as PlanCheckCard

  it('takes the newest card the SHARED loader returns, so Ask and Market name one plan', () => {
    const chip = askPlanChip([card])!
    expect(chip.planId).toBe('pc-1')
    expect(chip.claims).toBe(2)
    expect(chip.summary).toEqual({ supported: 1, contradicted: 1, untested: 0 })
  })

  it('lights only on a crossing', () => {
    expect(askPlanChip([card])!.moved).toBe(true)
    const held = { ...card, moved: [{ claim: 'a', from: 'Supported', to: 'Untested', on: 'x' }] } as PlanCheckCard
    expect(askPlanChip([held])!.moved).toBe(false)
    expect(askPlanChip([held])!.crossed).toBe(0)
  })

  it('is absent where no plan has been checked', () => {
    expect(askPlanChip([])).toBeNull()
  })
})

// WP3.9: the starters are written from the front page's biggest objects, and
// only the market front page carries them. Without `marketFront` the loader
// returned the Phase 1 page and the staging render (27 Sep) drew no starter.
describe('loadAskFront', () => {
  const scope = { supabase: {}, clientId: 'c1', reading: { client: {}, clientId: 'c1' } as never }

  it('asks the front page for its market blocks and writes the starters from them', async () => {
    vi.mocked(loadOverview).mockResolvedValueOnce(marketFrontFixture())
    const front = await loadAskFront(scope)
    expect(vi.mocked(loadOverview)).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'c1', params: {} }), { marketFront: true })
    expect(front?.brand).toBe('Sealand')
    expect(front?.starters.length).toBeGreaterThan(0)
    // The lead theme's question, with Sealand's September count under it.
    expect(front?.starters.map((c) => c.question)).toContain('What does my market ask about airline bag sizes?')
  })

  it('is null on the first-run empty state', async () => {
    vi.mocked(loadOverview).mockResolvedValueOnce(null)
    expect(await loadAskFront(scope)).toBeNull()
  })
})

// Walkthrough item 4: the quotes are numbered after the floor, so a dropped
// finding leaves no gap in the numbers, no line in the appendix and no video
// taken from a finding that stands.
describe('numberThreadQuotes', () => {
  const q = (ref: string, videoId: string | null) => ({ ref, text: `words ${ref}`, commentId: ref, videoId, n: 0 })
  const turn = (points: { id: string; quotes: ReturnType<typeof q>[] }[]): Turn => ({
    question: 'q', askedAt: '2026-09-10T00:00:00Z', prose: null, outcome: 'answered', updateAt: null,
    answer: {
      answer: 'a', judgement: [], nearest: [], silent: false, runId: 'r', costUsd: 0,
      grounded: points.map((p) => ({ id: p.id, text: 't', insightIds: [], conversationCount: 9, themeRefs: [], quotes: p.quotes })),
    } as unknown as Turn['answer'],
  })

  it('numbers what is printed, in reading order, one per video across the thread', () => {
    // The floor has already taken turn 0's other finding: its quotes are not here.
    const turns = [
      turn([{ id: 'G2', quotes: [q('c3', 'v3'), q('c4', 'v4')] }]),
      turn([{ id: 'G1', quotes: [q('c5', 'v3'), q('c6', 'v6')] }]),
    ]
    const cited = numberThreadQuotes(turns)
    expect(cited.map((c) => [c.ref, c.n])).toEqual([['c3', 1], ['c4', 2], ['c6', 3]])
    expect(turns[0].answer!.grounded[0].quotes.map((x) => x.n)).toEqual([1, 2])
    expect(turns[1].answer!.grounded[0].quotes.map((x) => x.n)).toEqual([3])
  })

  it('lists nothing for a thread whose answers the floor emptied', () => {
    const turns = [turn([])]
    expect(numberThreadQuotes(turns)).toEqual([])
  })
})
