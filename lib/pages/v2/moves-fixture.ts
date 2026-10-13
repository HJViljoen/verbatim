import { marketLabels } from '../../brands/attribution'
import { OSSUR_CLIENT_ID } from '../../config'
import { readingMonthLabel } from '../../reading/month-label'
import { planCard } from '../../ask/plan-cards'
import type { ClaimResult } from '../../ask/types'
import { READING_VERSION, type StatementReading, type StatementsBlockData } from '../../statements/types'
import { buildAdviceRows, type RecCopy } from '../market-surface'
import {
  adviceHistory,
  moveCards,
  recordRows,
  type AdviceCard,
  type MovesPageData,
} from './moves'

// Your moves' render fixtures (depth v2, T7): Össur-shaped, drawn from the
// boards' own illustrative story (E6-Moves, E6-Moves-Open), built THROUGH the
// page's pure builders (`adviceHistory`, `moveCards`, `planCard`) so the
// render tests exercise what the loader produces. No tenant row is read. The
// stored prose (titles, arguments, conclusions) is written without digits,
// as Pass D-b's and D-a's scrubbers leave it.

const OCT_13 = '2026-10-13T08:00:00.000Z'
const SEPT = '2026-09-01'

// ---- the advice ---------------------------------------------------------------------

const UPDATES = ['2026-07-20', '2026-07-27', '2026-08-03', '2026-08-17', '2026-08-24', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05']
const L_DESK = 'a1000000-0000-4000-8000-000000000001'
const L_LINER = 'a1000000-0000-4000-8000-000000000002'
const L_SWEAT = 'a1000000-0000-4000-8000-000000000003'
const L_OLD = 'a1000000-0000-4000-8000-000000000004'

const TITLES: Record<string, string> = {
  [L_DESK]: 'Set up a reimbursement help desk for powered knees',
  [L_LINER]: 'Lead liner messaging with how long they last',
  [L_SWEAT]: 'Look at a liner built for heat and sweat',
  [L_OLD]: 'Run a summer athlete campaign around the Paralympics',
}

/** Copies of each piece of advice across the ten updates: the help desk in the
 *  last nine, liner messaging in the last four, the liner for sweat in the last
 *  three, and an older piece the client declined in July. */
function copies(): RecCopy[] {
  const carried: Record<string, string[]> = {
    [L_DESK]: UPDATES.slice(1),
    [L_LINER]: UPDATES.slice(-4),
    [L_SWEAT]: UPDATES.slice(-3),
    [L_OLD]: UPDATES.slice(0, 2),
  }
  return Object.entries(carried).flatMap(([lineage, days]) => days.map((d) => ({
    id: `${lineage.slice(0, 8)}-${d}`,
    lineage_id: lineage,
    title: TITLES[lineage],
    type: lineage === L_DESK ? 'customer_experience' : 'product',
    status: 'new',
    priority: lineage === L_DESK ? 'high' : 'medium',
    created_at: `${d}T06:00:00.000Z`,
    run_id: `run-${d}`,
  })))
}

const HISTORY = (lineage: string) => adviceHistory(lineage, copies())

export const DESK: AdviceCard = {
  lineageId: L_DESK,
  recommendationId: 'r-desk',
  title: 'Set up a reimbursement help desk for powered knees',
  kind: 'customer_experience',
  priority: 'high',
  why:
    'Insurance refusals for powered knees have come up in every month since July, and the people raising them describe months of appeals. ' +
    'They are mostly long-time users trying to upgrade, and parents applying for a child, and several say the brand that helped them through the paperwork earned their trust. ' +
    'A help desk would give people one place to get letters, codes and appeal support. It is something a rival cannot easily copy in a quarter, and it speaks to the market’s biggest worry rather than to the device itself.',
  status: 'new',
  statusLabel: 'New',
  decidedAt: null,
  firstMade: '2026-07-27',
  grounded: { videos: 63, pruned: false },
  history: HISTORY(L_DESK),
  restsOn: [
    { id: 'mi-access', kind: 'market', title: 'Access, not the device, decides who gets fitted', videos: 286, anchor: 'conclusion-mi-access' },
    { id: 'mi-families', kind: 'market', title: 'Families are a growing part of the buying decision', videos: 45, anchor: 'conclusion-mi-families' },
    { id: 'ci-ottobock', kind: 'rival', title: 'Most of Ottobock’s talk is about getting a knee paid for', videos: null, anchor: null },
  ],
  quote: null,
}

export const LINER: AdviceCard = {
  ...DESK,
  lineageId: L_LINER,
  recommendationId: 'r-liner',
  title: 'Lead liner messaging with how long they last',
  kind: 'positioning_messaging',
  priority: 'medium',
  why: 'New amputees keep asking when a liner wears out, and no brand in the market answers it. Leading with lifespan answers the question people are already asking before they compare brands.',
  firstMade: '2026-09-14',
  grounded: { videos: 41, pruned: false },
  history: HISTORY(L_LINER),
  restsOn: [{ id: 'mi-liners', kind: 'market', title: 'Liners are treated as consumables that nobody explains', videos: 117, anchor: 'conclusion-mi-liners' }],
}

export const SWEAT: AdviceCard = {
  ...DESK,
  lineageId: L_SWEAT,
  recommendationId: 'r-sweat',
  title: 'Look at a liner built for heat and sweat',
  kind: 'product',
  priority: 'medium',
  why: 'Sweat is the most common liner complaint, and it is about liners in general, not one brand.',
  firstMade: '2026-09-21',
  grounded: { videos: 38, pruned: false },
  history: HISTORY(L_SWEAT),
  restsOn: [{ id: 'mi-liners', kind: 'market', title: 'Liners are treated as consumables that nobody explains', videos: 117, anchor: 'conclusion-mi-liners' }],
}

/** The help desk, opened: its one comment, through the gate. */
export const DESK_OPEN: AdviceCard = {
  ...DESK,
  quote: { ref: 'e:5d3b4c1e-2f60-4a8b-9c7d-0e1f2a3b4c5d', text: 'Whoever helps me get this approved gets my business. That’s it.', lang: 'en', english: null },
  quoteCite: { platform: 'youtube', date: '2026-10-05' },
}

// ---- the moves ----------------------------------------------------------------------

const S_COMMUNITY = 'b1000000-0000-4000-8000-000000000001'
const S_COST = 'b1000000-0000-4000-8000-000000000002'
const S_SOCKET = 'b1000000-0000-4000-8000-000000000003'

const LEVELS: Record<string, Record<string, number>> = {
  [S_COMMUNITY]: { '2026-07-01': 61, '2026-08-01': 75, '2026-09-01': 98 },
  [S_COST]: { '2026-06-01': 80, '2026-07-01': 92, '2026-08-01': 109, '2026-09-01': 150 },
}
const MARKET_N: Record<string, number> = { '2026-06-01': 620, '2026-07-01': 610, '2026-08-01': 680, '2026-09-01': 700 }

export const MOVE_CARDS = moveCards({
  moves: [
    { id: 'm-clinic', kind: 'subject', subject_id: S_COMMUNITY, registry_ids: null, lineage_id: null, title: 'Running & Mobility Clinic campaign', declared_at: '2026-09-15', dated_on: '2026-09-14', status: 'active', direction: 'up' },
    { id: 'm-price', kind: 'subject', subject_id: S_COST, registry_ids: null, lineage_id: null, title: 'Price transparency page', declared_at: '2026-09-02', dated_on: '2026-08-02', status: 'active', direction: 'up' },
    { id: 'm-socket', kind: 'subject', subject_id: S_SOCKET, registry_ids: null, lineage_id: null, title: 'Socket fitting guide', declared_at: '2026-08-20', dated_on: null, status: 'done', direction: 'up' },
  ],
  month: SEPT,
  now: OCT_13,
  subjects: new Map([
    [S_COMMUNITY, { name: 'Community & encouragement', calibration: 'ready' as const }],
    [S_COST, { name: 'Cost & access', calibration: 'ready' as const }],
    [S_SOCKET, { name: 'Fit & comfort', calibration: 'provisional' as const }],
  ]),
  themes: new Map(),
  adviceTargets: new Map(),
  levels: (_kind, id, month) => LEVELS[id]?.[month] ?? (LEVELS[id] ? 0 : null),
  n: (month) => MARKET_N[month] ?? null,
})

// ---- the plan -----------------------------------------------------------------------

const claim = (ref: string, text: string, verdict: ClaimResult['verdict'], count: number): ClaimResult => ({
  ref, claim: text, verdict, theySay: null, conversationCount: count, themeRefs: [], insightIds: [],
})

export const PLAN = planCard({
  planId: 'p-q4',
  title: 'Q4 marketing plan',
  sourceFilename: 'Q4 marketing plan.pdf',
  uploadedOn: '2026-09-28T09:00:00.000Z',
  notice: null,
  claims: [
    claim('C1', 'Our audience is mainly athletes', 'contradicts', 44),
    claim('C2', 'People choose a knee for its technology', 'contradicts', 22),
    claim('C3', 'Our clinics are a reason to choose us', 'silent', 0),
    claim('C4', 'Bionic technology is for everyday life', 'echoes', 31),
    claim('C5', 'Liners last longer with the right care', 'echoes', 18),
    claim('C6', 'Running is a route back to confidence', 'echoes', 26),
    claim('C7', 'Parents want a team behind them', 'echoes', 12),
    claim('C8', 'Waterproofing matters for daily life', 'echoes', 9),
    claim('C9', 'Fitting is a long relationship', 'echoes', 14),
  ],
  summary: { supported: 6, contradicted: 2, untested: 1 },
  evaluations: [
    { runDate: '2026-10-05', createdAt: '2026-10-05T07:00:00.000Z', moved: [{ ref: 'C1', claim: 'Our audience is mainly athletes', from: 'silent', to: 'contradicts' }] },
  ],
  corpusVideos: 1699,
  href: '/dashboard/agent/t-q4',
})

// ---- the statements -----------------------------------------------------------------

const reading = (over: Partial<StatementReading>): StatementReading => ({
  version: READING_VERSION, month: SEPT, complete: true, market: { videos: 0, base: 700 }, own: { videos: 0 },
  stance: null, says: null, who: [], members: 0, ...over,
})

export function statementsV2(over: Partial<StatementsBlockData> = {}): StatementsBlockData {
  return {
    month: SEPT,
    complete: true,
    base: 700,
    brand: 'Össur',
    market: marketLabels(OSSUR_CLIENT_ID),
    canEdit: false,
    statements: [
      { id: '11111111-1111-4111-8111-111111111111', text: 'Bionic technology for everyday life', reading: reading({ market: { videos: 22, base: 700 }, stance: { of: 'market', base: 20, backs: 11, doubts: 4, asks: 5 } }) },
      { id: '22222222-2222-4222-8222-222222222222', text: 'Our liners last longer', reading: reading({ market: { videos: 18, base: 700 }, stance: { of: 'market', base: 14, backs: 3, doubts: 2, asks: 9 } }) },
      { id: '33333333-3333-4333-8333-333333333333', text: 'Life without limitations', reading: reading({ market: { videos: 14, base: 700 }, stance: { of: 'market', base: 11, backs: 2, doubts: 8, asks: 1 } }) },
      { id: '44444444-4444-4444-8444-444444444444', text: 'Fitted by experts at our clinics', reading: reading({}) },
      { id: '55555555-5555-4555-8555-555555555555', text: 'Waterproof for real life', reading: null },
    ],
    ...over,
  }
}

// ---- the page -----------------------------------------------------------------------

/** The whole page as the board draws it, nothing open. */
export function movesFixture(over: Partial<MovesPageData> = {}): MovesPageData {
  return {
    brand: 'Össur',
    month: SEPT,
    // 13 October reads September (decision 3): the bar and the moves'
    // latest month say so.
    monthLabel: readingMonthLabel(SEPT, OCT_13),
    monthStatus: 'filling',
    readingAt: OCT_13,
    canDecide: true,
    counts: { waiting: 3, dated: 3, plans: 1 },
    advice: { cards: [DESK, LINER, SWEAT], more: 0, open: null, gone: false, total: 23, acted: 4 },
    moves: { cards: MOVE_CARDS, recorded: true },
    plan: PLAN,
    conclusions: [
      { id: 'mi-access', title: 'Access, not the device, decides who gets fitted', videos: 286, advice: [{ lineageId: L_DESK, title: DESK.title }] },
      { id: 'mi-liners', title: 'Liners are treated as consumables that nobody explains', videos: 117, advice: [{ lineageId: L_LINER, title: LINER.title }, { lineageId: L_SWEAT, title: SWEAT.title }] },
      { id: 'mi-families', title: 'Families are a growing part of the buying decision', videos: 45, advice: [{ lineageId: L_DESK, title: DESK.title }] },
      { id: 'mi-athletes', title: 'Athletes carry the most shared stories in the market', videos: 235, advice: [] },
    ],
    record: { open: false, rows: [] },
    dating: {
      datable: true,
      today: '2026-10-13',
      earliest: '2026-08-01',
      month: SEPT,
      subjects: [{ id: S_COMMUNITY, name: 'Community & encouragement' }, { id: S_COST, name: 'Cost & access' }],
      themes: [{ registryId: 'c1000000-0000-4000-8000-000000000001', label: 'How long a liner lasts' }],
      advice: { lineageId: L_DESK, title: DESK.title },
    },
    ...over,
  }
}

/** The board E6-Moves-Open: the first piece opened in place. */
export function movesOpenFixture(): MovesPageData {
  const base = movesFixture()
  return { ...base, advice: { ...base.advice, open: { card: DESK_OPEN, index: 0, waiting: true } } }
}

/** The advice record opened (`?advice=all`): every piece, in the ledger's
 *  order, the July piece declined on 2 Aug. */
export function movesRecordFixture(): MovesPageData {
  const base = movesFixture()
  const rows = buildAdviceRows(copies(), [
    { id: 'd-1', lineage_id: L_OLD, status: 'dismissed', decided_at: '2026-08-02T10:00:00.000Z' },
  ])
  return { ...base, record: { open: true, rows: recordRows(rows) } }
}

/** A tenant with nothing dated and no plan, and no advice waiting (Sealand's
 *  shape with its advice decided). */
export function movesQuietFixture(): MovesPageData {
  return movesFixture({
    counts: { waiting: 0, dated: 0, plans: 0 },
    advice: { cards: [], more: 0, open: null, gone: false, total: 64, acted: 64 },
    moves: { cards: [], recorded: true },
    plan: null,
    conclusions: [],
  })
}

// ---- the thin states (the parity pass, 13 Oct) -------------------------------------

const T_COST = 'c1000000-0000-4000-8000-000000000002'
const L_NAV = 'a1000000-0000-4000-8000-000000000005'

/** Össur's move on 13 October: an advice move dated 5 Oct, so October reads
 *  only once read; September read, August read but not the same way (a
 *  change of ours in September), so the line has one month on it. */
export const THIN_MOVE = moveCards({
  moves: [
    { id: 'm-access', kind: 'advice', subject_id: null, registry_ids: null, lineage_id: L_NAV, title: 'Create a guided access path, not a standalone price answer', declared_at: '2026-10-05', dated_on: null, status: 'active', direction: 'up' },
  ],
  month: SEPT,
  now: OCT_13,
  subjects: new Map(),
  themes: new Map([[T_COST, 'Cost and affordability frustration']]),
  adviceTargets: new Map([[L_NAV, T_COST]]),
  levels: (_kind, _id, month) => ({ '2026-08-01': 23, '2026-09-01': 19 } as Record<string, number>)[month] ?? null,
  n: (month) => ({ '2026-08-01': 533, '2026-09-01': 521 } as Record<string, number>)[month] ?? null,
  joined: (prev) => prev !== '2026-08-01',
})

/** One update has raised each piece so far: a streak of one, one dot. */
const ONE_UPDATE = { dates: ['2026-10-12'], streak: 1, since: '2026-10-12', recent: [false, false, false, false, false, false, false, false, true] }

/**
 * THE THIN REAL STATE (Össur and Sealand, 13 Oct): every piece raised by the
 * one update since the advice was re-keyed, one move dated after the reading
 * month with one month on its line, no plan checked (Sealand), statements
 * held from the tenant, conclusions carrying several pieces each.
 */
export function movesThinFixture(): MovesPageData {
  const card = (c: AdviceCard, over: Partial<AdviceCard>): AdviceCard => ({ ...c, history: ONE_UPDATE, firstMade: '2026-10-12', restsOn: c.restsOn.slice(0, 2), ...over })
  const cards = [
    card(DESK, { title: 'Create an access navigator for new amputees and caregivers', grounded: { videos: 203, pruned: false }, aim: { label: 'Cost and affordability frustration', month: SEPT, level: { k: 19, n: 521 } } }),
    card(LINER, { title: 'Translate engineering into everyday outcomes before a rival defines the category', kind: 'competitive_response', grounded: { videos: 141, pruned: false }, aim: { label: 'How the prosthesis works', month: SEPT, level: { k: 37, n: 521 } } }),
    card(SWEAT, { title: 'A piece of advice with no title', untitled: true, kind: 'customer_experience', grounded: { videos: 146, pruned: false }, aim: null }),
  ]
  return movesFixture({
    counts: { waiting: 4, dated: 1, plans: 0 },
    advice: { cards, more: 1, open: null, gone: false, total: 65, acted: 2 },
    moves: { cards: THIN_MOVE, recorded: true },
    plan: null,
    conclusions: [
      { id: 'mi-access', title: 'Access clarity is part of the product experience', videos: 203, advice: [{ lineageId: cards[0].lineageId, title: cards[0].title }] },
      { id: 'mi-inspire', title: 'Inspiration opens attention, but education earns consideration', videos: 117, advice: [{ lineageId: cards[1].lineageId, title: cards[1].title }, { lineageId: 'a1000000-0000-4000-8000-000000000009', title: 'Replace pure inspiration with guided real-life stories' }] },
      { id: 'mi-comfort', title: 'Daily wear comfort and fit remain unresolved', videos: 75, advice: [{ lineageId: cards[2].lineageId, title: cards[2].title }] },
      { id: 'mi-friction', title: 'Hope sits beside friction', videos: 74, advice: [] },
    ],
  })
}

/** The thin state with the first piece open: no comment can be shown. */
export function movesThinOpenFixture(): MovesPageData {
  const base = movesThinFixture()
  return { ...base, advice: { ...base.advice, open: { card: { ...base.advice.cards[0], quote: null }, index: 0, waiting: true } } }
}

/** A reader who may not decide (a member): no Accept, no Not for us, no Date a
 *  move, no status control. */
export function movesMemberFixture(): MovesPageData {
  return movesFixture({ canDecide: false })
}
