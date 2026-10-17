import { describe, expect, it } from 'vitest'

import { OSSUR_CLIENT_ID } from '../../config'
import type { StandingText } from '../../products/match'
import type { Crosses, TextRead } from './products'
import { PRODUCT_IDS, linersUnclearTexts } from './products-fixture'
import { categoryFixture, PRODUCTS_LEVEL_FIXTURES, productFixture, quietProductFixture, sealVideos, todayCategoryFixture } from './products-level-fixture'
import {
  aboutLine, categoryHeadline, categoryMenu, groupsOf, HUB_CARDS, hubQuotes, keptMonth, namedByVideo, namedVideoOrder, platformsOf, productEvidence, productGroupOf, productLead,
  productMenu, PRODUCT_VIDEO_QUOTES, PRODUCT_VIDEOS_MAX, PRODUCT_VIDEOS_SHOWN, quietWordsOf, shareWord, shownVideos, subjectRowsOf, unclearWhole, type ProductCard,
} from './products-levels'
import { OSSUR_CATALOGUE } from './products-fixture'

// YOUR PRODUCTS' LEVEL PAGES (17 Oct, the G4 boards): the pure half, over
// Össur's fixture catalogue and months. No network.

const cross = (n: number, subjects: [string, number][], kinds: [string, number][] = [], pending: string[] = []): Crosses => ({
  n,
  subjects: subjects.map(([label, k]) => ({ id: label, label, k })),
  kinds: kinds.map(([id, k]) => ({ id, label: id, k })),
  ...(pending.length ? { pending: pending.map((label) => ({ id: label, label })) } : {}),
})

describe('the words, in code\'s own (no model prose)', () => {
  it('the hub\'s headline is the root\'s "Category, not you" rule over the split, no digit and no direction word', () => {
    expect(categoryHeadline('Liners', { any: 52, named: 11, unclear: 11, unbranded: 30 }, 'October so far')).toBe('Liners talk is mostly about liners in general')
    expect(categoryHeadline('Knees', { any: 10, named: 6, unclear: 1, unbranded: 3 }, 'September')).toBe('Most knees talk names one of your products')
    expect(categoryHeadline('Knees', { any: 10, named: 3, unclear: 3, unbranded: 4 }, 'September')).toBe('Most knees talk is about one of your products')
    expect(categoryHeadline('Feet', { any: 10, named: 2, unclear: 3, unbranded: 5 }, 'September')).toBe('Feet talk is split between yours and feet in general')
    expect(categoryHeadline('Feet', { any: 0, named: 0, unclear: 0, unbranded: 0 }, 'October so far')).toBe('Nobody in your market talked about feet in October so far')
  })

  it('a share in words only past half', () => {
    expect([shareWord(6, 6), shareWord(5, 6), shareWord(4, 6), shareWord(3, 6), shareWord(1, 0)]).toEqual(['Every', 'Almost every', 'Most', null, null])
  })

  it('the product\'s line: what most of its videos are about and what most carry in their comments, each only past half', () => {
    const m = { monthWords: 'October so far', monthName: 'October' }
    expect(productLead({ ...m, videos: 6, crosses: cross(6, [['Fit & comfort', 5], ['Cost', 1]], [['praise', 4], ['question', 4]]) }))
      .toBe('Almost every video naming it is about Fit & comfort, and most have praise in their comments.')
    expect(productLead({ ...m, videos: 4, crosses: cross(4, [['Fit', 4]], [['question', 4]]) })).toBe('Every video naming it is about Fit, and every one has questions in its comments.')
    expect(productLead({ ...m, videos: 6, crosses: cross(6, [['Fit', 2]], [['praise', 4]]) })).toBe('Most videos naming it have praise in their comments.')
    expect(productLead({ ...m, videos: 6, crosses: cross(6, [['Fit', 2]], [['praise', 2]]) })).toBe('No one subject or kind of comment stands out in the videos naming it.')
    expect(productLead({ ...m, videos: 0, crosses: null })).toBe('Nobody in your market named it in October so far.')
    expect(productLead({ ...m, videos: null, crosses: null })).toMatch(/^Not read yet for October so far/)
    // U6: a subject not measured yet is never named, and takes nothing from
    // the level words of a ready one.
    const pending = cross(6, [], [['praise', 5]], ['Fit & comfort'])
    expect(productLead({ ...m, videos: 6, crosses: pending })).toBe('Almost every video naming it has praise in its comments.')
    for (const c of [pending, cross(6, [['Fit', 5]], [], ['Cost'])]) expect(productLead({ ...m, videos: 6, crosses: c })).not.toMatch(/\d|leads|more than/)
  })

  it('what a product\'s videos are about: a ready level, a tie, not measured, none, quiet, not read', () => {
    expect(aboutLine(cross(6, [['Fit', 5], ['Cost', 1]]), 6)).toEqual({ kind: 'top', label: 'Fit', k: 5, n: 6, leads: true })
    expect(aboutLine(cross(2, [['Fit', 1], ['Cost', 1]]), 2)).toEqual({ kind: 'tie' })
    // Beside a pending subject: its level, never a lead.
    expect(aboutLine(cross(6, [['Fit', 5]], [], ['Cost']), 6)).toEqual({ kind: 'top', label: 'Fit', k: 5, n: 6, leads: false })
    expect(aboutLine(cross(6, [], [], ['Cost']), 6)).toEqual({ kind: 'pending' })
    expect(aboutLine(cross(6, []), 6)).toEqual({ kind: 'none' })
    expect(aboutLine(null, 0)).toEqual({ kind: 'quiet' })
    expect(aboutLine(null, 3)).toEqual({ kind: 'unread' })
  })

  it('"Quiet so far" in the calendar month, "Quiet in September" in a closed one', () => {
    expect([quietWordsOf('October', true), quietWordsOf('September', false)]).toEqual(['Quiet so far', 'Quiet in September'])
  })
})

