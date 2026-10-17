import { OSSUR_CLIENT_ID } from '../../config'
import { readingMonthLabel } from '../../reading/month-label'
import { WHAT_THEY_SELL } from '../market-frame'
import { groupLink } from './market'
import { talkKindLabel } from '../overview-market/kinds'
import type { CrumbMenu } from '../crumbs'
import { DESK, LINER, MOVE_CARDS, SWEAT, THIN_MOVE } from './moves-fixture'
import type { AdviceCard, MoveCard, RecordRow } from './moves'
import type { AdvicePageData } from './moves-levels-load'
import {
  adviceCrumbs, argumentParts, moveCrumbs, moveMenu, recordCrumbs, recordGroupsOf, wouldMoveLineOf,
  type AdviceConversation, type AdviceNumbers, type AdviceQuote, type MoveEvidence, type MoveFacts, type MovePageData, type RecordPageData,
} from './moves-levels'
import { ADVICE_RECORD_PATH, advicePath, moveEvidenceHref } from './moves-address'
import { marketConversationHref } from '../../nav'
import type { ConvVideo } from './market'

// Your moves' level pages, as render fixtures (levels as pages, 17 Oct): the
// G6 boards' own illustrative story (the help desk, the running clinic, the
// record of 23) and the thin board's REAL Össur state (13 Oct production
// dump, as a member sees it), built through the pages' pure builders where a
// builder decides what prints (the argument's parts, the would-move line, the
// record's groups, the crumbs). No tenant row is read; the stored prose is
// written without digits, as the scrubbers leave it.

const OCT_13 = '2026-10-13T08:00:00.000Z'
const SEPT = '2026-09-01'
const NOUN = WHAT_THEY_SELL[OSSUR_CLIENT_ID] ?? null
const MONTH_LABEL = readingMonthLabel(SEPT, OCT_13)

const conv = (n: number) => `d1000000-0000-4000-8000-00000000000${n}`
const href = (id: string) => marketConversationHref(id, { period: 'month', month: SEPT })

/** The switcher as the board draws it: the three waiting, then the record. */
function waitingMenu(current: AdviceCard, total: number, opened = false): CrumbMenu {
  const items = [DESK, LINER, SWEAT].map((c) => ({
    key: c.lineageId, label: c.title, href: advicePath(c.lineageId), current: c.lineageId === current.lineageId,
    note: c.priority === 'high' ? 'High priority' : 'Medium priority', slot: 'pass_d_b_recommendation' as const,
  }))
  return {
    label: 'Advice waiting for a decision',
    switchLabel: 'Switch to another piece of advice waiting',
    wide: true,
    above: opened ? [{ key: current.lineageId, label: current.title, href: advicePath(current.lineageId), current: true, slot: 'pass_d_b_recommendation' }] : [],
    items,
    below: [{ key: 'record', label: `The advice record, all ${total}`, href: ADVICE_RECORD_PATH, current: false, note: 'every piece, and what you decided' }],
  }
}

// ---- the help desk (G6-Moves-Advice) ----------------------------------------------------

const DESK_WHY =
  'People refused cover for a powered knee say they would choose the brand that helps them through the paperwork. ' +
  'Insurance refusals have come up in the conversation every month since July. The people raising them are mostly long-time users trying to upgrade, and parents applying for a child. ' +
  'They describe months of appeals and knees judged not medically necessary. A help desk would give people one place to get letters, codes and appeal support. ' +
  'It is hard for a rival to copy quickly, and it speaks to the market’s biggest worry rather than to the device itself.'

const DESK_CARD: AdviceCard = {
  ...DESK,
  why: DESK_WHY,
  restsOn: [
    { id: 'mi-access', kind: 'market', title: 'Access, not the device, decides who gets fitted', videos: 286, anchor: null },
    { id: 'mi-families', kind: 'market', title: 'Families are part of the buying decision', videos: 45, anchor: null },
    { id: 'ci-ottobock', kind: 'rival', title: 'Most of Ottobock’s talk is about getting it paid for', videos: null, anchor: null },
  ],
  aim: { label: 'Insurance refusals for powered knees', month: SEPT, level: { k: 19, n: 839 } },
}

