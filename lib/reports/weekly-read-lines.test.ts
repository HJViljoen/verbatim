import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { fakeDb } from '../test/fake-db'
import { levelOneRead, sealandRead } from '../test/weekly-read-fixture'
import { conversationFigure, movesTop, productsTop, weeklyReadLines, LINE_PAGES } from './weekly-read-lines'
import { loadWeeklyReadLines, readContentTop, readMovesTop, readProductsTop } from './weekly-read-lines-load'

// "Across your pages" (depth v2, T11b): one line per page that has
// something, frozen into the snapshot when it is built.

const SEP = '2026-09-01'

describe('the lines', () => {
  it('one per page that has something, in the board\'s order, each opening its page\'s panel', () => {
    const lines = weeklyReadLines({
      month: SEP,
      read: levelOneRead(),
      voices: { key: 'commuters', name: 'Daily commuters', videos: 41 },
      products: { productId: 'p1', name: 'Kirby backpack', videos: 9 },
      content: { rank: 1, title: 'Which bag fits a carry-on rule', registryId: 't7' },
      moves: { lineageId: 'lin 1', title: 'Publish a colour roadmap', timesMade: 4 },
    })
    expect(lines.map((l) => l.page)).toEqual([...LINE_PAGES])
    expect(lines.map((l) => [l.label, `${l.lead} ${l.name}`, l.figure, l.href])).toEqual([
      ['Voices', 'In the most videos in September: Daily commuters', '41 videos', '/dashboard/voices?group=commuters'],
      ['Your products', 'Named most in September: Kirby backpack', '9 videos', '/dashboard/products?product=p1'],
      ['Content', 'Post next: Which bag fits a carry-on rule', '9 videos this week · 21 in September so far', '/dashboard/content?idea=1'],
      ['Your moves', 'Advice waiting: Publish a colour roadmap', 'raised in 4 updates', '/dashboard/moves?advice=lin%201'],
    ])
    expect(lines.map((l) => l.copy)).toEqual([
      { kind: 'subject', slot: 'pass_e_persona' }, { kind: 'plain' }, { kind: 'prose' }, { kind: 'stored', slot: 'pass_d_b_recommendation' },
    ])
  })
  it('drops a line whose page has nothing: no top, an empty name, no videos', () => {
    expect(weeklyReadLines({ month: SEP, read: null })).toEqual([])
    expect(weeklyReadLines({
      month: SEP, read: null,
      voices: { key: 'g', name: ' ', videos: 3 },
      products: { productId: 'p', name: 'X', videos: 0 },
      content: { rank: 1, title: '', registryId: 't' },
      moves: null,
    })).toEqual([])
  })
  it('advice raised once says nothing about how often; a post idea\'s conversation outside the read has no figure', () => {
    const [moves] = weeklyReadLines({ month: SEP, read: null, moves: { lineageId: 'l', title: 'Do a thing', timesMade: 1 } })
    expect(moves.figure).toBeNull()
    const [content] = weeklyReadLines({ month: SEP, read: sealandRead(), content: { rank: 2, title: 'An idea', registryId: 'nowhere' } })
    expect(content.figure).toBeNull()
    expect(content.href).toBe('/dashboard/content?idea=2')
  })
})

describe('a conversation\'s week beside its month, off the read', () => {
  it('from what was also heard, from what was new, from a finding resting on it alone; else none', () => {
    const read = levelOneRead({ newThisWeek: [{ themeId: 'tn', label: 'L', body: 'B', videos: { week: 3, month: 4 }, evidence: '' }] })
    expect(conversationFigure(read, 't7')).toBe('9 videos this week · 21 in September so far')
    expect(conversationFigure(read, 'tn')).toBe('3 videos this week · 4 in September so far')
    expect(conversationFigure(read, 't1')).toBe('7 videos this week · 16 in September so far')
    // The third finding rests on two conversations: neither is it alone.
    expect(conversationFigure(read, 't4')).toBeNull()
    expect(conversationFigure(null, 't7')).toBeNull()
  })
  it('a week that carried into the next month is restated against the month in full', () => {
    const read = levelOneRead({ monthComplete: true })
    expect(conversationFigure(read, 't7')).toBe('9 videos this week · 21 in September')
  })
  it('one video is a video', () => {
    const read = levelOneRead({ alsoHeard: [{ themeId: 'one', label: 'One', videos: 1, videoIds: [], monthVideos: 1 }] })
    expect(conversationFigure(read, 'one')).toBe('1 video this week · 1 in September so far')
  })
})

