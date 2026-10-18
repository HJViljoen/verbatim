import { describe, expect, it } from 'vitest'

import { surface } from '../../nav'
import { adviceTitle } from '../../pages/v2/advice-words'
import { buildPlaybook, type PlaybookVideo } from '../../pages/playbook'
import { fmtMultiple, postsBlock, worksBasis, type ContentMonth } from '../../pages/v2/content'
import { contentFixture, OSSUR_IDEAS as OSSUR_IDEA_ROWS, OSSUR_OWNED } from '../../pages/v2/content-fixture'
import { MOVE_CARDS } from '../../pages/v2/moves-fixture'
import { ossurTodayFixture } from '../../pages/v2/products-fixture'
import { ossurVoicesFixture, sealandVoicesFixture } from '../../pages/v2/voices-fixture'
import type { GroupProducts } from '../../pages/v2/voices'
import type { Verdict } from '../../reading/verdicts'
import { fact } from '../../written/test-fixtures'
import {
  appSectionsFor, briefVerdict, buyersSection, groupsSection, hooksOf, hooksSection, ideasOf, ideasSection, moveOf, movesOf, movesSection, namedNotes, namedOf, namedSection,
  peopleOf, productsOf, productsSection, RESPONSE_BASIS, standoutOf, subjectsSection, subjectWords,
} from './app'
import { OSSUR_APP, OSSUR_MOVES, OSSUR_PEOPLE, OSSUR_SUBJECT_FACTS, OSSUR_SUBJECT_READS, SEALAND_APP, SEALAND_NAMED } from './app-fixture'
import {
  adviceDetail, alsoInMarket, appLines, buyersSub, daysLong, ideaReadLine, inTheirVideos, moveLine, multipleText, ownTouchWords, pageHref, recordLine, slotWords, voicesMonthHref, withMonth,
} from './app-words'

// The October canvas's parts, from the app pages' own data (the pages' fixtures:
// Össur-shaped and Sealand-shaped), and the sections they make. Pure.

const OCT = '2026-10-01'
const SEP = '2026-09-01'