const DESK_CONVERSATIONS: AdviceConversation[] = [
  { id: conv(1), label: 'Insurance refusals for powered knees', description: 'Appeals that drag on for months, and knees judged not medically necessary.', videos: 29, level: { k: 19, n: 839 }, target: true, href: href(conv(1)) },
  { id: conv(2), label: 'Paying for a device', description: 'Paying out of pocket, and what cover leaves out.', videos: 18, level: { k: 41, n: 839 }, target: false, href: href(conv(2)) },
  { id: conv(3), label: 'Appeals and letters from the prosthetist', description: 'How to write an appeal, and what a prosthetist’s letter has to say.', videos: 11, level: { k: 12, n: 839 }, target: false, href: href(conv(3)) },
  { id: conv(4), label: 'Price and location questions', description: 'Where to get a device, and what it costs there.', videos: 6, level: { k: 14, n: 839 }, target: false, href: href(conv(4)) },
  { id: conv(5), label: 'Getting a knee covered for a child', description: 'Parents asking how to get a knee covered for their child.', videos: 4, level: { k: 6, n: 839 }, target: false, href: href(conv(5)) },
]

const LINE_LEVELS: Record<string, { k: number; n: number }> = { '2026-07-01': { k: 9, n: 455 }, '2026-08-01': { k: 13, n: 612 }, '2026-09-01': { k: 19, n: 839 } }

const doing = (rows: [string, number][], n: number) => rows.map(([kind, k]) => ({ kind, label: talkKindLabel(kind, NOUN), k, n }))
const where = (rows: [string, string, number][], n: number) => ({ basis: 'month' as const, n, rows: rows.map(([platform, label, videos]) => ({ platform, label, videos, pct: Math.round((100 * videos) / n) })) })

const DESK_NUMBERS: AdviceNumbers = {
  n: 63,
  groups: [
    { ...groupLink('upgraders', 'Long-time users upgrading'), videos: 31 },
    { ...groupLink('carers', 'Caregivers and family'), videos: 14 },
    { ...groupLink('new', 'New amputees, first year'), videos: 9 },
    { ...groupLink('clinicians', 'Clinicians and prosthetists'), videos: 5 },
  ],
  who: { parts: [{ about: 'client', videos: 9 }, { about: 'rival:Ottobock', videos: 16 }, { about: 'market', videos: 38 }], n: 63 },
  brands: 'counted',
  doing: doing([['pain_point', 41], ['question', 30], ['objection', 12]], 63),
  where: where([['tiktok', 'TikTok', 34], ['instagram', 'Instagram', 18], ['youtube', 'YouTube', 11]], 63),
}

const DESK_QUOTES: AdviceQuote[] = [
  { conv: { id: conv(1), label: 'Insurance refusals for powered knees', href: href(conv(1)) }, text: 'Third appeal denied. They say a mechanical knee is ‘adequate’. Adequate for sitting, maybe.', lang: null, english: null, cite: 'TikTok · 7 Oct', about: null },
  { conv: { id: conv(3), label: 'Appeals and letters from the prosthetist', href: href(conv(3)) }, text: 'My prosthetist wrote three letters. Still no.', lang: null, english: null, cite: 'Instagram · 8 Oct', about: null },
  { conv: { id: conv(2), label: 'Paying for a device', href: href(conv(2)) }, text: 'We’re paying out of pocket for the knee and it’s wiping out our savings.', lang: null, english: null, cite: 'YouTube · 9 Oct', about: null },
]

