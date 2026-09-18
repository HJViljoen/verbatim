import { PLAYBOOK_VIDEOS } from '@/components/pages/competitive-surface/fixture'
import { marketFixture } from '@/components/pages/market-surface/fixture'
import { buildPlaybook } from '@/lib/pages/playbook'
import { buildPlaybookSlide, buildRecordSlide, LEAD_MIN_RATED, type ContentBriefData } from '@/lib/pages/content-brief'
import { methodRecordFixture } from '@/lib/test/method-fixture'
import { deliveryRecord } from '@/lib/settings/delivery'
import { afterwardsFor, groundingFor } from '@/lib/reading/afterwards'
import { actedLine, LEDGER_AUDIENCE, repeatLine, type AdviceRow, type MarketSurfaceData } from '@/lib/pages/market-surface'

// The content brief's block fixtures (Block D wave 2, package E-content).
//
// THREE STATES, AND THE SECOND AND THIRD ARE WHAT A CLIENT MEETS FIRST. The
// populated one is the surface with everything it can have; `thinFixture` is a
// workspace whose own side published almost nothing, which is where the "0 of
// N" cells and the unread sentence live; `refusedFixture` is a fresh database
// with M1–M9 unapplied — no month tables, no gate record — where the record
// falls back to the sentences it can still stand behind.
//
// THE VIDEOS ARE COMPETITIVE'S OWN, NOT A SECOND SET. `PLAYBOOK_VIDEOS` is the
// corpus CO7's fixture is built on and `buildPlaybook` is the function both
// call. Two fixtures of one reading is two chances for a table to print a share
// the builder would never produce.

const NOW = '2026-09-18T09:00:00.000Z'
const MONTH = '2026-09-01'

const UPDATES = [
  { id: 'u1', status: 'completed', startedAt: '2026-09-06T05:00:00.000Z', completedAt: '2026-09-06T06:00:00.000Z', scheduledFor: '2026-09-06T05:00:00.000Z', stalled: false },
  { id: 'u2', status: 'completed', startedAt: '2026-09-13T05:00:00.000Z', completedAt: '2026-09-13T06:00:00.000Z', scheduledFor: '2026-09-13T05:00:00.000Z', stalled: false },
  { id: 'u3', status: 'completed', startedAt: '2026-09-20T05:00:00.000Z', completedAt: '2026-09-20T06:00:00.000Z', scheduledFor: null, stalled: false },
  { id: 'u4', status: 'completed', startedAt: '2026-09-27T05:00:00.000Z', completedAt: '2026-09-27T06:00:00.000Z', scheduledFor: '2026-09-27T05:00:00.000Z', stalled: false },
]

export function contentBriefFixture(over: Partial<ContentBriefData> = {}): ContentBriefData {
  // The same floor the surface passes, so the fixture prints what a tenant does.
  const playbook = buildPlaybook({ month: MONTH, brand: 'Össur', rival: 'Ottobock', videos: PLAYBOOK_VIDEOS, conclusionMinRated: LEAD_MIN_RATED })
  return {
    brand: 'Össur',
    month: MONTH,
    monthLabel: 'September',
    monthStatus: 'filling',
    readingAt: NOW,
    playbook: buildPlaybookSlide({ playbook, read: true, brand: 'Össur', monthLabel: 'September', rival: 'Ottobock' }),
    record: buildRecordSlide({
      month: MONTH,
      monthStatus: 'filling',
      read: true,
      // THE TWO REFUSALS AND THE COUNT AGREE. `comparisonsRefused` is what the
      // card prints and `refusals` is what the record's own sentence names, so
      // a fixture that sets one without the other puts "2 comparisons not
      // drawn" beside "every comparison this page asked for was drawn".
      record: methodRecordFixture({
        refusals: [
          { state: 'too_little_data', reason: null },
          { state: 'refused', reason: 'tracking_change' },
        ],
      }),
      delivery: deliveryRecord({ updates: UPDATES, slotsRecorded: true }).line,
      readings: 3,
    }),
    ...over,
  }
}

/** A workspace with no rival tracked and nothing of its own published this
 *  month: the arm where a column is "0 of N" and a side says it was not read. */
