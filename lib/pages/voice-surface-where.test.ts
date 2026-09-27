import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { INDUSTRY_AUDIENCE } from '../rivals'
import { ACCOUNT_ROWS, buildWhere, foundByBareName, loadMemory, loadMonthVideos, memoryMonths, type MonthVideo } from './voice-surface-where'

// C6 · Where your market talks (market-first WP3.8). REAL ROWS: every video,
// its dated comments in September, its segment and its searches are staging's
// (zfmxrrugaihxpubunleu, data to 20 Sep), read on 27 Sep for Sealand through
// `loadMonthVideos` and `loadMemory`; video ids are shortened to their first
// eight characters. On the whole month staging reads 469 accounts behind 625
// category videos, 19 of them at 3 or more, 17 listed and 2 set aside.

type Row = [id: string, dated: number, segment: string, keywords: string[]]
const rows = (account: string, platform: string, list: Row[]): (MonthVideo & { segment: string })[] =>
  list.map(([videoId, dated, segment, sourceKeywords]) => ({ videoId, platform, dated, account, sourceKeywords, segment }))

const ONEBAG = rows('r/onebag', 'reddit', [
  ['04ab6388', 22, 'market', ['r/onebag']], ['069659d3', 40, 'market', ['r/onebag']], ['175d5675', 40, 'market', ['r/onebag']],
  ['26727ac7', 28, 'market', ['r/onebag']], ['287030ff', 11, 'market', ['cotopaxi backpack']], ['2e44ff9e', 11, 'market', ['r/onebag']],
  ['2e7427a1', 39, 'market', ['r/onebag']], ['3e3d5e1d', 21, 'market', ['r/onebag']], ['3edc2f05', 12, 'market', ['r/onebag']],
  ['5252da97', 35, 'market', ['r/onebag']], ['5845c170', 40, 'market', ['r/onebag']], ['61030cb2', 40, 'market', ['r/onebag']],
  ['6523e07c', 40, 'market', ['r/onebag']], ['66d0095a', 1, 'market', ['r/onebag']], ['6b7e6334', 1, 'market', ['r/onebag']],
  ['6ed9d9d3', 16, 'market', ['r/onebag']], ['760bb560', 40, 'market', ['r/onebag']], ['8d3e81f6', 24, 'noise', ['cotopaxi']],
  ['b1c43e0e', 33, 'market', ['r/onebag']], ['b8c3a7ad', 7, 'market', ['r/onebag']], ['b91551d6', 40, 'market', ['r/onebag']],
  ['cb631369', 7, 'market', ['r/onebag']], ['cf1f540a', 40, 'market', ['r/onebag']], ['dd280eb4', 40, 'market', ['r/onebag']],
  ['e2618bd2', 10, 'market', ['r/onebag']], ['f73ff339', 3, 'market', ['r/onebag']], ['fbbb2935', 20, 'market', ['r/onebag']],
  ['fe6bcefc', 40, 'market', ['r/onebag']],
])
// Five of its ten September threads were found only by a bare brand name.
const MANYBAGGERS = rows('r/ManyBaggers', 'reddit', [
  ['03b90d49', 13, 'noise', ['topo designs']], ['2dc17b4e', 13, 'noise', ['topo designs']], ['3ea50840', 30, 'noise', ['cotopaxi']],
  ['420d4a86', 7, 'market', ['sailcloth bag']], ['63acbf29', 27, 'noise', ['cotopaxi']], ['910e359e', 14, 'noise', ['topo designs']],
  ['a1e751c2', 2, 'market', ['cotopaxi backpack']], ['b690d58f', 3, 'market', ['cotopaxi backpack']], ['e37dab0b', 16, 'market', ['sailcloth bag']],
  ['f5038936', 3, 'market', ['north face backpack']],
])
// The military-dog channel, found by "sealand gear" (plan §2.4 C6).
const RITLAND = rows('Mike Ritland', 'youtube', [
  ['68c33ca4', 2, 'noise', ['sealand gear', '#sealandgear']], ['809c2951', 5, 'noise', ['sealand gear']], ['9525ebdf', 2, 'noise', ['sealand gear']],
  ['b6ef5aed', 1, 'noise', ['sealand gear', '#sealandgear']], ['cf2cd623', 1, 'noise', ['sealand gear', '#sealandgear']],
  ['dec6ab71', 55, 'noise', ['sealand gear', '#sealandgear']], ['e0c04222', 2, 'noise', ['sealand gear', '#sealandgear']],
  ['efaac430', 5, 'noise', ['sealand gear', '#sealandgear']],
])
const POKER = rows('The Poker Academy', 'youtube', [['026a8c5c', 9, 'noise', ['poler']], ['22208334', 3, 'noise', ['poler']], ['d90223a1', 2, 'noise', ['poler']]])
const REBORN = rows('ReBorn Creations', 'youtube', [
  ['0f4b8ed2', 26, 'maker', ['recycled bag', 'upcycled backpack', 'sustainable backpack']], ['2ff8b3a8', 44, 'maker', ['recycled bag']],
  ['35ce1b36', 7, 'maker', ['recycled bag', 'sustainable fashion', 'upcycled bag']], ['3fa418ef', 22, 'maker', ['upcycled bag', 'upcycled backpack', 'sustainable backpack']],
  ['6c02947c', 12, 'maker', ['upcycled bag']], ['855e2c7c', 15, 'maker', ['upcycled bag', 'recycled bag']], ['b82b4672', 71, 'maker', ['upcycled bag']],
  ['c45d8c7b', 37, 'maker', ['upcycled bag']], ['cde29d28', 83, 'maker', ['upcycled bag', 'recycled bag']],
])
const PACKHACKER = rows('Pack Hacker Reviews', 'youtube', [['46e54a51', 7, 'market', ['travel gear']], ['7e3b372f', 16, 'market', ['travel gear']], ['f068543f', 12, 'noise', ['topo designs']]])
const BARNUS = rows('thecreativebarnus', 'instagram', [['39a54564', 11, 'market', ['handmade bag']]])