/** The help desk's page, as an owner sees it (G6-Moves-Advice). */
export function adviceFixture(over: Partial<AdvicePageData> = {}): AdvicePageData {
  return {
    brand: 'Össur',
    noun: NOUN,
    month: SEPT,
    monthLabel: MONTH_LABEL,
    readingAt: OCT_13,
    canDecide: true,
    dating: { today: '2026-10-13', earliest: '2026-08-01' },
    card: DESK_CARD,
    argument: argumentParts(DESK_WHY),
    conversations: { rows: DESK_CONVERSATIONS, videos: 63 },
    line: wouldMoveLineOf({
      themeId: conv(1), label: 'Insurance refusals for powered knees', month: SEPT, monthLabel: MONTH_LABEL, now: OCT_13,
      level: (m) => LINE_LEVELS[m]?.k ?? null, n: (m) => LINE_LEVELS[m]?.n ?? null,
    }),
    numbers: DESK_NUMBERS,
    quotes: DESK_QUOTES,
    moves: { cards: [], recorded: true },
    record: { total: 23 },
    crumbs: adviceCrumbs(DESK_CARD, waitingMenu(DESK_CARD, 23)),
    ...over,
  }
}

/** The help desk with a move dated on it (its history's "Moves made on it"). */
export function adviceWithMoveFixture(): AdvicePageData {
  const move: MoveCard = { ...MOVE_CARDS[0], id: 'm-desk', title: 'Reimbursement help desk pilot', kind: 'advice' }
  return adviceFixture({ moves: { cards: [move], recorded: true } })
}

// ---- the thin real state (G6-Moves-Advice-Thin, a member) -------------------------------

const NAV_WHY =
  'People move from admiration to practical questions about where to get a device, what payment looks like, and whether insurance or service delays will block them. ' +
  'For Össur, that means access is part of the product experience, not a separate admin step. ' +
  'Build a clear pathway with a clinic finder, coverage and financing explainer, expected fitting timeline, and live support for first-time questions so interested people can take a next step without guessing.'

const ONE_UPDATE = { dates: ['2026-10-12'], streak: 1, since: '2026-10-12', recent: [false, false, false, false, false, false, false, false, true] }

const NAV_CARD: AdviceCard = {
  ...DESK,
  lineageId: 'a1000000-0000-4000-8000-000000000005',
  recommendationId: 'r-nav',
  title: 'Create an Össur Access Navigator for new amputees and caregivers',
  kind: 'customer_experience',
  priority: 'high',
  why: NAV_WHY,
  firstMade: '2026-10-12',
  grounded: { videos: 203, pruned: false },
  history: ONE_UPDATE,
  restsOn: [
    { id: 'mi-access', kind: 'market', title: 'Access clarity is part of the product experience', videos: 203, anchor: null },
    { id: 'mi-outside', kind: 'market', title: 'Category expectations are being shaped outside Össur’s own conversation', videos: null, anchor: null },
    { id: 'ci-buckets', kind: 'rival', title: 'Buying conversations carry different emotions across buckets', videos: null, anchor: null },
  ],
  aim: { label: 'Price and location questions', month: SEPT, level: { k: 11, n: 521 } },
}

/** Össur's Access Navigator on 13 October, as a member sees it: one update,
 *  two conversations, one comment, no move, July and August not read. */
