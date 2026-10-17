import { describe, expect, it } from 'vitest'
import { OSSUR_CLIENT_ID } from '../../config'
import { brandMonthPair, type CreatorRow } from '../../reading/cross'
import { buildBrands, type VoicesBrands } from './voices'
import {
  brandMenu, brandMonthBars, brandWhere, countWords, creatorMenu, creatorPageHref, groupBrandRows, inMonthWords, levelParams, marketConvHref, marketSubjHref,
  resolveCreatorPath, topClaims, voicesRootHref,
} from './voices-levels'
import { brandFixture, creatorFixture, groupFixture, groupThinFixture } from './voices-levels-fixture'

// VOICES' LEVEL PAGES, THE PURE HALF (17 Oct; the G3 boards). Each builder
// over its fixture (lib/pages/v2/voices-levels-fixture.ts, built from row
// shapes through the builders the loaders run); the reads' glue is pinned in
// voices-statements.test.ts.

const SEP = '2026-09-01'
const OCT = '2026-10-01'

describe('the params and the addresses', () => {
  it('reads the month, a video id (a UUID only, lowercased) and the list of every video; anything else names nothing', () => {
    expect(levelParams({ month: '2026-09', video: '00000000-0000-4000-8000-0000000C0001', videos: 'all' })).toEqual({ month: '2026-09', video: '00000000-0000-4000-8000-0000000c0001', videos: true })
    expect(levelParams({ month: 'september', video: 'not-an-id', videos: 'yes' })).toEqual({})
    expect(levelParams({ month: ['2026-08-01', '2026-07'] })).toEqual({ month: '2026-08' })
    expect(levelParams(null)).toEqual({})
  })

  it('a level page links into Market on This month for the month Voices reads, and back to the root with its month', () => {
    expect(marketConvHref('reg-1', SEP)).toBe('/dashboard/market/conversations/reg-1?period=month&month=2026-09')
    expect(marketSubjHref('s-1', OCT)).toBe('/dashboard/market/subjects/s-1?period=month&month=2026-10')
    expect(voicesRootHref({ month: '2026-09' })).toBe('/dashboard/voices?month=2026-09')
    expect(voicesRootHref({})).toBe('/dashboard/voices')
  })

  it('a creator\'s page opens a video or lists every one, the month kept, landing on it', () => {
    const c = { platform: 'tiktok', account: '@a' }
    expect(creatorPageHref(c, { month: '2026-09' }, { video: 'v1' })).toBe('/dashboard/voices/creators/tiktok/@a?month=2026-09&video=v1#video-v1')
    expect(creatorPageHref(c, {}, { videos: true })).toBe('/dashboard/voices/creators/tiktok/@a?videos=all#their-videos')
    expect(creatorPageHref(c, {})).toBe('/dashboard/voices/creators/tiktok/@a')
  })

  it('small words: a month in a sentence, a small count in words', () => {
    expect(inMonthWords({ month: OCT, soFar: true })).toBe('this month')
    expect(inMonthWords({ month: SEP, soFar: false })).toBe('in September')
    expect([countWords(1), countWords(2), countWords(12), countWords(13)]).toEqual(['one', 'two', 'twelve', '13'])
  })
})

