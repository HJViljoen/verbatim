import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { OSSUR_CLIENT_ID } from '../../config'
import { placementMembers } from '../subject-place'
import type { DatedEvidence } from '../../written/evidence'
import { subjectReadOf } from '../../written/published'
import type { WeekReadData } from '../../written/types'
import {
  buildSubjectPanel, insideConvsOf, insightThemes, loadSubjectDetail, marketParams, personasOf, quotesAcrossConversations, subjectDetailOf, subjectOwnRead, subjectQuoteOf, subjectReadLines, subjectWeekLevel,
  type MarketConv, type MarketMonth, type SubjectDetail,
} from './market'
import { fixtureFacts, fixtureFactsIn, fixtureRead, fixtureSubjectEvidence, fixtureSubjectId, marketFixture, withSubjectHeadline, withSubjectReads } from './market-fixture'

// A READY SUBJECT'S PANEL (Heinrich, 14 Oct): the conversation panel's blocks
// over the subject's own videos, by the conversation panel's rules, read only
// when its panel is open, and only for a subject whose check passed (U6).

const OCT = '2026-10-01'
const WEEK = { from: '2026-10-05T00:00:00.000Z', to: '2026-10-12T00:00:00.000Z' }
const MONTH: Pick<MarketMonth, 'month' | 'text'> = { month: OCT, text: 'October so far' }

const ev = (o: { i: number; insight?: string; day: number; platform?: string; audience?: string; text?: string; redacted?: boolean; kind?: string; lane?: string }): DatedEvidence => ({
  insightId: o.insight ?? 'm1',
  kind: o.kind ?? 'pain_point',
  description: 'd',
  evidenceId: `e${o.i}`,
  rank: 1,
  commentId: `c${o.i}`,
  commentDate: `2026-10-${String(o.day).padStart(2, '0')}T10:00:00.000Z`,
  author: `a${o.i}`,
  text: o.redacted ? '' : o.text ?? 'Too short.',
  ...(o.redacted ? { redacted: true } : {}),
  video: { uuid: `v${o.i}`, platform: o.platform ?? 'tiktok', videoId: `n${o.i}`, audience: o.audience ?? 'industry-other', lane: o.lane ?? 'full', accountName: `acct${o.i}` },
  context: { platform: o.platform ?? 'tiktok', videoId: `n${o.i}`, caption: 'c', hashtags: [], topics: [], accountName: `acct${o.i}`, isClient: o.audience === 'client', isCompetitor: (o.audience ?? '').startsWith('competitor:'), competitorName: null, source: 'discovered', segment: 'market' },
})

const base = {
  subjectId: 's1', name: 'Cost & access', members: new Set(['m1', 'm2', 'm3']), market: new Set(['industry-other', 'competitor:Ottobock']),
  period: 'week' as const, week: WEEK, month: MONTH, personas: [], namings: [], brands: 'counted' as const,
  company: 'Össur', noun: null, gate: { claim: 'Cost & access. insurance, medical aid, funding, paperwork', requireRelevance: true },
}