export function adviceThinFixture(over: Partial<AdvicePageData> = {}): AdvicePageData {
  return adviceFixture({
    canDecide: false,
    dating: null,
    card: NAV_CARD,
    argument: argumentParts(NAV_WHY),
    conversations: {
      rows: [
        { id: conv(6), label: 'Price and location questions', description: 'Where to get a device, what it costs, and who to ask first.', videos: 64, level: { k: 11, n: 521 }, target: true, href: href(conv(6)) },
        { id: conv(7), label: 'Cost and affordability frustration', description: 'Frustration at what a device costs, and at cover that leaves gaps.', videos: 38, level: { k: 19, n: 521 }, target: false, href: href(conv(7)) },
      ],
      videos: 203,
    },
    line: wouldMoveLineOf({
      themeId: conv(6), label: 'Price and location questions', month: SEPT, monthLabel: MONTH_LABEL, now: OCT_13,
      level: (m) => (m === SEPT ? 11 : null), n: (m) => (m === SEPT ? 521 : m === '2026-08-01' ? 533 : null),
    }),
    numbers: {
      n: 203,
      groups: [{ ...groupLink('new', 'New amputees, first year'), videos: 71 }, { ...groupLink('carers', 'Caregivers and family'), videos: 38 }],
      who: { parts: [{ about: 'client', videos: 31 }, { about: 'market', videos: 172 }], n: 203 },
      brands: 'counted',
      doing: doing([['question', 118], ['feature_request', 22]], 203),
      where: where([['tiktok', 'TikTok', 96], ['instagram', 'Instagram', 61], ['youtube', 'YouTube', 46]], 203),
    },
    quotes: [{ conv: { id: conv(6), label: 'Price and location questions', href: href(conv(6)) }, text: 'How can i get a leg like urs?', lang: null, english: null, cite: 'TikTok · 2 Oct', about: null }],
    moves: { cards: [], recorded: true },
    record: { total: 65 },
    crumbs: adviceCrumbs(NAV_CARD, waitingMenu(NAV_CARD, 65, true)),
    ...over,
  })
}

/** Every read that can fail on the hub, failed on one load. */
export function adviceFailedFixture(): AdvicePageData {
  return adviceThinFixture({ conversations: 'unread', line: 'unread', numbers: 'unread', quotes: 'unread', moves: 'unread' })
}

// ---- the running clinic (G6-Moves-Move) ------------------------------------------------

const VIDEO = (n: number) => `e1000000-0000-4000-8000-00000000000${n}`
const comment = (text: string, date: string, extra: Partial<{ lang: string | null; english: string | null }> = {}) => ({ text, lang: extra.lang ?? null, english: extra.english ?? null, date })
const CLINIC = MOVE_CARDS[0]
const video = (n: number, v: Omit<ConvVideo, 'id' | 'open' | 'href'>): ConvVideo => ({ ...v, id: VIDEO(n), open: false, href: moveEvidenceHref(CLINIC.id, { video: VIDEO(n) }) })

/** What people said after the running clinic: five of its 112 videos. */
const CLINIC_EVIDENCE: MoveEvidence = {
  state: 'ready',
  total: 112,
  all: false,
  more: { href: moveEvidenceHref(CLINIC.id, { videos: true }), desktop: 107, phone: 109 },
  capped: null,
  videos: [
    video(1, { account: 'The Amputee Diaries', platform: 'YouTube', posted: '6 Oct', about: 'client', caption: 'A day at a running clinic: first strides on a blade', url: 'https://example.com/v/1', aboutCount: 18, total: 164, quotable: 18, quotes: [
      comment('Watching her sprint on that blade made me cry. Two years ago I couldn’t walk to my mailbox.', '9 Oct'),
      comment('First 5K on the Cheetah. Didn’t think I’d ever run again.', '9 Oct'),
      comment('Is there a clinic like this anywhere near Leeds?', '10 Oct'),
    ] }),
    video(2, { account: '@stepbystep.amp', platform: 'TikTok', posted: '29 Sep', about: 'client', caption: 'What I learned at my first running clinic', url: 'https://example.com/v/2', aboutCount: 12, total: 140, quotable: 12, quotes: [
      comment('Mile 3 on the new foot and I forgot I was wearing it.', '8 Oct'),
      comment('You make me want to try running again.', '1 Oct'),
    ] }),
    video(3, { account: '@runningon.carbon', platform: 'Instagram', posted: '18 Sep', about: null, caption: 'Group run after the clinic. Nobody finished last.', url: 'https://example.com/v/3', aboutCount: 9, total: 61, quotable: 9, quotes: [
      comment('This community is the reason I got out of bed this year.', '20 Sep'),
      comment('How do I sign up for the next one?', '22 Sep'),
    ] }),
    video(4, { account: '@limbcare.clinic', platform: 'Instagram', posted: '2 Oct', about: null, caption: 'Our patients at their first group run', url: 'https://example.com/v/4', aboutCount: 6, total: 30, quotable: 6, quotes: [
      comment('Mi hijo corrió por primera vez con su prótesis. Gracias.', '3 Oct', { lang: 'es', english: 'My son ran for the first time with his prosthesis. Thank you.' }),
      comment('Seeing other kids run made him want to try.', '4 Oct'),
    ] }),
    video(5, { account: '@bladerunner.kim', platform: 'TikTok', posted: '27 Sep', about: null, caption: 'Back on the track a year after my amputation', url: 'https://example.com/v/5', aboutCount: 5, total: 48, quotable: 4, quotes: [
      comment('Where do I find a running clinic in my area?', '28 Sep'),
      comment('This is the push I needed.', '30 Sep'),
    ] }),
  ],
}

