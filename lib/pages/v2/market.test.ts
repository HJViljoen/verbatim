import { describe, expect, it } from 'vitest'
import { placementTiers, placeSubject } from '../subject-place'
import { WEEKS_FAILED } from '../home'
import { setApartOf } from '../../written/conversations'
import { FAILED_EXPLAINED, SUBJECT_NOT_MEASURED } from '../../subjects/calibration-state'
import { earlierNewOfRows } from '../../written/published'
import { flagWordOf } from '@/components/v2/flag-chip'
import type { OurChange } from '../../reading/comparability'
import type { WindowReading } from '../../reading/read'
import type { WeekReadData } from '../../written/types'
import { MARKET_LONG_RUN_ANCHOR, marketMonthHref } from '../../nav'
import {
  buildConvs, buildKinds, buildSubjectBoard, buildSubjectPanel, buildTable, categoryThemeVideos, categoryVideos, closeHref, convHref,
  convOf, cutWindows, doingOf, leadDoing, marketWeeksOf, flagCardOf, flagVerdict, groupsOf, isRegistryId, insideOf, marketHref, marketMonths, marketParams,
  mergeMixes, monthsText, notchOf, ourReadOf, panelStats, periodHref, personasOf, pickHero, pickWeekSides, platformRows, subjectHref,
  flagBaseWords, monthSoFar, tableFilterOf, tableMonths, topSpans, unmeasuredOf, weekWindows, whoOf, windowLabel, withMonthPlatforms, MARKET_TABLE_ROWS,
  alsoTalkedOf, earlierNewOf, printableFlags, sideIds, subjectAxis,
  type MarketConv,
} from './market'
import {
  FIXTURE_FLAG, fixtureConvInput, fixtureFacts, fixtureFactsIn, fixtureId, fixtureKindReadings, fixtureRead, fixtureSubjectId, marketFixture, marketThinFixture,
} from './market-fixture'

const OCT = '2026-10-01'

describe('marketParams and the addresses', () => {
  it('opens on the week; a bare month reads the month; junk is dropped', () => {
    expect(marketParams({}).period).toBe('week')
    expect(marketParams({ month: '2026-09' })).toMatchObject({ period: 'month', month: '2026-09-01' })
    expect(marketParams({ period: 'month', month: '2026-09-01' })).toMatchObject({ period: 'month', month: '2026-09-01' })
    expect(marketParams({ period: 'nope' }).period).toBe('week')
    expect(marketParams({ month: 'soon' }).month).toBeNull()
    expect(marketParams({ at: 'side' }).at).toBeNull()
    expect(marketParams({ all: '1', in: 's1', conv: 'abc', subject: 'x' })).toMatchObject({ all: true, in: 's1', conv: 'abc', subject: 'x' })
  })

  it('accepts a registry id or a slug in ?conv=', () => {
    expect(isRegistryId(fixtureId(3))).toBe(true)
    expect(isRegistryId('insurance-refusals')).toBe(false)
    expect(marketParams({ conv: 'insurance-refusals' }).conv).toBe('insurance-refusals')
  })

  it('writes the period only off the week, and the month only with it', () => {
    expect(marketHref({ period: 'week', month: OCT })).toBe('/dashboard/market')
    expect(marketHref({ period: 'month', month: '2026-09-01' })).toBe('/dashboard/market?period=month&month=2026-09')
    const p = marketParams({ period: 'month', month: '2026-09', in: 's1' })
    expect(convHref(p, 'c1', 'table')).toBe('/dashboard/market?period=month&month=2026-09&conv=c1&at=table&in=s1#conv-panel')
    expect(subjectHref(p, 's2')).toBe('/dashboard/market?period=month&month=2026-09&subject=s2&at=subjects&in=s1#subject-panel')
    expect(closeHref(p, 'subjects')).toBe('/dashboard/market?period=month&month=2026-09&in=s1#subjects')
    expect(periodHref(p, 'week')).toBe('/dashboard/market')
    expect(periodHref(p, 'time')).toBe('/dashboard/market?period=time&month=2026-09')
  })

  it('writes This month\'s address as the review email\'s link does (`marketMonthHref`), and its long-run anchor', () => {
    for (const m of ['2026-09-01', '2026-10-01', '2027-01-01']) {
      expect(marketMonthHref(m)).toBe(marketHref({ period: 'month', month: m }))
      expect(marketMonthHref(m, MARKET_LONG_RUN_ANCHOR)).toBe(marketHref({ period: 'month', month: m }, 'long-run'))
    }
    expect(marketParams({ period: 'month', month: '2026-09' })).toMatchObject({ period: 'month', month: '2026-09-01' })
  })
})