export function thinContentBriefFixture(): ContentBriefData {
  const own = PLAYBOOK_VIDEOS.filter((v) => !v.is_client)
  const playbook = buildPlaybook({ month: MONTH, brand: 'Össur', rival: null, videos: own, conclusionMinRated: LEAD_MIN_RATED })
  return contentBriefFixture({
    playbook: buildPlaybookSlide({ playbook, read: true, brand: 'Össur', monthLabel: 'September', rival: null }),
  })
}

/**
 * The fresh database: nothing published has been read on the published clock,
 * no month tables, no gate record. Both blocks print their own honest absence.
 *
 * THE READ HAPPENED HERE. `videos` is a base table on a fresh database and
 * `loadPlaybookVideos` returns an empty array from it rather than throwing, so
 * this is the "nothing read" arm and not the "could not be read" one — which
 * is the distinction design review 1 found collapsed.
 */
export function refusedContentBriefFixture(): ContentBriefData {
  return contentBriefFixture({
    playbook: buildPlaybookSlide({ playbook: buildPlaybook({ month: MONTH, brand: 'Össur', rival: null, videos: [] }), read: true, brand: 'Össur', monthLabel: 'September', rival: null }),
    record: buildRecordSlide({
      month: MONTH,
      monthStatus: 'filling',
      read: true,
      record: methodRecordFixture({
        coverage: null,
        language: { analysed: 0, unknown: 0, english: 0, notEnglish: 0, basis: 'video_speech' },
        instrument: { themesPerVideo: null, themeAttachments: 0, analysedVideos: 0, runId: null },
        comparisonsRefused: null,
      }),
      delivery: null,
      readings: null,
    }),
  })
}

/** Nothing at all, and nothing to say why: every read threw. Both blocks print
 *  the sentence about OUR reading, never one about the world. */
export function emptyContentBriefFixture(): ContentBriefData {
  return contentBriefFixture({
    playbook: buildPlaybookSlide({ playbook: null, read: false, brand: 'Össur', monthLabel: 'September', rival: null }),
    record: buildRecordSlide({ month: MONTH, monthStatus: 'filling', record: null, read: false, delivery: null, readings: null }),
  })
}

/**
 * Videos were published and read, and the classifier has reached none of them
 * — the state a tenant is in between a gather and its first classifier pass,
 * and the one that printed "no video was published in this month".
 */
export function unclassifiedContentBriefFixture(): ContentBriefData {
  const unclassified = PLAYBOOK_VIDEOS.map((v) => ({ ...v, classified_type: null, hook_style: null }))
  return contentBriefFixture({
    playbook: buildPlaybookSlide({
      playbook: buildPlaybook({ month: MONTH, brand: 'Össur', rival: 'Ottobock', videos: unclassified }),
      read: true,
      brand: 'Össur',
      monthLabel: 'September',
      rival: 'Ottobock',
    }),
  })
}

// ── the ledger, with a dismissal on it ─────────────────────────────────────

/**
 * Market's own fixture plus the rows it has never carried: two pieces of advice
 * still OPEN, and one the client DISMISSED.
 *
 * MARKET'S THREE ROWS ARE TWO `acted_on` AND ONE `new`, WHICH IS PRODUCTION
 * TODAY — and once `toMake` stopped calling finished work a thing to make
 * (design review 2), this fixture drew one card on a page whose subject is
 * three. The two open rows are here rather than in Market's fixture because
 * they exist for this block: a card carries a reading, a quote and an argument,
 * and Market's table draws none of the three.
 *
 * `content.make`'s stop card is the mock's "What not to make", and the ledger
 * fixture next door has three rows and no dismissal — so the card had no state
 * to be drawn in. Added here rather than there because the dismissal is this
 * block's reason for existing and Market's page does not draw one specially.
 */