describe('subjectDetailOf: the subject\'s videos, by the conversation panel\'s rules', () => {
  it('counts only its members\' citations on the market\'s videos: never the client\'s own posts, never another subject\'s insight', () => {
    const d = subjectDetailOf({
      ...base, period: 'month', week: null,
      evidence: [ev({ i: 1, day: 2 }), ev({ i: 2, day: 3, audience: 'client' }), ev({ i: 3, day: 4, insight: 'other' }), ev({ i: 4, day: 6, audience: 'competitor:Ottobock' })],
    })
    expect(d.basis).toBe('month')
    expect(d.cited).toEqual({ month: 2, week: null })
    expect(d.platforms).toMatchObject({ n: 2, month: null })
    expect(d.doing).toMatchObject({ n: 2, text: 'in October so far' })
  })

  it('this week: the week\'s videos, each block\'s month beside it; what people did is the month\'s', () => {
    const d = subjectDetailOf({
      ...base,
      evidence: [
        ev({ i: 1, day: 2, platform: 'instagram' }), ev({ i: 2, day: 6 }), ev({ i: 3, day: 7, kind: 'question' }),
        // A comment dated before the week, on a video the week also holds, counts in the month once.
        { ...ev({ i: 4, day: 3 }), video: { ...ev({ i: 2, day: 6 }).video } },
      ],
    })
    expect(d.basis).toBe('week')
    // The week's videos a comment dates: the blocks' base, never the tile's
    // (the week's share reads the level's base, `subjectWeekLevel`).
    expect(d.cited).toEqual({ month: 3, week: 2 })
    expect(d).not.toHaveProperty('week')
    expect(d.platforms).toMatchObject({ n: 2, rows: [{ platform: 'tiktok', videos: 2 }], month: { counts: { tiktok: 2, instagram: 1 }, n: 3, text: 'October so far' } })
    expect(d.who).toMatchObject({ n: 2, month: { n: 3 } })
    expect(d.doing).toEqual({ rows: [{ kind: 'pain_point', label: 'Complained about something', k: 2, n: 3 }, { kind: 'question', label: 'Asked a question', k: 1, n: 3 }], n: 3, text: 'in October so far' })
  })

  it('files a video by its audience, unless the subject\'s own counted comments name a tracked brand', () => {
    const d = subjectDetailOf({
      ...base, period: 'month', week: null,
      evidence: [ev({ i: 1, day: 2 }), ev({ i: 2, day: 3, audience: 'competitor:Ottobock' }), ev({ i: 3, day: 4 }), ev({ i: 4, day: 5 })],
      namings: [
        { comment_id: 'c1', video_id: 'v1', name: 'Össur' },
        // Named in a comment the subject does not rest on: files nothing.
        { comment_id: 'c99', video_id: 'v3', name: 'Ottobock' },
      ],
    })
    expect(d.who?.parts).toEqual([{ about: 'client', videos: 1 }, { about: 'rival:Ottobock', videos: 1 }, { about: 'market', videos: 2 }])
  })

  it('a demographic citation counts a video and never quotes', () => {
    const d = subjectDetailOf({ ...base, period: 'month', week: null, evidence: [ev({ i: 1, day: 2, redacted: true, text: 'My insurance refused it again' })] })
    expect(d.platforms?.n).toBe(1)
    expect(d.quotes).toEqual([])
  })

  it('who\'s saying it: the group × subject cross over its month\'s talk, the most videos first, each with its videos (17 Oct: the subject page prints "k of n")', () => {
    const d = subjectDetailOf({
      ...base, period: 'month', week: null,
      evidence: [ev({ i: 1, day: 2, insight: 'm1' }), ev({ i: 2, day: 3, insight: 'm2' }), ev({ i: 3, day: 4, insight: 'm2' })],
      personas: [
        { key: 'a', name: 'Alpha', insightIds: ['m1'] },
        { key: 'b', name: 'Beta', insightIds: ['m2', 'zz'] },
        { key: 'c', name: 'Gamma', insightIds: ['zz'] },
        { key: 'd', name: 'Delta' },
      ],
    })
    expect(d.groups).toEqual([
      { key: 'b', name: 'Beta', href: '/dashboard/voices?group=b#group-panel', videos: 2 },
      { key: 'a', name: 'Alpha', href: '/dashboard/voices?group=a#group-panel', videos: 1 },
    ])
  })

  it('three quotes through the strict subject gate: this week first, the category\'s before a brand\'s, one a video, never the read lane\'s outside', () => {
    const say = (s: string) => `${s} and the insurance paperwork goes on for months.`
    const d = subjectDetailOf({
      ...base,
      evidence: [
        ev({ i: 1, day: 2, text: say('Month, the category') }),
        ev({ i: 2, day: 6, text: say('Week, a brand'), audience: 'competitor:Ottobock' }),
        ev({ i: 3, day: 7, text: say('Week, the category') }),
        ev({ i: 4, day: 8, text: say('Week, not the read lane'), lane: 'light' }),
        ev({ i: 5, day: 9, text: 'Love this so much, what a video' }),
      ],
    })
    expect(d.quotes.map((q) => q.text)).toEqual([say('Week, the category'), say('Week, a brand'), say('Month, the category')])
    expect(d.quotes[1]).toMatchObject({ about: 'rival:Ottobock', source: 'TikTok · 6 Oct' })
    expect(subjectQuoteOf(ev({ i: 9, day: 9, platform: 'youtube' }))).toMatchObject({ source: 'YouTube · 9 Oct', about: null })
  })

  it('this week with none of its videos and some in the month: who and where keep their frame, the month beside; one base named', () => {
    const d = subjectDetailOf({ ...base, evidence: [ev({ i: 1, day: 2, platform: 'instagram' }), ev({ i: 2, day: 3 })] })
    expect(d.cited).toEqual({ month: 2, week: 0 })
    expect(d.who).toMatchObject({ parts: [], n: 0, month: { n: 2 } })
    expect(d.platforms).toMatchObject({ rows: [], n: 0, month: { counts: { instagram: 1, tiktok: 1 }, n: 2 } })
  })

  it('a subject with nothing in the period has no block to print', () => {
    const d = subjectDetailOf({ ...base, evidence: [] })
    expect(d).toMatchObject({ who: null, doing: null, groups: [], platforms: null, quotes: [], cited: { month: 0, week: 0 } })
  })
})

