import type { AdviceRow, MarketSurfaceData } from '@/lib/pages/market-surface'
import {
  ADVICE_EMPTY, ADVICE_REQUESTED_LINE, ADVICE_UNLOCK, CLAIMS_CAVEAT, CONCLUSIONS_CORPUS_LINE,
  CONCLUSIONS_NEW_LINE,
  LEDGER_AUDIENCE, MOVES_EMPTY_MK4, MOVES_UNRECORDED,
  actedLine, moveLedgerLine, repeatLine, unlockRows, waysOfMoving,
} from '@/lib/pages/market-surface'
import { MOVES_MASTHEAD, MOVES_UNLOCK } from '@/lib/pages/overview'
import { cardFixture, moveReadingFixture } from '@/components/pages/overview/fixture'
import { methodFixture, methodRefusedFixture } from '@/lib/test/method-fixture'
import { refusals, refusedSentence } from '@/lib/reading/record'
import type { Verdict } from '@/lib/reading/verdicts'
import { PLAN_EMPTY, planCard } from '@/lib/ask/plan-cards'
import { afterwardsFor, groundingFor } from '@/lib/reading/afterwards'
import { recurrenceOf } from '@/lib/reading/head-to-head'

// Market's block fixtures (Phase 1 WP14).
//
// TWO STATES, BOTH REAL. `marketFixture()` is the surface with everything it
// can have — conclusions, a ledger with a decision on it, a dated move, advice
// to accept. `unrecordedFixture()` is PRODUCTION on the day this shipped: M4 is
// not applied, so there is no `moves` table to list from and nothing has been
// dated; the ledger is 64 identities of which the client has decided one.
//
// Every block is rendered in both, in all three modes, because the second is
// the reading a client meets first.

const NOW = '2026-09-18T09:00:00.000Z'

/** The verdicts the ledger's own rows produced — the same list the loader
 *  hands the record, so the fixture's method note cannot say something the
 *  table beside it disproves. */
const ledgerVerdicts = (rows: readonly AdviceRow[]): Verdict[] =>
  rows.map((r) => r.afterwards.verdict).filter((v): v is Verdict => v != null)

