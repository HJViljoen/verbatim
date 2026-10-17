import { OSSUR_CLIENT_ID } from '../../config'
import { readingMonthLabel } from '../../reading/month-label'
import type { PublishedWeekRead } from '../../written/published'
import type { StandingFact, WeekReadDataV2 } from '../../written/types'
import { homeWeeksFrame, type HomeWeeks } from '../home'
import { contentIdeaPath } from './content-address'
import { CONTENT_PATH, IDEAS_EMPTY, ideasReadOf, questionSlotId, recipe, topContentEmpty, type IdeasState, type TopAsked } from './content'
import {
  agentTries, weekSubjectsGap, weekSubjectsOf, weekTileOf, type ContentTile, type DashboardData, type MarketTile, type TileRead, type TopProducts, type WeekSubjects,
} from './home'
import { buildConvs, convHref, flagCardOf, marketParams, pickHero, pickWeekSides, type MarketTop } from './market'
import { FIXTURE_FLAG, FIXTURE_WEEKS, fixtureConvInput, fixtureFacts, fixtureId, fixtureRead } from './market-fixture'
import { adviceHref, movedMove, type TopMoves } from './moves'
import { movePath } from './moves-address'
import { DESK, MOVE_CARDS } from './moves-fixture'
import { shelfCut } from './products'
import { VOICES_HREF, voicesHref, type TopVoices } from './voices'

// THE DASHBOARD'S RENDER FIXTURES (Design v2, T8): Össur-shaped, from the
// other pages' own fixtures (Market's week, Your moves' help desk and its
// moves) and through the pages' own builders (`buildConvs`, `pickHero`,
// `flagCardOf`, `movedMove`, `weekTileOf`, `weekSubjectsOf`, `agentTries`),
// so the render tests exercise what the loader hands the page. One option per
// tile state, so every state each tile can print is drawn. Illustrative: no
// tenant row is read.

const OCT = '2026-10-01'
const SEP = '2026-09-01'
const NOW = '2026-10-13T08:00:00.000Z'

/** Decision 3's two clocks: on 13 October the whole-month tiles read
 *  September, the last full month, beside Market's October so far. */
const SEP_LABEL = readingMonthLabel(SEP, NOW)

/** Market's fixture read, with the week's conversations frozen (T11b). */
export function fixturePublished(): PublishedWeekRead {
  const data = fixtureRead() as WeekReadDataV2
  return {
    runId: 'run-2026-10-11',
    month: OCT,
    windowEnd: data.window.to,
    data: {
      ...data,
      conversations: [
        { registryId: fixtureId(1), label: 'How long a liner lasts', week: 23, month: 35, setApart: false },
        { registryId: fixtureId(3), label: 'Insurance refusals for powered knees', week: 19, month: 31, setApart: false },
        { registryId: fixtureId(2), label: 'Sweat under the liner', week: 21, month: 30, setApart: false },
      ],
    },
  }
}

/** Market's tile, as `topMarket` builds it from the week. `nothingNew`: no
 *  conversation was first heard this week (Össur, 5 Oct). `newBiggest`: the
 *  only one first heard this week is the week's biggest after the lead. */