describe('subjectWeekLevel: the week\'s share on the level\'s base (17 Oct)', () => {
  const rivals = ['competitor:Ottobock']
  const denominators = [
    { audience: 'industry-other', videos: 226, comments: 3700 },
    { audience: 'competitor:Ottobock', videos: 15, comments: 212 },
    { audience: 'client', videos: 9, comments: 64 },
    // A rival no longer tracked is not the market.
    { audience: 'competitor:Gone', videos: 30, comments: 90 },
  ]
  const row = (audience: string, subject_id: string, videos: number) => ({ audience, subject_id, videos })

  it('pools the subject\'s window rows and the window\'s market over the market\'s audiences, as the month\'s level pools', () => {
    const rows = [row('industry-other', 's1', 76), row('competitor:Ottobock', 's1', 6), row('client', 's1', 3), row('competitor:Gone', 's1', 5), row('industry-other', 's2', 40)]
    expect(subjectWeekLevel({ subjectId: 's1', rows, denominators, rivalAudiences: rivals })).toEqual({ k: 82, n: 241 })
  })

  it('a subject with no row among the others\' had no video in the week', () => {
    expect(subjectWeekLevel({ subjectId: 's3', rows: [row('industry-other', 's1', 76)], denominators, rivalAudiences: rivals })).toEqual({ k: 0, n: 241 })
  })

  it('unread where the read failed, answered no row, or the window\'s market is not there', () => {
    expect(subjectWeekLevel({ subjectId: 's1', rows: null, denominators, rivalAudiences: rivals })).toBe('unread')
    expect(subjectWeekLevel({ subjectId: 's1', rows: [], denominators, rivalAudiences: rivals })).toBe('unread')
    expect(subjectWeekLevel({ subjectId: 's1', rows: [row('industry-other', 's1', 4)], denominators: null, rivalAudiences: rivals })).toBe('unread')
    expect(subjectWeekLevel({ subjectId: 's1', rows: [row('industry-other', 's1', 4)], denominators: [], rivalAudiences: rivals })).toBe('unread')
  })
})