describe('Voices: the groups (Leadership\'s Who is in your market, Sales\' Who is buying)', () => {
  const v = ossurVoicesFixture({ month: '2026-09' }, 'ready')
  const personas = v.groups.cards.map((c) => ({ key: c.key, oneLiner: `${c.oneLiner}`, wants: `${c.wants} And more.`, blockers: `${c.stops} And more.`, triggers: 'They move on a peer who has done it.' }))

  it('takes every group in a market video, the most first, with its persona\'s words in full, its ready subject and its page', () => {
    const p = peopleOf({ month: SEP, market: v.videos, groups: v.groups, personas })!
    expect(p.market).toBe(487)
    expect(p.groups.map((g) => [g.name, g.videos])).toEqual([['New amputees, first year', 96], ['Long-time users upgrading', 70], ['Active and athletic', 57], ['Caregivers and family', 45], ['Clinicians and prosthetists', 29]])
    const first = p.groups[0]
    expect(first.wants).toMatch(/And more\.$/)
    expect(first.tips).toBe('They move on a peer who has done it.')
    expect(first.top).toEqual({ id: expect.any(String), label: 'Fit & comfort', k: 46, href: expect.stringMatching(/^\/dashboard\/market\/subjects\/.+\?period=month&month=2026-09$/) })
    expect(first.href).toBe('/dashboard/voices/groups/new-amputees?month=2026-09')
    // Products off for the tenant, or not read: no products line at all.
    expect(first.products).toBeNull()
  })

  it('U6: with no subject\'s check passed, no group names a subject it talks about most', () => {
    const prov = ossurVoicesFixture({}, 'provisional')
    const p = peopleOf({ month: SEP, market: prov.videos, groups: prov.groups, personas })!
    expect(p.groups.every((g) => g.top === null)).toBe(true)
    expect(inTheirVideos(p.groups[0])).toBeNull()
  })

  it('carries the products named in a group\'s videos where Your products read them, and none where it did not', () => {
    const products = new Map<string, GroupProducts>([
      ['new-amputees', { state: 'ready', rows: [{ id: 'p1', name: 'Pro-Flex XC', k: 3, href: '/dashboard/products/feet/p1?month=2026-09' }], unclear: 0, line: null }],
      ['long-time', { state: 'ready', rows: [], unclear: 0, line: null }],
      ['athlete', { state: 'off', rows: [], unclear: 0, line: 'off' }],
    ])
    const p = peopleOf({ month: SEP, market: v.videos, groups: v.groups, personas, products })!
    expect(p.groups[0].products).toEqual([{ name: 'Pro-Flex XC', k: 3, href: '/dashboard/products/feet/p1?month=2026-09' }])
    expect(inTheirVideos(p.groups[0])).toBe('Talks most about Fit & comfort, 46 of their 96 videos. Your products in them: Pro-Flex XC.')
    expect(inTheirVideos(p.groups[1])).toBe('Talks most about Cost & access, 31 of their 70 videos. None of your products came up in them.')
    expect(p.groups[2].products).toBeNull()
  })

  it('reads nothing where the groups were not read or the market is empty', () => {
    expect(peopleOf({ month: SEP, market: 487, groups: { state: 'unread', cards: [] }, personas })).toBeNull()
    expect(peopleOf({ month: SEP, market: 0, groups: v.groups, personas })).toBeNull()
    expect(peopleOf({ month: SEP, market: null, groups: v.groups, personas })).toBeNull()
  })

  it('makes Leadership\'s overview and Sales\' Who is buying: counts, never shares or a change', () => {
    const lead = groupsSection(OSSUR_PEOPLE)!
    expect(lead.key).toBe('leadership.groups')
    expect(lead.sub).toBe('Five groups comment in your market, as Voices describes them. A video can hold more than one group, so the counts overlap.')
    expect(lead.foot).toBe('Each update describes the groups afresh, so no count is set against September.')
    expect(lead.link).toEqual({ href: '/dashboard/voices?month=2026-10', text: 'Open the groups on Voices →' })
    expect(appLines(lead).join(' ')).not.toMatch(/%/)
    const sales = buyersSection(OSSUR_PEOPLE)!
    expect(sales.key).toBe('sales.groups')
    expect(buyersSub(OCT, 5, 4)).toBe('Five groups comment in your market in October, as Voices describes them. The four in the most videos are here.')
    expect(buyersSub(OCT, 4, 4)).toBe('Four groups comment in your market in October, as Voices describes them.')
    expect(alsoInMarket(OCT, [{ name: 'Long-term user', videos: 50 }])).toBe('Also in your market: Long-term user, in 50 of October’s videos.')
    expect(alsoInMarket(OCT, [])).toBeNull()
    expect(groupsSection(null)).toBeNull()
    expect(buyersSection({ ...OSSUR_PEOPLE, groups: [] })).toBeNull()
  })
})

describe('Voices: the brands named without being asked (Marketing)', () => {
  it('Sealand (brands counted): each counted brand named unprompted, its verdict, praised and complained, its subject', () => {
    const n = namedOf(sealandVoicesFixture().brands)!
    expect(n.base).toBe(743)
    expect(n.rows.map((r) => [r.label, r.you, r.named.k])).toEqual([['Sealand', true, 1], ['Patagonia', false, 13], ['The North Face', false, 10], ['Cotopaxi', false, 5], ['Freitag', false, 2]])
    expect(n.rows[1].verdict).toEqual({ state: 'too_little_data', change: expect.anything(), band: expect.anything() })
    expect(n.rows[1].praised?.k).toBe(50)
    expect(n.notNamed).toEqual(['Freedom of Movement', 'Rareform'])
    expect(n.href).toBe('/dashboard/voices?month=2026-09')
  })

  it('Össur (brands not counted yet): no page', () => {
    expect(namedOf(ossurVoicesFixture().brands)).toBeNull()
  })

  it('a refused comparison is not carried (it prints nothing, T0a)', () => {
    const v = { state: 'refused', changePts: 2, bandPts: 1 } as unknown as Verdict
    expect(briefVerdict(v)).toBeNull()
    expect(briefVerdict({ state: 'moved', changePts: -3.1, bandPts: 1.2 } as unknown as Verdict)).toEqual({ state: 'moved', change: -3.1, band: 1.2 })
  })

  it('writes the three notes from the counts, the company\'s own row said either way', () => {
    expect(namedNotes(SEALAND_NAMED, 'Sealand')).toEqual([
      'The North Face and Cotopaxi were named most without being asked: in 11 and 8 of the 941 videos.',
      'Sealand was named without being asked in 2 of them.',
      'Of the 52 videos naming Cotopaxi in any way, people praised it in 27 and complained in 32.',
    ])
    const quiet = { ...SEALAND_NAMED, rows: SEALAND_NAMED.rows.map((r) => (r.you ? { ...r, named: { k: 0, n: 941 } } : r)) }
    expect(namedNotes(quiet, 'Sealand')[1]).toBe('Sealand was not named without being asked in October.')
    const s = namedSection(SEALAND_NAMED, 'Sealand')!
    expect(s.also).toBe('Not named without being asked in October: Freedom of Movement.')
    expect(s.sub).toMatch(/^Of the 941 videos in your market in October that no brand search of ours found/)
    expect(namedSection(null, 'Össur')).toBeNull()
  })
})

