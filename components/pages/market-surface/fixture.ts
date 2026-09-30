import type { AdviceRow, MarketSurfaceData, QuestionPost, QuestionsBlock, SubjectAsked } from '@/lib/pages/market-surface'
import {
  ADVICE_EMPTY, ADVICE_REQUESTED_LINE, ADVICE_UNLOCK, CLAIMS_CAVEAT, LEDGER_AUDIENCE, MOVES_EMPTY_MARKET, MOVES_EMPTY_MK4, MOVES_UNRECORDED,
  actedLine, buildClaimSubjects, buildQuestions, moveLedgerLine, repeatLine, waysOfMoving,
} from '@/lib/pages/market-surface'
import type { MarketTheme } from '@/lib/pages/overview-market/board'
import { marketClaimEcho, ownPostFilings, type OwnPostSubjectRow } from '@/lib/reading/own-posts'
import { MOVES_MASTHEAD, MOVES_UNLOCK } from '@/lib/pages/overview'
import { cardFixture, moveReadingFixture } from '@/components/pages/overview/fixture'
import { methodFixture, methodRefusedFixture } from '@/lib/test/method-fixture'
import { refusals, refusedSentence } from '@/lib/reading/record'
import type { Verdict } from '@/lib/reading/verdicts'
import { PLAN_EMPTY, planCard } from '@/lib/ask/plan-cards'
import { afterwardsFor, groundingFor } from '@/lib/reading/afterwards'
import { recurrenceOf } from '@/lib/reading/head-to-head'
import type { MoveDating } from '@/lib/pages/date-move'

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
        pair: null, // no month pair applies: a fixture pins rendering (lib/test/pair-fixture.ts)
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
      quote: null,
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
        pair: null, // no month pair applies: a fixture pins rendering (lib/test/pair-fixture.ts)
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
      // The ledger's first row with an argument is the one drawn open, and
      // since WP1.9 that is this one, so the advice's own comment rides here.
      quote: { ref: 'e:ev-1', text: 'Wat gebeur as ’n naat gee? Niemand sê nie.', lang: 'af', english: 'What happens when a seam goes? Nobody says.' },
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
      afterwards: afterwardsFor({ pair: null, /* no month pair applies: a fixture */ decidedAt: null, targetIds: [], series: [], audience: LEDGER_AUDIENCE }),
      why: null,
      quote: null,
    },
  ]

  const acceptable = { lineageId: 'L-twice', recommendationId: 'r-twice', title: adviceRows[2].title }
  // THE LOADER'S ORDER (market-first WP1.9): the current recommendation first,
  // then the newest. L-twice was raised again by the newest update and is its
  // top recommendation; L-recent was last raised in a later month than L-old,
  // which only June's update carried. `number` is read off this order.
  const ledger = [adviceRows[2], adviceRows[1], adviceRows[0]].map((r, i) => ({ ...r, number: i + 1 }))

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
      counts: { confirmed: 1, early: 1, archive: 1 },
      belowBar: 1,
      total: 9,
      sortedBy: 'strongest evidence first, then by how many videos are behind it',
      concludedOn: '2026-09-27T02:00:00.000Z',
      empty: null,
    },
    advice: {
      rows: ledger,
      current: 'L-twice',
      highlight: null,
      requestedLine: null,
      total: 64,
      // TWO, because the table below prints two rows labelled Done. `acted` is
      // counted over all 64 identities by the loader, so the fixture's number
      // has to be at least the number of Done rows it draws — "you have acted
      // on 1 of 64" over a table showing two is an of-N the page disproves.
      acted: 2,
      actedLine: actedLine(2, 64),
      repeatLine: repeatLine(ledger),
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
      ways: waysOfMoving(acceptable, 1, '2026-09-01'),
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
    record: {
      line: 'your 3rd monthly reading · 3 updates · 2,359 videos',
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
    questions: sealandQuestions(),
    ...over,
  }
}

// ---- WP3.6 · Sealand's September, as Your moves reads it -------------------
//
// REAL FIGURES ONLY. The question themes and their counts are plan §2.2's
// production print ("Asked: airline bag sizes 21 · buying and shipping 20 ·
// bag materials 11", of 626 category videos); the maker shares are CQ F29's
// staging twins (airline sizes 3 of 17; shipping 0 of 28; bag materials not
// measured). The three-month subject counts are staging's (Jul to Sep,
// measured 27 Sep: Waterproofing 16, Price 12, Repair & warranty 11), with
// the groups GR F24 names. Your posts are Sealand's own on staging: 4 in July,
// 32 in August, 20 in September, 56 in all, with the topics each carries
// (19 of them carry any).