describe('buildSubjectPanel: the read and the blocks, for a READY subject alone (U6)', () => {
  const p = marketParams({ subject: fixtureSubjectId('cost') })
  const month = marketFixture().month
  const detail = { basis: 'month', who: null, brands: 'counted', doing: null, groups: [], platforms: null, quotes: [] } as SubjectDetail

  it('a ready subject: its own read where the published read holds one of this month, and its blocks', () => {
    const panel = buildSubjectPanel({ id: fixtureSubjectId('cost'), facts: fixtureFacts(), convs: [], period: 'month', p, read: withSubjectReads(fixtureRead()), month, detail, readsOn: true })
    expect(panel?.state).toBe('ready')
    expect(panel?.read?.thin).toBe(false)
    expect(panel?.read?.lines.map((l) => l.body)).toHaveLength(2)
    expect(panel?.read?.means?.body).toContain('the kind of knee Össur sells')
    expect(panel?.detail).toBe(detail)
    // The week read's sentence is kept: it stands in where there is no read.
    expect(panel?.sentence?.body).toContain('paid for')
  })

  it('no read of its own, or one of another month: none (the sentence stands in)', () => {
    expect(buildSubjectPanel({ id: fixtureSubjectId('cost'), facts: fixtureFacts(), convs: [], period: 'month', p, read: fixtureRead(), month })?.read).toBeNull()
    const sep = { ...withSubjectReads(fixtureRead()) } as WeekReadData & { subjectReads: { month: string } }
    sep.subjectReads = { ...sep.subjectReads, month: '2026-09-01' }
    expect(buildSubjectPanel({ id: fixtureSubjectId('cost'), facts: fixtureFacts(), convs: [], period: 'month', p, read: sep, month, readsOn: true })?.read).toBeNull()
  })

  it('a tenant whose subject reads are switched off prints no stored read: the sentence alone (the post ideas\' rule)', () => {
    for (const readsOn of [false, undefined]) {
      const panel = buildSubjectPanel({ id: fixtureSubjectId('cost'), facts: fixtureFacts(), convs: [], period: 'month', p, read: withSubjectReads(fixtureRead()), month, detail, readsOn })
      expect(panel).toMatchObject({ state: 'ready', read: null, detail })
      expect(panel?.sentence?.body).toContain('paid for')
    }
  })

  it('a ready subject the month has no reading for yet: its read, by its card\'s rule, and no figure and no blocks (17 Oct)', () => {
    const panel = buildSubjectPanel({ id: fixtureSubjectId('cost'), facts: fixtureFactsIn('unread'), convs: [], period: 'month', p, read: withSubjectReads(fixtureRead()), month, detail, readsOn: true })
    expect(panel).toMatchObject({ state: 'unread', level: null, verdict: null, bars: [], detail: null })
    expect(panel?.read).toEqual(subjectReadLines(subjectOwnRead({ id: fixtureSubjectId('cost'), state: 'unread', read: withSubjectReads(fixtureRead()), month: OCT, readsOn: true })))
    expect(panel?.read?.means?.body).toContain('the kind of knee Össur sells')
    // Off for the tenant, none, as for a subject with a level.
    expect(buildSubjectPanel({ id: fixtureSubjectId('cost'), facts: fixtureFactsIn('unread'), convs: [], period: 'month', p, read: withSubjectReads(fixtureRead()), month, readsOn: false })?.read).toBeNull()
  })

  it('subjectOwnRead: every subject whose check passed, a level or not; never one open or failed, never with the reads off', () => {
    const read = withSubjectReads(fixtureRead())
    const own = (state: 'ready' | 'unread' | 'provisional' | 'failed', readsOn = true) => subjectOwnRead({ id: fixtureSubjectId('cost'), state, read, month: OCT, readsOn })
    expect(own('ready')).toBe(subjectReadOf(read, fixtureSubjectId('cost'), OCT))
    expect(own('unread')).toBe(subjectReadOf(read, fixtureSubjectId('cost'), OCT))
    expect([own('provisional'), own('failed'), own('ready', false), own('unread', false)]).toEqual([null, null, null, null])
  })

  it('open or failed: neither the read nor the blocks, whatever was read', () => {
    for (const [facts, id] of [[fixtureFactsIn('provisional'), 'cost'], [fixtureFactsIn('tracked'), 'community'], [fixtureFacts(), 'sport']] as const) {
      const panel = buildSubjectPanel({ id: fixtureSubjectId(id), facts, convs: [], period: 'month', p, read: withSubjectReads(fixtureRead()), month, detail, readsOn: true })
      expect(panel?.state).not.toBe('ready')
      expect(panel).toMatchObject({ read: null, detail: null })
    }
  })

  it('subjectReadLines: what people said, then what it means; a thin read is its one line', () => {
    const read = withSubjectReads(fixtureRead())
    const cost = subjectReadLines(subjectReadOf(read, fixtureSubjectId('cost'), OCT))
    expect(cost?.lines.map((l) => l.body.slice(0, 20))).toEqual(['People describe insu', 'Paying out of pocket'])
    expect(cost?.means?.body.slice(0, 20)).toBe('The refusals people ')
    expect(subjectReadLines(subjectReadOf(read, fixtureSubjectId('look'), OCT))).toMatchObject({ thin: true, means: null, lines: [{ body: expect.stringContaining('sat in') }] })
    expect(subjectReadLines(null)).toBeNull()
    // A read stored before v3 has no headline, and its lines carry none.
    expect(cost && 'headline' in cost).toBe(false)
  })

  it('subjectReadLines carries a v3 read\'s headline for the subject card, and leaves the rest as it was', () => {
    const read = withSubjectReads(fixtureRead())
    const before = subjectReadLines(subjectReadOf(read, fixtureSubjectId('cost'), OCT))
    const v3 = withSubjectHeadline(read, 'The appeal decides when a knee is fitted')
    const after = subjectReadLines(subjectReadOf(v3, fixtureSubjectId('cost'), OCT))
    expect(after).toEqual({ ...before, headline: { body: 'The appeal decides when a knee is fitted', figures: {} } })
    // A blank headline is none.
    expect(subjectReadLines(subjectReadOf(withSubjectHeadline(read, '  '), fixtureSubjectId('cost'), OCT))).toEqual(before)
  })
})

