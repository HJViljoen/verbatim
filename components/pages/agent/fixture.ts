import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '@/lib/rivals'
import { measureAnswer, scrubThreadAnswer, type AnswerMeasure } from '@/lib/agent/measure'
import {
  askHistory,
  askReads,
  inHouseStyle,
  NO_ASK_READING,
  type AgentThreadData,
  type AskPlanChip,
  type AskReading,
} from '@/lib/pages/agent-thread'
import { sealandReading } from '@/lib/test/reading-fixture'
import { askBasisLine, type AskBasis } from '@/lib/agent/basis'
import { NOT_ANSWERED_HREF, DECLINED_WHY } from '@/lib/agent/measure'
import { surface } from '@/lib/nav'
import type { MonthPoint, MonthSeries } from '@/lib/reading/series'
import type { Verdict } from '@/lib/reading/verdicts'
import { FIXTURE_ENDED } from '@/lib/test/pair-fixture'
import { objectReading } from '@/lib/agent/movement'
import { pairOn } from '@/lib/reading/pairs'
import { sealandJudge } from '@/lib/test/sealand-pairs'

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

/**
 * What an answer reads on Sealand on 25 Sep (WP3.9; the approved preview's
 * rail). REAL NUMBERS: the market's 655 September videos, 626 in the category
 * and 29 filed under a tracked brand, and the client's 9 own posts with a
 * reading (prod as at 24 Sep, plan §2.2); August (377) and September clear
 * the floor; comments reach back to December 2020 (staging, GA F30); the first
 * pair read the same way is October against November, from the 6 Dec update
 * (plan §2.11).
 */
export const SEALAND_ASK_READING: AskReading = {
  reading: sealandReading('2026-09-25T09:00:00.000Z'),
  market: { month: MONTH, videos: 655, comments: 16233, category: 626, rivalFiled: 29 },
  own: 9,
  monthsRead: ['2026-08-01', MONTH],
  earliest: '2020-12-01',
  next: { prevMonth: '2026-10-01', month: '2026-11-01', sameAgeFrom: '2026-12-06T04:00:00.000Z' },
}
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
      // No month pair applies: a fixture pins rendering, read after its months ended (lib/test/pair-fixture.ts).
      pair: null, asOf: FIXTURE_ENDED,
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
    reads: askReads(SEALAND_ASK_READING, 'days90'),
    bar: { question: surface('ask').question ?? '', context: askBasisLine(BASIS, { short: true }), reading: SEALAND_ASK_READING.reading },
    about: [],
    window: 'days90',
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
    // empty line says "nothing ELSE has been asked" (`EarlierQuestionsTile`),
    // and why the footer is absent rather than a hairline with a lone
    // right-aligned "earliest 28 Sep" against it.
    history: askHistory(HISTORY_ROWS.slice(0, 1), 3, 'th-1'),
    reads: askReads(NO_ASK_READING, 'all'),
    bar: { question: surface('ask').question ?? '', context: askBasisLine(EMPTY_BASIS, { short: true }), reading: null },
    about: [],
    window: 'all',
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
        // No month pair applies: a fixture pins rendering, read after its months ended (lib/test/pair-fixture.ts).
        pair: null, asOf: FIXTURE_ENDED,
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

/** The instant T0a's thin-refused Ask fixture is read at: 2 Oct, when
 *  Sealand's August against September is refused on every view. */
const ON_2_OCT = '2026-10-02T06:00:00.000Z'

/**
 * An answer across a month pair the judge REFUSES, ON THIN DATA (T0a review,
 * finding 1; AK-14). The finding's theme came up in 4 of August's 351
 * category videos and 9 of September's 626: under the band's floor of 10 on
 * the earlier side, so the band would say "too few to compare", and the judge
 * refuses the pair for our September searches. It printed "the month before: 4
 * of 351 videos in August" and offered the model `_prev_` keys, while the chart
 * beside it was already cut to September. The object the question named
 * (Looks & style, HYPOTHETICAL ready) is read the same way: 4 of 351, then 9 of
 * 626. Read with the product's own judge (lib/test/sealand-pairs.ts).
 */
export function thinRefusedAskFixture(): AgentThreadData {
  const judge = pairOn(sealandJudge(ON_2_OCT))
  const thin = series(INDUSTRY_AUDIENCE, [
    ['2026-07-01', 3, 330],
    ['2026-08-01', 4, 351],
    [MONTH, 9, 626],
  ])
  const measure = measureAnswer({
    pair: judge,
    asOf: ON_2_OCT,
    findings: [{ findingId: '0:G1', registryIds: [REGISTRY_ID] }],
    series: [thin],
    month: MONTH,
    directionWords: true,
    ownAudience: CLIENT_AUDIENCE,
    hasJudgement: true,
  })
  const about = objectReading(
    {
      object: { kind: 'subject', id: 'subj-looks', label: 'Looks & style', calibration: 'ready' },
      points: [{ month: '2026-07-01', k: 3, n: 330 }, { month: '2026-08-01', k: 4, n: 351 }, { month: MONTH, k: 9, n: 626 }],
    },
    MONTH,
    judge,
    ON_2_OCT,
  )
  return agentFixture({ measure, about: [about] })
}