const theme = (registryId: string, label: string, kind: string, k: number, makerShare: number | null): MarketTheme => ({
  registryId, label, labelStripped: false, kind, k, n: 626, prev: null, makerShare, noiseShare: 0, identityNewThisRun: false, flags: [], provenance: null,
})

/** The reading month's category themes the question list ranks (§2.2). */
export const SEP_THEMES: MarketTheme[] = [
  theme('reg-buying', 'Ready to buy handmade bags', 'purchase_intent', 69, 50 / 140),
  theme('reg-airline', 'Confusion over airline bag sizes', 'question', 21, 3 / 17),
  theme('reg-shipping', 'Questions about buying and shipping', 'question', 20, 0 / 28),
  theme('reg-materials', 'Questions about bag materials', 'question', 11, null),
]

/** Sealand's own posts on staging with the topics they carry (Jul to Sep). */
const TOPIC_POSTS: [string, string, string[]][] = [
  ['29a78523', '2026-07-22', ['sale', 'apparel', 'bags', 'seasonal wear', 'discounts', 'store visit']],
  ['b4c91a7e', '2026-07-29', ['upcycling', 'community impact', 'sustainability', 'local employment', 'partnership']],
  ['f7a2e346', '2026-08-13', ['skateboarding', 'houtbay', 'eyethuskatepark']],
  ['03497e81', '2026-08-18', ['caps', 'color options', 'personal style', 'fashion accessory']],
  ['b8d59553', '2026-08-26', ['sustainable fashion', 'raffle', 'handmade bags', 'sealand gear']],
  ['1190cf79', '2026-08-26', ['upcycling', 'community engagement', 'sustainability', 'crafting', 'waste reduction']],
  ['c3975a3b', '2026-08-29', ['sustainable fashion', 'outfit styling', 'Terra Tide collection', 'eco-friendly apparel', 'store visit invitation']],
  ['643b6669', '2026-08-29', ['fashion', 'sustainable clothing', 'Teretai collection', 'outfit styling', 'nature inspiration']],
  ['747f0d6a', '2026-09-02', ['Heritage Day', 'community event', 'environmental activism', 'yoga', 'coastal clean-up', 'sustainability', 'people and planet']],
  ['3970e2cc', '2026-09-03', ['circularity', 'sustainability', 'recycling', 'brand initiative', 'second wave program']],
  ['ee2e07cf', '2026-09-04', ['brand story', 'purpose-led business', 'entrepreneurship', 'youth engagement']],
  ['30a685bf', '2026-09-04', ['sustainability', 'upcycling', 'outdoor gear', 'second wave gear', 'adventure']],
  ['6b628644', '2026-09-07', ['sustainability', 'recycled plastic', 'innovation', 'awards', 'circular economy', 'South Africa']],
  ['76a8af8e', '2026-09-07', ['giveaway', 'event', 'crossbody bags', 'trail running', 'collaboration', 'sustainable gear']],
  ['86f604f6', '2026-09-08', ['community cleanup', 'environmental care', 'Cape Town natural spaces', 'local government support', 'litter picking', 'urban nature conservation']],
  ['c8e1824a', '2026-09-10', ['sustainability', 'brand history', 'corporate responsibility', 'eco-friendly products', 'business ethics']],
  ['53fe31e3', '2026-09-12', ['sustainability', 'brand history', 'responsibility report', 'eco-friendly production', 'slow fashion', 'business ethics']],
  ['df0a32f5', '2026-09-15', ['event', 'yoga', 'coastal clean-up', 'community', 'sustainability', 'South Africa', 'Heritage Day', 'Sealand gear']],
  ['cc07b3ba', '2026-09-16', ['environmental conservation', 'community involvement', 'litter management', 'nature protection', 'social upliftment']],
]

/** The 56 posts: the 19 with topics, and the 37 that carry none (2 in July,
 *  26 in August, 9 in September), dated on the month's first day. */