export function ledgerWithDismissal(): MarketSurfaceData {
  const base = marketFixture()
  const open: AdviceRow[] = [
    {
      lineageId: 'L-repair-clip',
      recommendationId: 'r-repair-clip',
      title: 'Answer the seam question in a clip of its own',
      kind: 'content_strategy',
      firstMade: '2026-07-15',
      timesMade: 2,
      monthsRepeated: 2,
      repeatedWithinMonth: false,
      status: 'acknowledged',
      statusLabel: 'Acknowledged',
      decidedAt: '2026-07-20T09:00:00.000Z',
      number: 5,
      basedOn: ['mi-11'],
      grounded: groundingFor({
        basedOn: ['ai-11', 'ai-12', 'ai-13'],
        videoByInsight: new Map([['ai-11', 'v11'], ['ai-12', 'v12'], ['ai-13', 'v13']]),
        themeIds: ['repair_and_warranty'],
        audience: LEDGER_AUDIENCE,
        month: MONTH,
      }),
      afterwards: afterwardsFor({
        decidedAt: '2026-07-20T09:00:00.000Z',
        targetIds: ['reg-repair'],
        objectLabel: 'Repair & warranty',
        series: [
          { month: '2026-06-01', k: 12, n: 118 },
          { month: '2026-08-01', k: 16, n: 124 },
          { month: '2026-09-01', k: 21, n: 130 },
        ],
        audience: LEDGER_AUDIENCE,
      }),
      why: 'The question arrives as a question and never as a complaint, and nobody in the category answers it where it is asked.',
      quote: { ref: 'e:ev-11', text: 'Hoe lank hou die naat werklik?', lang: 'af', english: 'How long does the seam actually hold?' },
    },
    {
      lineageId: 'L-fit-sizes',
      recommendationId: 'r-fit-sizes',
      title: 'Show the fit on more than one body on camera',
      kind: 'customer_experience',
      firstMade: '2026-08-20',
      timesMade: 1,
      monthsRepeated: 1,
      repeatedWithinMonth: false,
      status: 'in_progress',
      statusLabel: 'Working on it',
      decidedAt: '2026-09-01T08:00:00.000Z',
      number: 6,
      basedOn: ['mi-12'],
      grounded: groundingFor({
        basedOn: ['ai-14', 'ai-15'],
        videoByInsight: new Map([['ai-14', 'v14'], ['ai-15', 'v15']]),
        themeIds: ['fit_and_sizing'],
        audience: LEDGER_AUDIENCE,
        month: MONTH,
      }),
      afterwards: afterwardsFor({
        decidedAt: '2026-09-01T08:00:00.000Z',
        targetIds: ['reg-fit'],
        objectLabel: 'Fit & sizing',
        series: [
          { month: '2026-07-01', k: 18, n: 118 },
          { month: '2026-08-01', k: 19, n: 124 },
          { month: '2026-09-01', k: 24, n: 130 },
        ],
        audience: LEDGER_AUDIENCE,
      }),
      why: 'Fit is asked about on every video that shows one body and never on the ones that show two.',
      quote: null,
    },
  ]
  const dismissed: AdviceRow = {
    lineageId: 'L-price',
    recommendationId: 'r-price',
    title: 'Lead with price comparisons against Ottobock',
    kind: 'positioning_messaging',
    firstMade: '2026-07-04',
    timesMade: 3,
    monthsRepeated: 2,
    repeatedWithinMonth: false,
    status: 'dismissed',
    statusLabel: 'Dismissed',
    decidedAt: '2026-07-28T10:00:00.000Z',
    number: 4,
    basedOn: ['mi-9'],
    grounded: groundingFor({
      basedOn: ['ai-9', 'ai-10'],
      videoByInsight: new Map([['ai-9', 'v9'], ['ai-10', 'v10']]),
      themeIds: ['price_and_value'],
      audience: LEDGER_AUDIENCE,
      month: MONTH,
    }),
    afterwards: afterwardsFor({
      decidedAt: '2026-07-28T10:00:00.000Z',
      targetIds: ['reg-price'],
      objectLabel: 'Price and value',
      series: [
        { month: '2026-06-01', k: 34, n: 118 },
        { month: '2026-08-01', k: 30, n: 124 },
        { month: '2026-09-01', k: 27, n: 130 },
      ],
      audience: LEDGER_AUDIENCE,
    }),
    why: 'Price is the subject the category argues about, and the half of that argument you can answer on camera is how long the thing lasts.',
    quote: { ref: 'e:ev-9', text: 'Die sak hou vir ewig, maar die prys is ’n grap', lang: 'af', english: 'The bag lasts forever, but the price is a joke' },
  }
  const rows = [...base.advice.rows, ...open, dismissed]
  return {
    ...base,
    advice: { ...base.advice, rows, actedLine: actedLine(3, 64), repeatLine: repeatLine(rows), acted: 3 },
  }
}

/** The ledger with nothing on it — the block's own empty state. */
export function emptyLedger(): MarketSurfaceData {
  const base = marketFixture()
  return { ...base, advice: { ...base.advice, rows: [], total: 0, acted: 0, empty: 'Advice lands with your next update.' } }
}