export function marketFixture(over: Partial<MarketSurfaceData> = {}): MarketSurfaceData {
  const adviceRows: AdviceRow[] = [
    {
      lineageId: 'L-old',
      recommendationId: 'r-old',
      title: 'Lead with repairability, not recycling, in the next campaign',
      kind: 'positioning_messaging',
      firstMade: '2026-06-28',
      timesMade: 1,
      monthsRepeated: 1,
      repeatedWithinMonth: false,
      status: 'acted_on' as const,
      statusLabel: 'Done',
      decidedAt: '2026-06-02T10:00:00.000Z',
      number: 1,
      basedOn: ['mi-1'],
      // D4's full row: the three columns the ledger has never had.
      grounded: groundingFor({
        basedOn: ['ai-1', 'ai-2', 'ai-3'],
        videoByInsight: new Map([['ai-1', 'v1'], ['ai-2', 'v2'], ['ai-3', 'v3']]),
        themeIds: ['repair_and_warranty', 'zips'],
        audience: LEDGER_AUDIENCE,
        month: '2026-09-01',
      }),
      // Decided in June, so July and September are both strictly after it and
      // the comparison is drawn. Two month readings, never a pool of them.
      afterwards: afterwardsFor({
        decidedAt: '2026-06-02T10:00:00.000Z',
        targetIds: ['reg-repair'],
        objectLabel: 'Repair & warranty',
        series: [
          { month: '2026-05-01', k: 9, n: 104 },
          { month: '2026-07-01', k: 11, n: 118 },
          { month: '2026-09-01', k: 21, n: 130 },
        ],
        audience: LEDGER_AUDIENCE,
      }),
      // A production reasoning, scrubbed: the model's argument with its
      // figure-bearing sentence already gone.
      why: 'Repair and warranty questions arrive as questions rather than complaints, and nobody in the category answers them on camera. Leading with the repair path uses the thing your audience already asks about.',
      quote: { ref: 'e:ev-1', text: 'Wat gebeur as ’n naat gee? Niemand sê nie.', lang: 'af', english: 'What happens when a seam goes? Nobody says.' },
    },
    {
      // THE MIDDLE STATE, AND THE ONE PRODUCTION IS ENTIRELY IN TODAY: decided
      // this month, so nothing has been read since and the cell says exactly
      // that instead of printing a dash or an arrow between two readings taken
      // at two arbitrary moments.
      lineageId: 'L-recent',
      recommendationId: 'r-recent',
      title: 'Show the warranty process on camera',
      kind: 'positioning_messaging',
      firstMade: '2026-08-04',
      timesMade: 2,
      monthsRepeated: 2,
      repeatedWithinMonth: false,
      status: 'acted_on' as const,
      statusLabel: 'Done',
      decidedAt: '2026-09-02T10:00:00.000Z',
      number: 2,
      basedOn: ['mi-2'],
      grounded: groundingFor({
        basedOn: ['ai-4', 'ai-5'],
        videoByInsight: new Map([['ai-4', 'v4'], ['ai-5', 'v5']]),
        themeIds: ['repair_and_warranty'],
        audience: LEDGER_AUDIENCE,
        month: '2026-09-01',
      }),
      afterwards: afterwardsFor({
        decidedAt: '2026-09-02T10:00:00.000Z',
        targetIds: ['reg-repair'],
        objectLabel: 'Repair & warranty',
        series: [
          { month: '2026-07-01', k: 11, n: 118 },
          { month: '2026-08-01', k: 14, n: 124 },
          { month: '2026-09-01', k: 21, n: 130 },
        ],
        audience: LEDGER_AUDIENCE,
      }),
      why: 'Nobody in the category shows the repair path on camera, so the question is asked and never answered where it is asked.',
      quote: null,
    },
    {
      lineageId: 'L-twice',
      recommendationId: 'r-twice',
      title: 'Increase Content Volume to Improve Share of Voice',
      kind: 'customer_experience',
      firstMade: '2026-09-10',
      timesMade: 2,
      monthsRepeated: 1,
      repeatedWithinMonth: true,
      status: 'new' as const,
      statusLabel: 'New',
      decidedAt: null,
      number: 3,
      basedOn: [],
      // THE DEGRADED ARM, ON THE SAME PAGE AS THE FULL ONE. Nothing recorded
      // behind it, nothing decided, no quote the evidence can vouch for — and
      // every cell still says something rather than printing a dash.
      grounded: null,
      afterwards: afterwardsFor({ decidedAt: null, targetIds: [], series: [], audience: LEDGER_AUDIENCE }),
      why: null,
      quote: null,
    },
  ]

  const acceptable = { lineageId: 'L-twice', recommendationId: 'r-twice', title: adviceRows[2].title }

  return {
    brand: 'Sealand',
    month: '2026-09-01',
    monthStatus: 'filling',
    readingAt: NOW,
    masthead: MOVES_MASTHEAD,
    conclusions: {
      rows: [
        {
          id: 'mi-1',
          title: 'Comfort and personalisation remain the real proof of value',
          description: 'People describe the fit before they describe the price, and they describe it in their own words.',
          kind: 'unmet_need',
          tier: 'confirmed',
          videos: 157,
          themes: [{ slug: 'comfort_and_fit', label: 'Comfort and fit' }, { slug: 'personalisation', label: null }],
          // HEARD BEFORE. Three months of readings behind its leading theme, so
          // no chip — the state most conclusions are in.
          recurrence: recurrenceOf('reg-comfort', ['2026-07-01', '2026-08-01', '2026-09-01'], '2026-09-01'),
        },
        {
          id: 'mi-2',
          title: 'The conversation is being shaped outside your own content',
          description: 'What the category believes about you is being decided somewhere you are not posting.',
          kind: 'platform_pattern',
          tier: 'early_signal',
          videos: 0,
          themes: [],
          // THE MONTH TABLES HOLD NOTHING FOR IT, which is not "new" — the chip
          // is absent and so is the claim. This is the arm production is in.
          recurrence: null,
        },
        {
          id: 'mi-3',
          title: 'Showcase Innovations in 3D Printed Prosthetics',
          description: 'Curiosity turns into distrust or drop-off where a price is never named.',
          kind: 'industry_signal',
          tier: 'archive',
          videos: 2,
          themes: [],
          // The mock's "New" chip: one month of readings, none of them earlier.
          recurrence: recurrenceOf('reg-resale', ['2026-09-01'], '2026-09-01'),
        },
      ],
      corpusVideos: 1699,
      corpusLine: CONCLUSIONS_CORPUS_LINE,
      counts: { confirmed: 1, early: 1, archive: 1 },
      belowBar: 1,
      total: 9,
      sortedBy: 'strongest evidence first, then by how many videos are behind it',
      concludedOn: '2026-09-27T02:00:00.000Z',
      newLine: CONCLUSIONS_NEW_LINE,
      empty: null,
    },
    advice: {
      rows: adviceRows,
      highlight: null,
      requestedLine: null,
      total: 64,
      // TWO, because the table below prints two rows labelled Done. `acted` is
      // counted over all 64 identities by the loader, so the fixture's number
      // has to be at least the number of Done rows it draws — "you have acted
      // on 1 of 64" over a table showing two is an of-N the page disproves.
      acted: 2,
      actedLine: actedLine(2, 64),
      repeatLine: repeatLine(adviceRows),
      recorded: true,
      unlock: ADVICE_UNLOCK,
      empty: null,
    },
    moves: {
      rows: [
        {
          id: 'm-1',
          title: 'Say less about recycling',
          kind: 'subject',
          on: 'on the subject Durability',
          declaredAt: '2026-09-14',
          line: moveLedgerLine({ title: 'Say less about recycling', declared_at: '2026-09-14' }, 'on the subject Durability'),
        },
        // THE MOVE THE READING BELOW IS OF (Block D wave 2). `readings` has
        // carried `moveReadingFixture()` since wave 1 and no row matched its
        // `moveId`, so every surface that joins a move to its reading — the
        // quarterly review's page 6 among them — drew the unread arm and only
        // the unread arm. In production the two are the same `moves.id`; here
        // they now are too, and the row above keeps the other arm.
        {
          id: 'mv-1',
          title: 'Push repairability',
          kind: 'subject',
          on: 'on the subject Repair & warranty',
          declaredAt: '2026-08-12',
          line: moveLedgerLine({ title: 'Push repairability', declared_at: '2026-08-12' }, 'on the subject Repair & warranty'),
        },
      ],
      masthead: MOVES_MASTHEAD,
      unlock: MOVES_UNLOCK,
      recorded: true,
      empty: null,
      // THE SAME CARD AND THE SAME READING AS OVERVIEW'S, from Overview's own
      // fixture, because both pages are handed them by one composition
      // (`loadMovesExtras`). Two fixtures would be two shapes for one month.
      card: cardFixture(),
      readings: [moveReadingFixture()],
    },
    ways: {
      ways: waysOfMoving(acceptable, 1),
      claims: [
        { id: 'c0', youSay: 'Our bags are made from rescued sailcloth.', theySay: 'People ask what happens when a seam goes.', gap: 'durability', audience: 'contradicts', verdictLabel: 'Pushed back' },
        { id: 'c1', youSay: 'Every bag is one of a kind.', theySay: 'Commenters repeat it back in their own words.', gap: '', audience: 'echoes', verdictLabel: 'Echoed' },
        { id: 'c2', youSay: 'We are a B Corp.', theySay: null, gap: '', audience: 'silent', verdictLabel: 'Not taken up' },
      ],
      claimsLine: '3 claims of yours, read against what the conversation said back.',
      claimsCaveat: CLAIMS_CAVEAT,
      acceptable,
      empty: null,
    },
    unlocks: { rows: unlockRows(1) },
    record: {
      line: 'your 3rd monthly reading · 3 updates · 2,359 videos · 27% of what was said on camera was not in English',
      // THE REFUSAL LINE IS READ OFF THE ROWS BESIDE IT, never typed. The full
      // ledger row's afterwards verdict is `too_little_data` (9 of 104 is under
      // SHARE_BAND's floor of 10), and the loader feeds exactly those verdicts
      // to `countRefused` — so a fixture saying "nothing was refused" is the
      // method note disagreeing with the table above it, in the artefact wave 2
      // is reviewed in.
      lines: ['3 updates delivered in this month.', refusedSentence(refusals(ledgerVerdicts(adviceRows)))],
      href: '/dashboard/settings',
    },
    method: methodFixture(),
    plans: [PLAN_CARD],
    plansEmpty: null,
    ...over,
  }
}

