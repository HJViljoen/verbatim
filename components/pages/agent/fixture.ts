import { INDUSTRY_AUDIENCE } from '@/lib/rivals'
import { INTERPRETATION_CAVEAT, TOO_FEW, type AnswerMeasure } from '@/lib/agent/measure'
import { ASK_RECORD_HREF, askRecordLines, type AgentThreadData } from '@/lib/pages/agent-thread'
import { askBasisLine, type AskBasis } from '@/lib/agent/basis'
import { NOT_ANSWERED_HREF, DECLINED_WHY } from '@/lib/agent/measure'
import { surface } from '@/lib/nav'
import type { Verdict } from '@/lib/reading/verdicts'

// Ask's fixtures (Phase 1 Block D, package D8).
//
// TWO STATES, BOTH REAL, and the second one is the one to look at first.
//
// `agentFixture()` is a thread on a workspace whose months are seeded: the
// finding carries its level with its own denominator, a banded verdict, a
// three-month series and — because `agent.movement` is the one reader flag that
// is true — an earned direction word. It is the shape the mock's Ask artboard
// draws, with the mock's own claims replaced by the honest ones: no Freitag
// line (a rival's months are out of Ask's scope by construction), no
// model-typed figures in the prose, and the client's own thin side stated as a
// caveat rather than compared.
//
// `refusedFixture()` is the state a fresh database is in and the one a reviewer
// will actually see: the monthly reading is not seeded, so `measure` is null,
// the record lines say what is not recorded rather than printing a zero, and
// the answer is prose and quotes alone. Every new field has to survive it.

const MONTH = '2026-09-01'
const LABEL = 'Will it survive a wet commute'

const BASIS: AskBasis = {
  updateAt: '2026-09-27T04:00:00.000Z',
  monthlyReadings: 3,
  embedded: 2872,
  total: 2872,
  lastEmbeddedAt: '2026-09-15T07:31:49.323Z',
}

const EMPTY_BASIS: AskBasis = {
  updateAt: '2026-09-27T04:00:00.000Z',
  monthlyReadings: null,
  embedded: 2872,
  total: 2872,
  lastEmbeddedAt: null,
}

export const askVerdict = (over: Partial<Verdict> = {}): Verdict => ({
  objectKind: 'theme',
  objectId: 'reg-wet-commute',
  objectLabel: LABEL,
  audience: INDUSTRY_AUDIENCE,
  window: { kind: 'month', from: MONTH, to: '2026-10-01' },
  basis: { from: '2026-08-01', to: MONTH },
  value: { k: 130, n: 1388 },
  baseline: { k: 99, n: 1455 },
  changePts: 2.6,
  bandPts: 1.8,
  state: 'moved',
  direction: 'growing',
  flags: [],
  ...over,
})

export function askMeasure(over: Partial<AnswerMeasure> = {}): AnswerMeasure {
  const verdict = askVerdict()
  const figures = {
    f1_k: { value: 130, unit: 'videos' as const, label: `videos naming ${LABEL} in September` },
    f1_n: { value: 1388, unit: 'videos' as const, label: 'videos read in The category in September' },
    f1_pct: { value: 9.4, unit: 'pct' as const, label: `${LABEL}’s share of The category in September` },
    f1_prev_k: { value: 99, unit: 'videos' as const, label: `videos naming ${LABEL} the month before` },
    f1_prev_n: { value: 1455, unit: 'videos' as const, label: 'videos read in The category the month before' },
    f1_prev_pct: { value: 6.8, unit: 'pct' as const, label: `${LABEL}’s share the month before` },
    f1_change: { value: 2.6, unit: 'pts' as const, label: `change in ${LABEL}’s share` },
    f1_band: { value: 1.8, unit: 'pts' as const, label: `the band ${LABEL}’s change is judged against` },
  }
  return {
    findings: [
      {
        findingId: 'G1',
        value: { k: 130, n: 1388 },
        audience: INDUSTRY_AUDIENCE,
        audienceLabel: 'The category',
        label: LABEL,
        series: [
          { month: '2026-07-01', k: 71, n: 1400, pct: 5.1 },
          { month: '2026-08-01', k: 99, n: 1455, pct: 6.8 },
          { month: MONTH, k: 130, n: 1388, pct: 9.4 },
        ],
        verdict,
        direction: 'growing',
        figures,
      },
    ],
    verdicts: [verdict],
    figures,
    caveats: [
      INTERPRETATION_CAVEAT,
      `Your own side of ${LABEL} is 26 of 84 videos in September — ${TOO_FEW}.`,
    ],
    ...over,
  }
}

