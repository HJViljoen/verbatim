import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { bandVerdict } from '../../reading/verdicts'
import type { StandingFact, WeekReadDataV2 } from '../../written/types'
import { homeWeeksFrame, WEEKS_FAILED } from '../home'
import { parseContentParams } from './content'
import { topProducts } from './products'
import {
  agentTries, dashboardBar, marketWeekOf, settleTile, shortDates, weekSubjectsOf, weekTileOf, AGENT_TRIES,
} from './home'
import {
  dashboardFixture, fixtureContentTop, fixtureMarketTop, fixtureMovesTop, fixturePublished, fixtureStanding, fixtureVoicesTop, DASHBOARD_NOW,
} from './home-fixture'
import { marketParams } from './market'
import { FIXTURE_FLAG, FIXTURE_WEEKS, fixtureId } from './market-fixture'
import { adviceParam } from './moves'
import { parseVoicesParams } from './voices'

// The Dashboard's loader (Design v2, depth plan T8; lib/pages/v2/home.ts):
// its pure builders, its one wave, and that every tile's link opens its
// page's panel (each href parsed by that page's own param parser).

const query = (href: string): Record<string, string> => {
  const q = href.split('#')[0].split('?')[1] ?? ''
  return Object.fromEntries(new URLSearchParams(q))
}
const path = (href: string): string => href.split('#')[0].split('?')[0]

describe('the week tile', () => {
  it('prints the read\'s frozen market this week, and the month it is restated against beside it', () => {
    const t = weekTileOf({ read: fixturePublished(), weeks: FIXTURE_WEEKS, subjects: null, now: DASHBOARD_NOW })
    expect(t.dates).toBe('5 to 11 October')
    expect(t.week).toEqual({ videos: 241, comments: 3912 })
    expect(t.month).toEqual({ videos: 318, comments: 5840 })
    expect(t.inMonth).toBe('in October so far')
    expect(t.weeks).toBe(FIXTURE_WEEKS)
    expect(t.href).toBe('/dashboard/market')
  })

  it('a week that crossed into the next month is restated against the month it started in, in full', () => {
    const base = fixturePublished()
    const read = { ...base, data: { ...base.data, window: { from: '2026-09-27T04:03:00Z', to: '2026-10-04T04:02:00Z' } } }
    expect(weekTileOf({ read, weeks: null, subjects: null, now: DASHBOARD_NOW }).inMonth).toBe('in September')
  })

  it('with no read: no figure, no month, and the weekly chart\'s empty frame', () => {
    const t = weekTileOf({ read: null, weeks: null, subjects: null, now: DASHBOARD_NOW })
    expect(t).toMatchObject({ dates: null, week: { videos: null, comments: null }, month: { videos: null, comments: null }, inMonth: null })
    expect(t.weeks).toEqual(homeWeeksFrame(DASHBOARD_NOW))
  })

  it('a weekly read that failed is told apart from too few clean weeks (Phase 4 fix round)', () => {
    const failed = weekTileOf({ read: null, weeks: WEEKS_FAILED, subjects: null, now: DASHBOARD_NOW })
    expect(failed.weeksFailed).toBe(true)
    expect(failed.weeks).toEqual(homeWeeksFrame(DASHBOARD_NOW))
    const thin = weekTileOf({ read: null, weeks: null, subjects: null, now: DASHBOARD_NOW })
    expect(thin.weeksFailed).toBeUndefined()
    expect(weekTileOf({ read: null, weeks: FIXTURE_WEEKS, subjects: null, now: DASHBOARD_NOW }).weeksFailed).toBeUndefined()
  })

  it('the loader turns a weekly read that throws into WEEKS_FAILED, never null', () => {
    const src = readFileSync(resolve(__dirname, 'home.ts'), 'utf8')
    expect(src).toMatch(/loadHomeWeeks\([^)]*\)[^;]*\.catch\(\(error: unknown\) => \{ say\('weeks', error\); return WEEKS_FAILED \}\)/)
    const market = readFileSync(resolve(__dirname, 'market.ts'), 'utf8')
    expect(market).toMatch(/\('weeks', loadWeekRows\(db, clientId, nowIso\), WEEKS_FAILED\)/)
    expect(market).toMatch(/weeks: !Array\.isArray\(weekRowsRaw\) \? WEEKS_FAILED/)
  })

  it('a figure the read did not hold is null, never zero', () => {
    const base = fixturePublished()
    const read = { ...base, data: { ...base.data, market: { week: { videos: 241, comments: null }, month: { videos: null, comments: 5840 } } } }
    const t = weekTileOf({ read: read as never, weeks: null, subjects: null, now: DASHBOARD_NOW })
    expect(t.week).toEqual({ videos: 241, comments: null })
    expect(t.month).toEqual({ videos: null, comments: 5840 })
  })
})