const ALL = [...ONEBAG, ...MANYBAGGERS, ...RITLAND, ...POKER, ...REBORN, ...PACKHACKER, ...BARNUS]
const SEGMENTS = new Map(ALL.map((v) => [v.videoId, v.segment]))

// The memory staging holds for four of them: which of each account's videos
// July's and August's category held (September's are this month's own).
const MEMORY = {
  months: ['2026-07-01', '2026-08-01', '2026-09-01'],
  held: new Map([
    ['2026-07-01', new Set<string>()],
    ['2026-08-01', new Set(['c1ac6724', '66d0095a', '4eb2f8ac', '82489987', '83e99401', '5f063ac7', 'f73ff339', 'e1580b84', '6b7e6334',
      '855905a7', '89da5141', 'a1e751c2', 'd19f9c33', 'd2097083', '6ea1ceb9', '912398b1', '30b5e502', '35b85365',
      '6c02947c', '2ff8b3a8', 'cde29d28', 'c45d8c7b', 'b82b4672', '3fa418ef'])],
    ['2026-09-01', new Set(ALL.map((v) => v.videoId))],
  ]),
  accountVideos: new Map([
    ['reddit|r/onebag', new Set([...ONEBAG.map((v) => v.videoId), 'c1ac6724', '4eb2f8ac', '82489987', '83e99401', '5f063ac7', 'e1580b84'])],
    ['reddit|r/ManyBaggers', new Set([...MANYBAGGERS.map((v) => v.videoId), '855905a7', '89da5141', 'd19f9c33', 'd2097083', '6ea1ceb9', '912398b1', '30b5e502', '35b85365'])],
    ['youtube|ReBorn Creations', new Set(REBORN.map((v) => v.videoId))],
    ['youtube|Pack Hacker Reviews', new Set(PACKHACKER.map((v) => v.videoId))],
  ]),
}

const build = (over: Partial<Parameters<typeof buildWhere>[0]> = {}) =>
  buildWhere({ month: '2026-09-01', videos: ALL, segments: SEGMENTS, segmentsState: 'measured', memory: MEMORY, expanded: false, ...over })

describe('buildWhere: a floor', () => {
  it('counts every account and those at 3 videos or more, the set-aside ones included', () => {
    const b = build()
    expect(b.accounts).toBe(7)
    expect(b.atFloor).toBe(6)
    expect(b.comments).toBe(ALL.reduce((n, v) => n + v.dated, 0))
  })

  it('lists them by videos, per month (r/onebag: September’s 28 threads and 701 comments, never August’s added)', () => {
    const b = build()
    expect(b.rows.map((r) => [r.name, r.videos, r.comments])).toEqual([
      ['r/onebag', 28, 701],
      ['r/ManyBaggers', 10, 128],
      ['ReBorn Creations', 9, 317],
      ['Pack Hacker Reviews', 3, 35],
    ])
    expect(b.listed).toBe(4)
  })

  it('never lists an account under 3 videos', () => {
    expect(build().rows.map((r) => r.name)).not.toContain('thecreativebarnus')
  })
})