describe('the weeks', () => {
  it('reads the run window and the two of its length before it, oldest first', () => {
    const w = weekWindows({ from: '2026-10-05T00:00:00.000Z', to: '2026-10-12T00:00:00.000Z' })!
    expect(w.map((x) => x.from.slice(0, 10))).toEqual(['2026-09-21', '2026-09-28', '2026-10-05'])
    expect(w[2].to.slice(0, 10)).toBe('2026-10-12')
    expect(weekWindows({ from: 'x', to: 'y' })).toBeNull()
    expect(weekWindows({ from: '2026-10-05', to: '2026-10-05' })).toBeNull()
  })

  it('cuts a window that began before a change on a week surface, never at a fail-open fix', () => {
    const w = weekWindows({ from: '2026-10-05T00:00:00.000Z', to: '2026-10-12T00:00:00.000Z' })!
    const change = (surface: string, changedAt: string, extra: Partial<OurChange> = {}): OurChange =>
      ({ id: surface, surface: surface as OurChange['surface'], changedAt, note: null, affects: [], ...extra })
    expect(cutWindows(w, [change('terms', '2026-09-30T10:00:00.000Z')])).toEqual([true, true, false])
    expect(cutWindows(w, [change('gate_rule', '2026-10-06T10:00:00.000Z', { failOpenFix: true })])).toEqual([false, false, false])
    // A surface the week chart does not cut on (`products`) cuts nothing.
    expect(cutWindows(w, [change('products' as never, '2026-10-06T10:00:00.000Z')])).toEqual([false, false, false])
    expect(cutWindows(w, [])).toEqual([false, false, false])
  })

  it('never cuts the newest window: a person\'s change on 8 Oct inside the 5 to 12 Oct window cuts the two before', () => {
    const w = weekWindows({ from: '2026-10-05T00:00:00.000Z', to: '2026-10-12T00:00:00.000Z' })!
    const change: OurChange = { id: 'c', surface: 'terms', changedAt: '2026-10-08T10:00:00.000Z', note: null, affects: [] }
    const cut = cutWindows(w, [change])
    expect(cut).toEqual([true, true, false])
    const convs = buildConvs({ ...fixtureConvInput('week'), weekCut: cut })
    expect(convs).toHaveLength(buildConvs(fixtureConvInput('week')).length)
    expect(convs.every((c) => c.week != null && c.weeks[0] === null && c.weeks[1] === null)).toBe(true)
  })

  it('reads the category out of a window read, and nothing for a missing one', () => {
    const read: WindowReading = {
      denominators: [{ audience: 'industry-other', videos: 226, comments: 0, platform_mix: {}, dual_mention: 0, excluded_undated: 0 }, { audience: 'competitor:Ottobock', videos: 15, comments: 0, platform_mix: {}, dual_mention: 0, excluded_undated: 0 }],
      themes: [
        { audience: 'industry-other', theme_id: 't1', videos: 19, comments: 0, platform_mix: { tiktok: 12 }, excluded_on_camera: 0, excluded_undated: 0 },
        { audience: 'competitor:Ottobock', theme_id: 't1', videos: 3, comments: 0, platform_mix: {}, excluded_on_camera: 0, excluded_undated: 0 },
      ],
    }
    expect(categoryVideos(read)).toBe(226)
    expect(categoryThemeVideos(read)?.get('t1')).toEqual({ videos: 19, mix: { tiktok: 12 } })
    expect(categoryVideos(null)).toBeNull()
    expect(categoryThemeVideos({ denominators: null, themes: null })).toBeNull()
  })
})

describe('the conversations', () => {
  it('lists the week at the floor, biggest first, with three counts, the month and the subject', () => {
    const convs = buildConvs(fixtureConvInput('week'))
    expect(convs.map((c) => c.week)).toEqual([...convs.map((c) => c.week)].sort((a, b) => (b ?? 0) - (a ?? 0)))
    expect(convs.every((c) => (c.week ?? 0) >= 3)).toBe(true)
    const liner = convs.find((c) => c.id === fixtureId(1))!
    expect(liner).toMatchObject({ label: 'How long a liner lasts', week: 23, weeks: [9, 14, 23], month: 35, subjectName: 'Fit & comfort', isNew: false })
    expect(convs.find((c) => c.id === fixtureId(11))).toMatchObject({ isNew: true, weeks: [0, 0, 8] })
  })

  it('keeps a set-apart conversation in the list and out of a subject\'s inside', () => {
    const input = { ...fixtureConvInput('week'), setApart: new Map([[fixtureId(1), 'makers' as const]]) }
    const convs = buildConvs(input)
    expect(convs.find((c) => c.id === fixtureId(1))?.setApart).toBe('makers')
    expect(insideOf(fixtureSubjectId('fit'), convs, 'week', { href: String }).find((c) => c.id === fixtureId(1))?.setApart).toBe('makers')
    expect(pickHero({ convs: convs.map((c) => ({ ...c, isNew: false })), flag: null, setApart: input.setApart })).toMatchObject({ conv: { id: fixtureId(2) } })
  })

  it('reads the makers\' shares into what is set apart', () => {
    const rows = [
      { registry_id: 'a', videos: 10, maker: 6, noise: 0 },
      { registry_id: 'b', videos: 10, maker: 1, noise: 7 },
      { registry_id: 'c', videos: 10, maker: 2, noise: 2 },
    ]
    expect([...setApartOf(rows as never).entries()]).toEqual([['a', 'makers'], ['b', 'noise']])
    expect(setApartOf(null).size).toBe(0)
  })

  it('labels a window by the first day it covers', () => {
    expect(windowLabel({ from: '2026-10-04T11:45:54.031Z', to: '2026-10-11T04:00:32.885Z' })).toBe('5 Oct')
    expect(windowLabel({ from: '2026-10-05T00:00:00.000Z', to: '2026-10-12T00:00:00.000Z' })).toBe('5 Oct')
  })

  it('draws a cut window as null, never 0', () => {
    const input = { ...fixtureConvInput('week'), weekCut: [true, false, false] }
    expect(convOf(fixtureId(1), input)?.weeks).toEqual([null, 14, 23])
  })

  it('lists the month by the month, with its bars and its verdict', () => {
    const convs = buildConvs(fixtureConvInput('month'))
    expect(convs[0]).toMatchObject({ id: fixtureId(1), month: 35, week: null, weeks: [] })
    expect(convs[0].months.map((m) => m.label)).toEqual(['Jul', 'Aug', 'Sep', 'Oct'])
    expect(convs[0].months[3].filling).toBe(true)
  })

  it('leaves out a theme with no label', () => {
    const input = fixtureConvInput('week')
    const themes = new Map(input.themes)
    themes.set(fixtureId(1), { ...themes.get(fixtureId(1))!, label: '' })
    expect(buildConvs({ ...input, themes }).some((c) => c.id === fixtureId(1))).toBe(false)
  })
})