describe('Your products (Össur only, behind PRODUCT_READINGS_ENABLED)', () => {
  it('each category with videos, the most first, the videos naming yours, its products with the shelf\'s first-month mark, the strict standouts', () => {
    const d = ossurTodayFixture()
    const p = productsOf(d, 'Össur', (id) => (d.shelf.find((c) => c.id === id)?.name === 'Feet' ? 4 : 0))!
    expect(p.cameUp).toBe(7)
    expect(p.products).toBe(65)
    expect(p.categories.map((c) => [c.name, c.videos])).toEqual([['Hands', 60], ['Sockets & Locks', 49], ['Feet', 29], ['Liners', 23], ['Knees', 22], ['Bracing & Supports', 12]])
    const feet = p.categories.find((c) => c.name === 'Feet')!
    expect(feet.named).toBe(4)
    expect(feet.products.map((x) => [x.name, x.videos])).toEqual([['Pro-Flex XC', 2], ['Pro-Flex Terra', 1], ['Proprio Foot', 1]])
    // Hands: some of its videos name yours, so not "none of yours named".
    expect(p.standouts.map((s) => [s.kind, s.label, s.name])).toEqual([['general', 'Category, not you', 'Hands'], ['praised', 'Praise in the comments', 'Feet']])
    expect(p.standouts[1].text).toMatch(/have praise in their comments\.$/)
    expect(p.href).toBe('/dashboard/products?month=2026-09')
  })

  it('switched off, not applied, no catalogue or a failed read: no page (Sealand)', () => {
    expect(productsOf(ossurTodayFixture({ over: { enabled: false } }), 'Össur', () => 0)).toBeNull()
    expect(productsSection(null)).toBeNull()
  })

  it('words each kind of standout from the pick\'s own figures, never "praised it"', () => {
    const base = { open: { kind: 'group' as const, id: 'g' }, href: '/x', where: 'Liners' }
    expect(standoutOf({ ...base, kind: 'first', name: 'Pro-Flex LP Align', videos: 1, months: [{ month: '2026-06-01', k: 0 }, { month: OCT, k: 1 }], flag: {} as Verdict, lead: null }, OCT, 'Össur').text).toBe('Named in one video in October, its first since June.')
    expect(standoutOf({ ...base, kind: 'general', name: 'Hands', inGeneral: { k: 48, n: 48 }, yours: { k: 0, n: 48 } }, OCT, 'Össur').text).toBe('48 videos about hands in October. None named one of Össur’s.')
    expect(standoutOf({ ...base, kind: 'praised', name: 'Liners', praised: { k: 13, n: 26 } }, OCT, 'Össur')).toMatchObject({ label: 'Praise in the comments', text: '13 of the 26 videos about liners have praise in their comments.' })
    expect(standoutOf({ ...base, kind: 'focus', name: 'Liners', subject: 'Fit & comfort', level: { k: 11, n: 26 }, ranked: false }, OCT, 'Össur')).toMatchObject({ name: 'Liners in Fit & comfort', text: '11 of the 26 videos about liners are in Fit & comfort.' })
  })
})

