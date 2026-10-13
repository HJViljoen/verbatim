import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract, copyNodes, copyViolations } from '@/lib/test/copy-contract'
import { fixtureId, marketFixture, FIXTURE_WEEKS } from '@/lib/pages/v2/market-fixture'
import type { MarketData } from '@/lib/pages/v2/market'
import { MarketPage, MARKET_FIRST_RUN } from './index'
import { ConversationPanel, SubjectPanelView } from './panel'
import { KindsCard, PlatformsCard, RailView, WatchCard, WeeksCard } from './rail'
import { SubjectBoardView } from './subjects'
import { ConversationTable } from './table'
import { TopRowView } from './top'
import { MarketSkeleton } from './skeleton'

// MARKET'S RENDER TIER (depth v2, T3): every block, from the fixture, against
// the copy contract (every number a figure or level, every level "of N", no
// direction word outside a verdict node, stored prose with its slot, quotes as
// quote nodes), plus the v2 rules Heinrich set: no quotes at level 1, no model
// sentence at the top, the board's weekly words not printed (decision 1).

const WEEK = marketFixture()
const QUIET = marketFixture({ flagged: false })
const OPEN = marketFixture({ open: { n: 3, at: 'top' } })
const TABLE_OPEN = marketFixture({ open: { n: 5, at: 'table' } })
const SUBJECT = marketFixture({ subject: 'cost' })
const MONTH = marketFixture({ period: 'month' })
const TIME = marketFixture({ period: 'time' })

/** The board words decision 1 retired. */
const RETIRED = /Rising|\busual\b|3×|▲ up\b|busy week|normal range|Against usual/

const quotesOutsidePanel = (data: MarketData): number => {
  const html = render(<MarketPage data={data} />)
  const panelAt = html.indexOf('data-panel=""')
  const outside = panelAt >= 0 ? html.slice(0, panelAt) + html.slice(html.indexOf('</section>', panelAt)) : html
  return (outside.match(/data-copy="quote"/g) ?? []).length
}

describe('MarketPage', () => {
  it.each([
    ['week, flagged', WEEK], ['week, quiet', QUIET], ['a conversation open', OPEN], ['a table row open', TABLE_OPEN],
    ['a subject open', SUBJECT], ['the month', MONTH], ['over time', TIME],
  ])('%s keeps the copy contract', (_label, data) => {
    expect(copyViolations(<MarketPage data={data} />)).toEqual([])
  })

  it.each([['week', WEEK], ['quiet', QUIET], ['open', OPEN], ['month', MONTH], ['time', TIME]])('%s prints none of the board\'s weekly direction words', (_l, data) => {
    expect(renderText(<MarketPage data={data} />)).not.toMatch(RETIRED)
  })

  it('opens on the week, its dates and the market beside the month, the period switch at the right', () => {
    const html = render(<MarketPage data={WEEK} />)
    const text = renderText(<MarketPage data={WEEK} />)
    expect(text).toMatch(/^Market This week This month Over time 5 to 11 Oct · 241 videos · 3,912 comments · 318 videos in October so far/)
    expect(html).toMatch(/<a (?=[^>]*href="\/dashboard\/market")(?=[^>]*aria-current="page")[^>]*>This week</)
    expect(html).toContain('href="/dashboard/market?period=month"')
  })

  it('prints no quote and no model sentence above the open panel (level 1)', () => {
    expect(quotesOutsidePanel(WEEK)).toBe(0)
    expect(quotesOutsidePanel(OPEN)).toBe(0)
    const top = render(<TopRowView data={WEEK} />)
    expect(copyNodes(top).filter((n) => n.kind === 'stored' || n.kind === 'quote' || n.kind === 'prose')).toEqual([])
  })

  it('draws the first run as one calm line', () => {
    expect(renderText(<MarketPage data={null} />)).toBe(`Market ${MARKET_FIRST_RUN}`)
  })

  it('says why the month shows when the week has no read yet', () => {
    expect(renderText(<MarketPage data={{ ...MONTH, weekUnavailable: true }} />)).toContain('This week’s read is not ready yet · October so far')
  })
})