describe('the top row', () => {
  const convs = buildConvs(fixtureConvInput('week'))
  const flag = flagCardOf({ flag: FIXTURE_FLAG, window: fixtureRead().window, convs, convInput: fixtureConvInput('week'), monthCategory: 300, p: marketParams({}), noun: null })!

  it('leads with the check\'s flag, else what was first heard this week, else the biggest', () => {
    expect(pickHero({ convs, flag, setApart: new Set() })).toEqual({ kind: 'flag' })
    expect(pickHero({ convs, flag: null, setApart: new Set() })).toMatchObject({ kind: 'new', conv: { id: fixtureId(11) } })
    const none = convs.map((c) => ({ ...c, isNew: false }))
    expect(pickHero({ convs: none, flag: null, setApart: new Set() })).toMatchObject({ kind: 'biggest', conv: { id: fixtureId(1) } })
    expect(pickHero({ convs: none, flag: null, setApart: new Set([fixtureId(1)]) })).toMatchObject({ kind: 'biggest', conv: { id: fixtureId(2) } })
    expect(pickHero({ convs: [], flag: null, setApart: new Set() })).toBeNull()
  })

  it('puts the week\'s biggest beside the hero, then the rest of the new', () => {
    const sides = pickWeekSides({ convs, heroId: fixtureId(3), setApart: new Set() })
    expect(sides.biggest?.id).toBe(fixtureId(1))
    expect(sides.fresh.map((c) => c.id)).toEqual([fixtureId(11), fixtureId(17)])
    expect(pickWeekSides({ convs, heroId: fixtureId(1), setApart: new Set() }).biggest?.id).toBe(fixtureId(2))
  })

  it('builds the flag card on the check\'s own verdict: a week that moved earns "Unusual this week"', () => {
    expect(flag.conv?.id).toBe(fixtureId(3))
    expect(flag.month).toEqual({ k: 31, n: 300 })
    expect(flag.baselineText).toBe('July to September')
    expect(flag.href).toBe('/dashboard/market?conv=00000000-0000-4000-8000-000000000003&at=top#conv-panel')
    expect(flag.verdict).toMatchObject({ state: 'moved', window: { kind: 'week' }, value: { k: 19, n: 252 }, baseline: { k: 39, n: 1906 } })
    expect(flag.verdict.direction).toBeUndefined()
    expect(flagWordOf(flag.verdict)).toBe('unusual')
  })

  it('names a kind flag in the rail\'s words, and opens a subject flag\'s subject', () => {
    const input = fixtureConvInput('week')
    const kind = flagCardOf({ flag: { ...FIXTURE_FLAG, objectKind: 'kind', objectId: 'pain_point', label: 'pain_point' }, window: fixtureRead().window, convs, convInput: input, monthCategory: 300, p: marketParams({}), noun: null })!
    expect(kind.flag.label).toBe('Complained about something')
    expect(kind.href).toBeNull()
    const subject = flagCardOf({ flag: { ...FIXTURE_FLAG, objectKind: 'subject', objectId: 's1', label: 'Cost & access' }, window: fixtureRead().window, convs, convInput: input, monthCategory: 300, p: marketParams({}), noun: null })!
    expect(subject.href).toContain('subject=s1')
  })

  it('carries the baseline\'s caveats onto the verdict', () => {
    const v = flagVerdict({ ...FIXTURE_FLAG, baselineRegime: 'mixed', baselineFilling: ['2026-09-01'] }, fixtureRead().window)
    expect(v?.flags).toEqual(['clustering_changed', 'thin'])
    expect(flagVerdict({ ...FIXTURE_FLAG, objectKind: 'mood' }, fixtureRead().window)).toBeNull()
  })

  it('draws the market\'s months, oldest first, the newest still filling', () => {
    const m = marketMonths(new Map([['2026-09-01', { videos: 839 }], ['2026-10-01', { videos: 318 }]]), OCT, OCT)
    expect(m?.map((x) => [x.label, x.k, x.filling])).toEqual([['September', 839, false], ['October', 318, true]])
    expect(marketMonths(new Map(), OCT, OCT)).toBeNull()
  })
})