describe('the category\'s page, the hub', () => {
  const d = categoryFixture()
  const page = d.category!

  it('its path and its switcher: the categories in the shelf\'s order, a quiet one in words, no figure, the month kept', () => {
    expect(d.crumbs!.map((c) => [c.label, c.href])).toEqual([['Your products', '/dashboard/products'], ['Liners', null]])
    const menu = d.crumbs![1].menu!
    expect(menu.items.map((i) => i.label)).toEqual(['Liners', 'Feet', 'Knees', 'Sockets & Locks', 'Hands', 'Bracing & Supports'])
    expect(menu.items.find((i) => i.current)?.label).toBe('Liners')
    expect(menu.items.every((i) => !/\d/.test(i.note ?? ''))).toBe(true)
    const kept = categoryFixture({ params: { month: '2026-09' } }).crumbs![1].menu!.items[1].href
    expect(kept).toBe(`/dashboard/products/${PRODUCT_IDS.feet()}?month=2026-09`)
    expect(categoryMenu(d.base.shelf.map((c) => ({ ...c, videos: c.name === 'Feet' ? 0 : c.videos })), PRODUCT_IDS.liners(), {}, 'Quiet in September').items[1].note).toBe('Quiet in September')
  })

  it('its month switch keeps the page, at each month', () => {
    expect(d.months.map((m) => `${m.label} ${m.href}`)).toEqual([
      `July /dashboard/products/${PRODUCT_IDS.liners()}?month=2026-07`, `August /dashboard/products/${PRODUCT_IDS.liners()}?month=2026-08`, `September /dashboard/products/${PRODUCT_IDS.liners()}?month=2026-09`,
    ])
  })

  it('the header card: the headline in code\'s words, the share and its verdict, the exclusive split', () => {
    expect(page.headline).toBe('Liners talk is mostly about liners in general')
    expect(page.detail.split).toEqual({ any: 118, named: 19, unclear: 21, unbranded: 78 })
    expect(page.detail.split!.named + page.detail.split!.unclear + page.detail.split!.unbranded).toBe(page.detail.split!.any)
    expect(page.detail.share).toEqual({ k: 118, n: 839 })
    expect(page.detail.verdict?.state).toBe('no_clear_change')
  })

  it('the products that came up as cards (at most three, most videos first), then every product in the shelf\'s order', () => {
    expect(page.cards.map((c) => [c.name, c.videos, c.prev])).toEqual([['Iceross Seal-In X', 10, 6], ['Iceross Comfort', 5, 4], ['Iceross Synergy', 3, 2]])
    expect(page.cards).toHaveLength(HUB_CARDS)
    expect(page.cards[0]).toMatchObject({ kind: { id: 'praise', label: 'Praise in the comments', k: 7, n: 10 }, about: { kind: 'top', label: 'Fit & comfort', k: 8, n: 10, leads: false } })
    expect(page.cards[0].href).toBe(`/dashboard/products/${PRODUCT_IDS.liners()}/${PRODUCT_IDS.sealInX()}`)
    expect(page.list).toHaveLength(OSSUR_CATALOGUE.products.filter((p) => p.group_id === PRODUCT_IDS.liners()).length)
    expect(page.list.slice(0, 4).map((r) => r.videos)).toEqual([10, 5, 3, 1])
    expect(page.list.slice(4).every((r) => r.videos === 0 && r.about.kind === 'quiet')).toBe(true)
  })

  it('the couldn\'t-tell-which list: three lines, the rest one click longer on the same page, Tag for an owner', () => {
    const u = page.detail.unclear
    expect(u).toMatchObject({ videos: 21, more: 3, withheld: 1, closed: false, allComments: false })
    expect(u.lines).toHaveLength(3)
    expect(u.allHref).toBe(`/dashboard/products/${PRODUCT_IDS.liners()}?unclear=all#unclear`)
    expect(u.options.map((o) => o.label).slice(-3)).toEqual(['One of your products in Liners, not sure which', 'Liners in general', 'Not about your products'])
    const all = PRODUCTS_LEVEL_FIXTURES['liners-all']().category!.detail.unclear
    expect([all.lines.length, all.more, all.allHref, all.fewerHref]).toEqual([6, 0, null, `/dashboard/products/${PRODUCT_IDS.liners()}#unclear`])
    expect(PRODUCTS_LEVEL_FIXTURES['liners-member']().category!.detail.unclear.options).toEqual([])
    // A frozen month keeps a tag and moves no count, and the page says so.
    expect(categoryFixture({ over: { now: '2026-11-20T08:00:00.000Z' } }).category!.detail.unclear.closed).toBe(true)
  })

  it('the couldn\'t-tell-which link says "all" only where the opened list draws every line that may print', () => {
    expect([unclearWhole(6, false), unclearWhole(30, false), unclearWhole(31, false), unclearWhole(6, true)]).toEqual([true, true, false, false])
    expect(page.detail.unclear).toMatchObject({ whole: true, openCount: 6 })
    // Forty that may print: the opened list draws thirty, so the link never
    // says "See all 40".
    const base = linersUnclearTexts()[0]
    const many: TextRead[] = Array.from({ length: 40 }, (_, i) => ({ ...base, key: `c:many-${i}`, commentId: `many-${i}`, text: 'This liner gave me a rash after a week, back to my old one now.', date: `2026-09-${String(28 - (i % 20)).padStart(2, '0')}` }))
    const long = categoryFixture({ reads: { unclear: many } }).category!.detail.unclear
    expect(long).toMatchObject({ whole: false, openCount: 30, more: 37 })
    const opened = categoryFixture({ params: { unclear: 'all' }, reads: { unclear: many } }).category!.detail.unclear
    expect(opened).toMatchObject({ whole: false, openCount: 30 })
    expect(opened.lines).toHaveLength(30)
    // A list longer than its read: never "all", whatever printed.
    expect(categoryFixture({ reads: { unclearCut: true } }).category!.detail.unclear.whole).toBe(false)
  })

  it('the numbers: subjects open Market\'s pages at the month, groups open Voices, platforms from the month\'s market', () => {
    expect(page.subjects[0]).toMatchObject({ label: 'Fit & comfort', k: 70, href: '/dashboard/market/subjects/s-fit-comfort?period=month&month=2026-09' })
    expect(page.groups.state === 'ready' && page.groups.rows.map((g) => [g.name, g.k, g.href])[0]).toEqual(['New amputees, first year', 47, '/dashboard/voices?group=new#group-panel'])
    expect(page.platforms?.n).toBe(118)
    expect(page.platforms!.rows.reduce((s, r) => s + r.k, 0)).toBe(118)
  })

  it('a comment naming each card\'s product, labelled with it, through the root\'s gate', () => {
    expect(page.quotes.map((q) => q.product.name)).toEqual(['Iceross Seal-In X', 'Iceross Comfort', 'Iceross Synergy'])
    const card: ProductCard = { id: 'p', name: 'P', href: '/x', videos: 3, prev: null, kind: null, about: { kind: 'none' } }
    const short: TextRead = { key: 'c:1', videoId: 'v', commentId: '1', text: 'P?', lang: 'en', english: null, date: '2026-09-01', platform: 'tiktok', account: null, videoUrl: null, platformCommentId: null }
    expect(hubQuotes([card], new Map([['p', [short]]]), OSSUR_CLIENT_ID)).toEqual([])
  })

  it('U6: every subject provisional, no figure, no lead, and the list claims no "most"', () => {
    const today = todayCategoryFixture({ group: PRODUCT_IDS.feet() }).category!
    expect(today.subjectsPending).toBe(true)
    expect(today.subjects).toEqual([])
    expect(today.cards.map((c) => c.about.kind)).toEqual(['pending', 'pending', 'pending'])
  })
})