describe('a group\'s page (G3-Voices-Group)', () => {
  const g = groupFixture()

  it('who they are and their four figures: their videos of the market\'s, never compared, the ready subject they talk about most, their conversations', () => {
    expect(g).toMatchObject({ kind: 'group', name: 'Caregivers and family', oneLiner: 'Parents and partners asking on someone’s behalf.', videos: 45, profileDate: '2026-10-11T05:00:00.000Z' })
    expect(g.month).toMatchObject({ month: OCT, soFar: true, monthWords: 'October so far', monthLabel: null, n: 318 })
    expect(g.topSubject).toEqual({ id: 's-fit', label: 'Fit & comfort', k: 17 })
    expect(g.conversations).toHaveLength(6)
    expect(g.platforms.map((p) => [p.label, p.k])).toEqual([['Instagram', 21], ['TikTok', 16], ['YouTube', 8]])
  })

  it('three ready subjects carded, most of their videos first, each with the conversations inside it for them and its level on the market', () => {
    expect(g.cards.map((c) => [c.name, c.state, c.k, c.inside.map((x) => [x.label, x.k]), c.market])).toEqual([
      ['Fit & comfort', 'ready', 17, [['Growing out of a socket', 12], ['Socket fit changing over time', 5]], { k: 108, n: 318 }],
      ['Cost & access', 'ready', 14, [['Paying for a device', 9], ['Insurance refusals for powered knees', 8]], { k: 60, n: 318 }],
      ['Community & encouragement', 'ready', 11, [['Getting kids to wear it', 7], ['Advice from other parents', 4]], { k: 51, n: 318 }],
    ])
    expect(g.cards[0].href).toBe('/dashboard/market/subjects/s-fit?period=month&month=2026-10')
    // Every other subject keeps its place: the ready ones not carded by count,
    // the open one named.
    expect(g.alsoIn.map((s) => [s.label, s.k])).toEqual([['Choosing the right device', 4], ['Look & style', 1]])
    expect(g.notMeasured).toEqual([{ id: 's-function', label: 'Function & movement', state: 'provisional' }])
    expect(g.inNone).toEqual([])
  })

  it('every conversation they are in, most of their videos first: its subject by the one rule, theirs of their videos, all of its videos', () => {
    expect(g.conversations.map((c) => [c.label, c.subject?.name, c.k, c.all])).toEqual([
      ['Growing out of a socket', 'Fit & comfort', 12, 19], ['Paying for a device', 'Cost & access', 9, 41], ['Insurance refusals for powered knees', 'Cost & access', 8, 31],
      ['Getting kids to wear it', 'Community & encouragement', 7, 9], ['Socket fit changing over time', 'Fit & comfort', 5, 20], ['Advice from other parents', 'Community & encouragement', 4, 11],
    ])
    expect(g.conversations[0]).toMatchObject({ description: 'A child’s socket stops fitting within months, and parents ask how often that is normal.', href: '/dashboard/market/conversations/reg-growing?period=month&month=2026-10' })
  })

  it('who they say they are, merged (decision 8), and how they talk', () => {
    expect(g.who).toEqual([{ label: 'Parent of a child amputee', count: 12 }, { label: 'Partner of an amputee', count: 5 }, { label: 'Adult child caring for a parent', count: 3 }])
    expect(g.phrases.map((p) => p.text)).toEqual(['my son’s leg', 'his prosthetist said', 'is this normal for kids?', 'we’re still waiting on insurance', 'she outgrew it already'])
  })

  it('the path: "Voices / Caregivers and family", the switcher the month\'s groups in the root\'s order, the month kept', () => {
    expect(g.crumbs[0]).toEqual({ label: 'Voices', href: '/dashboard/voices' })
    expect(g.crumbs[1]).toMatchObject({ label: 'Caregivers and family', href: null, slot: 'pass_e_persona' })
    expect(g.crumbs[1].menu?.items.map((i) => [i.label, i.current])).toEqual([
      ['New amputees, first year', false], ['Long-time users upgrading', false], ['Active and athletic', false], ['Caregivers and family', true], ['Clinicians and prosthetists', false],
    ])
    expect(groupFixture({ params: { month: '2026-09' } }).crumbs[1].menu?.items[0].href).toBe('/dashboard/voices/groups/new-amputees?month=2026-09')
  })

  // The thin board (G3-Voices-Group-Thin): no subject has passed its check.
  it('U6, no subject ready: no subject figure anywhere; the subjects holding their conversations carded by name, the rest named', () => {
    const t = groupThinFixture()
    expect(t.subjectsState).toBe('none_ready')
    expect(t.topSubject).toBeNull()
    expect(t.cards.map((c) => [c.name, c.state, c.k, c.market, c.inside.map((x) => [x.label, x.k])])).toEqual([
      ['Community & encouragement', 'provisional', null, null, [['Praise for resilience and courage', 31]]],
      ['Function & movement', 'provisional', null, null, [['How the prosthesis works', 18]]],
      ['Cost & access', 'provisional', null, null, [['Where can I get one', 11]]],
    ])
    expect(t.notMeasured).toHaveLength(6)
    expect(t.holdsMore).toEqual([{ id: 's-look', label: 'Look & style', convs: 1 }])
    expect(t.alsoIn).toEqual([])
    expect(t.brands).toMatchObject({ state: 'not_counted', line: 'Brands are not counted for this workspace yet.' })
    expect(t.brands.rows.map((r) => [r.label, r.k])).toEqual([['Össur', null], ['Ottobock', null]])
    expect(t.products.state).toBe('off')
    expect(t.who).toEqual([])
    expect(t.triggers).toBe('')
  })

  // A tracked subject is never hidden (14 Oct): one ready, one open, one
  // failed; the failed one named with the open one, never carded over a ready
  // one, and its conversations "in the list below".
  it('a tracked subject is never hidden: ready subjects carded, the open and the failed named, each holding its conversations below', () => {
    const t = groupFixture({ checks: 'tracked' })
    expect(t.cards.map((c) => c.name)).toEqual(['Community & encouragement', 'Function & movement', 'Choosing the right device'])
    expect(t.notMeasured).toEqual([{ id: 's-cost', label: 'Cost & access', state: 'provisional' }, { id: 's-fit', label: 'Fit & comfort', state: 'failed' }])
    expect(t.holdsMore.map((h) => [h.label, h.convs])).toEqual([['Cost & access', 2], ['Fit & comfort', 2]])
    // The failed subject's conversations name it (a name is not a figure).
    expect(t.conversations.find((c) => c.label === 'Growing out of a socket')?.subject).toEqual({ id: 's-fit', name: 'Fit & comfort', state: 'failed' })
  })

  it('the brands in their videos: you first, then most, counted brands alone; names alone where none is counted', () => {
    const tracked = [{ brandKey: 'client', label: 'Össur', countState: 'counted' as const }, { brandKey: 'otto', label: 'Ottobock', countState: 'counted' as const }, { brandKey: 'f', label: 'Fillauer', countState: 'counted' as const }]
    const rows = [
      { month: OCT, audience: 'industry-other', brand_key: 'client', k_any: 5, k_organic: 3, n: 100, n_organic: 90 },
      { month: OCT, audience: 'industry-other', brand_key: 'otto', k_any: 5, k_organic: 3, n: 100, n_organic: 90 },
      { month: OCT, audience: 'industry-other', brand_key: 'f', k_any: 1, k_organic: 1, n: 100, n_organic: 90 },
    ]
    const pairs = brandMonthPair({ month: OCT, brands: tracked, rows, audiences: ['industry-other'], pair: null })
    const sets = [{ brandKey: 'client', any: ['a', 'b'] }, { brandKey: 'otto', any: ['a', 'b', 'c', 'x'] }, { brandKey: 'f', any: ['z'] }]
    const brands: VoicesBrands = buildBrands({ clientId: OSSUR_CLIENT_ID, month: OCT, pairs, crosses: { videos: sets.map((s) => ({ ...tracked.find((t) => t.brandKey === s.brandKey)!, month: OCT, any: s.any, organic: s.any, n: 100, nOrganic: 90 })), kinds: [], subjects: [] }, note: null, params: {}, clientCounts: true })
    const r = groupBrandRows({ brands, sets, videoIds: new Set(['a', 'b', 'c']), params: { month: '2026-10' } })
    expect(r.state).toBe('ready')
    expect(r.rows.map((x) => [x.label, x.you, x.k, x.href])).toEqual([['Össur', true, 2, '/dashboard/voices/brands/client?month=2026-10'], ['Ottobock', false, 3, '/dashboard/voices/brands/otto?month=2026-10']])
    expect(groupBrandRows({ brands, sets, videoIds: new Set(['q']), params: {} })).toMatchObject({ rows: [], line: 'No brand you track was named in their videos.' })
    expect(groupBrandRows({ brands: { ...brands, state: 'unread', empty: 'Brands could not be read just now.' }, sets, videoIds: new Set(), params: {} })).toMatchObject({ state: 'unread', rows: [], line: 'Brands could not be read just now.' })
  })
})