export function fixtureMarketTop(opts: { flagged?: boolean; nothingNew?: boolean; newBiggest?: boolean } = {}): MarketTop {
  const p = marketParams({})
  const base = fixtureConvInput('week')
  let input = { ...base, ...(opts.nothingNew || opts.newBiggest ? { newIds: new Set<string>() } : {}) }
  if (opts.newBiggest) {
    // The biggest row as the plain read picks it, then made the week's one new one.
    const plain = buildConvs(input)
    const plainCard = opts.flagged === false ? null : flagCardOf({ flag: FIXTURE_FLAG, window: fixtureRead().window, convs: plain, convInput: input, monthCategory: 300, p, noun: null })
    const plainPick = pickHero({ convs: plain, flag: plainCard, setApart: new Set() })
    const plainHero = plainCard ? plainCard.conv?.id ?? null : plainPick && plainPick.kind !== 'flag' ? plainPick.conv.id : null
    const big = pickWeekSides({ convs: plain, heroId: plainHero, setApart: new Set() }).biggest
    input = { ...input, newIds: new Set(big ? [big.id] : []) }
  }
  const convs = buildConvs(input)
  const card = opts.flagged === false ? null : flagCardOf({ flag: FIXTURE_FLAG, window: fixtureRead().window, convs, convInput: input, monthCategory: 300, p, noun: null })
  const pick = pickHero({ convs, flag: card, setApart: new Set() })
  const hero: MarketTop['hero'] = card
    ? { kind: 'flag', card }
    : pick && pick.kind !== 'flag' ? { kind: pick.kind, conv: pick.conv, href: convHref(p, pick.conv.id) } : null
  const heroId = card ? card.conv?.id ?? null : pick && pick.kind !== 'flag' ? pick.conv.id : null
  const sides = pickWeekSides({ convs, heroId, setApart: new Set() })
  const rows: MarketTop['rows'] = []
  if (sides.biggest) rows.push({ kind: 'biggest', conv: sides.biggest, href: convHref(p, sides.biggest.id) })
  if (sides.fresh[0]) rows.push({ kind: 'new', conv: sides.fresh[0], href: convHref(p, sides.fresh[0].id) })
  const onRow = new Set([heroId, ...rows.map((r) => r.conv.id)].filter((x): x is string => x != null))
  const next = sides.fresh[0] ? null : convs.find((c) => !onRow.has(c.id) && c.setApart == null) ?? null
  return {
    hero,
    rows,
    also: next ? { conv: next, href: convHref(p, next.id) } : null,
    category: { week: 226, month: 300 },
    week: { dates: '5 to 11 October', inMonth: 'in October so far', labels: ['21 Sep', '28 Sep', '5 Oct'] },
    href: '/dashboard/market',
  }
}

/** Market's subject facts, as the standing reader hands them: the board's
 *  month, every subject ready. Market's seventh subject, being re-described,
 *  is Market's own case: since 14 Oct a failed subject withholds the tile's
 *  rank as an open one does (`weekSubjectsOf`, pinned in home.test.ts), and
 *  the board draws "Biggest subject". */
export function fixtureStanding(): StandingFact[] {
  return fixtureFacts().filter((f) => f.calibration !== 'failed').map((f, i): StandingFact => ({
    subjectId: f.id, name: f.name, calibration: f.calibration as StandingFact['calibration'], level: f.level, rank: f.level ? i + 1 : 0,
    trail: f.trail, verdict: f.verdict, direction: null, rung: f.level ? 'changed' : 'none', contents: [], notes: [], quoteRef: null,
  }))
}

export function fixtureVoicesTop(opts: { named?: boolean; september?: boolean } = {}): TopVoices {
  const tracked = [
    { label: 'Össur', you: true, href: voicesHref({}, { kind: 'brand', key: 'Össur' }) },
    { label: 'Ottobock', you: false, href: voicesHref({}, { kind: 'brand', key: 'Ottobock' }) },
  ]
  const groups = [
    { key: 'long-time-users', name: 'Long-time users upgrading', videos: 86 },
    { key: 'new-amputees', name: 'New amputees in their first year', videos: 74 },
    { key: 'active', name: 'Active and athletic users', videos: 51 },
    { key: 'caregivers', name: 'Caregivers and family', videos: 38 },
    { key: 'clinicians', name: 'Clinicians and prosthetists', videos: 22 },
  ]
  return {
    month: opts.september ? SEP : OCT,
    monthWords: opts.september ? 'September' : 'October so far',
    ...(opts.september ? { monthLabel: SEP_LABEL } : {}),
    videos: 318,
    group: { ...groups[0], oneLiner: 'People who have worn a prosthesis for years and want the next one.', href: voicesHref({}, { kind: 'group', key: groups[0].key }) },
    groups,
    named: opts.named === false ? [] : [
      { label: 'Össur', k: 41, n: 318, you: true, href: voicesHref({}, { kind: 'brand', key: 'client' }) },
      { label: 'Ottobock', k: 37, n: 318, you: false, href: voicesHref({}, { kind: 'brand', key: 'Ottobock' }) },
    ],
    groupsState: 'ready',
    groupsEmpty: null,
    brandsState: opts.named === false ? 'not_counted' : 'ready',
    tracked,
    href: VOICES_HREF,
  }
}