/** The plan's claims as the upload read them — one contradicted, two untested.
 *  The 13 Sep re-evaluation below re-reads them, which is where the card's
 *  printed verdicts and its `checkedOn` date come from. */
const CLAIMS_AT_UPLOAD = [
  { ref: 'C1', claim: 'Customers choose us on price.', verdict: 'contradicts' as const, theySay: 'They compare on what a bag survives, and name price second.', conversationCount: 41, themeRefs: [], insightIds: ['ai-9'], source: null },
  { ref: 'C2', claim: 'The recycled story drives sharing.', verdict: 'silent' as const, theySay: null, conversationCount: 0, themeRefs: [], insightIds: [], source: null },
  { ref: 'C3', claim: 'Travellers buy sets, not singles.', verdict: 'silent' as const, theySay: null, conversationCount: 0, themeRefs: [], insightIds: [], source: null },
]

/** MK6's card, shaped like production's: a plan whose claims are read fresh
 *  against every update, one of which moved on the newest reading and has
 *  therefore been carried by exactly one. */
const PLAN_CARD = planCard({
  planId: 'pc-1',
  title: 'Summer 2026/27 campaign brief',
  sourceFilename: 'summer-2627-brief.pdf',
  uploadedOn: '2026-08-20T09:00:00.000Z',
  notice: null,
  claims: CLAIMS_AT_UPLOAD,
  summary: { supported: 0, contradicted: 1, untested: 2 },
  // THE NEWEST RE-EVALUATION CARRIES ITS OWN CLAIMS, which is what production
  // holds and what `currentReading` exists for: `plan_checks.claims` is written
  // once, at upload, and `reevaluate.ts` never writes it back. A fixture whose
  // re-evaluations carried no claims left `checkedOn` null and printed the
  // upload's verdicts under a "moved since upload" row naming a transition the
  // chips above it did not show.
  evaluations: [
    { createdAt: '2026-09-06T02:00:00.000Z', runDate: '2026-09-06', moved: [], claims: CLAIMS_AT_UPLOAD, summary: { supported: 0, contradicted: 1, untested: 2 } },
    {
      createdAt: '2026-09-13T02:00:00.000Z',
      runDate: '2026-09-13',
      moved: [{ ref: 'C2', claim: 'The recycled story drives sharing.', from: 'silent', to: 'echoes' }],
      claims: [
        CLAIMS_AT_UPLOAD[0],
        { ...CLAIMS_AT_UPLOAD[1], verdict: 'echoes' as const, theySay: 'People repeat the sail story back in their own words.', conversationCount: 22, insightIds: ['ai-10'] },
        CLAIMS_AT_UPLOAD[2],
      ],
      summary: { supported: 1, contradicted: 1, untested: 1 },
    },
  ],
  corpusVideos: 2359,
  quoteFor: (c) => (c.ref === 'C1' ? { ref: 'e:ev-9', text: 'Ek kyk eers of dit hou. Prys is tweede.', lang: 'af', english: 'I look first at whether it lasts. Price is second.' } : null),
  href: '/dashboard/agent/thread-1',
})