describe('a brand\'s page (G3-Voices-Brand)', () => {
  const b = brandFixture()

  it('the header: Pass C\'s finding leads; named without being asked with its verdict, named at all, praised and complained', () => {
    expect(b).toMatchObject({ kind: 'brand', label: 'Ottobock', you: false, watched: false, state: 'counted', named: { k: 37, n: 290 }, any: { k: 49, n: 318 }, praised: { k: 16, n: 49 }, complained: { k: 24, n: 49 } })
    expect(b.prevNamed).toEqual({ k: 74, n: 713, month: SEP })
    expect(b.verdict?.state).toBe('no_clear_change')
    expect(b.lead).toEqual({ title: 'Ottobock’s talk turns on getting a knee paid for', body: expect.stringContaining('approvals, appeals and who pays'), kindWords: 'a topic it holds' })
    expect(b.findings.map((f) => f.title)).toEqual(['When people describe a long fight with insurance over a knee, the knee they name is an Ottobock one', 'Prosthetists in the comments mention it as what their clinic fits first'])
    expect(b.findingsDate).toBe('2026-10-11T05:00:00.000Z')
  })

  it('its parts are Voices\' levels: the groups commenting on its videos and the creators it comes up with, never a Reddit community', () => {
    expect(b.groups.map((g) => [g.name, g.k])).toEqual([['Long-time users upgrading', 21], ['New amputees, first year', 12], ['Active and athletic', 9], ['Clinicians and prosthetists', 6], ['Caregivers and family', 4]])
    expect(b.groups[0].href).toBe('/dashboard/voices/groups/long-time')
    // A tie on its videos: the creator with more of the market's first.
    expect(b.creators.map((c) => [c.account, c.k])).toEqual([['The Amputee Diaries', 3], ['@c.leg.life', 3], ['@limbcare.clinic', 2], ['@stepbystep.amp', 1]])
    expect(b.creators.some((c) => c.account.startsWith('r/'))).toBe(false)
    expect(b.communitiesLeftOut).toBe(true)
  })

  it('its numbers: three months named without being asked, the kinds, the READY subjects, where it was named, where', () => {
    expect(b.months.map((m) => [m.label, m.k, m.n, m.filling])).toEqual([['August', 52, 520, false], ['September', 74, 713, false], ['October', 37, 290, true]])
    expect(b.kinds.map((k) => [k.label, k.k])).toEqual([['Complained about something', 24], ['Asked a question', 19], ['Praised it', 16], ['Wished for something', 5]])
    expect(b.subjects.map((s) => [s.label, s.k, s.n])).toEqual([['Cost & access', 26, 49], ['Choosing the right device', 11, 49], ['Fit & comfort', 7, 49], ['Look & style', 2, 49]])
    expect(b.notMeasured).toEqual([{ id: 's-function', label: 'Function & movement' }])
    expect(b.where).toEqual({ comment: 34, content: 21, n: 49 })
    expect(b.platforms.map((p) => [p.label, p.k])).toEqual([['TikTok', 21], ['YouTube', 16], ['Instagram', 12]])
  })

  it('a rival\'s ninety days, under their own window (D4): asked under its content, what it says in its own videos, three comments each from its conversation', () => {
    expect(b.window).toEqual({ from: '2026-07-14', to: '2026-10-12', words: '14 Jul to 11 Oct' })
    expect(b.asked.map((a) => [a.label, a.videos])).toEqual([['Insurance refusals for powered knees', 14], ['Is the C-Leg worth the fight', 6], ['Waterproof knees', 3]])
    expect(b.claims).toHaveLength(2)
    expect(b.said.map((q) => q.from?.label)).toEqual(['Insurance refusals for powered knees', 'Paying for a device', 'Choosing a microprocessor knee'])
  })

  it('the switcher: "Brands you track", you first, then by how often each was named without being asked, the rest below the hairline in words', () => {
    expect(b.crumbs[1]).toMatchObject({ label: 'Ottobock', href: null })
    const menu = b.crumbs[1].menu!
    expect(menu.label).toBe('Brands you track')
    expect(menu.items.map((i) => [i.label, i.current, i.note ?? null])).toEqual([['Össur', false, 'You'], ['Ottobock', true, null], ['Fillauer', false, null], ['Blatchford', false, null]])
    expect(menu.below?.map((i) => [i.label, i.note])).toEqual([['Proteor', 'Not named this month']])
    // Words, never a figure.
    expect(JSON.stringify(menu)).not.toMatch(/"note":"[^"]*\d/)
  })

  it('your own brand: no finding, no ninety days', () => {
    const you = brandFixture({ key: 'client' })
    expect(you).toMatchObject({ you: true, lead: null, findings: [], window: null, asked: [], claims: [], said: [] })
    expect(you.askHref).toContain(encodeURIComponent('What does my market say about us?'))
  })

  it('a brand not counted keeps its parts empty and says why once; its ninety days stand', () => {
    const n = brandFixture({ counted: false })
    expect(n).toMatchObject({ state: 'not_yet', stateWords: 'not counted yet', named: null, any: null, praised: null, complained: null, groups: [], creators: [], kinds: [], subjects: [], where: null, platforms: [], notMeasured: [] })
    expect(n.said).toHaveLength(3)
    expect(n.lead?.title).toBe('Ottobock’s talk turns on getting a knee paid for')
  })

  it('the month bars pool the market\'s audiences; a month with no row reads nothing, never 0', () => {
    const rows = [
      { month: SEP, audience: 'industry-other', brand_key: 'o', k_any: 5, k_organic: 3, n: 100, n_organic: 90 },
      { month: SEP, audience: 'competitor:X', brand_key: 'o', k_any: 2, k_organic: 1, n: 20, n_organic: 10 },
      { month: SEP, audience: 'client', brand_key: 'o', k_any: 9, k_organic: 9, n: 9, n_organic: 9 },
    ]
    expect(brandMonthBars(rows, 'o', SEP, ['industry-other', 'competitor:X'], OCT)).toEqual([
      { month: '2026-07-01', label: 'July', k: null, n: null, filling: false },
      { month: '2026-08-01', label: 'August', k: null, n: null, filling: false },
      { month: SEP, label: 'September', k: 4, n: 100, filling: false },
    ])
    expect(brandWhere(rows.map((r) => ({ ...r, k_content: 1, k_comment: 2 })), 'o', SEP, ['industry-other', 'competitor:X'])).toEqual({ comment: 4, content: 2, n: 7 })
    expect(brandWhere(rows, 'o', SEP, ['industry-other'])).toBeNull()
  })

  it('its own claims, each said once, the one most of its posts carried first', () => {
    expect(topClaims([
      { id: 'a', source_video_id: 'v1', claim: 'Clinic visits.', posted: '2026-09-01' },
      { id: 'b', source_video_id: 'v2', claim: 'Approval stories.', posted: '2026-09-03' },
      { id: 'c', source_video_id: 'v3', claim: 'approval   stories', posted: '2026-09-02' },
      { id: 'd', source_video_id: 'v4', claim: '', posted: '2026-09-02' },
    ])).toEqual([{ id: 'b', claim: 'Approval stories.' }, { id: 'a', claim: 'Clinic visits.' }])
  })

  it('brandMenu holds no switcher for a workspace that tracks one brand', () => {
    const one = buildBrands({ clientId: OSSUR_CLIENT_ID, month: OCT, pairs: brandMonthPair({ month: OCT, brands: [{ brandKey: 'client', label: 'Össur', countState: 'counted' }], rows: [], audiences: ['industry-other'], pair: null }), crosses: null, note: null, params: {} })
    expect(brandMenu(one, 'client', {})).toBeNull()
  })
})