// ── The live thread Heinrich asked about (1 Oct) ─────────────────────────────

/** Sealand's September as the pages read it on 1 Oct (prod
 *  `month_denominators`, read 1 Oct): 796 in the category and 38 about a
 *  tracked brand (Cotopaxi 9, Freedom of Movement 1, Freitag 6, Patagonia 13,
 *  The North Face 9), so 834 in the market, the Dashboard's figure; the
 *  client's own 10. */
export const SEALAND_OCT_READING: AskReading = {
  reading: sealandReading('2026-10-01T19:36:00.000Z'),
  market: { month: MONTH, videos: 834, comments: 20680, category: 796, rivalFiled: 38 },
  own: 10,
  monthsRead: ['2026-08-01', MONTH],
  earliest: '2020-12-01',
  next: { prevMonth: '2026-10-01', month: '2026-11-01', sameAgeFrom: '2026-12-06T04:00:00.000Z' },
}

/** One grounded point of the live thread: its sentence, and each theme it
 *  rests on with the category's August and September videos (prod
 *  `month_theme_readings`, read 1 Oct; a month with no row is 0). */
const LIVE_POINTS: { id: string; text: string; themes: { id: string; label: string; aug: number; sep: number }[] }[] = [
  {
    id: 'G1',
    text: 'Durability over years is a purchase and loyalty driver; people describe long-lasting products as worth the higher upfront price and something they would repurchase or recommend.',
    themes: [
      { id: '63cf730a-fb7b-4ca1-92d6-66c0a6dedb47', label: 'Products that hold up well', aug: 0, sep: 2 },
      { id: 'a1aa48ac-610d-4d45-a75e-d98d3ec1d270', label: 'Loyalty to preferred bag brands', aug: 2, sep: 6 },
      { id: '5f28f90b-5fd8-4168-9d0f-fb3094061a29', label: 'Trust in long-lasting bag quality', aug: 5, sep: 13 },
      { id: '688c284f-1af1-43e1-97ba-be5489a97956', label: 'Willing to pay for quality', aug: 0, sep: 6 },
    ],
  },
  {
    id: 'G2',
    text: 'Repairability, replacement parts, and dependable warranties shape brand preference; people cite these services as reasons to trust, stay with, or switch to a brand.',
    themes: [
      { id: '5082d6c6-5019-4cd4-bcf0-387e8c16121d', label: 'Would replace with the same gear', aug: 1, sep: 1 },
      { id: 'dcf603ab-5651-4990-a69b-65e5f2dc2bcf', label: 'Gear built to repair', aug: 0, sep: 1 },
      { id: '352ce404-9016-4291-bdc6-e071bc568b40', label: 'Trust built through warranties', aug: 0, sep: 1 },
      { id: 'c730d7b3-2fbc-4a1b-b5f2-60637637cf01', label: 'Open to switching backpack brands', aug: 3, sep: 5 },
    ],
  },
  {
    id: 'G3',
    text: 'Shoppers question whether a premium bag really changes their experience, and skepticism rises when quality feels inconsistent or has declined.',
    themes: [
      { id: '2d1bcf91-5b6b-407f-b391-5ab7df040c35', label: 'Is the premium worth it', aug: 0, sep: 1 },
      { id: '541543c9-eecb-4a16-b043-9c2c259da3c0', label: 'Frustration with declining product quality', aug: 0, sep: 8 },
      { id: '13da13bd-2afd-4dcf-a1a7-b807943dcee1', label: 'Buy less, make it better', aug: 0, sep: 3 },
    ],
  },
  {
    id: 'G4',
    text: 'People evaluate bags through practical questions about fit, compartments, features, and even how to find the brand; unanswered questions can lose support.',
    themes: [
      { id: '2c72bebd-15cf-4836-8f9b-25a6e3d6d026', label: 'Basic product questions before buying', aug: 0, sep: 3 },
      { id: '6977b4c0-9a4e-4a8b-b2ec-101e93740d01', label: 'Curiosity about featured product details', aug: 7, sep: 22 },
      { id: 'd812ace3-47a1-405d-a7c0-0b5b0e4dbe82', label: 'Intent to shop the brand', aug: 3, sep: 18 },
    ],
  },
]

/** When the live thread is read: the evening it was asked. */
const ON_1_OCT = '2026-10-01T19:40:00.000Z'