describe('the panel\'s readers', () => {
  it('personasOf keeps a persona\'s insights where the profile holds them', () => {
    expect(personasOf([{ key: 'k', name: 'A', registryIds: ['t1'], insightIds: ['i1', 'i1', 3] }, { name: 'B' }])).toEqual([
      { key: 'k', name: 'A', registryIds: ['t1'], insightIds: ['i1'] },
      { key: 'B', name: 'B', registryIds: [] },
    ])
  })

  it('placementMembers: every subject\'s members, every tier, off the one membership read', () => {
    const placed = {
      names: new Map([['r', 'R'], ['o', 'O'], ['f', 'F']]),
      order: ['r'], subjectsOf: new Map([['i1', ['r']], ['i2', ['r']]]),
      pending: { order: ['o'], subjectsOf: new Map([['i2', ['o']]]) },
      failed: { order: ['f'], subjectsOf: new Map() },
    }
    const m = placementMembers(placed)
    expect([...m.get('r')!]).toEqual(['i1', 'i2'])
    expect([...m.get('o')!]).toEqual(['i2'])
    expect(m.get('f')!.size).toBe(0)
    expect(placementMembers(null).size).toBe(0)
  })
})

// THE STATEMENTS THE OPEN PANEL ADDS (14 Oct), counted on a stand-in that
// answers every table: the members come off the placement and the profile,
// the read off the published read, all three already read by the page. What
// the panel adds is the evidence (a statement per 250 members, each with its
// insight, video and comment embedded), the translations (a probe and one per
// 150 texts), the quote gate's video context (one per 60 videos and the
// segments call) and the brands its comments name (one per 250 comments).
function countingDb(tables: Record<string, Record<string, unknown>[]>, rpcs: Record<string, unknown[]> = {}) {
  const calls: string[] = []
  const query = (table: string) => {
    calls.push(table)
    const filters: [string, Set<unknown>][] = []
    let from = 0
    let to = Number.POSITIVE_INFINITY
    const run = () => {
      const rows = (tables[table] ?? []).filter((r) => filters.every(([c, vs]) => vs.has(r[c])))
      return { data: rows.slice(from, Number.isFinite(to) ? to + 1 : undefined), error: null }
    }
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'neq', 'not', 'gte', 'lt', 'lte', 'order', 'is']) b[m] = () => b
    b.in = (col: string, vs: unknown[]) => { if (!col.includes('.')) filters.push([col, new Set(vs)]); return b }
    b.limit = (n: number) => { to = n - 1; return b }
    b.range = (a: number, z: number) => { from = a; to = z; return Promise.resolve(run()) }
    b.maybeSingle = () => Promise.resolve({ data: run().data[0] ?? null, error: null })
    b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad)
    return b
  }
  return { client: { from: query, rpc: async (fn: string) => { calls.push(fn); return { data: rpcs[fn] ?? [], error: null } } }, calls }
}

