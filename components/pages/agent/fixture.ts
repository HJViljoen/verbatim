import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '@/lib/rivals'
import { measureAnswer, type AnswerMeasure } from '@/lib/agent/measure'
import {
  askDraws,
  askHistory,
  askRecordHref,
  askRecordLines,
  type AgentThreadData,
  type AskPlanChip,
} from '@/lib/pages/agent-thread'
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
/** The mock's second finding — a subject that held. Its months are real and
 *  flat, so `directionWord` earns nothing and the badge is the non-answer: the
 *  arm wave 2 has to be able to draw beside the one that moved. */
const LABEL_2 = 'Recycled materials'
const REGISTRY_ID_2 = 'reg-recycled'

const BASIS: AskBasis = {
  updateAt: '2026-09-27T04:00:00.000Z',
  monthlyReadings: 3,
  // The months the count IS — `readableMonths` off the same rows, so the draws
  // tile's "3 monthly · Jul, Aug, Sep" and the chart above it name one set.
  readingMonths: ['2026-07-01', '2026-08-01', MONTH],
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

function series(audience: string, rows: [string, number, number][], objectId = REGISTRY_ID, objectLabel = LABEL): MonthSeries {
  return {
    audience,
    names: [audience],
    objectId,
    objectLabel,
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

/** Finding 2's category side: 13.9% → 14.0%, which no band in this product can
 *  call a move. */
const CATEGORY_2 = series(
  INDUSTRY_AUDIENCE,
  [
    ['2026-07-01', 193, 1400],
    ['2026-08-01', 203, 1455],
    [MONTH, 194, 1388],
  ],
  REGISTRY_ID_2,
  LABEL_2,
)

const OWN_2 = series(
  CLIENT_AUDIENCE,
  [
    ['2026-07-01', 34, 79],
    ['2026-08-01', 40, 91],
    [MONTH, 39, 84],
  ],
  REGISTRY_ID_2,
  LABEL_2,
)

export function askMeasure(over: Partial<AnswerMeasure> = {}): AnswerMeasure {
  return {
    ...measureAnswer({
      findings: [
        { findingId: '0:G1', registryIds: [REGISTRY_ID] },
        { findingId: '0:G2', registryIds: [REGISTRY_ID_2] },
      ],
      series: [CATEGORY, OWN, CATEGORY_2, OWN_2],
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

function turn(answerText: string, groundedText: string, secondText?: string): AgentThreadData['turns'][number] {
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
          themeRefs: [{ themeId: 't1', registryId: REGISTRY_ID, label: LABEL }],
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
        {
          id: 'G2',
          text: secondText ?? 'Recycled materials is the subject your own audience raises most, and the category has not changed its mind about it.',
          insightIds: ['i3'],
          themeRefs: [{ themeId: 't2', registryId: REGISTRY_ID_2, label: LABEL_2 }],
          voices: 'category',
          conversationCount: 194,
          quotes: [
            {
              ref: 'c:c2',
              text: 'I want to believe the recycled sails thing but has anyone actually checked?',
              commentId: 'c2',
              videoId: null,
              n: 2,
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
  {
    n: 2,
    ref: 'c:c2',
    text: 'I want to believe the recycled sails thing but has anyone actually checked?',
    platform: 'reddit',
    date: '2026-09-09',
    href: 'https://www.reddit.com/r/onebag/comments/2',
    commentLevel: true,
  },
]

const METHOD: AgentThreadData['method'] = {
  company: 'Sealand',
  period: 'Asked Mon 28 Sep',
  platforms: ['tiktok'],
  videos: null,
  comments: 2,
  note: 'Every quoted voice is a real comment, listed in the appendix.',
}

/**
 * The rail's earlier questions. The middle row is the plan thread whose claim
 * CROSSED between supported and contradicted — the one movement that lights the
 * flag (`AskHistoryRow.claimCrossed`). The other two carry no figures, because
 * nothing stores a per-thread figure: `agent_messages.result` holds a count per
 * grounded point and nothing that summarises a row, and re-deriving one from a
 * stored answer's prose at read time is the re-derivation the reading layer
 * exists to stop (mock-gap Ask, deviation 8).
 */
const HISTORY_ROWS = [
  { threadId: 'th-1', title: 'Should our summer campaign lead with recycled materials or durability?', askedAt: '2026-09-28T08:00:00.000Z' },
  { threadId: 'th-2', title: 'Did the recycled-sails claim land after the August posts?', askedAt: '2026-09-13T09:00:00.000Z', claimCrossed: true },
  { threadId: 'th-3', title: 'Is price fading, or just quieter?', askedAt: '2026-09-06T09:00:00.000Z' },
  { threadId: 'th-4', title: 'What do people complain about with Freitag?', askedAt: '2026-08-20T09:00:00.000Z' },
]

/** The chip, built by the same pure function the loader uses, off the shape the
 *  shared plan loader hands back. */
const PLAN_CHIP: AskPlanChip = {
  planId: 'pc-1',
  title: 'Summer 2026/27 campaign brief.pdf',
  uploadedOn: '2026-08-20T10:00:00.000Z',
  claims: 9,
  summary: { supported: 6, contradicted: 1, untested: 2 },
  crossed: 1,
  moved: true,
  href: '/dashboard/agent/th-2',
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
        // NO DIRECTION WORD IN THE PROSE, and that is a rendering decision the
        // fixture has to hold. `scrubAnswer` LICENSES a direction sentence that
        // names the object whose verdict earned one (`dropUnverdictedDirection`),
        // so a model sentence reading "Will it survive a wet commute is growing"
        // survives the scrub — and the copy contract's rule (c) refuses a
        // direction word outside a `verdict` node whoever wrote it. The surface
        // resolves that the way D5 asks: the word is printed by the product, in
        // its own verdict node, from `directionWord`. The seam between the two
        // rules is written up in the status note; the fixture pins the shape the
        // page actually renders.
        'The wet-commute question is the one no tracked brand answers on camera.',
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
    planChip: PLAN_CHIP,
    // EXCLUDING th-1, which IS this thread: the rail lists where else to go,
    // not where you are (`askHistory`'s `exclude`).
    history: askHistory(HISTORY_ROWS, 3, 'th-1'),
    draws: askDraws(BASIS, 23),
    bar: { question: surface('ask').question ?? '', context: askBasisLine(BASIS, { short: true }) },
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
    // ONE QUESTION AND NO PLAN, AND THE ONE QUESTION IS THIS ONE. A fresh
    // workspace's rail on a thread page: the only thread held is the one being
    // read, so the rows are empty while the month count is 1 — which is why the
    // empty line says "nothing ELSE has been asked" (`EarlierQuestionsTile`).
    history: askHistory(HISTORY_ROWS.slice(0, 1), 3, 'th-1'),
    draws: askDraws(EMPTY_BASIS, null),
    bar: { question: surface('ask').question ?? '', context: askBasisLine(EMPTY_BASIS, { short: true }) },
    record: { lines: askRecordLines(EMPTY_BASIS, null), href: askRecordHref('th-1') },
    ...over,
  }
}


/**
 * A thread with a FOLLOW-UP on it — the state the footer used to get wrong.
 *
 * Turn 1 rests on ONE grounded point, and it is the second theme
 * (`REGISTRY_ID_2`, k = 194), so any figure this turn prints that reads 130 is
 * turn 0's. `answerFindings` keys findings by turn (`findingKey`), so the
 * measurement carries `1:G2` as well as turn 0's two: one measurement per
 * thread, indexed by turn, which is exactly the shape a renderer has to resolve
 * rather than index into.
 */
export function followUpFixture(over: Partial<AgentThreadData> = {}): AgentThreadData {
  const base = agentFixture()
  const followUp = turn(
    'Recycled materials is what your own audience raises; the category has not moved on it.',
    'The recycled-sails claim is asked about rather than repeated back.',
  )
  return {
    ...base,
    turns: [
      base.turns[0],
      {
        ...followUp,
        question: 'And what about the recycled sails on their own?',
        askedAt: '2026-09-28T09:10:00.000Z',
        answer: followUp.answer
          ? { ...followUp.answer, grounded: followUp.answer.grounded.filter((g) => g.id === 'G2') }
          : null,
      },
    ],
    measure: askMeasure({
      ...measureAnswer({
        findings: [
          { findingId: '0:G1', registryIds: [REGISTRY_ID] },
          { findingId: '0:G2', registryIds: [REGISTRY_ID_2] },
          { findingId: '1:G2', registryIds: [REGISTRY_ID_2] },
        ],
        series: [CATEGORY, OWN, CATEGORY_2, OWN_2],
        month: MONTH,
        directionWords: true,
        ownAudience: CLIENT_AUDIENCE,
        hasJudgement: true,
      }),
    }),
    ...over,
  }
}