const CLINIC_FACTS: MoveFacts = {
  n: 112,
  who: { parts: [{ about: 'client', videos: 38 }, { about: 'market', videos: 74 }], n: 112 },
  brands: 'counted',
  doing: doing([['praise', 51], ['question', 33], ['feature_request', 9]], 112),
  groups: [
    { ...groupLink('athletic', 'Active and athletic'), videos: 44 },
    { ...groupLink('new', 'New amputees, first year'), videos: 29 },
    { ...groupLink('carers', 'Caregivers and family'), videos: 14 },
  ],
  where: where([['tiktok', 'TikTok', 52], ['youtube', 'YouTube', 33], ['instagram', 'Instagram', 27]], 112),
}

/** The running clinic's page, as an owner sees it (G6-Moves-Move). */
export function moveFixture(over: Partial<MovePageData> = {}): MovePageData {
  const sept = CLINIC.points.find((p) => p.month === SEPT)
  return {
    brand: 'Össur',
    noun: NOUN,
    month: SEPT,
    monthLabel: MONTH_LABEL,
    readingAt: OCT_13,
    canDecide: true,
    card: CLINIC,
    on: { kind: 'subject', label: CLINIC.label ?? '', href: CLINIC.onHref, level: sept ? { k: sept.k, n: sept.n } : null, ready: true },
    window: { from: `${CLINIC.day}T00:00:00.000Z`, to: OCT_13 },
    evidence: CLINIC_EVIDENCE,
    facts: CLINIC_FACTS,
    others: [MOVE_CARDS[1]],
    invite: true,
    crumbs: moveCrumbs(CLINIC, moveMenu(MOVE_CARDS, CLINIC.id)),
    askHref: '/dashboard/agent?ask=What%20did%20people%20say',
    ...over,
  }
}

/** A move on a subject whose check has not passed (U6): no line, no figure,
 *  nothing it said listed. */
export function moveHeldFixture(): MovePageData {
  const socket = MOVE_CARDS[2]
  return moveFixture({
    card: socket,
    on: { kind: 'subject', label: socket.label ?? '', href: socket.onHref, level: null, ready: false },
    evidence: { state: 'held', total: 0, videos: [], all: false, more: null, capped: null },
    facts: null,
    others: MOVE_CARDS.filter((c) => c.id !== socket.id),
    crumbs: moveCrumbs(socket, moveMenu(MOVE_CARDS, socket.id)),
  })
}

/** Össur's thin move (13 Oct): an advice move dated after the reading month,
 *  one month on its line, its videos not read just now; a member's view. */