export function sealandPosts(): QuestionPost[] {
  const untopiced = (month: string, count: number, tag: string) =>
    Array.from({ length: count }, (_, i) => ({ id: `${tag}-${i + 1}`, upload_date: `${month}-01`, topics: null, video_url: null }))
  return [
    ...TOPIC_POSTS.map(([id, day, topics]) => ({ id, upload_date: day, topics, video_url: `https://www.instagram.com/p/${id}` })),
    ...untopiced('2026-07', 2, 'jul'),
    ...untopiced('2026-08', 26, 'aug'),
    ...untopiced('2026-09', 9, 'sep'),
  ]
}

/** The subjects asked about over Jul to Sep on staging, with GR F24's groups. */
export const SUBJECTS_ASKED: SubjectAsked[] = [
  { id: 's-water', name: 'Waterproofing', calibration: 'provisional', videos: 16, groups: [{ label: 'Demand for real waterproofing', videos: 3 }, { label: 'Worries about zippers in rain', videos: 2 }] },
  { id: 's-price', name: 'Price', calibration: 'provisional', videos: 12, groups: [{ label: 'Price and sale questions', videos: 6 }] },
  { id: 's-repair', name: 'Repair & warranty', calibration: 'provisional', videos: 11, groups: [] },
  { id: 's-comfort', name: 'Comfort', calibration: 'provisional', videos: 7, groups: [] },
  { id: 's-durability', name: 'Durability', calibration: 'provisional', videos: 7, groups: [] },
]

/** Y1 on Sealand's September, before MF3: no post is filed by the judge. */
/** `ready`: HYPOTHETICAL, every subject asked about checked and ready. On
 *  production none is, and a subject that is not ready is no row of the
 *  block (T0a, YM-9; ruling U6). */
export function sealandQuestions(filings: OwnPostSubjectRow[] | null = null, ready = false): QuestionsBlock {
  return buildQuestions({
    month: '2026-09-01',
    themes: SEP_THEMES,
    segments: 'measured',
    n: 626,
    brandNames: ['Sealand', 'Cotopaxi', 'Patagonia', 'The North Face', 'Freitag'],
    posts: sealandPosts(),
    subjects: ready ? SUBJECTS_ASKED.map((x) => ({ ...x, calibration: 'ready' as const })) : SUBJECTS_ASKED,
    filings: filings ? ownPostFilings(filings) : null,
  })
}

/** The same, after MF3 with the judge's rows: every post filed for every
 *  subject asked about, one post filed as about Price. (The judge has not run:
 *  the rows are the shape it writes, over the 56 staging posts.) */
export function sealandQuestionsFiled(ready = false): QuestionsBlock {
  const posts = sealandPosts()
  const rows: OwnPostSubjectRow[] = posts.flatMap((p) => SUBJECTS_ASKED.map((x) => ({
    video_id: p.id,
    claim_id: null,
    subject_id: x.id,
    touches: p.id === '29a78523' && x.id === 's-price',
    matched_words: p.id === '29a78523' && x.id === 's-price' ? ['sale', 'discounts'] : [],
    method: 'judge',
    judge_version: 'own_post_subjects_v1',
    decided_at: '2026-11-22T09:00:00.000Z',
  })))
  return sealandQuestions(rows, ready)
}

/**
 * Y2 and Y3 on Sealand (WP3.6): the current recommendation leads, with the
 * videos behind it; the say-vs-hear claims counted in the MARKET, not in the
 * client audience's handful of videos. The recommendation is §2.6's print
 * ("Add a 'Know Before You Buy' standard · 156 videos behind it", repeated
 * across 3 updates, marked Working on it on 15 Sep); the three claims and
 * their market counts are staging's latest update (20 Sep): of September's
 * 654 market videos, 89 carry the evidence behind the echoed claim, 25 behind
 * the pushed-back one, none behind the one nobody took up. Your claims read to
 * date: 98 distinct on 16 posts (120 rows across 11 updates).
 */
