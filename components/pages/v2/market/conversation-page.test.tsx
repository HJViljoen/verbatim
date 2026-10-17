import { describe, expect, it } from 'vitest'
import { markupText, render, renderText } from '@/lib/test/render'
import { assertCopyContract, copyNodes, copyViolations } from '@/lib/test/copy-contract'
import { CONV_SPANISH, fixtureId, fixtureSubjectId, marketConversationFixture } from '@/lib/pages/v2/market-fixture'
import { noGroupSaying, type MarketData } from '@/lib/pages/v2/market'
import { BACK_TO_MARKET, CONVERSATION_MISSING, MarketConversationPage } from './pages'
import { ConversationPageBody, CONV_NONE_QUOTABLE, CONV_SAID_IN_VIDEO, CONV_VIDEOS_UNREAD, notQuoted } from './conversation-page'

// A CONVERSATION'S PAGE, THE EVIDENCE (F3-Market-Conversation, 17 Oct): the
// header on the page (the title block, the one-line read, the week's chip
// only where flagged), what people said under each of its videos, the facts
// small beside them, its siblings and the Agent; from the page fixture
// through the page's own builders (`convEvidenceOf`, `convSiblingsOf`,
// `convGroupsOf`), against the copy contract and decision 1.

const LINER = marketConversationFixture(1)
const FLAG = marketConversationFixture(3)
const page = (d: MarketData) => <MarketConversationPage data={d} />
const body = (d: MarketData) => <ConversationPageBody page={d.convPage!} data={d} />
const cards = (html: string): string[] => html.match(/<article id="video-[^"]*" data-video-card=""[\s\S]*?<\/article>/g) ?? []

