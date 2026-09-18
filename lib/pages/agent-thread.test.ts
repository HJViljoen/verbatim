import { describe, expect, it } from 'vitest'
import { freezeQuotes, resolveQuotes } from '../renderables/quotes-freeze'
import { agentFixture, refusedFixture } from '../../components/pages/agent/fixture'
import type { AskBasis } from '../agent/basis'
import { agentThreadSlides, answerFindings, askRecordHref, askRecordLines, documentPages, findingKey, type AgentThreadData } from './agent-thread'

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
  bar: { question: 'What does the conversation say about this?', context: 'x' },
  record: null,
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
    expect(answerFindings(measured.turns)).toEqual([{ findingId: '0:G1', registryIds: ['reg-wet-commute'] }])
    // A point written before its themes were registered measures nothing rather
    // than being joined by a label that churns ~88% run to run.
    const unregistered = agentFixture()
    unregistered.turns[0].answer!.grounded[0].themeRefs = [{ themeId: 't1', registryId: null, label: 'Durability' }]
    expect(answerFindings(unregistered.turns)).toEqual([{ findingId: '0:G1', registryIds: [] }])
  })

  it('keys a follow-up\u2019s findings by its own turn, so turn 2\u2019s G1 is not turn 1\u2019s', () => {
    // The model's ref restarts at G1 on every answer. Two turns, both calling
    // their first point G1 and resting on DIFFERENT themes: both have to be
    // measured, or turn 2's prose is scrubbed against turn 1's figures.
    const d = agentFixture()
    const second = JSON.parse(JSON.stringify(d.turns[0])) as AgentThreadData['turns'][number]
    second.answer!.grounded[0].themeRefs = [{ themeId: 't2', registryId: 'reg-zip', label: 'The zip' }]
    expect(answerFindings([d.turns[0], second])).toEqual([
      { findingId: '0:G1', registryIds: ['reg-wet-commute'] },
      { findingId: '1:G1', registryIds: ['reg-zip'] },
    ])
    expect(findingKey(1, 'G1')).toBe('1:G1')
  })

  it('says what is not recorded rather than printing a zero for it', () => {
    const empty: AskBasis = { updateAt: null, monthlyReadings: null, embedded: null, total: null, lastEmbeddedAt: null }
    expect(askRecordLines(empty, null)).toEqual([
      'How many updates have been delivered is not recorded here.',
      'The month-by-month reading has not been recorded for this workspace yet.',
      'How much of the corpus a question can search is not recorded.',
    ])
    const none: AskBasis = { updateAt: null, monthlyReadings: 0, embedded: 0, total: 0, lastEmbeddedAt: null }
    expect(askRecordLines(none, 0)).toEqual([
      'No update has been delivered for this workspace yet.',
      'No month yet carries enough videos to compare on.',
      'There is nothing to search yet.',
    ])
    expect(askRecordLines({ ...empty, monthlyReadings: 1, embedded: 2872, total: 2872 }, 23)).toEqual([
      '23 updates delivered.',
      '1 monthly reading carries enough videos to compare on.',
      '2,872 of 2,872 findings are searchable.',
    ])
  })

  it('opens the record over the page the reader is on, not Ask’s index', () => {
    // From inside a thread the index address would throw the reader back to the
    // question list and lose the answer they were reading.
    expect(askRecordHref('th-1')).toBe('/dashboard/agent/th-1?detail=record')
    expect(agentFixture().record!.href).toBe('/dashboard/agent/th-1?detail=record')
    expect(askRecordHref()).toBe('/dashboard/agent?detail=record')
  })
})

describe('the Ask fixtures', () => {
  it('measures an answer: a level with its own N, a banded verdict, an earned word', () => {
    const d = agentFixture()
    const f = d.measure!.findings[0]
    expect(f.value).toEqual({ k: 130, n: 1388 })
    expect(f.verdict!.state).toBe('moved')
    expect(f.verdict!.changePts).toBe(2.6)
    expect(f.verdict!.bandPts).toBe(1.8)
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
    expect(d.record!.lines[1]).toBe('The month-by-month reading has not been recorded for this workspace yet.')
    expect(d.turns[0].answer!.grounded[0].quotes[0].text).toContain('Three winters')
    // The bar still prints: Ask's context is the basis, not a month reading.
    expect(d.bar.question).toBe('What does the conversation say about this?')
    expect(d.bar.context).toContain('Answers are given against the update of')
  })

  it('freezes and resolves a measured thread without losing the measurement', () => {
    const d = agentFixture()
    const { data: frozen, refs } = freezeQuotes(d)
    expect(refs).toEqual(['c:c1'])
    const thawed = resolveQuotes(frozen, new Map([['c:c1', d.citations[0].text]]))
    expect(thawed).toEqual(d)
  })
})
