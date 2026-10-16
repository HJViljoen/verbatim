import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract, copyNodes, copyViolations } from '@/lib/test/copy-contract'
import { fixtureId, marketFixture, marketLongRowsFixture, marketThinFixture, FIXTURE_WEEKS } from '@/lib/pages/v2/market-fixture'
import { FAILED_EXPLAINED, SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import type { MarketData } from '@/lib/pages/v2/market'
import { MarketPage, MARKET_FIRST_RUN } from './index'
import { ConversationPanel, SubjectPanelView, SUBJECT_NONE_THIS_WEEK } from './panel'
import { KindsCard, KindsFrame, PlatformsCard, PlatformsFrame, RailView, WatchCard, WeeksCard, weeksLine, WEEKS_UNREAD } from './rail'
import { WEEKS_FAILED } from '@/lib/pages/home'
import { SubjectBoardView } from './subjects'
import { ConversationTable } from './table'
import { ALSO_TALKED, NO_GROUP, NOTHING_ELSE_NEW, NOTHING_NEW, TopRowView } from './top'
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
    // A complaint conversation: its lead card names the next kind, never
    // "Complained about something" over its own videos (Phase 4 fix round).
    expect(text).toContain('What they’re doing Asked a question · 9 of 31 in October so far')
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

  it('the lead card labels every week\'s bar, as the side card and the Dashboard\'s tile do', () => {
    const hero = QUIET.top.hero
    if (!hero || hero.kind === 'flag') throw new Error('expected a conversation lead')
    const html = render(<TopRowView data={QUIET} />)
    const card = html.slice(html.indexOf('id="top-0"'), html.indexOf('id="top-1"'))
    const counts = hero.conv.weeks.filter((w): w is number => w != null)
    expect(counts.length).toBe(3)
    // Both drawings (the half-card's and the phone's) print all three.
    for (const n of counts) expect(card.match(new RegExp(`>${n}<`, 'g'))?.length ?? 0, String(n)).toBeGreaterThanOrEqual(2)
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
    // A tracked subject is never hidden (14 Oct): the failed one has its own
    // row, its reason where the level goes, and what is inside it.
    expect(text).toContain('Sport and running Being re-described: a check found the subject catching comments about other things, so it shows no figure while we reword it. Inside it No conversation in it reached three videos this week.')
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

  it('draws one month\'s point on the axis\'s centre line, with no range repeating the level', () => {
    const one = marketFixture({ subjects: 'one_month' })
    const t = renderText(<SubjectBoardView board={one.subjects!} data={one} />)
    expect(t).toContain('Fit & comfort 34% 108 of 318 1 month Inside it')
    const html = render(<SubjectBoardView board={one.subjects!} data={one} />)
    expect(html).toContain('<line x1="0" y1="17" x2="160" y2="17"')
    expect(html).toContain('<circle cx="156" cy="17"')
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

  it('weeks: the Dashboard\'s chart, or "Insufficient data" for too few clean weeks, or the failure where the read failed', () => {
    expect(renderText(<WeeksCard weeks={FIXTURE_WEEKS} />)).toContain('198 205 214 188 230 226 219 241')
    expect(renderText(<WeeksCard weeks={null} />)).toContain('Insufficient data')
    expect(renderText(<WeeksCard weeks={null} />)).not.toContain(WEEKS_UNREAD)
    // Phase 4 fix round: a read that threw is a failure, never an absence.
    expect(renderText(<WeeksCard weeks={WEEKS_FAILED} />)).toContain(WEEKS_UNREAD)
    expect(renderText(<WeeksCard weeks={WEEKS_FAILED} />)).not.toContain('Insufficient data')
    assertCopyContract(<WeeksCard weeks={FIXTURE_WEEKS} />)
    assertCopyContract(<WeeksCard weeks={WEEKS_FAILED} />)
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

  // The parity pass (13 Oct): the rail never breaks out into a row of cards.
  it('stays a column beside the board, with no subject board too', () => {
    const html = render(<RailView data={{ ...WEEK, subjects: null }} />)
    expect(html).toMatch(/^<div class="col-span-12 flex min-w-0 flex-col gap-5 xl:col-span-4">/)
    expect(html).not.toContain('xl:grid-cols-3')
  })

  it('weeks: one set of words for the chart\'s line', () => {
    const c = (videos: number | null, settled = true) => ({ videos, settled })
    expect(weeksLine(null)).toBe('Insufficient data: only weeks read the same way are drawn.')
    expect(weeksLine([c(null), c(null)])).toBe('Insufficient data: only weeks read the same way are drawn.')
    expect(weeksLine([c(null), c(5)])).toBe('Only weeks read the same way are drawn.')
    expect(weeksLine([c(null), c(5, false)])).toBe('Only weeks read the same way are drawn; the newest are still filling.')
    expect(weeksLine([c(4), c(5, false)])).toBe('The newest weeks are still filling.')
    expect(weeksLine([c(4), c(5)])).toBeNull()
    expect(weeksLine(null, true)).toBe(WEEKS_UNREAD)
  })

  it('weeks: with no week to draw, the eight weeks\' axis with empty slots and one line', () => {
    const axis = FIXTURE_WEEKS.columns.map((c) => c.label)
    for (const weeks of [null, WEEKS_FAILED] as const) {
      const html = render(<WeeksCard weeks={weeks} axis={axis} />)
      expect(html.match(/data-slot-empty=""/g)).toHaveLength(8)
      expect(renderText(<WeeksCard weeks={weeks} axis={axis} />)).toMatch(/17 Aug 7 Sep 5 Oct/)
      assertCopyContract(<WeeksCard weeks={weeks} axis={axis} />)
    }
    // A drawn chart with a week our rules leave out: its slot, and why.
    const gap = { ...FIXTURE_WEEKS, columns: FIXTURE_WEEKS.columns.map((c, i) => (i < 2 ? { ...c, videos: null, comments: null } : c)) }
    expect(render(<WeeksCard weeks={gap} />).match(/data-slot-empty=""/g)).toHaveLength(2)
    expect(renderText(<WeeksCard weeks={gap} />)).toContain('Only weeks read the same way are drawn; the newest are still filling.')
  })

  it('kinds and platforms keep their cards with nothing read', () => {
    expect(renderText(<KindsFrame noun={null} monthText="October so far" />)).toBe('What people do in the comments Share of October so far’s videos where at least one comment did it Asked a question Praised it Complained about something Wished for something Said they want to buy Pushed back Not read for October so far yet.')
    expect(renderText(<PlatformsFrame data={WEEK} />)).toContain('Where it’s said This week’s videos, by platform No video counted by platform yet.')
    assertCopyContract(<KindsFrame noun="bags" monthText="October so far" />)
    assertCopyContract(<PlatformsFrame data={WEEK} />)
  })
})

describe('ConversationTable', () => {
  it('this week: the week and the month, who it is about, subject filters, show all', () => {
    const text = renderText(<ConversationTable table={WEEK.table!} data={WEEK} />)
    expect(text).toMatch(/^Every conversation this week 17 conversations, biggest first, each counted in the category’s videos \( 226 this week\) All 17 Fit & comfort 4/)
    // The month twice: under the week's figure for a phone, and in its own
    // column from 640 (each shown at its width only).
    expect(text).toContain('Conversation Subject About This week October so far How long a liner lasts Fit & comfort Össur 4 · others 19 23 35 in October so far 35')
    expect(text).toContain('Insurance refusals for powered knees Cost & access Össur 3 · Ottobock 5 · others 11 19 31 in October so far 31')
    expect(text).toMatch(/Show all 17$/)
    expect(render(<ConversationTable table={WEEK.table!} data={WEEK} />)).toContain('href="/dashboard/market?all=1#conversations"')
    assertCopyContract(<ConversationTable table={WEEK.table!} data={WEEK} />)
  })

  it('U6: filtered to a subject whose check is open, the table prints no total and Show all no number', () => {
    const held = { ...WEEK.table!, totalHeld: true }
    const text = renderText(<ConversationTable table={held} data={WEEK} />)
    expect(text).toMatch(/^Every conversation this week Conversations, biggest first/)
    expect(text).toMatch(/Show all$/)
    assertCopyContract(<ConversationTable table={held} data={WEEK} />)
  })

  // Phase 4 fix round: at 390 two figure columns beside a label did not fit
  // Sealand's table, and its own scroll cut "42" to "4" at the card's edge.
  // On a phone the month sits under the week's figure, in its cell (Content's
  // Also asked); the month column shows from 640. Checked at 390, 360 and 320
  // on the long-label fixture and Sealand's dump by scripts/pages-shots.ts.
  it('on a phone the month sits under the week, so no figure column is cut, with long labels and three-digit figures', () => {
    const d = marketLongRowsFixture()
    const html = render(<ConversationTable table={d.table!} data={d} />)
    expect(html).toMatch(/<th scope="col" class="[^"]*hidden text-right sm:table-cell">October so far<\/th>/)
    expect(html).toMatch(/>123<\/span><span class="block whitespace-nowrap[^"]*sm:hidden"><span data-copy="figure" class="font-mono">456<\/span> in October so far<\/span><\/td><td class="[^"]*hidden text-right[^"]*sm:table-cell"><span data-copy="figure">456<\/span>/)
    expect(renderText(<ConversationTable table={d.table!} data={d} />)).toContain('Whether the forty litre travel backpack really fits under the seat on budget airlines across Europe')
    assertCopyContract(<ConversationTable table={d.table!} data={d} />)
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
    // Once, in each block's own place: the lead card's About slot and the
    // table's About header (the parity pass: the column stays).
    expect(text).toContain('About · brands not counted yet Close ↑')
    expect(renderText(<ConversationPanel panel={NC.panel!} data={NC} />)).toContain('Who it’s about Brands are not counted for this workspace yet.')
    expect(renderText(<ConversationTable table={NC.table!} data={NC} />)).toContain('Conversation Subject About · brands not counted yet This week October so far')
    assertCopyContract(<MarketPage data={NC} />)
  })
})

describe('SubjectPanelView', () => {
  it('a subject being re-described says why and lists the conversations inside it, as an open one does (14 Oct)', () => {
    const data = marketFixture({ subject: 'sport' })
    const text = renderText(<SubjectPanelView panel={data.subjectPanel!} data={data} />)
    // Its reason is said once a page, in its row on the board above (14 Oct).
    expect(text).toContain(`Sport and running Close ${SUBJECT_NOT_MEASURED}.`)
    expect(text).not.toContain(FAILED_EXPLAINED)
    expect(text).toContain('Conversations inside it · this week, and October so far No conversation in it reached three videos.')
    expect(text).not.toMatch(/\d+ of \d+ videos in your market/)
    assertCopyContract(<SubjectPanelView panel={data.subjectPanel!} data={data} />)
  })

  it('a subject whose check is open says why and lists the conversations inside it', () => {
    const data = marketThinFixture({ subject: 'cost' })
    const text = renderText(<SubjectPanelView panel={data.subjectPanel!} data={data} />)
    expect(text).toContain(`Cost & access Close ${SUBJECT_NOT_MEASURED}.`)
    expect(text).toContain('Conversations inside it · this week, and October so far Insurance refusals for powered knees 19 31 Paying out of pocket 15 22 Medical aid and liners 9 12')
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

// THE PARITY PASS (13 Oct; Heinrich: "I want the site to look like what we
// designed"): Össur's thin state today keeps E2-Market's shape. No flag,
// nothing new, every subject's check open, brands not counted yet, too few
// clean weeks: the same three cards, a row per subject, the rail a column
// beside the board, the weekly chart's frame, and the table's columns.
describe('the board\'s shape in the thin state (Össur today)', () => {
  const THIN = marketThinFixture()
  const html = render(<MarketPage data={THIN} />)
  const text = renderText(<MarketPage data={THIN} />)

  it('keeps the copy contract and the decided words', () => {
    expect(copyViolations(<MarketPage data={THIN} />)).toEqual([])
    expect(copyViolations(<MarketPage data={marketThinFixture({ earlierNew: true })} />)).toEqual([])
    expect(text).not.toMatch(RETIRED)
    expect(text).not.toMatch(/provisional|calibrat|Insufficient data.*Insufficient data/i)
    expect(text).toContain('Fit & comfort Not measured yet Inside it')
    expect(quotesOutsidePanel(THIN)).toBe(0)
  })

  it('the third card keeps the board\'s weight: nothing new, then the week\'s next biggest not on the row', () => {
    const third = renderText(<TopRowView data={THIN} />).split('New this week')[1]
    expect(third).toBe(` ${NOTHING_NEW} ${ALSO_TALKED} Insurance refusals for powered knees 19 of 226 category videos this week 31 of 300 in October so far Who’s asking ${NO_GROUP} Open →`)
    const top = render(<TopRowView data={THIN} />)
    expect(top).toMatch(/<span data-copy="verdict">New this week<\/span>/)
    // Each conversation on one card only.
    expect(renderText(<TopRowView data={THIN} />).match(/Insurance refusals for powered knees/g)).toHaveLength(1)
  })

  it('says "nothing else" where a conversation off the cards was first heard this week, never against a New chip', () => {
    const d = marketFixture({ flagged: false, noNew: true, flagNew: true })
    expect(renderText(<TopRowView data={d} />)).toContain(`New this week ${NOTHING_ELSE_NEW} ${ALSO_TALKED}`)
    assertCopyContract(<TopRowView data={d} />)
  })

  it('a flag on a kind of comment draws no group and no "doing": those are a conversation\'s', () => {
    const d = marketFixture({ flagKind: true })
    const hero = renderText(<TopRowView data={d} />).split('Three weeks')[0]
    expect(hero).toMatch(/^Unusual this week Complained about something 61 of 252 videos this week/)
    expect(hero).not.toMatch(/Who’s saying it|What they’re doing|Not linked to a group|Not read yet/)
    assertCopyContract(<TopRowView data={d} />)
  })

  it('a subject whose check is open has a chip with no count, after the ready ones, by name', () => {
    expect(text).toContain('All 17 Choosing the right device Community & encouragement Cost & access Fit & comfort Function & movement Look & style Conversation')
  })

  it('draws the top row\'s three cards, 6 · 3 · 3, the third saying nothing is new', () => {
    expect(html).toMatch(/id="top-0"[^>]*class="[^"]*xl:col-span-6/)
    expect(html).toMatch(/id="top-1"[^>]*class="[^"]*xl:col-span-3/)
    expect(html).toMatch(/id="top-2"[^>]*data-top-card="new-none"|data-top-card="new-none"[^>]*id="top-2"|id="top-2" data-top-card="new-none"/)
    expect(text).toContain(`New this week ${NOTHING_NEW}`)
    // Both of the lead's columns, the group's with its own words.
    expect(text).toContain(`Who’s saying it ${NO_GROUP} What they’re doing Complained about something · 14 of 35 in October so far`)
    const earlier = renderText(<TopRowView data={marketThinFixture({ earlierNew: true })} />)
    expect(earlier).toContain(`New this week ${NOTHING_NEW} Newest Showing it or hiding it 6 of 226 category videos this week 9 of 300 in October so far First heard the week of 21 Sep Open →`)
  })

  it('keeps a row per subject: its name, why in the level\'s place over the bar\'s track, and the conversations inside it', () => {
    expect(html.match(/data-subject-row="provisional"/g)).toHaveLength(6)
    expect(text).toContain(`Fit & comfort ${SUBJECT_NOT_MEASURED} Inside it Week Oct How long a liner lasts 23 35 Sweat under the liner 21 30 Socket fit changing over time 14 20`)
    expect(text).toContain(`Look & style ${SUBJECT_NOT_MEASURED} Inside it Week Oct Covers and finishes 7 10 Showing it or hiding it 6 9`)
    expect(html).toMatch(/<article id="subjects"[^>]*class="[^"]*col-span-12 xl:col-span-8/)
  })

  it('keeps the rail a column beside the board, the weekly chart drawn as its frame', () => {
    expect(html).toContain('<div style="order:2" class="col-span-12 flex min-w-0 flex-col gap-5 xl:col-span-4">')
    const weeks = html.slice(html.indexOf('id="weeks"'), html.indexOf('id="where"'))
    expect(weeks.match(/data-slot-empty=""/g)).toHaveLength(8)
    expect(text).toContain('Videos, week by week Your market’s videos, by the week people commented 17 Aug 7 Sep 5 Oct Insufficient data')
  })

  it('keeps the table\'s Subject and About columns, About saying once why it is empty', () => {
    expect(text).toContain('Conversation Subject About · brands not counted yet This week October so far How long a liner lasts Fit & comfort 23')
    // With no conversation in a subject, the Subject header says so too.
    const none = { ...THIN, table: { ...THIN.table!, subjects: false, filters: [], rows: THIN.table!.rows.map((r) => ({ ...r, conv: { ...r.conv, subjectId: null, subjectName: null } })) } }
    expect(renderText(<ConversationTable table={none.table} data={none} />)).toContain('Conversation Subject · none yet About · brands not counted yet This week')
  })
})

// A TRACKED SUBJECT IS NEVER HIDDEN (Heinrich, 14 Oct): one ready, one ready
// and thin, one whose check is open, one being re-described. Every one keeps
// its row; the failed one says why where its level goes and prints no figure
// (ruling U6), exactly as the open one does; the thin one prints its small
// count.
describe('a tracked subject is never hidden (14 Oct)', () => {
  const TRACKED = marketFixture({ subjects: 'tracked' })
  const board = TRACKED.subjects!
  const rowOf = (html: string, state: string): string => {
    const at = html.indexOf(`data-subject-row="${state}"`)
    const next = html.indexOf('data-subject-row="', at + 1)
    return html.slice(at, next < 0 ? undefined : next)
  }

  it('draws a row for every subject, the failed one with FAILED_EXPLAINED, the conversations inside it and no figure', () => {
    const text = renderText(<SubjectBoardView board={board} data={TRACKED} />)
    expect(board.rows.map((r) => [r.name, r.pending?.state ?? 'ready'])).toEqual([
      ['Fit & comfort', 'ready'], ['Look & style', 'ready'], ['Community & encouragement', 'failed'], ['Cost & access', 'provisional'],
    ])
    expect(text).toContain(`Community & encouragement ${FAILED_EXPLAINED} Inside it Week Oct Running-blade stories 17 26 First steps after amputation 13 19 Support from other amputees 9 13`)
    expect(text).toContain(`Cost & access ${SUBJECT_NOT_MEASURED} Inside it`)
    // No figure rests on the failed subject's membership: no level, no line,
    // no change. Its conversations' own counts are theirs.
    const failed = rowOf(render(<SubjectBoardView board={board} data={TRACKED} />), 'failed')
    expect(failed).toContain('Being re-described: a check found')
    expect(failed).toContain('Running-blade stories')
    expect(failed).not.toMatch(/data-copy="level"|data-copy="verdict"|months<\/span>|%<\/span>/)
    // Once a page, for a screen reader too: the empty track under the reason
    // carries the short line, never the reason again.
    expect(failed.split('Being re-described').length - 1).toBe(1)
    expect(failed).toContain(`role="img" aria-label="${SUBJECT_NOT_MEASURED}"`)
    assertCopyContract(<SubjectBoardView board={board} data={TRACKED} />)
  })

  it('prints a thin ready subject\'s small count as a small count', () => {
    const text = renderText(<SubjectBoardView board={board} data={TRACKED} />)
    expect(text).toContain('Look & style 1% 4 of 318 too few to compare')
  })

  it('the failed subject\'s panel lists the conversations inside it, with no figure of its own; the page says why once, in its row', () => {
    const data = marketFixture({ subjects: 'tracked', subject: 'community' })
    const node = <SubjectPanelView panel={data.subjectPanel!} data={data} />
    const text = renderText(node)
    expect(text).toContain(`Community & encouragement Close ${SUBJECT_NOT_MEASURED}. Conversations inside it · this week, and October so far Running-blade stories 17 26`)
    expect(text).not.toMatch(/videos in your market|of the market’s videos/)
    assertCopyContract(node)
    // Once a page: the board's row says it, the open panel does not repeat it.
    const page = renderText(<MarketPage data={data} />)
    expect(page.split(FAILED_EXPLAINED).length - 1).toBe(1)
  })

  it('the table names the failed subject on its conversations and gives its chip no count, as an open one\'s', () => {
    const node = <ConversationTable table={TRACKED.table!} data={TRACKED} />
    const text = renderText(node)
    expect(TRACKED.table!.filters.map((f) => [f.name, f.count])).toEqual([
      ['All', 17], ['Fit & comfort', 4], ['Look & style', 2], ['Community & encouragement', null], ['Cost & access', null],
    ])
    expect(text).toContain('Running-blade stories Community & encouragement')
    assertCopyContract(node)
  })
})

// A TRACKED SUBJECT'S PANEL SAYS SOMETHING (Heinrich, 14 Oct: "What's the
// point of tracking a subject if we just have nothing there"). A READY
// subject's panel has the conversation panel's anatomy over its own videos:
// our read (its own written read), month by month, who it is about, what
// people did, who is saying it, where, three quotes, Ask the Agent and the
// conversations inside it. A subject whose check is open or failed keeps the
// panel it had: no block rests on its membership (ruling U6).
describe('SubjectPanelView: a ready subject in full (14 Oct)', () => {
  const RICH = marketFixture({ subject: 'cost', subjectDetail: 'rich' })
  const RICH_MONTH = marketFixture({ subject: 'cost', subjectDetail: 'rich', period: 'month' })
  const THIN = marketFixture({ subjects: 'tracked', subject: 'look', subjectDetail: 'thin' })
  const panelOf = (d: MarketData) => <SubjectPanelView panel={d.subjectPanel!} data={d} />

  it('this week: the week beside the month, its own read, the four blocks, three quotes, then the conversations inside it', () => {
    const text = renderText(panelOf(RICH))
    // The week's videos stand beside the month's level (decision 1).
    expect(text).toMatch(/^Subject Cost & access Close 40 of 241 videos in your market this week 70 of 318 videos in your market, October so far 22% of the market’s videos ▲ 7 pts The parts below read the videos where a comment was about it: 40 this week, and 64 of these 70 in October so far\. Our read People describe insurance refusals/)
    // Our read: what people said, then what it means for the company.
    expect(text).toContain('Paying out of pocket runs through all of it.')
    expect(text).toContain('fundraisers when the funding does not come. What it means for Össur The refusals people describe are for powered knees, the kind of knee Össur sells.')
    expect(text).toContain('Who it’s about · this week Össur 6 · Ottobock 3 · others 31 October so far Össur 7 · Ottobock 6 · others 51')
    expect(text).toContain('What people did · of 64 in October so far Complained about something 44 Asked a question 20')
    expect(text).toContain('Who’s saying it Long-time users upgrading Caregivers and family Each opens in Voices')
    expect(text).toContain('Where This week October so far TikTok 20 32 of 64 Instagram 10 16 of 64 YouTube 10 16 of 64')
    expect(text).toMatch(/In their words · 3 of the comments “The cost of a running blade/)
    expect(text).toMatch(/Conversations inside it · this week, and October so far Insurance refusals for powered knees Unusual this week 19 31 .*Ask the Agent about this/)
    const html = render(panelOf(RICH))
    expect(html.match(/data-copy="quote"/g)).toHaveLength(3)
    expect(html).toContain('href="/dashboard/voices?group=long-time-users#group-panel"')
    // The quotes and the blocks come before the conversations inside it.
    expect(html.indexOf('In their words')).toBeLessThan(html.indexOf('Conversations inside it'))
    assertCopyContract(panelOf(RICH))
  })

  it('this month: the month alone, its one base named under the stats, where by platform as bars', () => {
    const text = renderText(panelOf(RICH_MONTH))
    expect(text).toMatch(/^Subject Cost & access Close 70 of 318 videos in your market, October so far 22% of the market’s videos ▲ 7 pts The parts below read the 64 of these 70 videos where a comment was about it\. Our read/)
    // Every block reads that one base: none of them counts over the level's 70.
    expect(text).toContain('What people did · of 64 in October so far')
    expect(text).not.toContain('this week')
    expect(text).toContain('Who it’s about Össur 7 · Ottobock 6 · others 51 What people did · of 64 in October so far')
    expect(text).toContain('Where TikTok 32 Instagram 16 YouTube 16')
    assertCopyContract(panelOf(RICH_MONTH))
  })

  it('ready and thin (one video): a small count as a small count, and code\'s one line as its read', () => {
    const text = renderText(panelOf(THIN))
    expect(text).toMatch(/^Subject Look & style Close 1 of 241 videos in your market this week 4 of 318 videos in your market, October so far 1% of the market’s videos too few to compare The parts below read the videos where a comment was about it: 1 this week, and 1 of these 4 in October so far\. Our read In October so far, talk about Look & style sat in “Covers and finishes” and “Showing it or hiding it”\./)
    expect(text).toContain('What people did · of 1 in October so far Praised it 1')
    expect(text).toContain('Where This week October so far Instagram 1 1 of 1')
    expect(text).toContain('In their words · 1 of the comments')
    // No group's talk is in it: the block is left out, as the conversation panel's is.
    expect(text).not.toContain('Who’s saying it')
    assertCopyContract(panelOf(THIN))
  })

  it('a v3 read\'s headline (16 Oct) is carried for the subject card and the panel prints exactly what it printed before', () => {
    for (const period of ['week', 'month'] as const) {
      const before = marketFixture({ subject: 'cost', subjectDetail: 'rich', period })
      const after = marketFixture({ subject: 'cost', subjectDetail: 'rich', period, subjectHeadline: 'The appeal decides when a knee is fitted' })
      expect(after.subjectPanel?.read?.headline?.body).toBe('The appeal decides when a knee is fitted')
      expect(render(panelOf(after))).toBe(render(panelOf(before)))
      expect(renderText(panelOf(after))).not.toContain('The appeal decides when a knee is fitted')
    }
  })

  it('a tenant whose subject reads are switched off: the week read\'s sentence alone under Our read, the blocks as they are', () => {
    const d = marketFixture({ subject: 'cost', subjectDetail: 'rich', subjectReadsOff: true })
    const text = renderText(panelOf(d))
    expect(text).toContain('Our read People ask how to get a knee paid for, and what to do when a claim is refused. Month by month')
    expect(text).not.toMatch(/People describe insurance refusals|What it means for/)
    expect(text).toContain('What people did · of 64 in October so far')
    assertCopyContract(panelOf(d))
  })

  it('no base line where the blocks read every video the level counts', () => {
    const d = marketFixture({ subject: 'cost', subjectDetail: 'rich', period: 'month' })
    const panel = { ...d.subjectPanel!, level: { ...d.subjectPanel!.level!, k: 64 } }
    expect(render(<SubjectPanelView panel={panel} data={d} />)).not.toContain('data-subject-base')
  })

  it('this week with none of its videos: who it is about and where keep their frame, say so in one line, and give the month', () => {
    const d = marketFixture({ subject: 'cost', subjectDetail: 'rich' })
    const detail = d.subjectPanel!.detail!
    const quiet = {
      ...d.subjectPanel!,
      detail: { ...detail, week: { k: 0, n: 241 }, cited: { month: 64, week: 0 }, who: { parts: [], n: 0, month: detail.who!.month }, platforms: { rows: [], n: 0, month: detail.platforms!.month } },
    }
    const text = renderText(<SubjectPanelView panel={quiet} data={d} />)
    expect(text).toContain(`Who it’s about · this week ${SUBJECT_NONE_THIS_WEEK} October so far Össur 7 · Ottobock 6 · others 51`)
    expect(text).toContain(`Where This week October so far TikTok 0 32 of 64 Instagram 0 16 of 64 YouTube 0 16 of 64 ${SUBJECT_NONE_THIS_WEEK}`)
    assertCopyContract(<SubjectPanelView panel={quiet} data={d} />)
  })

  it('brands not counted yet: who it is about says so, and nothing else changes', () => {
    const d = marketFixture({ subject: 'cost', subjectDetail: 'rich', period: 'month' })
    const panel = { ...d.subjectPanel!, detail: { ...d.subjectPanel!.detail!, brands: 'not_counted' as const } }
    const text = renderText(<SubjectPanelView panel={panel} data={d} />)
    expect(text).toContain('Who it’s about Brands are not counted for this workspace yet.')
    expect(text).not.toContain('Össur 7')
    assertCopyContract(<SubjectPanelView panel={panel} data={d} />)
  })

  it('a subject whose check is open keeps its panel: no read of its own, no block, no quote (U6)', () => {
    const d = marketFixture({ flagged: false, noNew: true, subjects: 'provisional', brands: 'not_counted', weeks: 'insufficient', noGroups: true, subject: 'cost', subjectDetail: 'rich' })
    expect(d.subjectPanel).toMatchObject({ state: 'provisional', detail: null, read: null })
    const text = renderText(panelOf(d))
    expect(text).toContain(`Cost & access Close ${SUBJECT_NOT_MEASURED}.`)
    expect(text).not.toMatch(/Who it’s about|What people did|Who’s saying it|Where|In their words|People describe insurance refusals|videos in your market/)
    expect(text).toContain('Conversations inside it · this week, and October so far Insurance refusals for powered knees 19 31')
    expect(render(panelOf(d))).not.toContain('data-copy="quote"')
    assertCopyContract(panelOf(d))
  })

  it('a subject being re-described keeps its panel: no read of its own, no block, no quote (U6)', () => {
    const d = marketFixture({ subjects: 'tracked', subject: 'community', subjectDetail: 'rich' })
    expect(d.subjectPanel).toMatchObject({ state: 'failed', detail: null, read: null })
    const text = renderText(panelOf(d))
    expect(text).toContain(`Community & encouragement Close ${SUBJECT_NOT_MEASURED}. Conversations inside it`)
    expect(text).not.toMatch(/Who it’s about|What people did|Who’s saying it|In their words|Our read|videos in your market/)
    assertCopyContract(panelOf(d))
  })

  it('the page with the rich panel open keeps the copy contract and prints its quotes inside the panel only', () => {
    assertCopyContract(<MarketPage data={RICH} />)
    expect(quotesOutsidePanel(RICH)).toBe(0)
  })
})