function turn(answerText: string, groundedText: string): AgentThreadData['turns'][number] {
  return {
    question: 'Should our summer campaign lead with recycled materials or durability?',
    askedAt: '2026-09-28T08:00:00.000Z',
    prose: null,
    outcome: 'answered',
    updateAt: '2026-09-27T04:00:00.000Z',
    answer: {
      answer: answerText,
      silent: false,
      nearest: [],
      judgement: [{ text: 'Lead with durability and let the recycled sails carry the proof underneath it.', basedOn: ['G1'] }],
      runId: 'run-1',
      costUsd: 0.04,
      scrub: { dropped: 1, droppedDigits: 1, droppedDirection: 0, leaked: true },
      fallback: null,
      grounded: [
        {
          id: 'G1',
          text: groundedText,
          insightIds: ['i1', 'i2'],
          themeRefs: [{ themeId: 't1', registryId: 'reg-wet-commute', label: LABEL }],
          voices: 'category',
          conversationCount: 130,
          quotes: [
            {
              ref: 'c:c1',
              text: 'Three winters on the bike and the seams are still perfect. The zip, less so.',
              commentId: 'c1',
              videoId: null,
              n: 1,
            },
          ],
        },
      ],
    },
  }
}

const CITATIONS: AgentThreadData['citations'] = [
  {
    n: 1,
    ref: 'c:c1',
    text: 'Three winters on the bike and the seams are still perfect. The zip, less so.',
    platform: 'tiktok',
    date: '2026-09-14',
    href: 'https://www.tiktok.com/@x/video/1',
    commentLevel: true,
  },
]

const METHOD: AgentThreadData['method'] = {
  company: 'Sealand',
  period: 'Asked Mon 28 Sep',
  platforms: ['tiktok'],
  videos: null,
  comments: 1,
  note: 'Every quoted voice is a real comment, listed in the appendix.',
}

/** A measured answer: months seeded, a verdict earned, a direction word the one
 *  true reader flag allows. */
export function agentFixture(over: Partial<AgentThreadData> = {}): AgentThreadData {
  return {
    threadId: 'th-1',
    kind: 'question',
    title: 'Should our summer campaign lead with recycled materials or durability?',
    brand: 'Sealand',
    createdAt: '2026-09-28T08:00:00.000Z',
    // The prose here is post-scrub: the sentence the model typed a figure into
    // is already gone, and the direction word that survives is the one the
    // verdict earned.
    turns: [
      turn(
        'Durability — it is the question underneath the category, and it is asked rather than praised.',
        `The wet-commute question is growing, and no tracked brand answers it on camera.`,
      ),
    ],
    citations: CITATIONS,
    silentQuestions: [],
    document: null,
    basis: BASIS,
    measure: askMeasure(),
    notAnswered: {
      month: MONTH,
      asked: 3,
      cap: 40,
      declined: [
        { question: 'Did our August ad spend move anything?', why: DECLINED_WHY.out_of_corpus },
        { question: 'Anything compared against Poler?', why: DECLINED_WHY.silent },
      ],
      line: '3 of 40 questions asked this month. 2 of them could not be answered from the conversation.',
      href: NOT_ANSWERED_HREF,
    },
    planChip: { planId: 'pc-1', title: 'Summer 2026/27 campaign brief', moved: true },
    bar: { question: surface('ask').question ?? '', context: askBasisLine(BASIS) },
    record: { lines: askRecordLines(BASIS, 23), href: ASK_RECORD_HREF },
    method: METHOD,
    ...over,
  }
}

/**
 * The same thread on a workspace whose months are NOT seeded — which is every
 * fresh database and, for the subject and kind tables, production today.
 *
 * Nothing here is a zero. `measure` is null because there is no reading, not
 * because nothing moved; the record lines say what is not recorded; the plan
 * chip is absent because no plan has been checked. The answer keeps its prose
 * and its quote, which is all Ask has ever had.
 */
export function refusedFixture(over: Partial<AgentThreadData> = {}): AgentThreadData {
  const base = agentFixture()
  return {
    ...base,
    turns: [
      turn(
        'Durability — it is the question underneath the category, and it is asked rather than praised.',
        'The wet-commute question is the one nobody answers on camera.',
      ),
    ],
    basis: EMPTY_BASIS,
    measure: null,
    notAnswered: {
      month: MONTH,
      asked: 1,
      cap: 40,
      declined: [],
      line: '1 of 40 questions asked this month. Every one was answered from the conversation.',
      href: NOT_ANSWERED_HREF,
    },
    planChip: null,
    bar: { question: surface('ask').question ?? '', context: askBasisLine(EMPTY_BASIS) },
    record: { lines: askRecordLines(EMPTY_BASIS, null), href: ASK_RECORD_HREF },
    ...over,
  }
}