describe('the subjects on the week tile, as Market\'s board reads them', () => {
  it('names the biggest ready subject and the one that moved most beyond its band, each opening on Market', () => {
    const s = weekSubjectsOf(fixtureStanding(), '2026-10-01', true)!
    expect(s.monthText).toBe('October so far')
    expect(s.prevText).toBe('September')
    expect(s.biggest).toMatchObject({ name: 'Fit & comfort', k: 108, n: 318 })
    // Cost & access: 70 of 318 against 126 of 839, the largest change that cleared its band.
    expect(s.moved?.name).toBe('Cost & access')
    expect(s.moved?.verdict.state).toBe('moved')
    expect(marketParams(query(s.moved!.href))).toMatchObject({ subject: s.moved!.id, at: 'subjects' })
    expect(path(s.biggest!.href)).toBe('/dashboard/market')
    expect(s.noneMoved).toBe(false)
  })

  it('says none moved where every comparison stayed inside its band, and prints no level for a subject that is not ready', () => {
    const still = (f: StandingFact): StandingFact => ({
      ...f,
      verdict: f.level ? bandVerdict({
        objectKind: 'subject', objectId: f.subjectId, objectLabel: f.name, audience: 'market',
        window: { kind: 'month', from: '2026-10-01', to: '2026-11-01' }, basis: { from: '2026-09-01', to: '2026-10-01' },
        value: { k: f.level.k, n: f.level.n }, baseline: { k: f.level.k, n: f.level.n },
      }) : null,
    })
    const s = weekSubjectsOf(fixtureStanding().map(still), '2026-10-01', true)!
    expect(s.moved).toBeNull()
    expect(s.noneMoved).toBe(true)
    const provisional = fixtureStanding().map((f) => ({ ...f, calibration: 'provisional' as const }))
    expect(weekSubjectsOf(provisional, '2026-10-01', true)).toBeNull()
  })

  it('a month already over reads without "so far"', () => {
    expect(weekSubjectsOf(fixtureStanding(), '2026-09-01', false)!.monthText).toBe('September')
  })
})

describe('the Agent box\'s conversations to try', () => {
  it('names the week\'s two biggest conversations the read froze, never one set apart, each asking the Agent about it', () => {
    const tries = agentTries(fixturePublished())
    expect(tries).toHaveLength(AGENT_TRIES)
    expect(tries.map((t) => t.label)).toEqual(['How long a liner lasts', 'Insurance refusals for powered knees'])
    expect(tries[0].question).toBe('What does my market say about "How long a liner lasts"?')
    expect(tries[0].href).toBe(`/dashboard/agent?ask=${encodeURIComponent(tries[0].question)}`)
    const base = fixturePublished()
    const apart = { ...base, data: { ...base.data, conversations: base.data.version === 2 ? base.data.conversations!.map((c, i) => ({ ...c, setApart: i === 0 })) : [] } }
    expect(agentTries(apart)[0].label).toBe('Insurance refusals for powered knees')
  })

  it('takes the conversations the Market tile leads with where the read froze none (a read stored before T11b)', () => {
    const base = fixturePublished()
    const older = { ...base, data: { ...(base.data as WeekReadDataV2), conversations: undefined } }
    expect(agentTries(older, fixtureMarketTop({ flagged: false })).map((t) => t.label)).toEqual(['Waterproof knees', 'How long a liner lasts'])
    // The flag's conversation leads where the check raised one.
    expect(agentTries(null, fixtureMarketTop())[0].label).toBe('Insurance refusals for powered knees')
  })

  it('offers none without a read or a Market tile, or a read that froze no conversations', () => {
    expect(agentTries(null)).toEqual([])
    const base = fixturePublished()
    expect(agentTries({ ...base, data: { ...(base.data as WeekReadDataV2), conversations: undefined } })).toEqual([])
  })
})

