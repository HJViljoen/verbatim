import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '@/lib/rivals'
import { measureAnswer, type AnswerMeasure } from '@/lib/agent/measure'
import { askRecordHref, askRecordLines, type AgentThreadData } from '@/lib/pages/agent-thread'
import { askBasisLine, type AskBasis } from '@/lib/agent/basis'
import { NOT_ANSWERED_HREF, DECLINED_WHY } from '@/lib/agent/measure'
import { surface } from '@/lib/nav'
import type { MonthPoint, MonthSeries } from '@/lib/reading/series'
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
const REGISTRY_ID = 'reg-wet-commute'

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

/**
 * The fixture's own months — the series `measureAnswer` is run over.
 *
 * THE MEASUREMENT IS COMPUTED, NOT TYPED. A hand-written fixture carried
 * `bandPts: 1.8`, and no verdict in this product can carry a band under 2.0:
 * the band is `max(2 x SE, minBandPts)` and `minBandPts` is 2
 * (lib/report-bands.ts). A fixture is what wave 2 builds a badge and a chart
 * against, so a fixture stating a number the loader can never hand it is worse
 * than no fixture. Running the real function over real series makes that class
 * of error impossible rather than caught.
 */
function monthPoint(month: string, k: number | null, videos: number | null, audience: string): MonthPoint {
  return {
    month,
    state: 'frozen',
    videos,
    comments: videos == null ? null : videos * 8,
    k,
    kComments: k == null ? null : k * 8,
    pct: k != null && videos ? Math.round((k / videos) * 1000) / 10 : null,
    audience,
    status: 'frozen',
    origin: 'live',
    readAt: '2026-09-28T00:00:00.000Z',
    runId: 'run-1',
    frozenAt: null,
    clusteringKey: 'cl-1',
    labels: [],
  }
}

function series(audience: string, rows: [string, number, number][]): MonthSeries {
  return {
    audience,
    names: [audience],
    objectId: REGISTRY_ID,
    objectLabel: LABEL,
    points: rows.map(([month, k, n]) => monthPoint(month, k, n, audience)),
    notes: [],
    firstReadable: rows[0][0],
    substrate: 'seeded',
  }
}

/** The category's side: climbing, one clustering, every month over both floors
 *  — which is what lets `directionWord` earn "growing" here at all. */
const CATEGORY = series(INDUSTRY_AUDIENCE, [
  ['2026-07-01', 71, 1400],
  ['2026-08-01', 99, 1455],
  [MONTH, 130, 1388],
])

/** The client's own side: real, and far under the floor — the caveat, never the
 *  drawn line. */
const OWN = series(CLIENT_AUDIENCE, [
  ['2026-07-01', 21, 79],
  ['2026-08-01', 25, 91],
  [MONTH, 26, 84],
])

export function askMeasure(over: Partial<AnswerMeasure> = {}): AnswerMeasure {
  return {
    ...measureAnswer({
      findings: [{ findingId: '0:G1', registryIds: [REGISTRY_ID] }],
      series: [CATEGORY, OWN],
      month: MONTH,
      // The one reader whose flag is true (`agent.movement`). The fixture pins
      // the TRUE branch; `lib/agent/measure.test.ts` holds both.
      directionWords: true,
      ownAudience: CLIENT_AUDIENCE,
      hasJudgement: true,
    }),
    ...over,
  }
}

/** The verdict the fixture's own months produce. Read off the measurement so
 *  the two can never disagree. */
export const askVerdict = (): Verdict => askMeasure().findings[0].verdict as Verdict

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
      scrub: { dropped: 1, droppedDigits: 1, droppedDirection: 0, magnitude: 0, leaked: true },
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
    record: { lines: askRecordLines(BASIS, 23), href: askRecordHref('th-1') },
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
    record: { lines: askRecordLines(EMPTY_BASIS, null), href: askRecordHref('th-1') },
    ...over,
  }
}