export function sealandMovesFixture(): MarketSurfaceData {
  const base = marketFixture()
  const kbyb: AdviceRow = {
    lineageId: 'L-kbyb',
    recommendationId: 'r-kbyb',
    title: 'Add a “Know Before You Buy” standard to every Sealand bag page and social shop link',
    kind: 'product_feature',
    firstMade: '2026-09-06',
    timesMade: 3,
    monthsRepeated: 1,
    repeatedWithinMonth: true,
    status: 'in_progress',
    statusLabel: 'Working on it',
    decidedAt: '2026-09-15T10:00:00.000Z',
    number: 1,
    basedOn: ['mi-kbyb'],
    grounded: groundingFor({
      basedOn: Array.from({ length: 156 }, (_, i) => `ai-k${i}`),
      videoByInsight: new Map(Array.from({ length: 156 }, (_, i) => [`ai-k${i}`, `vk${i}`])),
      themeIds: ['buying_and_shipping', 'airline_sizes'],
      audience: LEDGER_AUDIENCE,
      month: '2026-09-01',
    }),
    afterwards: afterwardsFor({ pair: null, /* no month pair applies: a fixture */ decidedAt: '2026-09-15T10:00:00.000Z', targetIds: [], series: [], audience: LEDGER_AUDIENCE }),
    why: null,
    quote: null,
  }
  const rest = base.advice.rows.map((r, i) => ({ ...r, number: i + 2 }))
  const claims = [
    {
      id: 'c0',
      youSay: 'The collection is designed to withstand the great outdoors while effortlessly transitioning to street-ready urban style, staying true to a commitment to the planet.',
      theySay: 'Shoppers do not take outdoor performance on faith; they ask how waterproof the bag really is, worry about rain getting in through zippers and want to know whether it stays comfortable to carry.',
      gap: 'waterproofing', audience: 'contradicts', verdictLabel: 'Pushed back',
      echo: marketClaimEcho({ stance: 'contradicts', reading: { k: 25, n: 654 } }),
    },
    {
      id: 'c1',
      youSay: 'This collaboration reimagines the extraordinary from what was once excess, giving new life to dead stock fabric.',
      theySay: 'People are drawn to creative reuse and sustainable material innovation, while some also ask for proof that the materials and upcycling story are genuine.',
      gap: '', audience: 'echoes', verdictLabel: 'Echoed',
      echo: marketClaimEcho({ stance: 'echoes', reading: { k: 89, n: 654 } }),
    },
    {
      id: 'c2',
      youSay: 'Protect Our Paths is a community-driven environmental initiative started by Sealand Gear to combat litter and protect natural spaces.',
      theySay: null,
      gap: '', audience: 'silent', verdictLabel: 'Not taken up',
      echo: marketClaimEcho({ stance: 'silent', reading: { k: 0, n: 654 } }),
    },
  ]
  const questions = sealandQuestions()
  return {
    ...base,
    advice: { ...base.advice, rows: [kbyb, ...rest], current: 'L-kbyb', total: 67, acted: 2, actedLine: actedLine(2, 67), repeatLine: repeatLine([kbyb, ...rest]) },
    moves: {
      rows: [], masthead: MOVES_MASTHEAD, unlock: MOVES_UNLOCK, recorded: true, empty: MOVES_EMPTY_MARKET, card: cardFixture(), readings: [], market: [],
      dating: sealandDating(questions, { lineageId: kbyb.lineageId, title: kbyb.title }),
    },
    ways: {
      ...base.ways,
      claims,
      claimsLine: '3 claims of yours, read against what the conversation said back.',
      claimSubjects: buildClaimSubjects({
        claims: Array.from({ length: 98 }, (_, i) => ({ id: `cl-${i}`, source_video_id: `post-${i % 16}`, claim: `claim ${i}` })),
        subjects: SUBJECTS_ASKED.map((x) => ({ id: x.id, name: x.name, calibration: x.calibration })),
        filings: null,
      }),
    },
    questions,
  }
}

/** "Date a move" on Sealand at the 2 Oct clock (WP3.6 wave 2): the subjects
 *  the page asks about, September's question themes, the current
 *  recommendation, and the window from 1 Aug; MF5 applied. */
export function sealandDating(questions: QuestionsBlock, advice: MoveDating['advice']): MoveDating {
  return {
    datable: true,
    today: '2026-10-02',
    earliest: '2026-08-01',
    month: questions.month,
    subjects: SUBJECTS_ASKED.map((x) => ({ id: x.id, name: x.name })),
    themes: questions.themes.map((t) => ({ registryId: t.registryId, label: t.label })),
    advice,
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
    plans: [],
    plansEmpty: PLAN_EMPTY,
    advice: {
      ...base.advice,
      rows: base.advice.rows.map((r) => ({
        ...r,
        grounded: r.basedOn.length > 0
          ? groundingFor({ basedOn: ['pruned-1'], videoByInsight: new Map(), themeIds: [], audience: LEDGER_AUDIENCE, month: '2026-09-01' })
          : null,
        afterwards: afterwardsFor({ pair: null, /* no month pair applies: a fixture */ decidedAt: r.decidedAt, targetIds: [], series: [], audience: LEDGER_AUDIENCE }),
        quote: null,
      })),
    },
  }
}