describe('the product\'s page, the evidence', () => {
  const d = productFixture()
  const page = d.product!

  it('its path, its two switchers and its label up', () => {
    expect(d.crumbs!.map((c) => [c.label, c.href])).toEqual([['Your products', '/dashboard/products'], ['Liners', `/dashboard/products/${PRODUCT_IDS.liners()}`], ['Iceross Seal-In X', null]])
    const menu = d.crumbs![2].menu!
    expect(menu.label).toBe('Your liners')
    expect(menu.items.map((i) => i.label)).toEqual(['Iceross Seal-In X', 'Iceross Comfort', 'Iceross Synergy', 'Iceross Dermo'])
    expect(menu.below!.every((i) => i.note === 'Quiet in September')).toBe(true)
    expect(menu.items.find((i) => i.current)?.label).toBe('Iceross Seal-In X')
    // Switched off: every product in one list, no word.
    const off = PRODUCTS_LEVEL_FIXTURES['not-on-product']().crumbs![2].menu!
    expect(off.below).toBeUndefined()
    expect(off.items.every((i) => !i.note)).toBe(true)
    expect(productMenu(d.base.shelf[0], PRODUCT_IDS.sealInX(), { month: '2026-09' }, 'Quiet so far').items[1].href).toBe(`/dashboard/products/${PRODUCT_IDS.liners()}/${PRODUCT_IDS.comfort()}?month=2026-09`)
  })

  it('its line in code\'s words, its place in its category (which adds up), its siblings', () => {
    expect(page.lead).toBe('Almost every video naming it is about Fit & comfort, and most have praise in their comments.')
    expect(page.place).toEqual({ product: 10, others: 9, unclear: 21, general: 78, n: 118 })
    expect(page.place!.product + page.place!.others + page.place!.unclear + page.place!.general).toBe(page.place!.n)
    expect(page.siblings.map((s) => s.name).slice(0, 3)).toEqual(['Iceross Comfort', 'Iceross Synergy', 'Iceross Dermo'])
    expect(page.siblings.some((s) => s.id === PRODUCT_IDS.sealInX())).toBe(false)
  })

  it('where it was named: most comments naming it first, four listed, an own post marked, a video\'s own words marked', () => {
    const ev = page.evidence
    expect(ev.total).toBe(10)
    expect(ev.videos).toHaveLength(PRODUCT_VIDEOS_SHOWN)
    expect(ev.videos.map((v) => [v.account, v.named, v.owned, v.inVideo])).toEqual([
      ['The Amputee Diaries', 3, false, true], ['@stepbystep.amp', 2, false, true], ['ossur', 2, true, false], ['@vida.protesis', 1, false, true],
    ])
    expect(ev.videos[0]).toMatchObject({ total: 148, quotable: 3, platform: 'YouTube', posted: '2 Sep' })
    expect(ev.videos[0].quotes).toHaveLength(PRODUCT_VIDEO_QUOTES)
    expect(ev.videos[3].quotes[0]).toMatchObject({ lang: 'es', english: 'The Seal-In X holds all day for me, but putting it on is hard.' })
    expect(ev.more).toEqual({ href: `/dashboard/products/${PRODUCT_IDS.liners()}/${PRODUCT_IDS.sealInX()}?videos=all#where-named`, desktop: 6, phone: 7 })
  })

  it('one video opened, or every video listed, the month kept, and the way back', () => {
    const v0 = sealVideos()[0]
    const open = PRODUCTS_LEVEL_FIXTURES['sealinx-open']().product!.evidence
    expect(open.videos.find((v) => v.open)?.id).toBe(v0)
    expect(open.videos.find((v) => v.open)?.href).toBe(`/dashboard/products/${PRODUCT_IDS.liners()}/${PRODUCT_IDS.sealInX()}`)
    expect(page.evidence.videos[0].href).toBe(`/dashboard/products/${PRODUCT_IDS.liners()}/${PRODUCT_IDS.sealInX()}?video=${v0}#video-${v0}`)
    const all = PRODUCTS_LEVEL_FIXTURES['sealinx-all']().product!.evidence
    expect([all.videos.length, all.more, all.all]).toEqual([10, null, true])
    expect(all.fewerHref).toBe(`/dashboard/products/${PRODUCT_IDS.liners()}/${PRODUCT_IDS.sealInX()}`)
  })

  it('the order and the list, pure: an opened video wherever it sits, a foreign id nothing, at most the cap', () => {
    const order = Array.from({ length: 70 }, (_, i) => ({ id: `v${i}` }))
    expect(shownVideos(order, {}).ids).toEqual(['v0', 'v1', 'v2', 'v3'])
    expect(shownVideos(order, { video: 'v9' })).toEqual({ ids: ['v0', 'v1', 'v2', 'v3', 'v9'], open: 'v9', all: false })
    expect(shownVideos(order, { video: 'not-ours' }).open).toBeNull()
    expect(shownVideos(order, { videos: 'all' }).ids).toHaveLength(PRODUCT_VIDEOS_MAX)
    const standing = new Map<string, StandingText>([
      ['v:a', { videoId: 'a', commentId: null, month: null, placements: [{ placement: 'named', groupId: 'g', productId: 'p', method: 'rule' }] }],
      ['c:1', { videoId: 'b', commentId: '1', month: '2026-09-01', placements: [{ placement: 'named', groupId: 'g', productId: 'p', method: 'rule' }] }],
      ['c:2', { videoId: 'b', commentId: '2', month: '2026-08-01', placements: [{ placement: 'named', groupId: 'g', productId: 'p', method: 'rule' }] }],
    ])
    expect(namedVideoOrder({ set: new Set(['a', 'b', 'c']), standing, month: '2026-09-01', productId: 'p' })).toEqual([
      { id: 'b', named: 1, inVideo: false }, { id: 'a', named: 0, inVideo: true }, { id: 'c', named: 0, inVideo: false },
    ])
  })

  it('a comment the gate refuses is counted, not quoted; videos not read say so', () => {
    const order = [{ id: 'v', named: 2, inVideo: false }]
    const t = (id: string, text: string): TextRead => ({ key: `c:${id}`, videoId: 'v', commentId: id, text, lang: 'en', english: null, date: '2026-09-02', platform: 'tiktok', account: null, videoUrl: null, platformCommentId: null })
    const ev = productEvidence({ order, shown: { ids: ['v'], open: null, all: false }, videos: new Map([['v', { id: 'v', platform: 'tiktok', video_id: 'p', video_url: null, account_name: 'a', comments_count: 1 }]]), texts: [t('1', 'liner?'), t('2', 'This liner finally stopped slipping on my long walks to work.')], owned: new Set(), clientId: OSSUR_CLIENT_ID, groupId: 'g', productId: 'p', params: {} })
    expect(ev.videos[0]).toMatchObject({ named: 2, quotable: 1, total: null })
    expect(productEvidence({ order, shown: { ids: ['v'], open: null, all: false }, videos: null, texts: [], owned: new Set(), clientId: OSSUR_CLIENT_ID, groupId: 'g', productId: 'p', params: {} }).state).toBe('unread')
  })

  it('a busy video never crowds another out: each video\'s comments are one list, read whole, and every printable one is counted', () => {
    const st = (videoId: string, commentId: string): StandingText => ({ videoId, commentId, month: '2026-09-01', placements: [{ placement: 'named', groupId: 'g', productId: 'p', method: 'rule' }] })
    const busy = Array.from({ length: 300 }, (_, i) => st('busy', `b${i}`))
    const lists = namedByVideo([...busy, st('quiet', 'q1'), st('busy', 'b300')])
    expect(lists.map((l) => [l.texts[0].videoId, l.texts.length, l.cap])).toEqual([['busy', 301, 301], ['quiet', 1, 1]])
    expect(namedByVideo([])).toEqual([])
    // Past the opened list's cap, the card still counts every printable one.
    const t = (id: string): TextRead => ({ key: `c:${id}`, videoId: 'busy', commentId: id, text: 'This liner finally stopped slipping on my long walks to work.', lang: 'en', english: null, date: '2026-09-02', platform: 'tiktok', account: null, videoUrl: null, platformCommentId: null })
    const ev = productEvidence({ order: [{ id: 'busy', named: 130, inVideo: false }], shown: { ids: ['busy'], open: 'busy', all: false }, videos: new Map([['busy', { id: 'busy', platform: 'tiktok', video_id: 'p', video_url: null, account_name: 'a', comments_count: 400 }]]), texts: Array.from({ length: 120 }, (_, i) => t(`b${i}`)), owned: new Set(), clientId: OSSUR_CLIENT_ID, groupId: 'g', productId: 'p', params: {} })
    expect(ev.videos[0]).toMatchObject({ named: 130, quotable: 120, open: true })
    expect(ev.videos[0].quotes).toHaveLength(50)
  })

  it('a quiet month: named in no video, one last month, the way to it', () => {
    const q = quietProductFixture()
    expect(q.product).toMatchObject({ videos: 0, prev: 1, lead: 'Nobody in your market named it in October so far.' })
    expect(q.product!.prevHref).toBe(`/dashboard/products/${PRODUCT_IDS.feet()}/${PRODUCT_IDS.proprio()}?month=2026-09`)
    expect(q.product!.evidence.total).toBe(0)
  })
})