describe('loadSubjectDetail: what an open subject panel reads', () => {
  it('on a subject of 1,200 members with 400 citations on 150 videos in the month: 15 statements', async () => {
    const members = Array.from({ length: 1200 }, (_, i) => `m${i}`)
    const insights = Array.from({ length: 300 }, (_, i) => {
      const v = i % 150
      return {
        id: members[i],
        category: i % 3 ? 'pain_point' : 'question', description: 'd', theme: 't',
        videos: { id: `v${v}`, platform: 'tiktok', video_id: `n${v}`, analyzed_lane: 'full', is_client: false, is_competitor: false, competitor_name: null, account_name: `acct${v}` },
        insight_evidence: Array.from({ length: i < 100 ? 2 : 1 }, (_, k) => ({
          id: `e${i}-${k}`, quote: `About the insurance and the cost of a knee, number ${i} ${k}`, relevance_rank: 1, comment_id: `c${i}-${k}`, redacted: false,
          comments: { id: `c${i}-${k}`, comment_date: '2026-10-03T10:00:00.000Z', platform: 'tiktok', video_id: `n${v}`, author: `a${i}` },
        })),
      }
    })
    const db = countingDb({
      audience_insights: insights,
      comment_translations: [],
      videos: Array.from({ length: 150 }, (_, v) => ({ id: `v${v}`, platform: 'tiktok', video_id: `n${v}`, account_name: `acct${v}`, caption: '', hashtags: [], topics: [], is_client: false, is_competitor: false, competitor_name: null, source: 'discovered' })),
      brand_mentions: [{ video_id: 'v1', brand_key: 'client', comment_id: 'c1-0', comment_month: OCT, method: 'rule', rule_version: 'brands_v1' }],
    })
    const month = marketFixture({ period: 'month' }).month
    const detail = await loadSubjectDetail({
      db: db.client as unknown as SupabaseClient, clientId: OSSUR_CLIENT_ID, subject: { id: 's1', name: 'Cost & access', description: 'insurance, cost, funding' },
      members: new Set(members), period: 'month', week: null, month, market: ['industry-other'], personas: [], company: 'Össur', rivals: [], noun: null,
    })
    expect(detail.platforms?.n).toBe(150)
    const by = (t: string) => db.calls.filter((c) => c === t).length
    expect(by('audience_insights')).toBe(5)
    expect(by('comment_translations')).toBe(1 + 3)
    expect(by('videos')).toBe(3)
    expect(by('segments_for_videos')).toBe(1)
    // The brands its 400 comments name (Össur has brand rules): one a 250.
    expect(by('brand_mentions')).toBe(2)
    expect(db.calls).toHaveLength(15)
  })

  it('reads nothing for a subject with no member', async () => {
    const db = countingDb({})
    const month = marketFixture({ period: 'month' }).month
    const detail = await loadSubjectDetail({
      db: db.client as unknown as SupabaseClient, clientId: 'c', subject: { id: 's1', name: 'S', description: null },
      members: new Set(), period: 'month', week: null, month, market: ['industry-other'], personas: [], company: 'Össur', rivals: [], noun: null,
    })
    expect(detail.platforms).toBeNull()
    expect(db.calls.filter((c) => c !== 'brand_mentions')).toEqual([])
  })
})

describe('the fixture\'s subject evidence', () => {
  it('rich: 64 videos in October, 40 in the week, one demographic citation, and the weeks before October\'s', () => {
    const { evidence } = fixtureSubjectEvidence('rich')
    const october = evidence.filter((e) => e.commentDate.startsWith('2026-10'))
    expect(new Set(october.map((e) => e.video.uuid)).size).toBe(64)
    expect(evidence.filter((e) => e.commentDate.startsWith('2026-09')).length).toBeGreaterThan(0)
    expect(evidence.filter((e) => e.redacted)).toHaveLength(1)
    expect(fixtureSubjectEvidence('thin').evidence).toHaveLength(1)
  })
})