describe('Content: what to post next (the month-closing run\'s ideas)', () => {
  const page = contentFixture()
  it('the run\'s own ideas beside their month, each with its sub-questions by videos, its chips, who asks, your posts; Also asked over the month; Worth a reply', () => {
    const i = ideasOf(page, OSSUR_IDEA_ROWS, { month: OCT, medical: true })!
    expect(i.read.label).toBe('14 Sep to 11 Oct')
    expect(i.since).toBe('2026-08-01')
    expect(i.medical).toBe(true)
    expect(i.ideas.map((x) => x.title)).toEqual(page.ideas.cards.map((c) => c.title))
    const first = i.ideas[0]
    expect(first.read).toEqual({ k: 48, n: 640 })
    expect(first.month).toEqual({ k: 31, n: 318 })
    expect(first.groups).toEqual(['New amputees, first year', 'Caregivers and family'])
    expect(first.asks.length).toBe(4)
    expect(first.asks.map((a) => a.videos)).toEqual([...first.asks.map((a) => a.videos)].sort((a, b) => b - a))
    expect(first.asksOf).toBe(23)
    expect(first.format).toEqual({ label: 'Tutorial', multiple: expect.any(Number) })
    expect(first.opening?.label).toBe('Open with a question')
    expect(first.href).toBe(`/dashboard/content/ideas/${first.id}`)
    expect(i.asked.map((a) => [a.label, a.videos])).toEqual([['How a socket should fit as a child grows', 17], ['Which knee suits my activity level', 14], ['Looking after the skin under a liner', 13]])
    expect(i.replies).toBe('/dashboard/content/replies?period=month')
    expect(ideaReadLine(first, i)).toBe('48 of 640 videos, 14 Sep to 11 Oct · 31 of 318 in October')
    expect(ideaReadLine({ read: first.read, month: null }, i)).toBeNull()
    expect(ownTouchWords(first.own)).toMatch(/^None of your \d+ posts since August touched on it$/)
  })

  it('two ideas: the question Content sets in the card they leave leads Also asked, so the most asked question is never lost', () => {
    const two = contentFixture({ ideas: 'two' })
    expect(two.ideas.questions).toHaveLength(1)
    const lead = two.ideas.questions[0]
    const i = ideasOf(two, OSSUR_IDEA_ROWS, { month: OCT, medical: true })!
    expect(i.ideas).toHaveLength(2)
    expect(i.asked[0]).toEqual({ label: lead.label, videos: lead.month, href: `/dashboard/market/conversations/${lead.registryId}?period=month&month=2026-10` })
    expect(i.asked.map((a) => a.label)).toEqual([lead, ...two.asked.rows].slice(0, 3).map((r) => r.label))
  })

  it('an older set (not the closing run\'s), another month\'s set, or none: no page', () => {
    expect(ideasOf({ ...page, ideas: { ...page.ideas, week: { ...page.ideas.week!, current: false } } }, OSSUR_IDEA_ROWS, { month: OCT, medical: true })).toBeNull()
    expect(ideasOf(page, OSSUR_IDEA_ROWS, { month: SEP, medical: true })).toBeNull()
    expect(ideasOf({ ...page, ideas: { ...page.ideas, state: 'not_on', cards: [] } }, [], { month: OCT, medical: false })).toBeNull()
    expect(ideasSection(null)).toBeNull()
  })

  it('the sub says the days the ideas read, in full', () => {
    const i = ideasOf(page, OSSUR_IDEA_ROWS, { month: OCT, medical: true })!
    expect(ideasSection(i)!.sub).toBe('From questions people asked 14 September to 11 October that none of your posts since August had touched on, the most videos first. 1× is a typical market video on the question.')
    expect(daysLong('2026-10-04T00:00:00.000Z', '2026-11-01T00:00:00.000Z')).toBe('4 to 31 October')
  })
})