/**
 * The live thread Heinrich screenshotted (Sealand, 1 Oct, "what's something
 * long term we should work on the next year"; prod thread 0845c247).
 *
 * REAL: the question, the answer, the four grounded sentences, the judgement,
 * every point's theme labels and registry ids, the themes' category videos in
 * August and September, and September's denominators (`SEALAND_OCT_READING`).
 * HYPOTHETICAL: the August denominator (351, staging's), the client's own
 * side (0 of 10 on every theme, as the live page printed for the first) and
 * the quote words, which are stored as comment ids and are placeholders here.
 *
 * Everything else runs through the product's own functions: the judge refuses
 * August against September (as it did on 1 Oct), the measurement chooses each
 * point's side, and the scrub empties G1 and G3 (both on the direction rule),
 * so those two print the product's own sentence in their place.
 */
export function sealandLongTermFixture(): AgentThreadData {
  const judge = pairOn(sealandJudge(ON_1_OCT))
  const series_ = LIVE_POINTS.flatMap((p) => p.themes.flatMap((t) => [
    series(INDUSTRY_AUDIENCE, [['2026-08-01', t.aug, 351], [MONTH, t.sep, 796]], t.id, t.label),
    series(CLIENT_AUDIENCE, [[MONTH, 0, 10]], t.id, t.label),
  ]))
  const measure = measureAnswer({
    pair: judge,
    asOf: ON_1_OCT,
    findings: LIVE_POINTS.map((p) => ({ findingId: `0:${p.id}`, registryIds: p.themes.map((t) => t.id) })),
    series: series_,
    month: MONTH,
    directionWords: true,
    ownAudience: CLIENT_AUDIENCE,
    hasJudgement: true,
    market: { category: 796, rivalFiled: 38 },
  })
  const quote = (n: number) => ({
    ref: `c:live-${n}`,
    text: ['Six years on this pack and it still looks new.', 'They replaced the buckle for free, that is why I stay.', 'Is the expensive one actually any better?', 'Does it fit a 16 inch laptop?'][n - 1],
    commentId: `live-${n}`,
    videoId: null,
    n,
  })
  const raw = {
    answer: 'Over the next year, I’d work on making long-term ownership a pillar of the brand: design for repair, offer clear aftercare and spare-part support, and make the warranty easy to understand. In this category, that is one of the clearest ways to justify a premium, earn repeat buying, and make sustainability feel real.',
    grounded: LIVE_POINTS.map((p, i) => ({
      id: p.id,
      text: p.text,
      insightIds: p.themes.map((t) => `ins-${t.id.slice(0, 8)}`),
      themeRefs: p.themes.map((t) => ({ themeId: `th-${t.id.slice(0, 8)}`, registryId: t.id, label: t.label })),
      voices: 'category' as const,
      conversationCount: 4,
      quotes: [quote(i + 1)],
    })),
  }
  const scrubbed = scrubThreadAnswer(raw, measure, { keyOf: (g) => `0:${g.id}` })
  const base = agentFixture()
  return agentFixture({
    threadId: '0845c247-7bdb-44dc-9148-1c12549b35eb',
    title: 'what’s something long term we should work on the next year',
    createdAt: '2026-10-01T19:36:06.447Z',
    turns: [{
      question: 'what’s something long term we should work on the next year',
      askedAt: '2026-10-01T19:36:06.505Z',
      prose: null,
      outcome: 'answered',
      updateAt: '2026-09-27T04:00:00.000Z',
      // The loader's read-time house style, as the page gets it.
      answer: inHouseStyle({
        answer: scrubbed.answer,
        silent: false,
        nearest: [],
        judgement: [
          { text: 'The long-term priority should be an ownership program, not just a product claim: repairs, spare hardware, refurbishment or refresh services, and a clear warranty and care promise attached to every bag.', basedOn: ['G1', 'G2', 'G3'] },
          { text: 'For the next product cycle, treat repairability as a design requirement by standardizing replaceable components and choosing materials that can be maintained or reconditioned. That turns sustainability into a practical reason to buy.', basedOn: ['G1', 'G2', 'G3'] },
          { text: 'Communicate this more operationally on product pages and in content: what lasts, what can be fixed, how support works, and the key specs people ask about. The market is looking for proof, not just positioning.', basedOn: ['G3', 'G4'] },
        ],
        runId: 'f3646446',
        costUsd: 0.05,
        window: 'all' as const,
        scrub: scrubbed.scrub,
        fallback: null,
        grounded: scrubbed.grounded,
      }),
    }],
    citations: [1, 2, 3, 4].map((n) => ({ n, ref: `c:live-${n}`, text: quote(n).text, platform: ['tiktok', 'youtube', 'reddit', 'instagram'][n - 1], date: '2026-09-2' + n, href: `https://example.com/${n}`, commentLevel: n === 3 })),
    measure,
    reads: askReads(SEALAND_OCT_READING, 'all'),
    bar: { ...base.bar, reading: SEALAND_OCT_READING.reading },
    planChip: null,
    window: 'all',
    // What the loader writes for a question: who and when, nothing else.
    method: { company: 'Sealand', period: 'Asked Thu 1 Oct', platforms: [], videos: null, comments: null, note: null },
  })
}