describe('TopRowView', () => {
  it('leads with the flag: the chip and never an eyebrow beside it, the flag\'s own k of n, its baseline, the month', () => {
    const text = renderText(<TopRowView data={WEEK} />)
    expect(text).toMatch(/^Unusual this week Insurance refusals for powered knees 19 of 252 videos this week, every audience together, your own posts included 39 of 1,906 in July to September, the same base 31 of 300 category videos in October so far/)
    expect(text.match(/Unusual this week/g)).toHaveLength(1)
    const html = render(<TopRowView data={WEEK} />)
    expect(html).toMatch(/data-copy="verdict" data-flag="unusual"/)
    expect(text).toContain('Who’s saying it Long-time users upgrading , Caregivers and family')
    expect(text).toContain('What they’re doing Complained about something · 14 of 31 in October so far')
    assertCopyContract(<TopRowView data={WEEK} />)
  })

  it('beside it, the week\'s biggest as three bare counts and the rest of the new', () => {
    const text = renderText(<TopRowView data={WEEK} />)
    expect(text).toContain('Three weeks How long a liner lasts 23 of 226 category videos this week 35 of 300 in October so far 9 14 23 21 Sep 28 Sep 5 Oct')
    expect(text).toContain('New this week Waterproof knees 8 of 226 category videos this week 8 of 300 in October so far Also new this week Liner smell and cleaning 5 this week · 5 of 300 in October so far')
  })

  it('draws a week our own change cut as a gap, never a printed 0', () => {
    const cut = { ...WEEK, top: { ...WEEK.top, sides: WEEK.top.sides.map((s) => (s.kind === 'biggest' ? { ...s, convs: s.convs.map((c) => ({ ...c, weeks: [null, 14, 23] })) } : s)) } }
    const side = render(<TopRowView data={cut} />)
    const three = side.slice(side.indexOf('Three weeks'))
    expect(three).toContain('21 Sep not read')
    expect(renderText(<TopRowView data={cut} />)).toContain('Three weeks How long a liner lasts 23 of 226 category videos this week 35 of 300 in October so far 14 23 21 Sep 28 Sep 5 Oct')
  })

  it('with no flag, the biggest new conversation leads, "New this week" earned in a verdict node', () => {
    const html = render(<TopRowView data={QUIET} />)
    expect(renderText(<TopRowView data={QUIET} />)).toMatch(/^New this week Waterproof knees 8 of 226 category videos this week 8 of 300 in October so far/)
    expect(html).toMatch(/<span data-copy="verdict">New this week<\/span>/)
    assertCopyContract(<TopRowView data={QUIET} />)
  })

  it('rings the card whose panel is open, and turns its link to Close', () => {
    const html = render(<TopRowView data={OPEN} />)
    expect(html).toMatch(/id="top-0" style="order:0" class="[^"]*ring-2 ring-foreground/)
    expect(renderText(<TopRowView data={OPEN} />)).toContain('Close ↑')
  })

  it('draws the open panel under the card it was opened from, at every width (T9)', () => {
    const html = render(<TopRowView data={OPEN} panel={(n) => (OPEN.panel ? <ConversationPanel panel={OPEN.panel} data={OPEN} notchAt={n} /> : null)} />)
    // In the markup right after the hero, before the cards beside it.
    const hero = html.indexOf('id="top-0"')
    const slot = html.indexOf('data-panel-slot')
    expect(slot).toBeGreaterThan(hero)
    expect(slot).toBeLessThan(html.indexOf('id="top-1"'))
    // Under the hero on a phone and from 768 (it is the row's width); under
    // the 6 · 3 · 3 row from 1280.
    expect(html).toContain('--panel-o-base:1;--panel-o-sm:1;--panel-o-md:1;--panel-o-lg:1;--panel-o-w1180:1;--panel-o-xl:5')
    expect(html).toContain('--notch-base:50%;--notch-sm:50%;--notch-md:50%;--notch-lg:50%;--notch-w1180:50%;--notch-xl:25%')
    expect(html.match(/id="conv-panel"/g)).toHaveLength(1)
  })

  it('with nothing flagged and nothing new, the week\'s most talked about leads, headed plainly', () => {
    const plain = marketFixture({ flagged: false, noNew: true })
    const text = renderText(<TopRowView data={plain} />)
    expect(text).toMatch(/^Most talked about this week How long a liner lasts 23 of 226 category videos this week 35 of 300 in October so far/)
    assertCopyContract(<TopRowView data={plain} />)
  })

  it('the month leads with its three biggest and their month bars, each "k of n"', () => {
    const text = renderText(<TopRowView data={MONTH} />)
    expect(text).toMatch(/^Most talked about in October so far How long a liner lasts 35 of 300 category videos in October so far/)
    expect(text).toContain('Month by month Insurance refusals for powered knees 31 of 300 category videos')
    expect(text).toContain('Jul 16 of 455')
    assertCopyContract(<TopRowView data={MONTH} />)
  })

  it('over time draws the market\'s months', () => {
    expect(renderText(<TopRowView data={TIME} />)).toContain('Your market, month by month')
    assertCopyContract(<TopRowView data={TIME} />)
  })

  it('draws nothing with nothing to lead with', () => {
    expect(render(<TopRowView data={{ ...WEEK, top: { hero: null, sides: [], months: null } }} />)).toBe('')
  })
})