describe('Content: hooks and formats, on Content\'s measure', () => {
  const video = (id: string, over: Partial<PlaybookVideo>): PlaybookVideo => ({
    id, upload_date: '2026-10-05', platform: 'tiktok', classified_type: null, hook_style: null, engagement_rate: null,
    is_client: false, is_competitor: false, competitor_name: null, source: 'discovered', sentiment: null, sentiment_source: null, analyzed_lane: null, ...over,
  })
  const videos: PlaybookVideo[] = []
  let n = 0
  const add = (count: number, classified: string, hook: string, rate: number, o: Partial<PlaybookVideo> = {}) => {
    for (let i = 0; i < count; i++) videos.push(video(`m${n++}`, { classified_type: classified, hook_style: hook, engagement_rate: rate, ...o }))
  }
  add(6, 'story', 'personal-story', 9)
  add(5, 'tutorial', 'question', 6)
  add(8, 'promotional', 'before-after', 2)
  add(4, 'story', 'personal-story', 5, { is_competitor: true, competitor_name: 'Ottobock' })
  add(3, 'promotional', 'question', 3, { source: 'owned', is_client: true })
  const playbook = buildPlaybook({ month: OCT, brand: 'Össur', rival: 'Ottobock', videos, clientSide: 'owned' })
  const month: ContentMonth = { month: OCT, complete: true, from: `${OCT}T00:00:00.000Z`, to: '2026-11-01T00:00:00.000Z' }

  it('the market\'s formats by share with their response, your posts and the rival\'s beside each; your posts in the month', () => {
    const h = hooksOf({ month: OCT, rival: 'Ottobock', playbook, posts: postsBlock({ owned: OSSUR_OWNED, typical: 3, month }), sentence: ['7 of your 15 posts', { figure: ' in October' }] })!
    expect(h.rival).toBe('Ottobock')
    expect(h.formats!.rows.map((r) => r.label)).toEqual(['Promotional', 'Story', 'Tutorial'])
    expect(h.formats!.rows.every((r) => r.multiple != null)).toBe(true)
    expect(h.formats!.rows.find((r) => r.label === 'Promotional')!.own).toBe(3)
    expect(h.formats!.rows.find((r) => r.label === 'Story')!.rival).toBe(4)
    expect(h.posts!.total).toBe(OSSUR_OWNED.total)
    expect(h.posts!.sentence).toBe('7 of your 15 posts in October')
    expect(h.posts!.best?.href).toMatch(/^\/dashboard\/content\/posts\?post=/)
    expect(h.basis).toBe(RESPONSE_BASIS)
    expect(hooksSection(h)!.sub).toBe('Videos published in October, by format and by how they open, as Content reads them: 1× is a typical video in your market.')
  })

  it('Content\'s own words for the response, and its multiples, one source', () => {
    const parts = worksBasis(10, 20, { month: OCT, complete: true })
    expect(parts.map((p) => (typeof p === 'string' ? p : p.figure)).join('')).toContain(RESPONSE_BASIS)
    for (const m of [0.6, 1, 1.25, 2.34]) expect(multipleText(m)).toBe(fmtMultiple(m))
  })

  it('no playbook, or nothing rated: no page', () => {
    expect(hooksOf({ month: OCT, rival: null, playbook: null, posts: null, sentence: null })).toBeNull()
    expect(hooksOf({ month: OCT, rival: null, playbook: buildPlaybook({ month: OCT, brand: 'Össur', rival: null, videos: [video('a', { classified_type: 'story', engagement_rate: 2 })], clientSide: 'owned' }), posts: null, sentence: null })).toBeNull()
  })
})