describe('the tops, from what the build read', () => {
  it('products: named most across the market\'s audiences this month, never the client\'s own posts; ties by name', () => {
    const rows = [
      { month: SEP, audience: 'industry-other', object_kind: 'product', product_id: 'a', k_named: 4 },
      { month: SEP, audience: 'competitor:Osprey', object_kind: 'product', product_id: 'a', k_named: 2 },
      { month: SEP, audience: 'client', object_kind: 'product', product_id: 'b', k_named: 50 },
      { month: SEP, audience: 'industry-other', object_kind: 'product', product_id: 'b', k_named: 6 },
      { month: SEP, audience: 'industry-other', object_kind: 'group', product_id: null, k_named: 90 },
      { month: '2026-08-01', audience: 'industry-other', object_kind: 'product', product_id: 'c', k_named: 99 },
    ]
    const names = new Map([['a', 'Alpha'], ['b', 'Beta'], ['c', 'Gamma']])
    expect(productsTop({ month: SEP, rows, names, clientAudience: 'client' })).toEqual({ productId: 'a', name: 'Alpha', videos: 6 })
    expect(productsTop({ month: SEP, rows: [], names, clientAudience: 'client' })).toBeNull()
    // A product the catalogue no longer names is not printed.
    expect(productsTop({ month: SEP, rows, names: new Map([['b', 'Beta']]), clientAudience: 'client' })).toEqual({ productId: 'b', name: 'Beta', videos: 6 })
  })
  it('moves: the first undecided advice in the short list\'s order', () => {
    const rows = [
      { lineageId: 'x', title: 'Done already', status: 'acted_on', timesMade: 3 },
      { lineageId: 'y', title: 'Waiting', status: 'new', timesMade: 2 },
      { lineageId: 'z', title: 'Also waiting', status: 'new', timesMade: 5 },
    ]
    expect(movesTop(rows, ['x', 'y', 'z'])).toEqual({ lineageId: 'y', title: 'Waiting', timesMade: 2 })
    expect(movesTop(rows, ['x'])).toBeNull()
  })
})

describe('the build\'s reads survive what is not there yet', () => {
  const admin = (db: ReturnType<typeof fakeDb>) => db.client as SupabaseClient

  it('no post_ideas, no products migration, no advice: no lines, and nothing throws', async () => {
    const db = fakeDb({})
    expect(await loadWeeklyReadLines(admin(db), { clientId: 'c1', runId: 'run-1', read: sealandRead() })).toEqual([])
    expect(await readContentTop(admin(db), 'c1', 'run-1')).toBeNull()
    expect(await readProductsTop(admin(db), 'c1', SEP)).toBeNull()
  })

  it('content: the run\'s first idea, its title through the written read\'s scrub', async () => {
    const idea = (rank: number, title: string) => ({
      id: `i${rank}`, client_id: 'c1', run_id: 'run-1', window_start: 'a', window_end: 'b', rank, registry_id: `t${rank}`, title,
      cover: { text: 'c' }, subquestions: [], format: null, format_multiple: null, opening: null, opening_multiple: null,
      model: 'm', prompt_version: 'p', created_at: 'x',
    })
    const db = fakeDb({ post_ideas: [idea(2, 'Second'), idea(1, 'How long a liner lasts, and when it is time')] })
    expect(await readContentTop(admin(db), 'c1', 'run-1')).toEqual({ rank: 1, title: 'How long a liner lasts, and when it is time', registryId: 't1' })
    // A title that claims a direction, or types a number, is dropped whole.
    const loud = fakeDb({ post_ideas: [idea(1, 'Liner questions are rising fast.')] })
    expect(await readContentTop(admin(loud), 'c1', 'run-1')).toBeNull()
    const digit = fakeDb({ post_ideas: [idea(1, 'The 3 things to ask.')] })
    expect(await readContentTop(admin(digit), 'c1', 'run-1')).toBeNull()
  })

  it('moves: the advice ledger read as Your moves reads it; rec_decisions absent is no decisions', async () => {
    const db = fakeDb({
      recommendations: [
        { id: 'r1', client_id: 'c1', lineage_id: 'l1', title: 'Older idea', type: 'content', status: 'new', priority: 'low', created_at: '2026-09-01T00:00:00Z', run_id: 'run-0' },
        { id: 'r2', client_id: 'c1', lineage_id: 'l2', title: 'Set up a reimbursement help desk', type: 'product', status: 'new', priority: 'high', created_at: '2026-10-04T00:00:00Z', run_id: 'run-1' },
        { id: 'r3', client_id: 'c1', lineage_id: 'l2', title: 'Set up a reimbursement help desk', type: 'product', status: 'new', priority: 'high', created_at: '2026-09-27T00:00:00Z', run_id: 'run-9' },
      ],
    })
    expect(await readMovesTop(admin(db), 'c1')).toEqual({ lineageId: 'l2', title: 'Set up a reimbursement help desk', timesMade: 2 })
  })

  it('products: a ready catalogue and its month\'s rows', async () => {
    const catalogue = { version: 'pc1_0123456789abcdef', groups: [{ id: 'g1', name: 'Liners', sort: 1 }], products: [{ id: 'p1', group_id: 'g1', name: 'Iceross Seal-In', sort: 1 }], aliases: [] }
    const rows = [{ client_id: 'c1', month: SEP, audience: 'industry-other', object_kind: 'product', object_id: 'p1', group_id: 'g1', product_id: 'p1', k_named: 7 }]
    const db = fakeDb({ month_product_readings: rows })
    const client = { from: (t: string) => (db.client as SupabaseClient).from(t), rpc: async () => ({ data: catalogue, error: null }) } as unknown as SupabaseClient
    expect(await readProductsTop(client, 'c1', SEP)).toEqual({ productId: 'p1', name: 'Iceross Seal-In', videos: 7 })
  })
})