describe('the subject board', () => {
  const convs = buildConvs(fixtureConvInput('week'))
  const board = buildSubjectBoard({
    facts: fixtureFacts(), month: OCT, convs, period: 'week', flag: null,
    convHref: (id) => `#c-${id}`, subjectHref: (id) => `#s-${id}`, soFar: true,
  })!

  it('lists the subjects with a level, largest first, then a subject being re-described in its own row (14 Oct)', () => {
    expect(board.rows.map((r) => r.name)).toEqual(['Fit & comfort', 'Function & movement', 'Cost & access', 'Community & encouragement', 'Choosing the right device', 'Look & style', 'Sport and running'])
    expect(board.rows.slice(0, 6).every((r) => r.pending === null)).toBe(true)
    // A tracked subject is never hidden: the failed one keeps a row, no
    // figure, FAILED_EXPLAINED where its level goes.
    expect(board.rows[6]).toMatchObject({ id: fixtureSubjectId('sport'), level: null, verdict: null, prevPct: null, trail: [], pending: { state: 'failed', note: FAILED_EXPLAINED }, href: `#s-${fixtureSubjectId('sport')}` })
    expect(board.unmeasured).toEqual([])
    expect(board).toMatchObject({ monthText: 'October so far', prevText: 'September', n: 318, ticks: true })
  })

  it('says why a subject prints no level: its check open, being re-described, or not read this month', () => {
    expect(unmeasuredOf({ id: 's', name: 'S', calibration: 'failed' }, 'October so far', '#').note).toBe(FAILED_EXPLAINED)
    expect(unmeasuredOf({ id: 's', name: 'S', calibration: 'unread' }, 'October so far', '#').note).toBe('No reading in October so far yet')
    expect(unmeasuredOf({ id: 's', name: 'S', calibration: 'provisional' }, 'October so far', '#')).toMatchObject({ state: 'provisional', note: SUBJECT_NOT_MEASURED })
    // No calibration or "provisional" word on a client surface (ruling U6).
    expect(SUBJECT_NOT_MEASURED).toBe('Not measured yet')
    expect(SUBJECT_NOT_MEASURED).not.toMatch(/provisional|calibrat/i)
  })

  // The parity pass (13 Oct): a subject with no level keeps the board's row.
  it('keeps a row for a subject whose check is open: its name, the conversations inside it, why in the level\'s place', () => {
    const thin = buildSubjectBoard({
      facts: fixtureFactsIn('provisional'), month: OCT, convs, period: 'week', flag: null,
      convHref: (id) => `#c-${id}`, subjectHref: (id) => `#s-${id}`, soFar: true,
    })!
    expect(thin.rows.map((r) => r.name)).toEqual(['Choosing the right device', 'Community & encouragement', 'Cost & access', 'Fit & comfort', 'Function & movement', 'Look & style', 'Sport and running'])
    const fit = thin.rows.find((r) => r.name === 'Fit & comfort')!
    expect(fit).toMatchObject({ level: null, pending: { state: 'provisional', note: SUBJECT_NOT_MEASURED }, verdict: null, prevPct: null, trail: [] })
    expect(fit.inside.map((c) => [c.label, c.count, c.month])).toEqual([
      ['How long a liner lasts', 23, 35], ['Sweat under the liner', 21, 30], ['Socket fit changing over time', 14, 20],
    ])
    expect(thin.rows.map((r) => r.pending?.state)).toEqual(['provisional', 'provisional', 'provisional', 'provisional', 'provisional', 'provisional', 'failed'])
    expect(thin.unmeasured).toEqual([])
    expect(thin).toMatchObject({ n: null, ticks: false })
  })

  it('draws a subject read for one month on the board\'s axis, the months before as gaps', () => {
    const one = buildSubjectBoard({
      facts: fixtureFactsIn('one_month'), month: OCT, convs, period: 'week', flag: null, convHref: String, subjectHref: String, soFar: true,
    })!
    expect(subjectAxis(OCT)).toEqual(['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', OCT])
    const fit = one.rows.find((r) => r.name === 'Fit & comfort')!
    expect(fit.trail.map((t) => t.pct == null)).toEqual([true, true, true, true, true, false])
    expect(fit.verdict).toBeNull()
  })

  it('splits the subjects into three tiers: ready, open, failed (14 Oct)', () => {
    const all = [
      { subject: { id: 'p' }, calibration: 'provisional' }, { subject: { id: 'f' }, calibration: 'failed' }, { subject: { id: 'r' }, calibration: 'ready' },
    ]
    const t = placementTiers(all)
    expect([t.ready.map((x) => x.id), t.pending.map((x) => x.id), t.failed.map((x) => x.id)]).toEqual([['r'], ['p'], ['f']])
  })

  // Ruling U6 on a mixed tenant: a ready subject always wins placement, even
  // where a subject whose check is open holds more of the members.
  it('places a conversation in a ready subject wherever one qualifies, else in one whose check is open', () => {
    const members = Array.from({ length: 10 }, (_, i) => `m${i}`)
    const of = (pairs: [string, string[]][]) => {
      const m = new Map<string, string[]>()
      for (const [subject, ids] of pairs) for (const id of ids) m.set(id, [...(m.get(id) ?? []), subject])
      return m
    }
    const subjects = {
      names: new Map([['ready', 'Ready'], ['open', 'Open']]),
      order: ['ready'],
      subjectsOf: of([['ready', members.slice(0, 3)]]),
      pending: { order: ['open'], subjectsOf: of([['open', members.slice(0, 8)]]) },
    }
    // Ready holds 3 of 10 (it qualifies): it wins over 8 of 10 still open.
    expect(placeSubject(members, subjects)).toBe('ready')
    // Ready holds 2 (it does not qualify): the open one takes it.
    expect(placeSubject(members, { ...subjects, subjectsOf: of([['ready', members.slice(0, 2)]]) })).toBe('open')
    // Neither qualifies: no subject.
    expect(placeSubject(members.slice(0, 2), subjects)).toBeNull()
    // With no second tier (every other surface), ready only.
    expect(placeSubject(members, { ...subjects, subjectsOf: of([['ready', members.slice(0, 2)]]), pending: null })).toBeNull()
  })

  it('prints no count on the chip of a subject whose check is open, and lists those chips by name after the ready ones', () => {
    const t = buildTable({ convs, params: marketParams({}), openId: null, months: [], pending: new Set([fixtureSubjectId('fit'), fixtureSubjectId('cost')]) })!
    expect(t.filters.map((f) => [f.name, f.count])).toEqual([
      ['All', 17], ['Community & encouragement', 3], ['Function & movement', 3], ['Choosing the right device', 2], ['Look & style', 2],
      ['Cost & access', null], ['Fit & comfort', null],
    ])
  })

  // Ruling U6 (14 Oct sweep): the count a pending chip withholds is the
  // count of the table filtered to it, so that is held too.
  it('holds the table\'s total under the filter of a subject whose check is open, and prints it under a ready one', () => {
    const pending = new Set([fixtureSubjectId('fit'), fixtureSubjectId('cost')])
    const open = buildTable({ convs, params: marketParams({ in: fixtureSubjectId('fit') }), openId: null, months: [], pending })!
    expect(open.filter).toBe(fixtureSubjectId('fit'))
    expect(open.totalHeld).toBe(true)
    const ready = buildTable({ convs, params: marketParams({ in: fixtureSubjectId('community') }), openId: null, months: [], pending })!
    expect(ready.totalHeld).toBeUndefined()
    expect(buildTable({ convs, params: marketParams({}), openId: null, months: [], pending })!.totalHeld).toBeUndefined()
  })

  // Ruling U6 (14 Oct sweep): the anomaly check flags every active subject;
  // a flag on one that is not ready never leads Market or the tile.
  it('a flag on a subject that is not ready never leads: the next flag does', () => {
    const rows = [
      { object_kind: 'subject', object_id: 's-open', rank: 1 },
      { object_kind: 'theme', object_id: 't-1', rank: 2 },
      { object_kind: 'subject', object_id: 's-ready', rank: 3 },
    ]
    expect(printableFlags(rows, new Set(['s-ready'])).map((r) => r.object_id)).toEqual(['t-1', 's-ready'])
    expect(printableFlags(rows.slice(0, 1), new Set())).toEqual([])
  })

  it('draws no tick legend where no pair may be printed', () => {
    const none = buildSubjectBoard({
      facts: fixtureFacts().map((f) => (f.verdict ? { ...f, verdict: { ...f.verdict, state: 'refused' as const } } : f)),
      month: OCT, convs, period: 'week', flag: null, convHref: String, subjectHref: String, soFar: true,
    })!
    expect(none.ticks).toBe(false)
  })

  it('ticks last month only where the pair may be printed', () => {
    const cost = board.rows.find((r) => r.name === 'Cost & access')!
    expect(cost.prevPct).toBeCloseTo((100 * 126) / 839, 5)
    expect(cost.verdict?.state).toBe('moved')
    const refused = buildSubjectBoard({
      facts: fixtureFacts().map((f) => (f.verdict ? { ...f, verdict: { ...f.verdict, state: 'refused' as const } } : f)),
      month: OCT, convs, period: 'week', flag: null, convHref: String, subjectHref: String, soFar: true,
    })!
    expect(refused.rows.every((r) => r.prevPct === null)).toBe(true)
  })

  it('lists the conversations inside, the week beside its month, the flag on the flagged one', () => {
    const fit = board.rows.find((r) => r.name === 'Fit & comfort')!
    expect(fit.inside.map((c) => [c.label, c.count, c.month])).toEqual([
      ['How long a liner lasts', 23, 35], ['Sweat under the liner', 21, 30], ['Socket fit changing over time', 14, 20],
    ])
    expect(fit.trail).toHaveLength(6)
    const flagged = insideOf(fixtureSubjectId('cost'), convs, 'week', { href: String, flagId: fixtureId(3), flag: { state: 'moved' } as never })
    expect(flagged[0].flag).not.toBeNull()
  })

  it('is nothing with no subject', () => {
    expect(buildSubjectBoard({ facts: [], month: OCT, convs, period: 'week', flag: null, convHref: String, subjectHref: String, soFar: true })).toBeNull()
  })
})