export function moveThinFixture(): MovePageData {
  const m = THIN_MOVE[0]
  return moveFixture({
    canDecide: false,
    card: m,
    on: { kind: 'theme', label: m.label ?? '', href: m.onHref, level: { k: 19, n: 521 }, ready: true },
    evidence: { state: 'ready', total: 0, videos: [], all: false, more: null, capped: null },
    facts: null,
    others: [],
    invite: false,
    crumbs: moveCrumbs(m, moveMenu(THIN_MOVE, m.id)),
  })
}

// ---- the record (G6-Moves-Record) ------------------------------------------------------

const rec = (id: number, title: string, kind: string, firstMade: string, updates: number, extra: Partial<RecordRow> = {}): RecordRow => ({
  lineageId: `f1000000-0000-4000-8000-0000000000${String(id).padStart(2, '0')}`, title, kind, firstMade, updates, status: 'new', statusLabel: 'New', decidedAt: null, current: false, ...extra,
})

const RECORD_ROWS: RecordRow[] = [
  rec(1, DESK.title, 'customer_experience', '2026-07-20', 9, { lineageId: DESK.lineageId, current: true }),
  rec(2, LINER.title, 'positioning_messaging', '2026-09-21', 4, { lineageId: LINER.lineageId, current: true }),
  rec(3, SWEAT.title, 'product', '2026-09-28', 3, { lineageId: SWEAT.lineageId, current: true }),
  rec(4, 'Answer liner questions in the comments within a day', 'customer_experience', '2026-09-07', 3, { status: 'acted_on', statusLabel: 'Done', decidedAt: '2026-09-28T10:00:00.000Z' }),
  rec(5, 'Back the running clinics with stories from first-time runners', 'content', '2026-08-17', 4, { status: 'acted_on', statusLabel: 'Done', decidedAt: '2026-09-14T10:00:00.000Z' }),
  rec(6, 'Sponsor a swim meet for amputee athletes', 'audience_targeting', '2026-08-24', 2, { status: 'dismissed', statusLabel: 'Dismissed', decidedAt: '2026-09-07T10:00:00.000Z' }),
  rec(7, 'Open a price page that says what a knee costs and what is covered', 'positioning_messaging', '2026-08-03', 5, { status: 'acted_on', statusLabel: 'Done', decidedAt: '2026-09-02T10:00:00.000Z' }),
  rec(8, 'Reply to caregivers’ questions on Instagram first', 'audience_targeting', '2026-09-07', 1),
  rec(9, 'Show the Cheetah on everyday runs, not only races', 'content', '2026-08-24', 2),
  rec(10, 'Partner with clinics on a fitting checklist', 'customer_experience', '2026-08-17', 2),
  rec(11, 'Explain the Rheo Knee’s battery life in plain words', 'product', '2026-08-03', 1),
  rec(12, 'Compare Pro-Flex with rival feet side by side', 'competitive_response', '2026-07-20', 2),
  rec(13, 'Run a parents’ guide to a child’s first prosthesis', 'content', '2026-07-20', 3),
  ...Array.from({ length: 10 }, (_, i) => rec(14 + i, `An earlier piece of advice, the ${['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'][i]} not raised again`, 'content', '2026-07-20', 1)),
]

/** The record as the board draws it: 23 pieces, 4 decided, 3 waiting. */
export function recordFixture(all = false): RecordPageData {
  return {
    total: RECORD_ROWS.length,
    since: '2026-07-20',
    decided: 4,
    waiting: 3,
    groups: recordGroupsOf(RECORD_ROWS, [DESK.lineageId, LINER.lineageId, SWEAT.lineageId], all),
    all,
    crumbs: recordCrumbs(),
  }
}

/** A tenant with advice and nothing decided or waiting yet. */
export function recordQuietFixture(): RecordPageData {
  const rows = RECORD_ROWS.slice(7, 9)
  return { total: rows.length, since: '2026-08-24', decided: 0, waiting: 0, groups: recordGroupsOf(rows, []), all: false, crumbs: recordCrumbs() }
}