/** A reader who followed `?rec=<id>` from a sent digest onto a row that is not
 *  one of the twelve drawn. The row is drawn, in its place in the ledger's
 *  order, and marked. */
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
    plans: [],
    plansEmpty: PLAN_EMPTY,
  }
}

/**
 * Össur (paused, no subjects; plan §2.13), as Your moves reads it at WP3.6:
 * no maker rule, so nothing is grouped; no subject, so no subject rows; its
 * September question themes and posts on staging (measured 27 Sep): of 338
 * category videos, "Questions about prosthetic function" 28 and "Price and
 * availability questions" 14; 109 posts of its own in September and 240 over
 * July to September, six of them shown with the topics they carry.
 */
export function ossurMovesFixture(): MarketSurfaceData {
  const base = marketFixture()
  const topics: [string, string, string[]][] = [
    ['f5c219a7', '2026-09-01', ['prosthetics', 'product', 'training']],
    ['1acc17e1', '2026-09-01', ['prosthetic leg', 'battery charging', 'international travel', 'amputee experience', 'prosthetic knee', 'travel challenges']],
    ['09833ce2', '2026-09-02', ['prosthetic leg', 'below knee prosthesis', 'knee contracture', 'rehabilitation']],
    ['f537055c', '2026-09-02', ['prosthetic leg', 'Power Knee', 'mobility', 'confidence', 'overcoming limitations']],
    ['51dd5f22', '2026-09-02', ['international travel', 'amputee experience', 'prosthetic leg', 'travel challenges', 'accessibility', 'prosthetic battery', 'airport security', 'travel preparation']],
    ['eb3a9752', '2026-09-03', ['prosthetics', 'amputee', 'rehabilitation', 'bionic hand']],
  ]
  const posts: QuestionPost[] = [
    ...topics.map(([id, day, t]) => ({ id, upload_date: day, topics: t, video_url: null })),
    ...Array.from({ length: 103 }, (_, i) => ({ id: `os-sep-${i}`, upload_date: '2026-09-01', topics: null, video_url: null })),
    ...Array.from({ length: 131 }, (_, i) => ({ id: `os-early-${i}`, upload_date: i < 60 ? '2026-07-01' : '2026-08-01', topics: null, video_url: null })),
  ]
  const ossurTheme = (registryId: string, label: string, k: number): MarketTheme => ({
    registryId, label, labelStripped: false, kind: 'question', k, n: 338, prev: null, makerShare: null, noiseShare: null, identityNewThisRun: false, flags: [], provenance: null,
  })
  const questions = buildQuestions({
    month: '2026-09-01',
    themes: [ossurTheme('reg-os-function', 'Questions about prosthetic function', 28), ossurTheme('reg-os-price', 'Price and availability questions', 14)],
    segments: 'no_rule',
    n: 338,
    brandNames: ['Össur', 'Ottobock'],
    posts,
    subjects: [],
    filings: null,
  })
  const current = base.advice.rows.find((r) => r.lineageId === base.advice.current) ?? null
  return {
    ...base,
    brand: 'Össur',
    moves: {
      rows: [], masthead: MOVES_MASTHEAD, unlock: MOVES_UNLOCK, recorded: true, empty: MOVES_EMPTY_MARKET, card: cardFixture(), readings: [], market: [],
      // No subject, so a move is dated on a question or the advice; and MF5
      // not applied here, so it is dated today.
      dating: { datable: false, today: '2026-10-02', earliest: '2026-08-01', month: questions.month, subjects: [], themes: questions.themes.map((t) => ({ registryId: t.registryId, label: t.label })), advice: current ? { lineageId: current.lineageId, title: current.title } : null },
    },
    ways: { ...base.ways, claims: [], claimSubjects: null, claimsLine: 'Nothing you have said in your own posts has been read against the conversation this update.' },
    questions,
  }
}