describe('one "so far" rule', () => {
  it('reads so far only while the month is under way and the week did not carry past it', () => {
    expect(monthSoFar('2026-10-01', '2026-10-01')).toBe(true)
    expect(monthSoFar('2026-09-01', '2026-10-01')).toBe(false)
    expect(monthSoFar('2026-10-01', '2026-10-01', true)).toBe(false)
  })
})

describe('the rail', () => {
  it('reads the six kinds, largest first, ticking last month', () => {
    const kinds = buildKinds(fixtureKindReadings(), OCT, null, true)!
    expect(kinds.rows.map((r) => r.label)).toEqual(['Asked a question', 'Praised it', 'Complained about something', 'Wished for something', 'Said they want to buy', 'Pushed back'])
    expect(kinds.n).toBe(318)
    expect(kinds.rows[0].prevPct).toBeCloseTo((100 * 369) / 839, 5)
    expect(kinds.ticks).toBe(true)
    expect(buildKinds([], OCT, null, true)).toBeNull()
    expect(buildKinds(fixtureKindReadings(), OCT, 'bags', false)?.rows.find((r) => r.kind === 'praise')?.label).toBe('Praised a bag')
  })

  it('pools platform mixes and lists them largest first', () => {
    expect(mergeMixes([{ tiktok: 3 }, null, { tiktok: 2, youtube: 1 }])).toEqual({ tiktok: 5, youtube: 1 })
    expect(mergeMixes([null, {}])).toBeNull()
    const rows = platformRows({ youtube: 37, tiktok: 128, instagram: 76 }, 'week')!
    expect(rows.rows.map((r) => [r.label, r.videos])).toEqual([['TikTok', 128], ['Instagram', 76], ['YouTube', 37]])
    expect(rows.n).toBe(241)
    expect(platformRows({}, 'month')).toBeNull()
    const both = withMonthPlatforms(rows, { tiktok: 170, instagram: 98, youtube: 50 }, 'in October so far')
    expect(both?.month).toEqual({ counts: { tiktok: 170, instagram: 98, youtube: 50 }, n: 318, text: 'in October so far' })
    expect(withMonthPlatforms(null, {}, 'x')).toBeNull()
  })
})

