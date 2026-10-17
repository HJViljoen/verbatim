import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'
import { fixtureContentTop, fixtureMovesTop, fixtureProductsTop, fixtureVoicesTop } from '../pages/v2/home-fixture'
import { UNTITLED_ADVICE } from '../pages/v2/advice-words'
import { marketProductMonth, topProductsOf } from '../pages/v2/products'
import { ossurProductRows, ossurProductsFixture, OSSUR_CATALOGUE, PRODUCTS_FIXTURES } from '../pages/v2/products-fixture'
import { fakeDb } from '../test/fake-db'
import { sealandRead } from '../test/weekly-read-fixture'
import { contentLine, LINE_PAGES, movesLine, productsLine, voicesLine, weeklyReadLines } from './weekly-read-lines'
import { loadWeeklyReadLines } from './weekly-read-lines-load'

// "Across your pages" (depth v2, T11b; Phase 4 fix round): one line per page
// that has something, each that page's Dashboard tile said in a line, frozen
// into the snapshot when it is built. That each line prints exactly what its
// tile prints is checked against the tiles themselves in
// components/pages/v2/home/email-lines.test.tsx.

const SEP = '2026-09-01'

describe('the lines, from the pages\' tops', () => {
  it('one per page that has something, in the board\'s order, each opening its tile\'s panel', () => {
    const lines = weeklyReadLines({
      voices: fixtureVoicesTop(), products: fixtureProductsTop(), content: fixtureContentTop(), moves: fixtureMovesTop('member'),
    })
    expect(lines.map((l) => l.page)).toEqual([...LINE_PAGES])
    expect(lines.map((l) => [l.label, `${l.lead} ${l.name}`, l.figure, l.href])).toEqual([
      ['Voices', 'In the most videos in October so far: Long-time users upgrading', '86 of 318 videos', '/dashboard/voices/groups/long-time-users'],
      ['Your products', 'Named in the most videos: Pro-Flex Pivot', '9 of 318 videos in October so far', '/dashboard/products/g-feet/p-pivot'],
      ['Content', 'Post next: How long a liner lasts, and when it is time to replace one', '48 of 640 videos, 14 Sep to 11 Oct · 35 of 318 in October so far', '/dashboard/content/ideas/i0000001-0000-4000-8000-000000000000'],
      ['Your moves', `Advice waiting: ${fixtureMovesTop().advice!.title}`, lines[3].figure, fixtureMovesTop().advice!.href],
    ])
    expect(lines[3].figure).toMatch(/^\d+ update/)
    expect(lines.map((l) => l.copy)).toEqual([
      { kind: 'subject', slot: 'pass_e_persona' }, { kind: 'plain' }, { kind: 'prose' }, { kind: 'stored', slot: 'pass_d_b_recommendation' },
    ])
  })

  it('drops a line whose page has nothing, has failed, or is not switched on', () => {
    expect(weeklyReadLines({})).toEqual([])
    // Voices: no group, or the groups' read failed.
    expect(voicesLine({ ...fixtureVoicesTop(), group: null })).toBeNull()
    expect(voicesLine({ ...fixtureVoicesTop(), groupsState: 'unread' })).toBeNull()
    // Your products: every state with no standout, the switch off among them.
    for (const state of ['not_applied', 'not_on', 'no_catalogue', 'quiet'] as const) expect(productsLine(fixtureProductsTop(state)), state).toBeNull()
    expect(productsLine(fixtureProductsTop('quiet', { note: 'failed' }))).toBeNull()
    // Content: not switched on (a workspace the switch leaves off), none, too old, unread.
    for (const state of ['not_on', 'none', 'stale', 'unread'] as const) expect(contentLine(fixtureContentTop(state)), state).toBeNull()
    // Your moves: nothing waiting.
    expect(movesLine(fixtureMovesTop('no_advice'))).toBeNull()
  })

  it('a post idea from an older week gives no line: the email is about this week', () => {
    expect(fixtureContentTop('older').idea).not.toBeNull()
    expect(contentLine(fixtureContentTop('older'))).toBeNull()
  })

  it('a post idea\'s title goes through the written read\'s scrub: one that claims a direction or types a number drops the line', () => {
    const top = fixtureContentTop()
    const titled = (title: string) => contentLine({ ...top, idea: { ...top.idea!, title } })
    expect(titled('Liner questions are rising fast.')).toBeNull()
    expect(titled('The 3 things to ask.')).toBeNull()
    expect(titled('How long a liner lasts')?.name).toBe('How long a liner lasts')
  })

  it('the ideas\' four weeks beside the month, named by their days; the month alone where those were not read, never the four weeks alone', () => {
    const top = fixtureContentTop()
    expect(contentLine(top)?.figure).toBe('48 of 640 videos, 14 Sep to 11 Oct · 35 of 318 in October so far')
    expect(contentLine(top)?.figure).not.toMatch(/this week/)
    expect(contentLine({ ...top, idea: { ...top.idea!, read: null } })?.figure).toBe('35 of 318 videos in October so far')
    expect(contentLine({ ...top, idea: { ...top.idea!, month: null } })?.figure).toBeNull()
  })

  it('an untitled piece of advice prints the page\'s words, marked as code\'s', () => {
    const top = fixtureMovesTop('member')
    expect(movesLine({ ...top, advice: { ...top.advice!, title: UNTITLED_ADVICE } })).toMatchObject({ name: UNTITLED_ADVICE, copy: { kind: 'plain' } })
  })

  // Decision 3: Voices' and Your products' lines are whole-month readings,
  // so a month that is not the current one carries the tile's label; the
  // week-based Content line keeps the week's own month.
  it('labels a whole-month line\'s month as its tile does, and only where it is not the current one', () => {
    const voices = fixtureVoicesTop({ september: true })
    expect(voicesLine(voices)?.lead).toBe('In the most videos in September, the last full month:')
    expect(voicesLine(fixtureVoicesTop())?.lead).toBe('In the most videos in October so far:')
    expect(voicesLine({ ...voices, monthLabel: undefined })?.lead).toBe('In the most videos in September:')
    expect(productsLine(fixtureProductsTop('ready', { september: true }))?.figure).toBe('9 of 318 videos in September, the last full month')
    expect(productsLine(fixtureProductsTop())?.figure).toBe('9 of 318 videos in October so far')
    expect(contentLine(fixtureContentTop())?.figure).not.toMatch(/last full month/)
    const lines = weeklyReadLines({ voices, products: fixtureProductsTop('ready', { september: true }), content: fixtureContentTop(), moves: fixtureMovesTop('member', { september: true }) })
    expect(lines.filter((l) => /last full month/.test(`${l.lead} ${l.figure ?? ''}`)).map((l) => l.page)).toEqual(['voices', 'products'])
  })

  it('one video is a video', () => {
    const top = fixtureVoicesTop()
    expect(voicesLine({ ...top, videos: null, group: { ...top.group!, videos: 1 } })?.figure).toBe('1 video')
  })
})