describe('SubjectBoardView', () => {
  const board = WEEK.subjects!
  it('states the month and the month before once, each subject a level against last month', () => {
    const text = renderText(<SubjectBoardView board={board} data={WEEK} />)
    expect(text).toMatch(/^What the market is talking about Your subjects, as a share of October so far’s 318 videos\. The black tick is September\./)
    expect(text).toContain('Cost & access 22% 70 of 318 ▲ 7 pts')
    expect(text).toContain('Fit & comfort 34% 108 of 318 no clear change')
    expect(text).toContain('Sport and running : counted in your market, marked provisional')
    assertCopyContract(<SubjectBoardView board={board} data={WEEK} />)
  })

  it('this week, each conversation\'s week count stands beside its month\'s', () => {
    const text = renderText(<SubjectBoardView board={board} data={WEEK} />)
    expect(text).toContain('Inside it Week Oct How long a liner lasts 23 35')
    expect(text).toContain('Insurance refusals for powered knees Unusual this week 19 31')
    expect(text).toContain('Waterproof knees New 8 8')
  })

  it('this month, the month\'s count alone', () => {
    const text = renderText(<SubjectBoardView board={MONTH.subjects!} data={MONTH} />)
    expect(text).toContain('Inside it How long a liner lasts 35 Sweat under the liner 30')
    expect(text).not.toContain('Week Oct')
  })

  it('draws the tick at last month and a month line where there are two readings', () => {
    const html = render(<SubjectBoardView board={board} data={WEEK} />)
    expect(html.match(/data-tick=""/g)?.length).toBe(6)
    expect(renderText(<SubjectBoardView board={board} data={WEEK} />)).toContain('6 months')
  })
})