/** Production on the day this shipped: `moves` is not applied, nothing is
 *  dated, and one of 64 pieces of advice has been decided on. */
export function unrecordedFixture(): MarketSurfaceData {
  const base = marketFixture()
  return {
    ...base,
    method: methodRefusedFixture(),
    moves: { rows: [], masthead: MOVES_MASTHEAD, unlock: MOVES_UNLOCK, recorded: false, empty: MOVES_UNRECORDED, card: cardFixture(), readings: [] },
    ways: { ...base.ways, ways: waysOfMoving(null, 0), acceptable: null, claims: [], claimsLine: 'Nothing you have said in your own posts has been read against the conversation this update.' },
    // NO PLAN, NO MONTH TABLES, NO LIVE EVIDENCE — production on the day this
    // shipped, measured rather than imagined. Sealand's twelve drawn ledger
    // rows were all first made on 28 June and every `audience_insights` row
    // they cite has since been pruned, so "Grounded in" says the evidence is
    // gone rather than printing "0 videos" twelve times; nothing is marked Done
    // with months either side of it, so "Afterwards" is a sentence; and no
    // hero quote can be vouched for. This is the state wave 2 is reviewed in.
    unlocks: { rows: unlockRows(0) },
    plans: [],
    plansEmpty: PLAN_EMPTY,
    advice: {
      ...base.advice,
      rows: base.advice.rows.map((r) => ({
        ...r,
        grounded: r.basedOn.length > 0
          ? groundingFor({ basedOn: ['pruned-1'], videoByInsight: new Map(), themeIds: [], audience: LEDGER_AUDIENCE, month: '2026-09-01' })
          : null,
        afterwards: afterwardsFor({ decidedAt: r.decidedAt, targetIds: [], series: [], audience: LEDGER_AUDIENCE }),
        quote: null,
      })),
    },
  }
}

/** A reader who followed `?rec=<id>` from a sent digest onto a row that is not
 *  one of the twelve oldest. The row is drawn, in its place by age, and marked. */
export function deepLinkFixture(): MarketSurfaceData {
  const base = marketFixture()
  const named = base.advice.rows[base.advice.rows.length - 1]
  return {
    ...base,
    advice: { ...base.advice, highlight: named.lineageId, requestedLine: ADVICE_REQUESTED_LINE },
  }
}

/** The state where the ledger itself is empty and nothing has been dated: a
 *  tenant one update old, and the only state in which MK2 and MK4 both print
 *  their empty sentence. */
export function firstUpdateFixture(): MarketSurfaceData {
  const base = marketFixture()
  return {
    ...base,
    advice: { rows: [], highlight: null, requestedLine: null, total: 0, acted: 0, actedLine: actedLine(0, 0), repeatLine: repeatLine([]), recorded: true, unlock: ADVICE_UNLOCK, empty: ADVICE_EMPTY },
    moves: { rows: [], masthead: MOVES_MASTHEAD, unlock: MOVES_UNLOCK, recorded: true, empty: MOVES_EMPTY_MK4, card: cardFixture(), readings: [] },
    ways: { ...base.ways, ways: waysOfMoving(null, 0), acceptable: null },
    unlocks: { rows: unlockRows(0) },
    plans: [],
    plansEmpty: PLAN_EMPTY,
  }
}