describe('a creator\'s page (G3-Voices-Creator)', () => {
  const c = creatorFixture()

  it('one line code builds: their biggest conversation, theirs of their videos, of all of its videos', () => {
    expect(c).toMatchObject({ kind: 'creator', account: '@stepbystep.amp', platform: 'tiktok', platformLabel: 'TikTok', followers: 182000, followerWord: 'followers', videos: 14 })
    expect(c.lead).toMatchObject({ label: 'Running on a blade', k: 6, ofTheme: 24, href: '/dashboard/market/conversations/reg-running?period=month&month=2026-10' })
    expect(c.brands.map((b) => [b.label, b.k, b.you])).toEqual([['Össur', 4, true], ['Ottobock', 1, false]])
  })

  it('their videos, the most comments counted first: five shown, each with its counted comments of its total and its printable ones naming their conversation', () => {
    expect(c.evidence).toMatchObject({ state: 'ready', total: 14, all: false, more: { desktop: 9, phone: 11 }, capped: null })
    const [first, second, third] = c.evidence.cards
    expect([first.caption, first.posted, first.conv?.label, first.brand, first.counted, first.total]).toEqual(['First 5k on the Cheetah, and what nobody tells you about the socket', '8 Oct', 'Running on a blade', { label: 'Össur', you: true }, 22, 340])
    expect(first.quotes.map((q) => [q.text, q.conv?.label])).toEqual([
      ['Mile 3 on the new foot and I forgot I was wearing it.', 'Running on a blade'],
      ['How long before you could run without the socket rubbing?', 'Socket fit causes pain'],
      ['Is the Cheetah covered anywhere or is it all out of pocket?', 'Paying for a device'],
    ])
    expect(second.quotes.map((q) => q.conv?.label)).toEqual(['Skin irritation from silicone', 'How long a liner lasts'])
    // A comment in another language prints with its English.
    expect(third.quotes.find((q) => q.lang === 'es')).toMatchObject({ english: 'Which foot do you run with in the mountains? I can’t find one that holds up.', conv: { label: 'Feet for trail running' } })
    expect(first.href).toBe(`/dashboard/voices/creators/tiktok/@stepbystep.amp?video=${first.id}#video-${first.id}`)
  })

  it('?video= opens one of their own videos in full wherever it falls; ?videos=all lists every video', () => {
    const open = creatorFixture({ video: 2 })
    const card = open.evidence.cards.find((v) => v.open)!
    expect(card.caption).toBe('Hill sprints, week six: the blade against my everyday foot')
    expect(card.href).toBe('/dashboard/voices/creators/tiktok/@stepbystep.amp')
    const all = creatorFixture({ all: true })
    expect(all.evidence).toMatchObject({ all: true, more: null, capped: null })
    expect(all.evidence.cards).toHaveLength(14)
  })

  it('the facts: their conversations (theirs, of all its videos), the groups commenting, what people did; the other creators and the root\'s list', () => {
    expect(c.conversations.slice(0, 4).map((x) => [x.label, x.k, x.ofTheme])).toEqual([['Running on a blade', 6, 24], ['How long a liner lasts', 3, 35], ['Socket fit causes pain', 2, 11], ['Feet for trail running', 2, 7]])
    expect(c.groups.map((g) => [g.name, g.k])).toEqual([['Active and athletic', 9], ['New amputees, first year', 5], ['Long-time users upgrading', 2]])
    expect(c.kinds?.map((k) => [k.label, k.k])).toEqual([['Praised a device', 11], ['Asked a question', 9], ['Complained about something', 3], ['Wished for something', 2]])
    expect(c.siblings.map((s) => s.account)).toEqual(['The Amputee Diaries', '@runningon.carbon', '@limbcare.clinic', '@c.leg.life', '@newleg.newlife', '@bladerunner.kim', '@peg.leg.pete', '@amp.fitness.lab'])
    expect(c.atFloor).toBe(9)
    expect(c.allHref).toBe('/dashboard/voices?creators=all#creators')
  })

  it('the path and its switcher: creators at the floor, most videos first, never Reddit', () => {
    expect(c.crumbs.map((x) => x.label)).toEqual(['Voices', '@stepbystep.amp'])
    const items = c.crumbs[1].menu!.items
    expect(items[0]).toMatchObject({ label: '@stepbystep.amp', current: true, note: 'TikTok' })
    expect(items.some((i) => i.label.startsWith('r/'))).toBe(false)
  })

  it('an address names a creator by two segments exactly, or by the account alone', () => {
    const people: CreatorRow[] = [
      { key: 'tiktok|kate', account: 'kate', platform: 'tiktok', videos: 5, followers: 1, themes: [] },
      { key: 'youtube|kate', account: 'kate', platform: 'youtube', videos: 3, followers: 1, themes: [] },
    ]
    expect(resolveCreatorPath(people, ['youtube', 'kate'])?.key).toBe('youtube|kate')
    expect(resolveCreatorPath(people, ['Kate'])?.key).toBe('tiktok|kate')
    expect(resolveCreatorPath(people, ['instagram', 'kate'])).toBeNull()
    expect(resolveCreatorPath(people, [])).toBeNull()
    expect(creatorMenu(people.slice(0, 1), 'tiktok|kate', {})).toBeNull()
  })
})