describe('the states around the two levels', () => {
  it('switched off keeps the frame: the path, the title, the list with no count, no month', () => {
    const off = PRODUCTS_LEVEL_FIXTURES['not-on']()
    expect(off).toMatchObject({ missing: false, category: null, months: [] })
    expect(off.base.state).toBe('not_on')
    expect(off.crumbs).toHaveLength(2)
  })

  it('a month not read keeps the frame and its switch', () => {
    const u = PRODUCTS_LEVEL_FIXTURES.unread()
    expect(u.base.state).toBe('unread')
    expect(u.months.length).toBeGreaterThan(0)
  })

  it('an address the catalogue does not hold is missing, a state that reads no catalogue too', () => {
    for (const k of ['missing', 'missing-product', 'sealand'] as const) expect(PRODUCTS_LEVEL_FIXTURES[k]().missing, k).toBe(true)
    expect(PRODUCTS_LEVEL_FIXTURES.sealand().base.state).toBe('no_catalogue')
  })

  it('a product under another category redirects to its own address, its params kept', () => {
    const r = productFixture({ params: { month: '2026-09', video: 'v1' } })
    expect(r.redirect).toBeNull()
  })

  it('old root links find a product\'s category in the catalogue', () => {
    expect(productGroupOf(OSSUR_CATALOGUE)(PRODUCT_IDS.navii())).toBe(PRODUCT_IDS.knees())
    expect(productGroupOf(OSSUR_CATALOGUE)('nope')).toBeNull()
    expect(productGroupOf(null)('x')).toBeNull()
  })
})