describe('the table', () => {
  const convs = buildConvs(fixtureConvInput('week'))
  const p = marketParams({})

  it('shows ten until all, with the subjects as filters', () => {
    const t = buildTable({ convs, params: p, openId: null, months: [], pending: new Set() })!
    expect(t.rows).toHaveLength(MARKET_TABLE_ROWS)
    expect(t.total).toBe(convs.length)
    expect(t.showAllHref).toBe('/dashboard/market?all=1#conversations')
    expect(t.filters[0]).toMatchObject({ id: null, name: 'All', count: convs.length })
    expect(t.filters[1]).toMatchObject({ name: 'Fit & comfort', count: 4 })
    const all = buildTable({ convs, params: marketParams({ all: '1' }), openId: null, months: [], pending: new Set() })!
    expect(all.rows).toHaveLength(convs.length)
    expect(all.showAllHref).toBeNull()
  })

  it('filters by subject, and keeps an open row further down', () => {
    const t = buildTable({ convs, params: marketParams({ in: fixtureSubjectId('cost') }), openId: null, months: [], pending: new Set() })!
    expect(t.rows.map((r) => r.conv.subjectName)).toEqual(['Cost & access', 'Cost & access', 'Cost & access'])
    expect(t.filter).toBe(fixtureSubjectId('cost'))
    const open = buildTable({ convs, params: p, openId: fixtureId(16), months: [], pending: new Set() })!
    expect(open.rows.at(-1)).toMatchObject({ open: true, conv: { id: fixtureId(16) } })
  })

  it('is nothing with no conversation', () => {
    expect(buildTable({ convs: [], params: p, openId: null, months: [], pending: new Set() })).toBeNull()
  })

  it('ignores an unknown ?in= (every row, and its who, stays)', () => {
    expect(tableFilterOf(convs, 'nope')).toBeNull()
    expect(buildTable({ convs, params: marketParams({ in: 'nope' }), openId: null, months: [], pending: new Set() })!.rows).toHaveLength(MARKET_TABLE_ROWS)
  })

  it('has no Subject column where no conversation is in a measured subject', () => {
    const none = convs.map((c) => ({ ...c, subjectId: null, subjectName: null }))
    expect(buildTable({ convs: none, params: p, openId: null, months: [], pending: new Set() })!.subjects).toBe(false)
    expect(buildTable({ convs, params: p, openId: null, months: [], pending: new Set() })!.subjects).toBe(true)
  })

  it('reads the over-time months off the category', () => {
    const months = tableMonths(OCT, new Map([['2026-09-01', 780], ['2026-10-01', 300]]), OCT, 3)
    expect(months.map((m) => [m.label, m.n, m.filling])).toEqual([['Sep', 780, false], ['Oct', 300, true]])
  })
})

