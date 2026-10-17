import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract, copyViolations } from '@/lib/test/copy-contract'
import { fixtureId, fixtureSubjectId, marketConversationFixture } from '@/lib/pages/v2/market-fixture'
import type { MarketData } from '@/lib/pages/v2/market'
import { BACK_TO_MARKET, CONVERSATION_MISSING, MarketConversationPage } from './pages'
import { ConversationPageBody } from './conversation-page'

// A CONVERSATION'S PAGE (depth as pages, 17 Oct; F2-Market-Conversation): E2's
// conversation panel, whole, as a page, from the page fixture through the
// panel's own builders (`loadConvPanel`'s shape: `panelStats`, `ourReadOf`,
// `lineBars`, `doingOf`, `groupsOf`, `platformRows`, the quote gate), under
// its breadcrumb. Quotes live here (level 2), never on the top layer.

const LINER = marketConversationFixture(1)
const FLAG = marketConversationFixture(3)
const page = (d: MarketData) => <MarketConversationPage data={d} />
const body = (d: MarketData) => <ConversationPageBody page={d.convPage!} data={d} />

describe('a conversation under its ready subject, this week', () => {
  const text = renderText(page(LINER))
  const html = render(page(LINER))

  it('its bar: "Market / Fit & comfort / How long a liner lasts", the week beside its month', () => {
    expect(text).toMatch(/^Fit & comfort Market \/ Fit & comfort \/ How long a liner lasts This week This month Over time 5 to 11 October · in 23 of 226 category videos this week · 35 of 300 in October so far/)
    expect(html).toContain(`href="/dashboard/market/subjects/${fixtureSubjectId('fit')}"`)
    expect(html).toContain(`href="/dashboard/market/conversations/${fixtureId(1)}?period=month"`)
  })

  it('E2\'s anatomy: its subject, its name, the stats with their n, our read, week by week and month by month', () => {
    expect(renderText(body(LINER))).toMatch(/^Fit & comfort How long a liner lasts 23 of 226 category videos this week 35 of 300 category videos in October so far 19 of 780 category videos in September Our read People share how long their liners last/)
    expect(text).toContain('Week by week · videos 9 14 23 21 Sep 28 Sep 5 Oct Month by month · share of the category’s videos 2% July 9 of 455')
  })

  it('three stats leave no hole: two to a row under 1280, the third the row\'s width (the fresh check, 17 Oct)', () => {
    const row = (d: MarketData) => render(body(d)).match(/<div class="grid grid-cols-2 gap-3 [^"]*">/)?.[0] ?? ''
    expect(row(LINER)).toContain('xl:grid-cols-3')
    expect(row(LINER)).toContain('max-xl:[&amp;&gt;*:last-child]:col-span-2')
    // Four (a flag's baseline among them) fill two rows of two.
    expect(row(FLAG)).not.toContain('col-span-2')
  })

  it('who it is about, what people did, who is saying it, where, each "of N"', () => {
    expect(text).toContain('Who it’s about Össur 4 · others 19 What people did · of 35 in October so far Complained about something 14 Asked a question 9 Pushed back 4 Who’s saying it Long-time users upgrading New amputees in their first year Each opens in Voices Where · of 23 this week TikTok 14 Instagram 5 YouTube 4')
  })

  it('three comments at level 2, as quote nodes, with who the video is filed under; the Agent', () => {
    expect(html.match(/data-copy="quote"/g)).toHaveLength(3)
    expect(text).toContain('“This liner gave me a rash after a week.” TikTok · 6 Oct Össur Ask the Agent about this')
  })

  it('keeps the copy contract', () => {
    assertCopyContract(page(LINER))
  })
})

describe('the flagged conversation', () => {
  it('carries the check\'s chip and its baseline among the stats; our read is the week read\'s finding, stored prose', () => {
    const text = renderText(body(FLAG))
    expect(text).toMatch(/^Cost & access Unusual this week Insurance refusals for powered knees 19 of 226 category videos this week 31 of 300 category videos in October so far 19 of 780 category videos in September 39 of 1,906 videos in July to September, every audience together, your own posts included Our read People describe appeals/)
    const html = render(body(FLAG))
    expect(html).toContain('data-flag="unusual"')
    expect(html).toContain('data-copy="stored" data-slot="week_read"')
    // What it means, the read's last line, is the quieter one.
    expect(html).toMatch(/data-slot="week_read" class="[^"]*text-secondary-foreground">Access, not the knee itself/)
    assertCopyContract(page(FLAG))
  })

  it('a description standing in for our read is Pass B\'s, in its slot', () => {
    const d = LINER
    const desc = { ...d.convPage!, panel: { ...d.convPage!.panel, ourRead: { slot: 'pass_b_theme' as const, lines: [{ body: 'A 16-inch liner.', figures: {} }] } } }
    expect(copyViolations(<ConversationPageBody page={desc} data={d} />)).toEqual([])
  })
})

describe('every state keeps its frame', () => {
  it('this month: no week stat and no week by week; its month', () => {
    const d = marketConversationFixture(1, { period: 'month' })
    const text = renderText(page(d))
    expect(text).toMatch(/^Fit & comfort Market \/ Fit & comfort \/ How long a liner lasts This week This month Over time October so far · in 35 of 300 category videos/)
    expect(text).not.toContain('Week by week')
    expect(text).not.toContain('this week')
    assertCopyContract(page(d))
  })

  it('with no ready subject: "Market / {conversation}"; brands not counted says so in its place', () => {
    const d = marketConversationFixture(1, { flagged: false, noNew: true, subjects: 'provisional', brands: 'not_counted', weeks: 'insufficient', noGroups: true })
    const text = renderText(page(d))
    expect(text).toMatch(/^Market Market \/ How long a liner lasts /)
    expect(text).toContain('Who it’s about Brands are not counted for this workspace yet.')
    assertCopyContract(page(d))
  })

  it('a conversation first heard this week carries "New", the reader flag in a verdict node', () => {
    const d = marketConversationFixture(11)
    expect(render(body(d))).toContain('data-flag="new"')
  })

  it('an id Market cannot name: one calm line, and the way back', () => {
    const d = { ...LINER, convPage: null, missing: true }
    expect(renderText(page(d))).toBe(`Market ${CONVERSATION_MISSING} ${BACK_TO_MARKET} →`)
  })
})