describe('Your products\' line ranks on the page\'s own basis (fix 1)', () => {
  it('names what Your products and its tile name, counted over every audience, the client\'s included (`marketProductMonth`)', () => {
    const d = ossurProductsFixture()
    const line = productsLine(topProductsOf(d))!
    const rows = ossurProductRows()
    const named = OSSUR_CATALOGUE.products.map((p) => ({ name: p.name, k: marketProductMonth(rows, SEP, p.id)?.k_named ?? 0 }))
    const most = Math.max(...named.map((p) => p.k))
    expect(line.name).toBe('Iceross Seal-In X')
    expect(named.find((p) => p.name === line.name)!.k).toBe(most)
    // On the fixture's day (13 October) September is the last full month,
    // and the line says so, as the tile does (decision 3).
    expect(line.figure).toBe(`${most} of 839 videos in September, the last full month`)
    // The month's first product, where there is one, as the tile leads.
    const first = productsLine(topProductsOf(d, d.standouts.filter((s) => s.kind === 'first') as never))!
    expect([first.lead, first.name]).toEqual(['Came up for the first time:', 'Navii'])
  })

  it('prints nothing while the page is not switched on (PRODUCT_READINGS_ENABLED), even with a catalogue and its rows', () => {
    expect(productsLine(topProductsOf(PRODUCTS_FIXTURES['not-on']()))).toBeNull()
  })
})

describe('the build\'s reads', () => {
  const admin = (db: ReturnType<typeof fakeDb>) => db.client as SupabaseClient

  it('hands every page\'s top to the lines, and a failed read of them is no lines, never a throw', async () => {
    const tops = vi.fn(async () => ({ voices: fixtureVoicesTop(), products: null, content: fixtureContentTop('not_on'), moves: fixtureMovesTop('member') }))
    const lines = await loadWeeklyReadLines(admin(fakeDb({})), { clientId: 'c1', runId: 'run-1', read: sealandRead() }, tops)
    expect(tops).toHaveBeenCalledWith(expect.anything(), 'c1')
    expect(lines.map((l) => l.page)).toEqual(['voices', 'moves'])
    const broken = vi.fn(async () => { throw new Error('connection reset') })
    expect(await loadWeeklyReadLines(admin(fakeDb({})), { clientId: 'c1', runId: 'run-1', read: sealandRead() }, broken)).toEqual([])
  })

  it('reads through the pages\' own tops: on a database with none of their tables, no lines and nothing throws, for both tenants', async () => {
    for (const clientId of [OSSUR_CLIENT_ID, SEALAND_CLIENT_ID]) {
      const db = fakeDb({})
      expect(await loadWeeklyReadLines(admin(db), { clientId, runId: 'run-1', read: sealandRead() })).toEqual([])
      // Post ideas are on for both tenants (13 Oct): the table is read, and a
      // database without it gives no Content line and throws nothing.
      expect(db.calls.some((c) => c.table === 'post_ideas')).toBe(true)
    }
  })
})