describe('the open panel', () => {
  it('points the notch at the clicked item, on the row as it is laid out', () => {
    expect(notchOf('top', 0)).toBe(0.25)
    expect(notchOf('top', 2)).toBe(0.875)
    expect(notchOf('top', 0, 1)).toBeCloseTo(3.5 / 12, 5)
    expect(notchOf('top', 1, 1)).toBeCloseTo(9.5 / 12, 5)
    expect(notchOf('top', 0, 0)).toBe(0.5)
    expect(topSpans(1)).toEqual([7, 5])
    expect(notchOf('subjects')).toBe(0.3)
  })

  it('names the flag\'s base', () => {
    expect(flagBaseWords('every audience together')).toBe('every audience together, your own posts included')
    expect(flagBaseWords('the category')).toBe('the category')
  })

  it('reads our read from the finding, else the flag\'s explanation, else the description', () => {
    const read = fixtureRead()
    expect(ourReadOf({ id: fixtureId(3), read, flag: FIXTURE_FLAG, description: 'd' })?.slot).toBe('week_read')
    expect(ourReadOf({ id: fixtureId(3), read: null, flag: FIXTURE_FLAG, description: 'd' })).toMatchObject({ slot: 'interpretation_anomaly', lines: [{ body: FIXTURE_FLAG.sentences[0] }, { body: FIXTURE_FLAG.sentences[1] }] })
    expect(ourReadOf({ id: fixtureId(1), read, flag: FIXTURE_FLAG, description: ' A description. ' })).toEqual({ slot: 'pass_b_theme', lines: [{ body: 'A description.', figures: {} }] })
    expect(ourReadOf({ id: fixtureId(1), read: null, flag: null, description: null })).toBeNull()
  })

  it('drops an explanation sentence that names a figure the table lacks', () => {
    const r = ourReadOf({ id: fixtureId(3), read: null, flag: { ...FIXTURE_FLAG, sentences: ['It was [[flag_1_week_share]] of the week.', 'It cites [[nowhere]].'] }, description: null })
    expect(r?.lines.map((l) => l.body)).toEqual(['It was [[flag_1_week_share]] of the week.'])
  })

  it('names the groups a conversation is in, defensively', () => {
    const personas = personasOf([{ key: 'k', name: 'Caregivers', registryIds: ['t1'] }, { name: ' ' }, null, { name: 'No key', registryIds: 'x' }])
    expect(personas).toEqual([{ key: 'k', name: 'Caregivers', registryIds: ['t1'] }, { key: 'No key', name: 'No key', registryIds: [] }])
    expect(groupsOf('t1', personas)).toEqual([{ key: 'k', name: 'Caregivers', href: '/dashboard/voices?group=k#group-panel' }])
    expect(personasOf(null)).toEqual([])
  })

  it('states the week, the month, last month and the flag\'s baseline, each with its n', () => {
    const data = marketFixture({ open: { n: 3, at: 'top' } })
    const conv = { ...(data.table!.rows.find((r) => r.conv.id === fixtureId(3))!.conv) } as MarketConv
    const stats = panelStats({ conv, period: 'week', week: data.week, month: data.month, prevK: 19, flag: FIXTURE_FLAG, baselineText: monthsText(FIXTURE_FLAG.baselineMonths) })
    expect(stats).toEqual([
      { value: 19, of: 226, label: 'category videos this week' },
      { value: 31, of: 300, label: 'category videos in October so far' },
      { value: 19, of: 780, label: 'category videos in September' },
      { value: 39, of: 1906, label: 'videos in July to September, every audience together, your own posts included' },
    ])
    expect(monthsText([])).toBe('the months before')
    expect(monthsText(['2026-09-01'])).toBe('September')
  })

  it('counts what people did over the month\'s videos, at most four kinds', () => {
    expect(doingOf([{ kind: 'pain_point', videos: 14 }, { kind: 'question', videos: 0 }], 31, null)).toEqual([{ kind: 'pain_point', label: 'Complained about something', k: 14, n: 31 }])
    expect(doingOf(null, 31, null)).toEqual([])
    // The lead card never says a conversation does what it is (Phase 4 fix
    // round: Össur's praise conversation read "Praised it · 35 of 35").
    const rows = doingOf([{ kind: 'praise', videos: 35 }, { kind: 'question', videos: 9 }], 35, null)
    expect(leadDoing(rows, 'praise')).toMatchObject({ kind: 'question', k: 9, n: 35 })
    expect(leadDoing(rows, 'pain_point')).toMatchObject({ kind: 'praise' })
    expect(leadDoing(rows, null)).toMatchObject({ kind: 'praise' })
    expect(leadDoing(doingOf([{ kind: 'praise', videos: 35 }], 35, null), 'praise')).toBeNull()
    expect(doingOf([{ kind: 'praise', videos: 3 }], 0, null)).toEqual([])
  })

  it('splits who a conversation\'s videos are about by the brands their comments name', () => {
    const who = whoOf(
      [{ theme_id: 't1', video_ids: ['v1', 'v2', 'v3'], comment_ids: ['c1', 'c2'] }],
      [{ comment_id: 'c1', video_id: 'v1', name: 'Össur' }, { comment_id: 'c9', video_id: 'v2', name: 'Ottobock' }],
      'Össur',
    )
    expect(who.get('t1')).toEqual([{ about: 'client', videos: 1 }, { about: 'market', videos: 2 }])
  })

  it('a subject being re-described opens as an open one does: not measured yet, the conversations inside it (here none), no figure', () => {
    const data = marketFixture({ subject: 'sport' })
    // Its reason, FAILED_EXPLAINED, is said once a page: in its row (14 Oct).
    expect(data.subjectPanel).toMatchObject({ state: 'failed', note: SUBJECT_NOT_MEASURED, inside: [], bars: [], level: null })
    expect(data.subjects!.rows.find((r) => r.id === data.subjectPanel!.id)!.pending).toEqual({ state: 'failed', note: FAILED_EXPLAINED })
  })

  it('a subject whose check is open opens with why and the conversations inside it', () => {
    const data = marketThinFixture({ subject: 'cost' })
    expect(data.subjectPanel).toMatchObject({ state: 'provisional', note: SUBJECT_NOT_MEASURED, bars: [], level: null, verdict: null })
    expect(data.subjectPanel!.inside.map((c) => c.label)).toEqual(['Insurance refusals for powered knees', 'Paying out of pocket', 'Medical aid and liners'])
  })

  it('lists a set-apart conversation inside its subject, tagged (only leading is barred)', () => {
    const input = { ...fixtureConvInput('week'), setApart: new Map([[fixtureId(1), 'makers' as const]]) }
    const rows = insideOf(fixtureSubjectId('fit'), buildConvs(input), 'week', { href: String })
    expect(rows.find((r) => r.id === fixtureId(1))?.setApart).toBe('makers')
  })

  it('opens a subject with its line, every conversation inside it and the read\'s sentence', () => {
    const data = marketFixture({ subject: 'cost' })
    expect(data.subjectPanel).toMatchObject({ name: 'Cost & access', level: { k: 70, n: 318 }, sentence: { body: expect.stringContaining('paid for') } })
    expect(data.subjectPanel!.inside.map((c) => c.label)).toEqual(['Insurance refusals for powered knees', 'Paying out of pocket', 'Medical aid and liners'])
    expect(buildSubjectPanel({ id: 'nope', facts: fixtureFacts(), convs: [], period: 'week', p: marketParams({}), read: null, month: data.month })).toBeNull()
  })
})