describe('Your moves: the advice waiting, the moves dated, the record', () => {
  it('a dated move as Your moves\' card reads it: its months, its one sentence, its verdict where it may print', () => {
    const reading = { month: OCT, label: null }
    const clinic = moveOf(MOVE_CARDS[0], reading)
    expect(clinic.status).toBe('Active')
    expect(clinic.slots.length).toBeGreaterThan(2)
    expect(clinic.sentence).toMatch(/^Share of market videos/)
    const socket = moveOf(MOVE_CARDS[2], reading)
    expect(socket.sentence).toBe('This subject is not measured yet: its line is drawn once its check has passed.')
    expect(socket.axis).toBeNull()
    expect(socket.verdict).toBeNull()
    expect(moveLine(socket)).toBe('Dated 20 Aug · Done · read on Fit & comfort')
  })

  it('folds the advice as Your moves does, by the compose step\'s vectors; with none it is drawn unmerged', () => {
    // The first two say the same thing; the rest are apart.
    const axis = (k: number) => [0, 0, 0, 0, 0].map((_x, j) => (j === k ? 1 : 0))
    const vectors = new Map(OSSUR_MOVES.pool.map((r, k) => [r.lineageId, axis(k < 2 ? 0 : k)]))
    const folded = movesSection(OSSUR_MOVES, vectors)!.moves!
    const flat = movesSection(OSSUR_MOVES, null)!.moves!
    expect(flat.waiting.length).toBe(4)
    expect(folded.waiting.length).toBe(3)
    expect(folded.waitingCount).toBe(3)
    expect(flat.waiting.every((a) => !a.title.startsWith('Create a guided'))).toBe(true)
    expect(recordLine(flat)).toBe('65 pieces of advice since 13 June: 1 decided, 4 waiting.')
    expect(adviceDetail(flat.waiting[0], OCT)).toBe('First raised 12 Oct · would move Where can I get one, 41 of 902 videos in October')
  })

  it('reads the record and the current advice from the ledger, the move that compares first', () => {
    const m = movesOf({
      month: OCT, monthLabel: null,
      rows: [
        { lineageId: 'a', title: 'A', why: null, status: 'new', inLatest: true, firstMade: '2026-07-01' },
        { lineageId: 'b', title: 'B', why: null, status: 'accepted', inLatest: false, firstMade: '2026-06-13' },
        { lineageId: 'c', title: 'C', why: null, status: 'new', inLatest: false, firstMade: '2026-08-01' },
      ],
      aims: new Map([['a', { label: 'Where can I get one', month: OCT, level: { k: 41, n: 902 } }]]),
      cards: MOVE_CARDS,
      adviceHref: (id) => `/dashboard/moves/advice/${id}`,
    })
    // Every Your moves address at the brief's month (its pages read `?month=`).
    expect(m.record).toEqual({ total: 3, decided: 1, since: '2026-06-13', href: '/dashboard/moves/advice?all=1&month=2026-10' })
    expect(m.pool.map((r) => r.href)).toEqual(['/dashboard/moves/advice/a?month=2026-10', '/dashboard/moves/advice/b?month=2026-10'])
    expect(m.moves.every((x) => x.href.endsWith('?month=2026-10'))).toBe(true)
    expect(movesSection(m, null)!.link).toEqual({ href: '/dashboard/moves?month=2026-10', text: 'Open Your moves →' })
    expect(withMonth('/dashboard/moves/m1?video=v#what-people-said', OCT)).toBe('/dashboard/moves/m1?video=v&month=2026-10#what-people-said')
    expect(m.pool.map((r) => r.lineageId)).toEqual(['a', 'b'])
    expect(m.pool[0].aim).toEqual({ label: 'Where can I get one', k: 41, n: 902, href: null })
    expect(m.moves[0].verdict != null || m.moves.every((x) => x.verdict == null)).toBe(true)
    expect(movesSection({ ...m, pool: [], moves: [] }, null)).toBeNull()
  })

  it('slots say why a month is empty, in a word or two', () => {
    expect(slotWords({ k: 31, n: 902, why: null })).toBe('31 of 902')
    expect(slotWords({ k: null, n: null, why: 'cut' })).toBe('Left off the line')
    expect(slotWords({ k: null, n: null, why: 'unread' })).toBe('No reading')
    expect(slotWords({ k: null, n: null, why: 'pending' })).toBe('Reads once ended')
  })
})