describe('buildWhere: the noise named, never listed (done-when: the military-dog channel only under set aside)', () => {
  it('sets aside an account more than half of whose videos are off-topic, with how it was found', () => {
    const b = build()
    expect(b.setAside.map((a) => [a.name, a.videos, a.foundBy])).toEqual([
      ['Mike Ritland', 8, 'sealand gear'],
      ['The Poker Academy', 3, 'poler'],
    ])
    expect(b.rows.map((r) => r.name)).not.toContain('Mike Ritland')
    expect(build({ expanded: true }).rows.map((r) => r.name)).not.toContain('Mike Ritland')
  })

  it('keeps an account whose off-topic videos are half, not more (r/ManyBaggers, 5 of 10)', () => {
    expect(build().rows.map((r) => r.name)).toContain('r/ManyBaggers')
  })

  it('marks an account more than half makers’', () => {
    const b = build()
    expect(b.rows.filter((r) => r.maker).map((r) => r.name)).toEqual(['ReBorn Creations'])
  })

  it('sets nothing aside and marks nothing where there is no rule or the segments were not read', () => {
    for (const segmentsState of ['no_rule', 'unknown'] as const) {
      const b = build({ segments: null, segmentsState })
      expect(b.setAside).toEqual([])
      expect(b.rows.some((r) => r.maker)).toBe(false)
      expect(b.rows.map((r) => r.name)).toContain('Mike Ritland')
    }
  })
})

describe('buildWhere: a memory', () => {
  it('says in how many of the months read each account was seen', () => {
    const seen = Object.fromEntries(build().rows.map((r) => [r.name, r.seen]))
    expect(seen).toEqual({
      'r/onebag': { n: 2, of: 3 },
      'r/ManyBaggers': { n: 2, of: 3 },
      'ReBorn Creations': { n: 2, of: 3 },
      'Pack Hacker Reviews': { n: 1, of: 3 },
    })
  })

  it('prints no memory where it was not read', () => {
    expect(build({ memory: null }).rows.every((r) => r.seen === null)).toBe(true)
    expect(build({ memory: null }).memory).toBeNull()
  })
})

describe('buildWhere: the largest', () => {
  it('is the first row, with its comments in the month', () => {
    expect(build().largest).toEqual({ key: 'reddit|r/onebag', comments: 701 })
  })

  it('is none where nothing is listed', () => {
    expect(build({ videos: BARNUS }).largest).toBeNull()
  })
})

describe('buildWhere: the list’s length', () => {
  it('prints at most the first ten unless expanded', () => {
    // Staging's whole September lists 17 and prints 10 (the loader dump); the
    // rows here are four, so the cap is checked as a bound.
    const b = build()
    expect(b.rows.length).toBeLessThanOrEqual(ACCOUNT_ROWS)
    expect(build({ expanded: true }).rows).toHaveLength(b.listed)
  })
})

