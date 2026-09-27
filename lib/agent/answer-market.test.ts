import { beforeEach, describe, expect, it, vi } from 'vitest'

// EVERY MODEL CALL IS MOCKED (WP3.9 done-when 10). The interpret call and the
// answer call both go through `openai.chat.completions.parse`, stubbed here to
// record what it was sent and hand back a fixed parse; the query vectors are
// stubbed too. Nothing here reaches the network, and nothing is spent.
const sent: { model: string; system: string; user: string }[] = []
vi.mock('../openai', () => ({
  samplingParams: () => ({}),
  openai: {
    chat: {
      completions: {
        parse: vi.fn(async (req: { model: string; messages: { role: string; content: string }[] }) => {
          const system = req.messages.find((m) => m.role === 'system')?.content ?? ''
          const user = req.messages.find((m) => m.role === 'user')?.content ?? ''
          sent.push({ model: req.model, system, user })
          if (system.includes('You prepare searches')) {
            return { choices: [{ message: { parsed: { intent: 'about_customers', retrieval_queries: ['cotopaxi colours', 'bag colours'], timeframe: 'current' } } }], usage: { prompt_tokens: 0, completion_tokens: 0 } }
          }
          return {
            choices: [{ message: { parsed: {
              answer: 'People ask which colours are coming.',
              grounded: [{ ref: 'G1', text: 'People ask about colours.', insight_ids: ['coto-1'] }],
              judgement: [],
              nearest: [],
            } } }],
            usage: { prompt_tokens: 0, completion_tokens: 0 },
          }
        }),
      },
    },
  },
}))
vi.mock('../pipeline/cluster', () => ({ embedTexts: async (qs: string[]) => qs.map(() => [0.1]) }))

import { ASK_MONTHLY_CAP } from '../config'
import { evaluateMonthlyCap } from '../ask/quota'
import { fakeDb } from '../test/fake-db'
import { refuseEveryPair } from '../reading/pairs'
import { answerQuestion, namedObjects, retrievalScopeFor, whoseOf, type AskFrame } from './answer'
import { enforceRegisters } from './enforce'

const RUN = 'run-0927'
const CLIENT = 'client-sealand'
const FRAME: AskFrame = {
  // The pages read September on 2 Oct; the last update read it on 27 Sep.
  reading: { month: '2026-09-01', asAt: '2026-09-27T08:30:00.000Z' } as AskFrame['reading'],
  rivals: [{ id: 'comp-cotopaxi', name: 'Cotopaxi' }, { id: 'comp-patagonia', name: 'Patagonia' }],
  // HYPOTHETICAL calibration: a ready subject to exercise the verdict path
  // (decision C; no production subject is ready yet).
  subjects: [{ id: 'subj-looks', name: 'Looks & style', calibration: 'ready' }, { id: 'subj-water', name: 'Waterproofing', calibration: 'provisional' }],
  pair: refuseEveryPair,
}
const NOW = new Date('2026-10-02T06:00:00.000Z')

function world() {
  const insight = (id: string, video: string) => ({ id, client_id: CLIENT, theme: 'colours', description: `${id}`, emotion: null, journey_stage: null, source_video_id: video })
  return fakeDb(
    {
      pipeline_runs: [{ id: RUN, client_id: CLIENT, status: 'completed', started_at: '2026-09-27T04:00:00.000Z' }],
      themes: [
        { id: 't1', client_id: CLIENT, run_id: RUN, registry_id: 'reg-cat', label: 'Interest in specific colors', bucket: 'industry-other', supporting_insight_ids: ['cat-1'] },
        { id: 't2', client_id: CLIENT, run_id: RUN, registry_id: 'reg-coto', label: 'Cotopaxi colours', bucket: 'competitor:Cotopaxi', supporting_insight_ids: ['coto-1'] },
      ],
      audience_insights: [insight('cat-1', 'v-cat'), insight('coto-1', 'v-coto'), insight('pata-1', 'v-pata')],
      videos: [
        { id: 'v-cat', is_client: false, is_competitor: false, competitor_name: null, upload_date: '2026-09-02' },
        { id: 'v-coto', is_client: false, is_competitor: true, competitor_name: 'Cotopaxi', upload_date: '2026-09-05' },
        { id: 'v-pata', is_client: false, is_competitor: true, competitor_name: 'Patagonia', upload_date: '2026-09-06' },
      ],
      insight_evidence: [
        { id: 'e1', audience_insight_id: 'cat-1', quote: 'If you made it in pink and a bigger size I would buy it immediately', relevance_rank: 1, comment_id: 'c1', source_video_id: null, source: 'comment', redacted: false },
        { id: 'e2', audience_insight_id: 'coto-1', quote: 'love the colours on this one', relevance_rank: 1, comment_id: 'c2', source_video_id: null, source: 'comment', redacted: false },
        { id: 'e3', audience_insight_id: 'pata-1', quote: 'patagonia fixed mine for free', relevance_rank: 1, comment_id: 'c3', source_video_id: null, source: 'comment', redacted: false },
      ],
      comments: [{ id: 'c1', comment_date: '2026-09-14' }, { id: 'c2', comment_date: '2026-09-15' }, { id: 'c3', comment_date: '2026-09-16' }],
      comment_translations: [],
    },
    { match_insights: () => [{ id: 'pata-1', similarity: 0.6 }, { id: 'coto-1', similarity: 0.59 }, { id: 'cat-1', similarity: 0.58 }] },
  )
}