describe('the bar', () => {
  it('dates the week by the read and the updates by the clock', () => {
    expect(dashboardBar({ read: fixturePublished(), clock: { asAt: '2026-10-11T07:30:00Z', nextUpdate: '2026-10-18T06:00:00Z', paused: false } }))
      .toEqual({ dates: '5 to 11 October', short: '5 to 11 Oct', asAt: '2026-10-11T07:30:00Z', nextUpdate: '2026-10-18T06:00:00Z', paused: false })
    expect(dashboardBar({ read: null, clock: null })).toEqual({ dates: null, short: null, asAt: null, nextUpdate: null, paused: false })
    expect(shortDates('28 September to 4 October')).toBe('28 Sep to 4 Oct')
  })

  it('hands the Market tile the read\'s market this week, so its category count can say where it sits', () => {
    expect(marketWeekOf(fixturePublished())).toBe(241)
    expect(marketWeekOf(null)).toBeNull()
  })
})

describe('a tile whose read fails loses only itself', () => {
  it('settles to what it read, or to failed, and never throws', async () => {
    await expect(settleTile('x', Promise.resolve(3))).resolves.toEqual({ state: 'ok', top: 3 })
    const quiet = console.error
    console.error = () => {}
    try {
      await expect(settleTile('x', Promise.reject(new Error('PGRST002')))).resolves.toEqual({ state: 'failed' })
    } finally {
      console.error = quiet
    }
  })
})

describe('Your products (T5\'s reader)', () => {
  it('reads through topProducts, and a failed read is a quiet tile that says it failed, never a throw', async () => {
    await expect(topProducts({ supabase: null as never, clientId: 'c', reading: null as never, now: '2026-10-13T10:00:00Z' }))
      .resolves.toMatchObject({ state: 'quiet', standout: null, href: '/dashboard/products', note: 'failed' })
  })

  it('calls T5\'s reader in the one wave, not a stub', () => {
    const src = readFileSync(resolve(__dirname, 'home.ts'), 'utf8')
    expect(src).not.toMatch(/topProductsStub|STUB UNTIL T5 MERGES/)
    expect(src).toMatch(/topProducts\(\{ supabase, clientId, reading, now: nowIso \}\)/)
  })
})