describe('the rail', () => {
  it('prints the tick legend only where a tick is drawn', () => {
    const block = { ...WEEK.rail.kinds!, ticks: false, rows: WEEK.rail.kinds!.rows.map((r) => ({ ...r, prevPct: null })) }
    expect(renderText(<KindsCard block={block} />)).not.toMatch(/September$/)
    const board = { ...WEEK.subjects!, ticks: false }
    expect(renderText(<SubjectBoardView board={board} data={WEEK} />)).not.toContain('The black tick')
  })

  it('this week, each platform\'s week sits beside its month', () => {
    const block = { ...WEEK.rail.platforms!, month: { counts: { tiktok: 170, instagram: 98, youtube: 50 }, n: 318, text: 'in October so far' } }
    expect(renderText(<PlatformsCard block={block} data={WEEK} />)).toContain('This week October so far TikTok 128 170 of 318 Instagram 76 98 of 318 YouTube 37 50 of 318')
    assertCopyContract(<PlatformsCard block={block} data={WEEK} />)
  })

  it('kinds: the month so far against last month, a badge only where it moved', () => {
    const block = WEEK.rail.kinds!
    expect(renderText(<KindsCard block={block} />)).toMatch(/^What people do in the comments Share of October so far’s 318 videos where at least one comment did it Asked a question 45%/)
    expect(renderText(<KindsCard block={block} />)).toMatch(/October so far September$/)
    assertCopyContract(<KindsCard block={block} />)
  })

  it('weeks: the Dashboard\'s chart, or "Insufficient data"', () => {
    expect(renderText(<WeeksCard weeks={FIXTURE_WEEKS} />)).toContain('198 205 214 188 230 226 219 241')
    expect(renderText(<WeeksCard weeks={null} />)).toContain('Insufficient data')
    assertCopyContract(<WeeksCard weeks={FIXTURE_WEEKS} />)
  })

  it('platforms: the week\'s, or the month\'s', () => {
    expect(renderText(<PlatformsCard block={{ ...WEEK.rail.platforms!, month: null }} data={WEEK} />)).toBe('Where it’s said This week’s 241 videos, by platform TikTok 128 Instagram 76 YouTube 37')
    expect(renderText(<PlatformsCard block={MONTH.rail.platforms!} data={MONTH} />)).toContain('The 318 videos in October so far, by platform')
    assertCopyContract(<PlatformsCard block={WEEK.rail.platforms!} data={WEEK} />)
  })

  it('watch: the read\'s stored lines, slot week_read', () => {
    const html = render(<WatchCard lines={WEEK.rail.watch} />)
    expect(html).toContain('data-copy="stored" data-slot="week_read"')
    assertCopyContract(<WatchCard lines={WEEK.rail.watch} />)
    expect(render(<RailView data={MONTH} />)).not.toContain('Worth watching')
  })

  it('takes the row where there is no subject board', () => {
    expect(render(<RailView data={{ ...WEEK, subjects: null }} />)).toContain('xl:grid-cols-3')
  })
})

describe('ConversationTable', () => {
  it('this week: the week and the month, who it is about, subject filters, show all', () => {
    const text = renderText(<ConversationTable table={WEEK.table!} data={WEEK} />)
    expect(text).toMatch(/^Every conversation this week 17 conversations, biggest first, each counted in the category’s videos \( 226 this week\) All 17 Fit & comfort 4/)
    expect(text).toContain('Conversation Subject About This week October so far How long a liner lasts Fit & comfort Össur 4 · others 19 23 35')
    expect(text).toContain('Insurance refusals for powered knees Cost & access Össur 3 · Ottobock 5 · others 11 19 31')
    expect(text).toMatch(/Show all 17$/)
    expect(render(<ConversationTable table={WEEK.table!} data={WEEK} />)).toContain('href="/dashboard/market?all=1#conversations"')
    assertCopyContract(<ConversationTable table={WEEK.table!} data={WEEK} />)
  })

  it('marks a conversation set apart (makers\' own posts), which stays in the list', () => {
    const rows = WEEK.table!.rows.map((r, i) => (i === 0 ? { ...r, conv: { ...r.conv, setApart: 'makers' as const } } : r))
    const text = renderText(<ConversationTable table={{ ...WEEK.table!, rows }} data={WEEK} />)
    expect(text).toContain('How long a liner lasts mostly makers’ own posts Fit & comfort')
  })

  it('this month: the month against the month before, through the badge', () => {
    const text = renderText(<ConversationTable table={MONTH.table!} data={MONTH} />)
    expect(text).toContain('Videos Against September')
    assertCopyContract(<ConversationTable table={MONTH.table!} data={MONTH} />)
  })

  it('over time: the months as columns, each with its n', () => {
    const text = renderText(<ConversationTable table={TIME.table!} data={TIME} />)
    expect(text).toContain('Conversation Subject Jul of 455 Aug of 612 Sep of 780 Oct so far of 300 How long a liner lasts Fit & comfort 16 21 32 35')
    assertCopyContract(<ConversationTable table={TIME.table!} data={TIME} />)
  })

  it('opens a row in place, as the table\'s next row', () => {
    const html = render(<ConversationTable table={TABLE_OPEN.table!} data={TABLE_OPEN} />)
    expect(html).toMatch(new RegExp(`id="conv-${fixtureId(5)}"[^>]*>[\\s\\S]*?</tr><tr><td colSpan="5"|id="conv-${fixtureId(5)}"[\\s\\S]*?<td colspan="5"`, 'i'))
    expect(html).toContain('data-panel=""')
  })
})