// THE SUBJECT AS THE HUB (F3-Market-Subject, 17 Oct): every conversation
// inside it with its own description and the week's chip, and three comments
// each from a different conversation, each labelled with it.
describe('the hub\'s parts', () => {
  const conv = (id: string, subjectId: string | null, week: number): MarketConv => ({
    id, label: `Conv ${id}`, kind: 'question', subjectId, subjectName: subjectId ? 'Fit' : null, week, weeks: [1, 2, week], month: week + 5,
    months: [], who: [], mix: null, isNew: false, monthVerdict: null, setApart: null,
  })

  it('insideConvsOf: every conversation placed in it, in the given order, each with its description and the chip only where flagged', () => {
    const convs = [conv('a', 's1', 9), conv('b', 's2', 8), conv('c', 's1', 4)]
    const flag = { id: 'c', verdict: { state: 'moved' } as never }
    const inside = insideConvsOf({ subjectId: 's1', convs, descriptions: new Map([['a', '  Liners wearing out. ']]), flag, href: (id) => `/c/${id}` })
    expect(inside.map((x) => [x.conv.id, x.href, x.description, x.flag ? 'flag' : null])).toEqual([['a', '/c/a', 'Liners wearing out.', null], ['c', '/c/c', null, 'flag']])
  })

  it('insightThemes: each member insight\'s conversation, the first that names it; an unlabelled theme names none', () => {
    const themes = new Map([
      ['t1', { label: 'Liners', kind: null, memberIds: ['i1', 'i2'] }],
      ['t2', { label: 'Sweat', kind: null, memberIds: ['i2', 'i3'] }],
      ['t3', { label: ' ', kind: null, memberIds: ['i4'] }],
    ])
    const of = insightThemes(themes)
    expect([...of.entries()]).toEqual([['i1', { id: 't1', label: 'Liners' }], ['i2', { id: 't1', label: 'Liners' }], ['i3', { id: 't2', label: 'Sweat' }]])
  })

  it('quotesAcrossConversations: the first of each conversation first, then the rest in the gate\'s order', () => {
    const of = new Map([['i1', { id: 't1' }], ['i2', { id: 't1' }], ['i3', { id: 't2' }], ['i4', { id: 't3' }]])
    const q = (insightId: string, n: number) => ({ insightId, n })
    expect(quotesAcrossConversations([q('i1', 1), q('i2', 2), q('i3', 3), q('i4', 4)], of, 3).map((x) => x.n)).toEqual([1, 3, 4])
    // Two conversations only: both first, then the next pick.
    expect(quotesAcrossConversations([q('i1', 1), q('i2', 2), q('i3', 3)], of, 3).map((x) => x.n)).toEqual([1, 3, 2])
    // A quote in no conversation comes only in the second pass.
    expect(quotesAcrossConversations([q('x', 0), q('i1', 1), q('i3', 3)], of, 3).map((x) => x.n)).toEqual([1, 3, 0])
  })

  it('subjectDetailOf labels each quote with its conversation and its page, each from its own where they can be', () => {
    const say = (s: string) => `${s} and the insurance paperwork goes on for months.`
    const d = subjectDetailOf({
      ...base,
      evidence: [
        ev({ i: 1, insight: 'm1', day: 6, text: say('First of one') }),
        ev({ i: 2, insight: 'm1', day: 7, text: say('Second of one') }),
        ev({ i: 3, insight: 'm2', day: 8, text: say('First of two') }),
      ],
      conversations: { themeOf: new Map([['m1', { id: 't1', label: 'Insurance refusals' }], ['m2', { id: 't2', label: 'Medical aid' }]]), href: (id) => `/dashboard/market/conversations/${id}` },
    })
    expect(d.quotes.map((x) => [x.text, x.from?.label ?? null])).toEqual([
      [say('First of one'), 'Insurance refusals'], [say('First of two'), 'Medical aid'], [say('Second of one'), 'Insurance refusals'],
    ])
    expect(d.quotes[1].from).toEqual({ id: 't2', label: 'Medical aid', href: '/dashboard/market/conversations/t2' })
    // Without the conversations, the gate's three as before, unlabelled.
    expect(subjectDetailOf({ ...base, evidence: [ev({ i: 1, insight: 'm1', day: 6, text: say('One') })] }).quotes[0]).not.toHaveProperty('from')
  })
})