describe('every tile\'s link opens its page\'s panel (each parsed by that page\'s own parser)', () => {
  it('Market: `?conv=` and `?at=top`, on the flag\'s conversation, the lead and each row', () => {
    const top = fixtureMarketTop()
    expect(top.hero?.kind).toBe('flag')
    const flagHref = top.hero?.kind === 'flag' ? top.hero.card.href! : ''
    expect(path(flagHref)).toBe('/dashboard/market')
    expect(marketParams(query(flagHref))).toMatchObject({ period: 'week', conv: FIXTURE_FLAG.objectId, at: 'top' })
    expect(flagHref).toMatch(/#conv-panel$/)
    for (const r of top.rows) expect(marketParams(query(r.href))).toMatchObject({ conv: r.conv.id, at: 'top' })
    const quiet = fixtureMarketTop({ flagged: false })
    expect(quiet.hero?.kind).toBe('new')
    if (quiet.hero && quiet.hero.kind !== 'flag') expect(marketParams(query(quiet.hero.href)).conv).toBe(quiet.hero.conv.id)
  })

  it('Voices: `?group=` for the lead group, `?brand=` for each brand named', () => {
    const top = fixtureVoicesTop()
    expect(path(top.group!.href)).toBe('/dashboard/voices')
    expect(parseVoicesParams(query(top.group!.href))).toEqual({ group: top.group!.key })
    expect(top.group!.href).toMatch(/#group-panel$/)
    expect(top.named.map((b) => parseVoicesParams(query(b.href)).brand)).toEqual(['client', 'Ottobock'])
  })

  it('Content: `?idea=1`, the brief in place', () => {
    const top = fixtureContentTop()
    expect(path(top.href)).toBe('/dashboard/content')
    expect(parseContentParams(query(top.href)).open).toEqual({ kind: 'idea', rank: 1 })
    expect(top.href).toMatch(/#idea-panel$/)
  })

  it('Your moves: `?advice=<lineage>`, the advice in place', () => {
    const top = fixtureMovesTop()
    expect(path(top.advice!.href)).toBe('/dashboard/moves')
    expect(adviceParam(query(top.advice!.href))).toBe(top.advice!.lineageId)
    expect(top.advice!.href).toMatch(/#advice-panel$/)
  })

  it('the whole fixture page carries each of them', () => {
    const d = dashboardFixture()
    expect(d.market.state === 'ok' && d.market.top.top?.hero?.kind).toBe('flag')
    expect(fixtureId(3)).toBe(FIXTURE_FLAG.objectId)
  })
})

describe('one wave (the loader\'s shape, pinned by its source)', () => {
  const src = readFileSync(resolve(__dirname, 'home.ts'), 'utf8')

  it('reads the published week once and hands it to Market and Content (Content on the soft read: a failed week read costs it its anchor, not the tile)', () => {
    expect(src.match(/loadPublishedWeekRead\(/g)).toHaveLength(1)
    expect(src).toMatch(/topMarket\(\{ supabase, clientId, reading, read, now \}\)/)
    expect(src).toMatch(/publishedSoft\.then\(\(read\) => topContent\(scope, \{ now, published: read \}\)\)/)
  })

  it('starts every tile before awaiting any, on one session client and one reading handle', () => {
    const start = src.slice(src.indexOf('export function startDashboard'), src.indexOf('export async function loadDashboard'))
    expect(start).not.toMatch(/\bawait\b/)
    for (const t of ['topMarket(', 'topVoices(', 'topContent(', 'topMoves(', 'topProducts(', 'loadHomeWeeks(']) expect(start).toContain(t)
    expect(start).not.toMatch(/readingHandle\(/)
  })

  it('wraps each tile so a failed read loses only that tile', () => {
    for (const t of ['market', 'voices', 'products', 'content', 'moves', 'week']) expect(src).toContain(`settleTile('${t}',`)
  })
})

describe('a failed read reaches its tile as a failure, never as "nothing yet"', () => {
  it('Market\'s top read throws where the themed run, the newest week or its labels could not be read', () => {
    const src = readFileSync(resolve(__dirname, 'market.ts'), 'utf8')
    const top = src.slice(src.indexOf('export async function topMarket'), src.indexOf('async function loadThemeLabels'))
    expect(top).not.toMatch(/fetchThemedRunId\([^)]*\)\)\.catch\(\(\) => null\)/)
    expect(top).toMatch(/throw new Error\('market\.top: the newest week could not be read'\)/)
    expect(top).toMatch(/const runThemes = await loadThemeLabels\(/)
  })

  it('Voices\' top read carries its groups\' and brands\' states', () => {
    const top = fixtureVoicesTop()
    expect(top).toMatchObject({ groupsState: 'ready', groupsEmpty: null, brandsState: 'ready' })
  })
})

describe('the rivals are read once a request', () => {
  it('loadTrackedRivals memoises on the client and hands each caller its own copy', () => {
    const src = readFileSync(resolve(__dirname, '../../rivals.ts'), 'utf8')
    expect(src).toMatch(/memoRead\(client, `rivals:tracked:\$\{clientId\}`/)
    expect(src).toMatch(/return rows\.map\(\(r\) => \(\{ \.\.\.r \}\)\)/)
  })
})