beforeEach(() => { sent.length = 0 })

describe('answerQuestion, market-first (WP3.9)', () => {
  it('a Cotopaxi question retrieves the insights filed under Cotopaxi, and says whose they are', async () => {
    const { client } = world()
    const a = await answerQuestion(client as never, {
      clientId: CLIENT, companyName: 'Sealand', question: 'What do people say about Cotopaxi colours?', persist: false, frame: FRAME, now: NOW,
    })
    expect(a.namedRivals).toEqual(['Cotopaxi'])
    expect(a.grounded[0]?.insightIds).toEqual(['coto-1'])
    const answerCall = sent.find((c) => c.system.startsWith('You are Verbatim'))
    expect(answerCall?.user).toContain('whose: filed under Cotopaxi')
    // Patagonia was not named: its filed insight is not evidence here.
    expect(answerCall?.user).not.toContain('pata-1')
  })

  it('reads the market over the last 90 days by default, and all time only when asked', async () => {
    const { client } = world()
    const a = await answerQuestion(client as never, { clientId: CLIENT, companyName: 'Sealand', question: 'Which colours does my market wish for?', persist: false, frame: FRAME, now: NOW })
    expect(a.window).toBe('days90')
    expect(retrievalScopeFor('q', FRAME, 'days90', NOW).window).toEqual({ from: '2026-06-30', to: '2026-09-28' })
    const b = await answerQuestion(client as never, { clientId: CLIENT, companyName: 'Sealand', question: 'q', persist: false, frame: FRAME, now: NOW, window: 'all' })
    expect(b.window).toBe('all')
    expect(retrievalScopeFor('q', FRAME, 'all', NOW).window).toBeNull()
  })

  it('the rule before it is still there, by name: no rival, all time', async () => {
    const { client, calls } = world()
    const a = await answerQuestion(client as never, { clientId: CLIENT, companyName: 'Sealand', question: 'What do people say about Cotopaxi?', persist: false, scope: 'client_voices', now: NOW })
    expect(a.namedRivals).toEqual([])
    expect(a.grounded).toHaveLength(0)
    expect(calls.some((c) => c.table === 'comments')).toBe(false)
  })

  it('a question that names a subject carries that subject, read on the market, into the prompt', async () => {
    expect(namedObjects('What does my market say about Looks & style?', FRAME)).toEqual([
      { kind: 'subject', id: 'subj-looks', label: 'Looks & style', calibration: 'ready' },
    ])
    expect(namedObjects('How does my market feel about Cotopaxi?', FRAME).map((o) => o.kind)).toEqual(['brand', 'mood'])
    expect(whoseOf('client')).toBe('whose: the company’s own post')
    expect(whoseOf('industry-other')).toBeNull()
  })

  it('whatever the timeframe, and says "not read yet" where the months are not there', async () => {
    const { client } = world()
    const a = await answerQuestion(client as never, { clientId: CLIENT, companyName: 'Sealand', question: 'What does my market say about Looks & style?', persist: false, frame: FRAME, now: NOW })
    expect(a.about.map((r) => [r.object.id, r.state])).toEqual([['subj-looks', 'not_read']])
    const answerCall = sent.find((c) => c.system.startsWith('You are Verbatim'))
    expect(answerCall?.user).toContain('WHAT THE QUESTION NAMES, READ ON YOUR MARKET')
    expect(answerCall?.user).toContain('- Looks & style (a subject) · your market: not read yet')
  })

  it('the model is told it answers from the market, and every call went to the mock', async () => {
    const { client } = world()
    await answerQuestion(client as never, { clientId: CLIENT, companyName: 'Sealand', question: 'q', persist: false, frame: FRAME, now: NOW })
    expect(sent).toHaveLength(2)
    expect(sent[0].system).toContain('in Sealand’s market'.replace('’', "'"))
    expect(sent[1].system).toContain('from what their market says in public')
  })
})

describe('what stands (plan §2.8; §9.1 #18)', () => {
  it('the 40-a-month cap stands', () => {
    expect(ASK_MONTHLY_CAP).toBe(40)
    expect(evaluateMonthlyCap(39, ASK_MONTHLY_CAP).ok).toBe(true)
    expect(evaluateMonthlyCap(40, ASK_MONTHLY_CAP).ok).toBe(false)
  })

  it('there is no evidence floor: a point on one conversation is shown, with its count', () => {
    const out = enforceRegisters(
      { answer: 'a', grounded: [{ ref: 'G1', text: 'One person said so.', insightIds: ['i1'] }], judgement: [], nearest: [] },
      [{ id: 'i1', theme: 't', description: 'd', emotion: null, journeyStage: null, videoId: 'v1', bucket: 'industry-other', themeRef: null, similarity: 0.5, quotes: [{ quote: 'I said so', rank: 1, evidenceId: 'e1', source: 'comment', commentId: 'c1', videoId: null }] }],
      { allowNearest: true, runId: 'r', costUsd: 0 },
    )
    expect(out.grounded).toHaveLength(1)
    expect(out.grounded[0].conversationCount).toBe(1)
  })
})