describe('memoryMonths', () => {
  it('takes the reading month and the two before it that were read, oldest first', () => {
    expect(memoryMonths('2026-09-01', ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01'])).toEqual(['2026-07-01', '2026-08-01', '2026-09-01'])
    expect(memoryMonths('2026-09-01', ['2026-06-01', '2026-08-01', '2026-09-01'])).toEqual(['2026-08-01', '2026-09-01'])
    expect(memoryMonths('2026-01-01', ['2025-11-01', '2025-12-01', '2026-01-01'])).toEqual(['2025-11-01', '2025-12-01', '2026-01-01'])
  })
})

describe('foundByBareName', () => {
  it('names the bare name every search that found the videos was, the words before their hashtag', () => {
    expect(foundByBareName(RITLAND.map((v) => v.sourceKeywords))).toBe('sealand gear')
    expect(foundByBareName(POKER.map((v) => v.sourceKeywords))).toBe('poler')
  })

  it('names none where any search was another term', () => {
    expect(foundByBareName(MANYBAGGERS.map((v) => v.sourceKeywords))).toBeNull()
    expect(foundByBareName([])).toBeNull()
  })
})

// ---- the reads, on a fake client (no network) --------------------------------

type Call = { kind: 'rpc' | 'from'; name: string; filters: [string, string, unknown][]; order: string | null; range: [number, number] | null }
type Answer = { data: unknown[] | null; error: { message: string } | null }

/** Just enough of supabase-js's builder for these reads: every call is
 *  recorded, and `answer` decides what it returns. */
function fakeClient(answer: (c: Call) => Answer): { client: SupabaseClient; calls: Call[] } {
  const calls: Call[] = []
  const make = (kind: Call['kind'], name: string) => {
    const call: Call = { kind, name, filters: [], order: null, range: null }
    calls.push(call)
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      select: () => b,
      eq: (col: string, v: unknown) => { call.filters.push(['eq', col, v]); return b },
      in: (col: string, v: unknown) => { call.filters.push(['in', col, v]); return b },
      order: (col: string) => { call.order = col; return b },
      range: (from: number, to: number) => { call.range = [from, to]; return Promise.resolve(answer(call)) },
      then: (ok: (a: Answer) => unknown, no: (e: unknown) => unknown) => Promise.resolve(answer(call)).then(ok, no),
    })
    return b
  }
  return { client: { rpc: (name: string) => make('rpc', name), from: (name: string) => make('from', name) } as unknown as SupabaseClient, calls }
}

// Staging's Mike Ritland videos in September (the RITLAND rows above).
const MONTH_ROWS = RITLAND.map((v) => ({ video_id: v.videoId, audience: INDUSTRY_AUDIENCE, platform: 'youtube', dated_comments: v.dated }))
const VIDEO_ROWS = RITLAND.map((v) => ({ id: v.videoId, account_name: 'Mike Ritland', source_keywords: v.sourceKeywords }))

describe('loadMonthVideos', () => {
  it('gives each of the month’s category videos its account and searches', async () => {
    const { client } = fakeClient((c) => ({ data: c.kind === 'rpc' ? (c.range?.[0] === 0 ? MONTH_ROWS : []) : VIDEO_ROWS, error: null }))
    const out = await loadMonthVideos(client, 'sealand', '2026-09-01', false)
    expect(out?.videos.map((v) => [v.account, v.dated])).toEqual(RITLAND.map((v) => ['Mike Ritland', v.dated]))
    expect(out?.segmentsState).toBe('no_rule')
  })

  it('fails the read where a page of accounts failed, rather than print fewer accounts', async () => {
    const { client } = fakeClient((c) => (c.kind === 'rpc'
      ? { data: c.range?.[0] === 0 ? MONTH_ROWS : [], error: null }
      : { data: null, error: { message: 'canceling statement due to statement timeout' } }))
    expect(await loadMonthVideos(client, 'sealand', '2026-09-01', false)).toBeNull()
  })
})

describe('loadMemory', () => {
  const months = ['2026-07-01', '2026-08-01', '2026-09-01']
  const earlier = Promise.resolve(new Map([['2026-07-01', new Set<string>()], ['2026-08-01', new Set<string>()]]))

  it('reads the listed accounts’ videos in pages by id, past PostgREST’s 1,000-row cap', async () => {
    // The fake fills whatever page the reader asks for, then ends: a reader
    // that took one page would stop at the first.
    const { client, calls } = fakeClient((c) => {
      const [from, to] = c.range ?? [0, 0]
      const size = from === 0 ? to - from + 1 : 1
      return { data: Array.from({ length: size }, (_, i) => ({ id: `v${from + i}`, platform: 'reddit', account_name: 'r/onebag' })), error: null }
    })
    const out = await loadMemory(client, 'sealand', '2026-09-01', months, [], [{ platform: 'reddit', name: 'r/onebag' }], earlier)
    const reads = calls.filter((c) => c.name === 'videos')
    expect(reads.map((c) => c.range)).toEqual([[0, 999], [1000, 1999]])
    expect(reads.every((c) => c.order === 'id')).toBe(true)
    expect(out?.accountVideos.get('reddit|r/onebag')?.size).toBe(1001)
  })

  it('is not read where the accounts’ videos could not be read', async () => {
    const { client } = fakeClient(() => ({ data: null, error: { message: 'canceling statement due to statement timeout' } }))
    expect(await loadMemory(client, 'sealand', '2026-09-01', months, [], [{ platform: 'reddit', name: 'r/onebag' }], earlier)).toBeNull()
  })
})