describe('the small builders', () => {
  it('keeps a month only where it is one', () => {
    expect([keptMonth({ month: '2026-09' }), keptMonth({ month: 'nonsense' }), keptMonth({})]).toEqual([{ month: '2026-09' }, {}, {}])
  })

  it('platforms and groups count each video once, those with none left out', () => {
    expect(platformsOf(new Set(['a', 'b']), [{ id: 'a', platform: 'tiktok' }, { id: 'a', platform: 'tiktok' }, { id: 'b', platform: 'youtube' }, { id: 'c', platform: 'youtube' }]))
      .toEqual({ n: 2, rows: [{ platform: 'tiktok', label: 'TikTok', k: 1 }, { platform: 'youtube', label: 'YouTube', k: 1 }] })
    expect(platformsOf(new Set(), [])).toBeNull()
    const g = groupsOf(new Set(['a', 'b']), [{ key: 'x', name: 'X', videoIds: ['a'] }, { key: 'y', name: 'Y', videoIds: ['z'] }], {})
    expect(g).toEqual({ state: 'ready', n: 2, rows: [{ key: 'x', name: 'X', k: 1, href: '/dashboard/voices?group=x#group-panel' }] })
    expect(groupsOf(new Set(['a']), null, {})).toEqual({ state: 'none' })
    expect(groupsOf(new Set(['a']), undefined, {})).toEqual({ state: 'unread' })
  })

  it('subjects: the ready counted, the ready on none at 0, each opening Market\'s page at the month', () => {
    const c: Crosses = { n: 5, subjects: [{ id: 's1', label: 'A', k: 3 }], quiet: [{ id: 's2', label: 'B' }], kinds: [], pending: [{ id: 's3', label: 'C' }] }
    expect(subjectRowsOf(c, '2026-09-01').map((r) => [r.label, r.k, r.href])).toEqual([
      ['A', 3, '/dashboard/market/subjects/s1?period=month&month=2026-09'], ['B', 0, '/dashboard/market/subjects/s2?period=month&month=2026-09'],
    ])
  })

  it('the couldn\'t-tell fixture keeps its seven texts', () => {
    expect(linersUnclearTexts()).toHaveLength(7)
  })
})