describe('ConversationPanel', () => {
  const panel = OPEN.panel!
  it('the conversation in full: its tags, its stats with their n, our read, its months, who, what, where', () => {
    const text = renderText(<ConversationPanel panel={panel} data={OPEN} />)
    expect(text).toMatch(/^Cost & access Unusual this week Insurance refusals for powered knees Close 19 of 226 category videos this week 31 of 300 category videos in October so far 19 of 780 category videos in September 39 of 1,906 videos in July to September, every audience together, your own posts included Our read People describe appeals/)
    expect(text).toContain('Month by month · share of the category’s videos')
    expect(text).toContain('October so far · 31 of 300')
    expect(text).toContain('What people did · of 31 in October so far Complained about something 14')
    expect(text).toContain('Who’s saying it Long-time users upgrading Caregivers and family Each opens in Voices')
    expect(text).toContain('Where TikTok 12')
    expect(text).toContain('Ask the Agent about this')
    assertCopyContract(<ConversationPanel panel={panel} data={OPEN} />)
  })

  it('three quotes at level 2, as quote nodes, with who the video is filed under', () => {
    const html = render(<ConversationPanel panel={panel} data={OPEN} />)
    expect(html.match(/data-copy="quote"/g)).toHaveLength(3)
    expect(renderText(<ConversationPanel panel={panel} data={OPEN} />)).toContain('YouTube · 3 Oct Ottobock')
  })

  it('our read is stored prose with its slot', () => {
    expect(render(<ConversationPanel panel={panel} data={OPEN} />)).toContain('data-copy="stored" data-slot="week_read"')
    const desc = { ...panel, ourRead: { slot: 'pass_b_theme' as const, lines: [{ body: 'A 16-inch liner.', figures: {} }] } }
    expect(copyViolations(<ConversationPanel panel={desc} data={OPEN} />)).toEqual([])
  })

  it('points its notch at the clicked card and closes back to the row', () => {
    const html = render(<ConversationPanel panel={panel} data={OPEN} />)
    expect(html).toContain('calc(25% - 9px)')
    expect(html).toContain('href="/dashboard/market#top-row"')
  })
})

describe('brands not counted yet (Össur before its back-read)', () => {
  const NC = marketFixture({ brands: 'not_counted', open: { n: 3, at: 'top' } })
  it('prints no "about" split anywhere, and says once why', () => {
    const text = renderText(<MarketPage data={NC} />)
    expect(text).not.toContain('no brand named')
    expect(text).not.toMatch(/About Össur/)
    expect(text).toContain('Who the talk is about: Brands are not counted for this workspace yet.')
    expect(renderText(<ConversationPanel panel={NC.panel!} data={NC} />)).toContain('Who it’s about Brands are not counted for this workspace yet.')
    expect(renderText(<ConversationTable table={NC.table!} data={NC} />)).toContain('Conversation Subject This week October so far')
    assertCopyContract(<MarketPage data={NC} />)
  })
})

describe('SubjectPanelView', () => {
  it('a subject not measured yet says why and lists nothing', () => {
    const data = marketFixture({ subject: 'sport' })
    const text = renderText(<SubjectPanelView panel={data.subjectPanel!} data={data} />)
    expect(text).toContain('Sport and running Close Not measured yet: counted in your market, marked provisional.')
    expect(text).not.toContain('No conversation in it reached three videos')
    assertCopyContract(<SubjectPanelView panel={data.subjectPanel!} data={data} />)
  })

  it('the subject in full: its level, against last month, our read, its months and every conversation inside it', () => {
    const p = SUBJECT.subjectPanel!
    const text = renderText(<SubjectPanelView panel={p} data={SUBJECT} />)
    expect(text).toMatch(/^Subject Cost & access Close 70 of 318 videos in your market, October so far 22% of the market’s videos ▲ 7 pts Our read People ask how to get a knee paid for/)
    expect(text).toContain('Conversations inside it · this week, and October so far Insurance refusals for powered knees Unusual this week 19 31')
    assertCopyContract(<SubjectPanelView panel={p} data={SUBJECT} />)
  })
})

describe('MarketSkeleton', () => {
  it('says it is loading', () => {
    expect(render(<MarketSkeleton />)).toMatch(/role="status"/)
  })
})
