import { describe, expect, it, vi } from 'vitest'

// NO MODEL CALL: the answering engine is mocked whole. What is pinned is what
// the brief path does with an answer once it has one (WP3.9 done-when 6).
const asked: { question: string; frame: unknown }[] = []
vi.mock('../../agent/answer', () => ({
  loadAskFrame: vi.fn(async () => ({ reading: { month: '2026-09-01', asAt: '2026-09-27T08:30:00.000Z' }, rivals: [], subjects: [], pair: () => ({ mode: 'refuse', reasons: [{ kind: 'unmeasured', changeId: null, share: null }], row: null }) })),
  answerQuestion: vi.fn(async (_admin: unknown, args: { question: string; frame: unknown }) => {
    asked.push({ question: args.question, frame: args.frame })
    return {
      answer: 'Interest in carry-on sizes is growing fast. People ask which bag fits the cabin.',
      grounded: [
        { id: 'G1', text: 'Sales rose 40% in September.', insightIds: ['i1'], themeRefs: [{ themeId: 't1', registryId: 'reg-airline', label: 'Confusion over airline bag sizes' }], voices: 'category', quotes: [{ text: 'About time they do something about too big carry on suitcases', commentId: 'c1', videoId: null }], conversationCount: 3 },
        { id: 'G2', text: 'People ask which bag fits the cabin.', insightIds: ['i2'], themeRefs: [{ themeId: 't1', registryId: 'reg-airline', label: 'Confusion over airline bag sizes' }], voices: 'category', quotes: [], conversationCount: 2 },
      ],
      judgement: [],
      silent: false,
      nearest: [],
      runId: 'run-0927',
      costUsd: 0.05,
      plan: { intent: 'about_customers', retrievalQueries: [], timeframe: 'current' },
      retrievedCount: 2,
      emptyQueries: [],
      window: 'days90',
      namedRivals: [],
      about: [],
    }
  }),
}))

import { fakeDb } from '../../test/fake-db'
import { POINT_REMOVED_NOTE } from '../../agent/measure'
import { runResearch } from './research'

describe('the brief research path: the Ask page’s measurement and scrub (WP3.9)', () => {
  it('drops a figure the model typed and a direction no verdict earned, and keeps the quotes', async () => {
    asked.length = 0
    // No month table here: the measurement is of nothing, so every figure and
    // every direction the model typed goes.
    const { client } = fakeDb({ config_changes: [], pipeline_runs: [] })
    const out = await runResearch(client as never, {
      clientId: 'client-sealand', companyName: 'Sealand', runId: 'run-0927', budgetUsd: 3, now: new Date('2026-10-02T06:00:00.000Z'),
      questions: [{ id: 'q1', text: 'What does my market ask about carry-on sizes?', purpose: 'anchor' }],
    })
    const a = out.answers[0]
    expect(a.answer).toBe('People ask which bag fits the cabin.')
    expect(a.answer).not.toMatch(/growing/)
    const [g1, g2] = a.grounded
    // The point whose only sentence named a figure keeps its voices and says
    // why its sentence is gone.
    expect(g1.text).toBe(POINT_REMOVED_NOTE)
    expect(g1.replaced).toBe(true)
    expect(g1.quotes).toHaveLength(1)
    expect(g1.registryIds).toEqual(['reg-airline'])
    expect(g2.text).toBe('People ask which bag fits the cabin.')
    expect(g2.replaced).toBeUndefined()
  })

  it('reads the market frame once for the build and hands it to every question', async () => {
    asked.length = 0
    const { client } = fakeDb({ config_changes: [], pipeline_runs: [] })
    await runResearch(client as never, {
      clientId: 'client-sealand', companyName: 'Sealand', runId: 'run-0927', budgetUsd: 3, parallel: 3,
      questions: [
        { id: 'q1', text: 'a', purpose: 'anchor' },
        { id: 'q2', text: 'b', purpose: 'anchor' },
        { id: 'q3', text: 'c', purpose: 'anchor' },
      ],
    })
    expect(asked).toHaveLength(3)
    expect(new Set(asked.map((x) => x.frame)).size).toBe(1)
    expect(asked[0].frame).toBeTruthy()
  })
})
