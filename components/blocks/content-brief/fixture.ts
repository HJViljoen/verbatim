import { PLAYBOOK_VIDEOS } from '@/components/pages/competitive-surface/fixture'
import { marketFixture } from '@/components/pages/market-surface/fixture'
import { buildPlaybook } from '@/lib/pages/playbook'
import { buildPlaybookSlide, buildRecordSlide, type ContentBriefData } from '@/lib/pages/content-brief'
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
  const playbook = buildPlaybook({ month: MONTH, brand: 'Össur', rival: 'Ottobock', videos: PLAYBOOK_VIDEOS })
  return {
    brand: 'Össur',
    month: MONTH,
    monthLabel: 'September',
    monthStatus: 'filling',
    readingAt: NOW,
    playbook: buildPlaybookSlide({ playbook, brand: 'Össur', rival: 'Ottobock' }),
    record: buildRecordSlide({
      month: MONTH,
      monthStatus: 'filling',
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
  const playbook = buildPlaybook({ month: MONTH, brand: 'Össur', rival: null, videos: own })
  return contentBriefFixture({
    playbook: buildPlaybookSlide({ playbook, brand: 'Össur', rival: null }),
  })
}

/** The fresh database: no video read on the published clock, no month tables,
 *  no gate record. Both blocks print their own honest absence. */
export function refusedContentBriefFixture(): ContentBriefData {
  return contentBriefFixture({
    playbook: buildPlaybookSlide({ playbook: null, brand: 'Össur', rival: null }),
    record: buildRecordSlide({
      month: MONTH,
      monthStatus: 'filling',
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

/** Nothing at all — the empty state both blocks compute without rendering. */
export function emptyContentBriefFixture(): ContentBriefData {
  return contentBriefFixture({
    playbook: buildPlaybookSlide({ playbook: null, brand: 'Össur', rival: null }),
    record: buildRecordSlide({ month: MONTH, monthStatus: 'filling', record: null, delivery: null, readings: null }),
  })
}

// ── the ledger, with a dismissal on it ─────────────────────────────────────

/**
 * Market's own fixture plus the one row it has never carried: a piece of advice
 * the client DISMISSED.
 *
 * `content.make`'s stop card is the mock's "What not to make", and the ledger
 * fixture next door has three rows and no dismissal — so the card had no state
 * to be drawn in. Added here rather than there because the dismissal is this
 * block's reason for existing and Market's page does not draw one specially.
 */
export function ledgerWithDismissal(): MarketSurfaceData {
  const base = marketFixture()
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
  const rows = [...base.advice.rows, dismissed]
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