describe('a conversation under its ready subject, this week', () => {
  const text = renderText(page(LINER))
  const html = render(page(LINER))

  it('the path, then the title block: "Conversation in Fit & comfort", the counts in the meta line, the period switch', () => {
    expect(text).toMatch(/^Market \/ Fit & comfort \/ How long a liner lasts Fit & comfort Conversation in Fit & comfort How long a liner lasts 5 to 11 October · 23 of 226 category videos this week · 35 of 300 in October so far This week This month Over time/)
    expect(html).toContain(`href="/dashboard/market/subjects/${fixtureSubjectId('fit')}"`)
    expect(html).toContain(`href="/dashboard/market/conversations/${fixtureId(1)}?period=month"`)
  })

  it('the header on the page: its one-line read as the lead, no chip where the check flagged nothing, a hairline under; no tile row', () => {
    const lead = html.match(/<div data-conv-lead=""[\s\S]*?<\/div>/)![0]
    expect(lead).toMatch(/class="[^"]*border-b border-border[^"]*"><p data-copy="stored" data-slot="pass_b_theme" class="[^"]*text-\[21px\][^"]*">People share how long their liners last before they lose grip, and when to replace one\.<\/p><\/div>/)
    expect(html).not.toContain('data-flag=')
    expect(html).not.toContain('bg-inner px-4 pt-4')
  })

  it('what people said: five videos, most comments about it first, each with three of its comments, "Show all", the link out', () => {
    expect(text).toContain('What people said 23 videos this week, most comments about it first @stepbystep.amp TikTok · posted 3 Oct Össur Three signs your liner is done')
    const all = cards(html)
    expect(all).toHaveLength(5)
    expect(markupText(all[0])).toBe('@stepbystep.amp TikTok · posted 3 Oct Össur Three signs your liner is done, and what my clinic never told me about replacing it 14 comments about this, of 212 on the video Watch the video ↗ “This liner gave me a rash after a week and I had to go back to my old one.” 5 Oct “Mine lasted eight months before it started slipping. Is that normal?” 6 Oct “Nobody at my fitting said anything about replacing the liner.” 7 Oct Show all 14 comments')
    expect(all.map((c) => c.match(/<b class="[^"]*">(\d+)<\/b>/)?.[1])).toEqual(['14', '11', '9', '6', '5'])
    expect(all[0]).toMatch(/<a href="https:\/\/example.com\/v\/1-1" target="_blank" rel="noopener noreferrer"[^>]*>Watch the video ↗<\/a>/)
    expect(all[0]).toContain(`?video=${LINER.convPage!.evidence!.videos[0].id}#video-${LINER.convPage!.evidence!.videos[0].id}`)
    // Each comment a quote node, its date only (the platform is on the video).
    expect(all[0].match(/data-copy="quote"/g)).toHaveLength(3)
    expect(all[0]).toMatch(/<span data-copy="level"><b[^>]*>14<\/b> comments about this, of 212 on the video<\/span>/)
  })

  it('a comment in another language prints with its English, stamped a machine translation', () => {
    // The gate ranks an English original first, so the Spanish comment is in
    // its video's full list (it prints third of nine on the board's own).
    const open = renderText(page(marketConversationFixture(1, { convVideo: 3 })))
    expect(open).toContain(`“${CONV_SPANISH.text}” Spanish · machine translation ${CONV_SPANISH.english} 8 Oct`)
  })

  it('who the video is about only where counted: the client\'s chip on its videos, none on the market\'s', () => {
    const all = cards(html)
    expect(all.map((c) => (c.includes('data-who-chip="you"') ? 'you' : null))).toEqual(['you', null, null, 'you', null])
  })

  it('"Show more videos · 18 more" from 640, "· 20 more" on a phone (three there), both an address', () => {
    expect(html).toMatch(new RegExp(`<a class="[^"]*self-start max-sm:hidden" href="/dashboard/market/conversations/${fixtureId(1)}\\?videos=all#what-people-said">Show more videos · <span data-copy="figure">18</span>\u00a0more</a>`))
    expect(html).toMatch(/self-stretch sm:hidden" href="[^"]*">Show more videos · <span data-copy="figure">20<\/span>\u00a0more<\/a>/)
  })

  it('the facts, small, on the page: week by week, who it\'s about, what people did, who\'s saying it and where, each of the week\'s 23', () => {
    expect(text).toContain('The facts Week by week · videos 9 14 23 21 Sep 28 Sep 5 Oct 23 this week · 35 in October so far Who it’s about Össur 4 · others 19 What people did · of 23 Complained about something 14 Asked a question 9 Pushed back 4 Who’s saying it · of 23 New amputees in their first year 15 of 23 Long-time users upgrading 5 of 23 Each opens in Voices Where · of 23 TikTok 14 Instagram 5 YouTube 4')
    expect(html).toContain('href="/dashboard/voices?group=new-amputees#group-panel"')
    // No month chart and no tile row.
    expect(text).not.toContain('Month by month')
  })

  it('other conversations in its subject, with their week beside their month, and the whole subject', () => {
    expect(text).toContain('Other conversations in Fit & comfort Fit & comfort, the whole subject → Sweat under the liner 21 this week · 30 in October so far Socket fit changing over time 14 this week · 20 in October so far Liner smell and cleaning 5 this week · 5 in October so far')
    expect(html.match(/data-sibling=""/g)).toHaveLength(3)
    expect(html).toContain(`href="/dashboard/market/subjects/${fixtureSubjectId('fit')}"`)
  })

  it('the Agent: about these videos and what people said under them', () => {
    expect(text).toContain('Ask about these videos and what people said under them, in your own words. Ask the Agent about this')
  })

  it('no quotes outside the videos\' own cards, and the copy contract', () => {
    const quotes = copyNodes(html).filter((n) => n.kind === 'quote')
    expect(quotes.length).toBe(cards(html).reduce((s, c) => s + (c.match(/data-copy="quote"/g)?.length ?? 0), 0))
    assertCopyContract(page(LINER))
    expect(text).not.toMatch(/[–—]/)
  })
})

describe('on a phone (F3-Market-Conversation-Phone)', () => {
  const html = render(page(LINER))

  it('three videos with two comments each; the rest hidden there, and every list still opens', () => {
    const all = cards(html)
    expect(all.filter((c) => /^<article[^>]*class="[^"]*max-sm:hidden/.test(c))).toHaveLength(2)
    expect(all[0].match(/data-video-comment="" class="[^"]*max-sm:hidden"/g)).toHaveLength(1)
  })

  it('the facts become a card; the siblings a two-line list with the whole subject under it', () => {
    expect(html).toMatch(/<aside aria-labelledby="facts-title" class="[^"]*max-sm:rounded-\[14px\] max-sm:bg-card/)
    expect(markupText(html.match(/<section aria-label="Other conversations in Fit &amp; comfort"[\s\S]*?<\/section>/)![0])).toBe('Other conversations in Fit & comfort This week, then October so far Sweat under the liner 21 30 in October so far Socket fit changing over time 14 20 in October so far Liner smell and cleaning 5 5 in October so far Fit & comfort, the whole subject →')
  })
})

describe('the flagged conversation', () => {
  it('carries the check\'s chip under its lead, and nowhere else', () => {
    const html = render(body(FLAG))
    expect(html.match(/data-flag="unusual"/g)).toHaveLength(1)
    expect(html).toMatch(/<div data-conv-lead=""[\s\S]*?data-flag="unusual"/)
    assertCopyContract(page(FLAG))
  })

  it('a conversation first heard this week earns no chip here: the week\'s one chip is the check\'s (decision 1)', () => {
    expect(render(body(marketConversationFixture(11)))).not.toContain('data-flag=')
  })
})

describe('the params: a video\'s list opened, every video listed', () => {
  it('?video= opens that video\'s every printable comment, closing again by its own link; nothing past the edge of the period', () => {
    const d = marketConversationFixture(1, { convVideo: 1 })
    const open = cards(render(page(d)))[0]
    expect(open.match(/data-copy="quote"/g)).toHaveLength(14)
    expect(open).not.toMatch(/data-video-comment="" class="[^"]*max-sm:hidden"/)
    expect(open).toMatch(new RegExp(`href="/dashboard/market/conversations/${fixtureId(1)}">Show fewer comments</a>`))
  })

  it('opened, where fewer may print than are counted: the rest are said to be counted, not quoted', () => {
    const d = marketConversationFixture(1, { convVideo: 7 })
    const v = d.convPage!.evidence!.videos.find((x) => x.open)!
    expect(v.aboutCount).toBeGreaterThan(v.quotable)
    expect(renderText(body(d))).toContain(notQuoted(v.aboutCount - v.quotable))
  })

  it('?videos=all lists every one (and none is hidden on a phone); no "Show more"', () => {
    const d = marketConversationFixture(1, { convVideos: 'all' })
    const html = render(page(d))
    expect(cards(html)).toHaveLength(23)
    expect(cards(html).some((c) => /^<article[^>]*max-sm:hidden/.test(c))).toBe(false)
    expect(html).not.toContain('Show more videos')
  })
})

describe('every state keeps its frame', () => {
  it('this month: its month in the meta and the facts, no week by week', () => {
    const d = marketConversationFixture(1, { period: 'month' })
    const text = renderText(page(d))
    expect(text).toMatch(/^Market \/ Fit & comfort \/ How long a liner lasts Fit & comfort Conversation in Fit & comfort How long a liner lasts October so far · 35 of 300 category videos This week/)
    expect(text).toContain('What people said 35 videos in October so far, most comments about it first')
    expect(text).toContain('Who’s saying it · of 35 New amputees in their first year 23 of 35 Long-time users upgrading 7 of 35 Each opens in Voices')
    expect(text).toContain('Other conversations in Fit & comfort Fit & comfort, the whole subject → Sweat under the liner 30 in October so far')
    expect(text).not.toContain('Week by week')
    expect(text).not.toContain('this week')
    assertCopyContract(page(d))
  })

  it('with no ready subject: "Conversation", "Market / {conversation}", its siblings the week\'s biggest; brands not counted says so in its place', () => {
    const d = marketConversationFixture(1, { flagged: false, noNew: true, subjects: 'provisional', brands: 'not_counted', weeks: 'insufficient', noGroups: true })
    const text = renderText(page(d))
    expect(text).toMatch(/^Market \/ How long a liner lasts Market Conversation How long a liner lasts /)
    expect(text).toContain('Who it’s about Brands are not counted for this workspace yet.')
    expect(text).toContain('Other conversations this week Sweat under the liner 21 this week · 30 in October so far Insurance refusals for powered knees 19 this week · 31 in October so far')
    expect(render(page(d)).match(/data-sibling=""/g)).toHaveLength(8)
    expect(render(page(d))).not.toContain('data-who-chip')
    assertCopyContract(page(d))
  })

  it('its videos could not be read: the section\'s frame and one line, never an empty list', () => {
    const d = marketConversationFixture(1, { convEvidence: 'unread' })
    const html = render(body(d))
    expect(html).toContain('data-said-gap="unread"')
    expect(renderText(body(d))).toContain(`What people said ${CONV_VIDEOS_UNREAD} The facts`)
  })

  it('no video in the period: the section\'s frame and one line', () => {
    const d = marketConversationFixture(1, { convEvidence: 'none' })
    expect(renderText(body(d))).toContain('What people said No video in it this week. The facts')
  })

  it('a video said on camera with no comment about it, and one whose comments none can print, each say so in their frame', () => {
    const d = LINER
    const ev = d.convPage!.evidence!
    const [first, ...rest] = ev.videos
    const oncam = { ...first, aboutCount: 0, quotes: [], quotable: 0 }
    const unquotable = { ...rest[0], quotes: [], quotable: 0 }
    const page2 = { ...d.convPage!, evidence: { ...ev, videos: [oncam, unquotable] } }
    const text = renderText(<ConversationPageBody page={page2} data={d} />)
    expect(text).toContain(CONV_SAID_IN_VIDEO)
    expect(text).toContain(CONV_NONE_QUOTABLE)
    expect(copyViolations(<ConversationPageBody page={page2} data={d} />)).toEqual([])
  })

  it('groups that could not be counted: Pass E\'s names, no count and no base; none counted says so in the period\'s words', () => {
    const names = { ...LINER.convPage!, panel: { ...LINER.convPage!.panel, groupBase: null, groups: LINER.convPage!.panel.groups.map(({ videos: _v, ...g }) => g) } }
    expect(renderText(<ConversationPageBody page={names} data={LINER} />)).toContain('Who’s saying it New amputees in their first year Long-time users upgrading Each opens in Voices Where')
    const none = { ...LINER.convPage!, panel: { ...LINER.convPage!.panel, groups: [] } }
    expect(renderText(<ConversationPageBody page={none} data={LINER} />)).toContain('Who’s saying it · of 23 This week, no video in it has a comment from one of the groups in Voices. Where')
    expect(noGroupSaying('in October so far')).toBe('In October so far, no video in it has a comment from one of the groups in Voices.')
    assertCopyContract(<ConversationPageBody page={names} data={LINER} />)
  })

  it('no sibling in its subject this week: the section says so', () => {
    const lone = { ...LINER.convPage!, siblings: { ...LINER.convPage!.siblings!, items: [] } }
    expect(renderText(<ConversationPageBody page={lone} data={LINER} />)).toContain('No other conversation in Fit & comfort this week.')
  })

  it('an id Market cannot name: one calm line, and the way back', () => {
    const d = { ...LINER, convPage: null, missing: true }
    expect(renderText(page(d))).toBe(`Market ${CONVERSATION_MISSING} ${BACK_TO_MARKET} →`)
  })
})