/** The catalogue as the board's mini shelf draws it: liners 3 of 8 named,
 *  feet 2 of 9, knees 3 of 6, bracing 1 of 9, sockets none of 6. */
const SHELF: { id: string; name: string; videos: number[] }[] = [
  { id: 'g-liners', name: 'Liners', videos: [9, 4, 1, 0, 0, 0, 0, 0] },
  { id: 'g-feet', name: 'Feet', videos: [7, 3, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'g-knees', name: 'Knees', videos: [6, 4, 3, 0, 0, 0] },
  { id: 'g-bracing', name: 'Bracing', videos: [1, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'g-sockets', name: 'Sockets', videos: [0, 0, 0, 0, 0, 0] },
]

/** The fixture shelf as the tile carries it: the page's columns, each cut as
 *  the page cuts it (`shelfCut`), its videos (`read`), all none (`quiet`) or
 *  none read (`unread`). */
function fixtureColumns(as: 'read' | 'quiet' | 'unread'): NonNullable<TopProducts['columns']> {
  return SHELF.map((c) => {
    const all = c.videos.map((videos, i) => ({ id: `${c.id}-${i}`, videos: as === 'read' ? videos : as === 'quiet' ? 0 : null }))
    const { shown, more } = shelfCut(all)
    return { id: c.id, name: c.name, products: shown, more, named: as === 'unread' ? null : all.filter((p) => (p.videos ?? 0) > 0).length }
  })
}

export function fixtureProductsTop(state: TopProducts['state'] = 'ready', opts: { note?: TopProducts['note']; shelf?: boolean; september?: boolean } = {}): TopProducts {
  const href = '/dashboard/products'
  const shelf = opts.shelf === false ? {} : {
    cameUp: SHELF.reduce((n, c) => n + c.videos.filter((v) => v > 0).length, 0),
    products: SHELF.reduce((n, c) => n + c.videos.length, 0),
    columns: fixtureColumns('read'),
  }
  const words = opts.september ? 'September' : 'October so far'
  const label = opts.september ? { monthLabel: SEP_LABEL } : {}
  // Not switched on, or the month not read: the page's shelf unshaded (it
  // carries no count); read and quiet: the shelf, every product none.
  const unshaded = state === 'not_on' || (state === 'quiet' && opts.note === 'unread')
  const catalogue = unshaded && opts.shelf !== false ? { columns: fixtureColumns('unread') } : {}
  const quiet = state === 'quiet' && !opts.note && opts.shelf !== false
    ? { cameUp: 0, products: SHELF.reduce((n, c) => n + c.videos.length, 0), columns: fixtureColumns('quiet') }
    : {}
  if (state !== 'ready') return { state, monthWords: state === 'quiet' ? words : '', ...(state === 'quiet' ? label : {}), standout: null, href, ...(opts.note ? { note: opts.note } : {}), ...catalogue, ...quiet }
  return {
    state,
    monthWords: words,
    ...label,
    standout: { label: 'Named in the most videos', name: 'Pro-Flex Pivot', k: 9, n: 318, href: `${href}/g-feet/p-pivot` },
    href,
    ...shelf,
  }
}

/** The week's most-asked question your posts have not touched (Content's
 *  "Also asked", first row), as `topAsked` reads it. */
export function fixtureAsked(): TopAsked {
  return {
    registryId: fixtureId(1),
    label: 'How long a liner lasts',
    week: { k: 23, n: 226 },
    month: { k: 35, n: 300 },
    weekWords: 'this week',
    monthWords: 'in October so far',
    groups: [{ key: 'new-amputees', name: 'New amputees in their first year' }],
    next: [{ registryId: fixtureId(2), label: 'Sweat under the liner', week: 21, month: 30, href: `${CONTENT_PATH}#${questionSlotId(2)}` }],
    own: { state: 'none', touched: 0, posts: 25, since: '2026-08-01' },
    href: `${CONTENT_PATH}#${questionSlotId(1)}`,
  }
}

/** The first post idea's row (`post_ideas.id`): the tile opens its page. */
export const FIXTURE_IDEA_ID = 'i0000001-0000-4000-8000-000000000000'

export function fixtureContentTop(state: IdeasState | 'older' = 'ready', opts: { medical?: boolean; asked?: boolean } = {}): ContentTile {
  if (state !== 'ready' && state !== 'older') return { state, idea: null, href: '/dashboard/content', line: state === 'unread' ? IDEAS_EMPTY.unread : topContentEmpty(state), ...(opts.asked ? { asked: fixtureAsked() } : {}) }
  const older = state === 'older'
  return {
    state: 'ready',
    idea: {
      id: FIXTURE_IDEA_ID,
      rank: 1,
      title: 'How long a liner lasts, and when it is time to replace one',
      read: { k: 48, n: 640 },
      month: older ? { k: 64, n: 839 } : { k: 35, n: 318 },
      monthWords: older ? 'in September' : 'in October so far',
      format: recipe('tutorial', 2.1, 'format'),
      opening: recipe('question', 1.8, 'opening'),
      own: { state: 'none', touched: 0, posts: 25, since: '2026-08-01' },
      medical: opts.medical ?? true,
      ideasWeek: {
        runId: older ? 'run-2026-10-04' : 'run-2026-10-11', label: older ? '28 Sep to 4 Oct' : '5 to 11 Oct', phrase: 'the week of 28 Sep', current: !older,
        // The four weeks the ideas read (`ideasReadWindow`).
        read: ideasReadOf(older
          ? { read_start: '2026-09-06T04:02:00.000Z', read_end: '2026-10-04T04:02:00.000Z' }
          : { read_start: '2026-09-13T04:02:00.000Z', read_end: '2026-10-11T04:02:00.000Z' })!,
        // The month the figure sits beside: the page's for this week's ideas,
        // an older set's own read window's (September in full).
        month: older
          ? { month: '2026-09-01', complete: true, from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' }
          : { month: '2026-10-01', complete: false, from: '2026-10-01T00:00:00.000Z', to: '2026-10-11T04:02:00.000Z' },
      },
    },
    href: contentIdeaPath(FIXTURE_IDEA_ID),
    line: older ? 'No new ideas this week. These are from the week of 28 Sep.' : null,
  }
}

/** Your moves' tile states: `pending` the newest move waits for its own
 *  month (Össur's and Sealand's, accepted on 5 October); `refused` its
 *  comparison may not print, so its latest month alone; `unread_move` no line
 *  can be drawn for it; `no_move_member` no move, as a member reads it. */
export type MovesFixtureState = 'full' | 'member' | 'no_advice' | 'no_move' | 'no_move_member' | 'pending' | 'refused' | 'unread_move'

export function fixtureMovesTop(state: MovesFixtureState = 'full', opts: { september?: boolean } = {}): TopMoves {
  const move = movedMove(MOVE_CARDS)
  const access = {
    id: 'm-access', title: 'Create a guided access path, not a standalone price answer', kind: 'advice' as const, label: 'Cost and affordability frustration',
    day: '2026-10-05', direction: 'up' as const, href: movePath('m-access'),
  }
  const newest: TopMoves['newest'] = state === 'pending'
    ? { ...access, pending: OCT, unread: null, point: { month: SEP, role: 'before', k: 19, n: 521, soFar: false } }
    : state === 'refused'
      ? { ...access, day: '2026-08-12', pending: null, unread: null, point: { month: SEP, role: 'after', k: 23, n: 521, soFar: false } }
      : state === 'unread_move'
        ? { ...access, pending: null, unread: 'several', point: null }
        : null
  const moveless = state === 'no_move' || state === 'no_move_member' || state === 'pending' || state === 'refused' || state === 'unread_move'
  return {
    advice: state === 'no_advice' ? null : {
      lineageId: DESK.lineageId,
      recommendationId: DESK.recommendationId,
      title: DESK.title,
      kind: DESK.kind,
      priority: DESK.priority,
      grounded: DESK.grounded,
      history: DESK.history,
      href: adviceHref(DESK.lineageId),
    },
    waiting: state === 'no_advice' ? 0 : 3,
    move: moveless || !move?.compare ? null : {
      id: move.id, title: move.title, kind: move.kind, label: move.label, day: move.day, direction: move.direction,
      compare: move.compare, moved: move.compare.verdict.state === 'moved', href: move.href,
    },
    canDecide: state !== 'member' && state !== 'no_move_member',
    // Moves are recorded in the fixture: the reader who may decide may date.
    invite: state !== 'member' && state !== 'no_move_member',
    ...(opts.september ? { reading: { month: SEP, label: SEP_LABEL } } : {}),
    ...(moveless ? { newest } : {}),
  }
}

const ok = <T,>(top: T): TileRead<T> => ({ state: 'ok', top })
const FAILED = { state: 'failed' } as const

export interface DashboardFixtureOptions {
  /** The anomaly check flagged insurance refusals (default true). */
  flagged?: boolean
  products?: TopProducts['state']
  /** Why a quiet products tile has nothing (`note`). */
  productsNote?: TopProducts['note']
  content?: IdeasState | 'older'
  moves?: MovesFixtureState | 'none'
  /** Brands named this month (Össur before its back-read has none). */
  named?: boolean
  /** The tiles whose read failed. */
  failed?: readonly ('market' | 'week' | 'voices' | 'products' | 'content' | 'moves')[]
  /** Decision 3's two clocks, as 13 October really reads: Voices, Your
   *  products and Your moves on September, labelled the last full month,
   *  beside Market's and the week's October so far. */
  twoClocks?: boolean
}

/** Össur's Dashboard, the week of 5 October, as the route would draw it. */
export function dashboardFixture(o: DashboardFixtureOptions = {}): DashboardData {
  const read = fixturePublished()
  const failed = new Set(o.failed ?? [])
  const market: TileRead<MarketTile> = ok({ top: fixtureMarketTop({ flagged: o.flagged }), month: OCT, marketWeek: 241 })
  const week = ok(weekTileOf({ read, weeks: FIXTURE_WEEKS, subjects: weekSubjectsOf(fixtureStanding(), OCT, true), now: NOW }))
  return {
    bar: { dates: '5 to 11 October', short: '5 to 11 Oct', asAt: '2026-10-11T07:30:00.000Z', nextUpdate: '2026-10-18T06:00:00.000Z', paused: false },
    market: failed.has('market') ? FAILED : market,
    week: failed.has('week') ? FAILED : week,
    voices: failed.has('voices') ? FAILED : ok(fixtureVoicesTop({ named: o.named, september: o.twoClocks })),
    products: failed.has('products') ? FAILED : ok(fixtureProductsTop(o.products, { note: o.productsNote, september: o.twoClocks })),
    content: failed.has('content') ? FAILED : ok(fixtureContentTop(o.content, { medical: true })),
    moves: failed.has('moves') ? FAILED : ok(o.moves === 'none' ? null : fixtureMovesTop(o.moves ?? 'full', { september: o.twoClocks })),
    agent: { action: '/dashboard/agent', tries: agentTries(read) },
  }
}

/**
 * THE THIN STATE, AS ÖSSUR READS TODAY (parity pass, 13 Oct): no flag and
 * nothing first heard this week; too few clean weeks for the weekly volume;
 * subjects named and none calibrated; brands not counted yet; product
 * readings not switched on (the catalogue unshaded); post ideas not switched
 * on (the week's most-asked question in their place); and one move, accepted
 * this month, its after side waiting for October. `sealand` is Sealand's
 * today: brands counted, subjects calibrated with no September to compare,
 * no catalogue. The board's shape must hold in both.
 */
/** "Week by week" with its first five weeks not drawn (cut by our own
 *  change, or nothing gathered) and the last three drawn. */
export function fixturePartialWeeks(): HomeWeeks {
  const columns = FIXTURE_WEEKS.columns.map((c, i) => (i < 5 ? { ...c, videos: null, comments: null, settled: false } : c))
  const drawn = columns.filter((c) => c.videos != null)
  return { columns, maxVideos: Math.max(...drawn.map((c) => c.videos!)), maxComments: Math.max(...drawn.map((c) => c.comments!)) }
}

export function dashboardThinFixture(opts: { tenant?: 'ossur' | 'sealand'; weeks?: 'partial'; market?: 'flag_new_biggest'; moves?: MovesFixtureState } = {}): DashboardData {
  const read = fixturePublished()
  const sealand = opts.tenant === 'sealand'
  const top = opts.market === 'flag_new_biggest' ? fixtureMarketTop({ newBiggest: true }) : fixtureMarketTop({ flagged: false, nothingNew: true })
  const ready = weekSubjectsOf(fixtureStanding(), OCT, true)
  const subjects: WeekSubjects = sealand && ready ? { ...ready, moved: null, noneMoved: false } : weekSubjectsGap(OCT, true, 'calibrating')
  return {
    bar: { dates: '5 to 11 October', short: '5 to 11 Oct', asAt: '2026-10-12T06:23:00.000Z', nextUpdate: '2026-10-18T04:00:00.000Z', paused: false },
    market: ok({ top, month: OCT, marketWeek: 241 }),
    week: ok(weekTileOf({ read, weeks: opts.weeks === 'partial' ? fixturePartialWeeks() : null, subjects, now: NOW })),
    voices: ok(fixtureVoicesTop({ named: sealand, september: true })),
    products: ok(fixtureProductsTop(sealand ? 'no_catalogue' : 'not_on', { september: true })),
    content: ok(fixtureContentTop('not_on', { asked: true })),
    moves: ok(fixtureMovesTop(opts.moves ?? 'pending', { september: true })),
    agent: { action: '/dashboard/agent', tries: agentTries(read, top) },
  }
}

/** A workspace before its first update: no read, no week, nothing to lead
 *  with; no catalogue and post ideas not switched on. */
export function dashboardEmptyFixture(): DashboardData {
  return {
    bar: { dates: null, short: null, asAt: null, nextUpdate: '2026-10-18T06:00:00.000Z', paused: false },
    market: ok({ top: null, month: null, marketWeek: null }),
    week: ok(weekTileOf({ read: null, weeks: homeWeeksFrame(NOW), subjects: null, now: NOW })),
    voices: ok(null),
    products: ok(fixtureProductsTop('no_catalogue')),
    content: ok(fixtureContentTop('not_on')),
    moves: ok(null),
    agent: { action: '/dashboard/agent', tries: [] },
  }
}

/** The fixture's day, for a test's clock. */
export const DASHBOARD_NOW = NOW
/** The workspace the medical team line prints for (Össur). */
export const DASHBOARD_CLIENT = OSSUR_CLIENT_ID