describe('the fixture, end to end', () => {
  it('opens a conversation under the top row with its quotes, and keeps the top free of quotes', () => {
    const data = marketFixture({ open: { n: 3, at: 'top' } })
    expect(data.panel).toMatchObject({ id: fixtureId(3), at: 'top', notchAt: 0.25, quotes: [{}, {}, {}] })
    expect(data.top.hero?.kind).toBe('flag')
  })

  it('a read stored before v3 has no new and no watch', () => {
    const v1 = { ...fixtureRead(), version: 1, inShort: '', promptVersion: 'week_read_v2' } as unknown as WeekReadData
    expect(v1.version).toBe(1)
  })
})

// Phase 4 fix check: Market drew its weekly bars UNCUT when the change log or
// the cadence read failed (each fell back to an empty list), where the
// Dashboard said the read failed. Any of the three reads failing is the
// block's failure.
describe('marketWeeksOf: the weekly bars, or WEEKS_FAILED', () => {
  const base = { rows: [] as never[], changes: [], cadence: [], rivalAudiences: [], updates: [], now: '2026-10-13T10:00:00.000Z' }
  it('is WEEKS_FAILED where the rows, the change log or the cadence failed', () => {
    expect(marketWeeksOf({ ...base, rows: WEEKS_FAILED })).toBe(WEEKS_FAILED)
    expect(marketWeeksOf({ ...base, changes: null })).toBe(WEEKS_FAILED)
    expect(marketWeeksOf({ ...base, cadence: null })).toBe(WEEKS_FAILED)
  })
  it('is the chart, or null for too few clean weeks, where all three read', () => {
    expect(marketWeeksOf(base)).not.toBe(WEEKS_FAILED)
  })
})

// The parity pass (13 Oct): the third top card where nothing was first heard
// this week names the newest conversation an earlier week's read first heard.
describe('the newest conversation an earlier week first heard', () => {
  const input = fixtureConvInput('week')
  const w = { from: '2026-09-21T00:00:00.000Z', to: '2026-09-28T00:00:00.000Z' }
  it('reads the stored rows defensively, newest week first', () => {
    expect(earlierNewOfRows([
      { window: w, fresh: [{ themeId: 'a' }, { themeId: '' }, null] },
      { window: null, fresh: [{ themeId: 'b' }] },
      { window: w, fresh: [] },
      { window: w, fresh: 'nope' },
    ])).toEqual([{ window: w, themeIds: ['a'] }])
  })
  it('takes the first one the themed run can name, with this week\'s counts', () => {
    const e = earlierNewOf([{ window: w, themeIds: ['unknown', fixtureId(16)] }], input, (id) => `#${id}`)
    expect(e).toMatchObject({ week: '21 Sep', href: `#${fixtureId(16)}`, conv: { label: 'Showing it or hiding it', week: 6, month: 9 } })
    expect(earlierNewOf([], input, String)).toBeNull()
    expect(earlierNewOf([{ window: w, themeIds: ['unknown'] }], input, String)).toBeNull()
  })
  it('never names a conversation the row already holds', () => {
    const e = earlierNewOf([{ window: w, themeIds: [fixtureId(1), fixtureId(16)] }], input, String, new Set([fixtureId(1)]))
    expect(e?.conv.id).toBe(fixtureId(16))
    expect(earlierNewOf([{ window: w, themeIds: [fixtureId(1)] }], input, String, new Set([fixtureId(1)]))).toBeNull()
  })

  it('stands in the week\'s next biggest not on the row, never one set apart, where no earlier week named one', () => {
    const convs = buildConvs(input)
    expect(alsoTalkedOf(convs, new Set([fixtureId(1), fixtureId(2)]), new Set())?.label).toBe('Insurance refusals for powered knees')
    expect(alsoTalkedOf(convs, new Set([fixtureId(1), fixtureId(2)]), new Set([fixtureId(3)]))?.label).toBe('Running-blade stories')
    expect(alsoTalkedOf(convs.slice(0, 2), new Set([fixtureId(1), fixtureId(2)]), new Set())).toBeNull()
  })

  it('draws the board\'s three cards in the thin state, each conversation on one card only', () => {
    const thin = marketThinFixture()
    expect(thin.top.sides.map((x) => [x.kind, x.convs.length])).toEqual([['biggest', 1], ['new_list', 0]])
    const third = thin.top.sides[1]
    expect(third).toMatchObject({ anyNew: false, earlier: null, also: { conv: { label: 'Insurance refusals for powered knees' } } })
    const ids = [thin.top.hero && thin.top.hero.kind !== 'flag' ? thin.top.hero.conv.id : null, ...thin.top.sides.flatMap(sideIds)]
    expect(new Set(ids).size).toBe(ids.length)
    const earlier = marketThinFixture({ earlierNew: true }).top.sides[1]
    expect(earlier).toMatchObject({ earlier: { conv: { label: 'Showing it or hiding it' } }, also: null })
  })

  it('says "nothing else" where a conversation off the cards was first heard this week (the flag\'s)', () => {
    const d = marketFixture({ flagged: false, noNew: true, flagNew: true })
    expect(d.top.hero?.kind).toBe('flag')
    expect(d.top.sides[1]).toMatchObject({ kind: 'new_list', anyNew: true, earlier: null })
  })
})