describe('Market: each subject in its own read', () => {
  it('the headline and the first sentence of what it means; a thin read\'s line; none, and the writer stands in', () => {
    expect(subjectWords({ id: 's', status: 'ready', headline: 'The socket decides', means: 'Questions return to the socket. They ask about socks too.', line: null })).toEqual({ headline: 'The socket decides', meaning: 'Questions return to the socket.' })
    expect(subjectWords({ id: 's', status: 'ready', headline: null, means: 'Only a meaning. More.', line: null })).toEqual({ headline: null, meaning: 'Only a meaning.' })
    expect(subjectWords({ id: 's', status: 'thin', headline: null, means: null, line: 'Little was said.' })).toEqual({ headline: null, meaning: 'Little was said.' })
    expect(subjectWords({ id: 's', status: 'ready', headline: null, means: null, line: null })).toBeNull()
    expect(subjectWords(undefined)).toBeNull()
  })
})

describe('every page links to its page in the app, with the month', () => {
  it('the header links: the surfaces\' own addresses', () => {
    expect(pageHref('in_short', OCT)).toBe(surface('home').href)
    expect(pageHref('leadership.groups', OCT)).toBe(`${surface('voices').href}?month=2026-10`)
    expect(pageHref('marketing.products', OCT)).toBe(`${surface('products').href}?month=2026-10`)
    expect(pageHref('content.watch', OCT)).toBe(surface('content').href)
    expect(pageHref('leadership.moves', OCT)).toBe(`${surface('moves').href}?month=2026-10`)
    expect(pageHref('leadership.holds', OCT)).toBe(`${surface('market').href}?period=month&month=2026-10#long-run`)
    expect(pageHref('sales.stops', OCT)).toBe(`${surface('market').href}?period=month&month=2026-10`)
    expect(voicesMonthHref(OCT)).toBe('/dashboard/voices?month=2026-10')
  })
})

describe('the pages each role reads from the app (`appSectionsFor`, the compose step\'s and --pages\')', () => {
  it('each role\'s, in the canvas\'s order; with no writer, a subject with no read of its own is held, never a bare name', () => {
    expect(appSectionsFor('leadership', { company: 'Össur', app: OSSUR_APP, subjects: null, vectors: null }).map((s) => s.key)).toEqual(['leadership.groups', 'leadership.moves'])
    expect(appSectionsFor('marketing', { company: 'Sealand', app: SEALAND_APP, subjects: null, vectors: null }).map((s) => s.key)).toEqual(['marketing.named'])
    expect(appSectionsFor('content', { company: 'Össur', app: null, subjects: null, vectors: null })).toEqual([])
    const subjects = OSSUR_SUBJECT_FACTS.map((f) => ({ id: f.id, fact: fact({ subjectId: f.subjectId, name: f.name, calibration: 'ready', level: { k: f.k, n: 902 }, rank: f.rank }) }))
    const r = subjectsSection({ month: OCT, subjects, reads: OSSUR_SUBJECT_READS.slice(0, 4), sentenceOf: () => '', voiceOf: () => null, panel: {} })
    expect(r.section!.groups[0].items.map((i) => i.title)).toEqual(['Community & encouragement', 'Function & movement', 'Cost & access', 'Fit & comfort'])
    expect(r.held.map((h) => h.what)).toEqual(['subject: Look & style', 'subject: Choosing the right device'])
    // U6: a subject whose check is open is never on the page.
    const open = subjectsSection({ month: OCT, subjects: subjects.map((s) => ({ ...s, fact: { ...s.fact, calibration: 'provisional' as const } })), reads: OSSUR_SUBJECT_READS, sentenceOf: () => 'x', voiceOf: () => null, panel: {} })
    expect(open.section).toBeNull()
  })
})

describe('a piece of advice is named by `adviceTitle`, as everywhere', () => {
  it('a blank stored title takes its body\'s first clause', () => {
    const m = movesOf({
      month: OCT, monthLabel: null,
      rows: [{ lineageId: 'a', title: '', why: 'Daily wear issues such as socket pain, sweat and skin irritation need one clear answer page, written with owners.', status: 'new', inLatest: true, firstMade: '2026-10-12' }],
      aims: new Map(), cards: [], adviceHref: (id) => `/dashboard/moves/advice/${id}`,
    })
    expect(m.pool[0].title).toBe(adviceTitle('', m.pool[0].why))
    expect(m.pool[0].title).not.toBe('')
  })
})
