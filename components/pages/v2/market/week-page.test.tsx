import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { marketWeekFixture, OSSUR_WEEK, STORY_QUOTE_WORDS } from '@/lib/pages/v2/market-fixture'
import { MarketWeekPage } from './pages'
import { WEEK_THIN, WEEK_UNREAD } from './analysis'
import { WEEK_NONE, WEEK_NOTHING_NEW } from './week-page'

// THE WEEK'S READ, IN FULL (depth as pages, 17 Oct; F2-Market-Week): the
// published read, its quotes resolved at render and placed after the
// paragraph whose ref each carries, from the page fixture through
// `weekPageOf` (over `weeklyReadView`), against the copy contract.

const READ = marketWeekFixture()

describe('the week\'s page', () => {
  const text = renderText(<MarketWeekPage data={READ} />)
  const html = render(<MarketWeekPage data={READ} />)

  it('its bar: "Market / This week\'s read", no switch, no chevron; the week beside its month', () => {
    // The audit design: the title "The week's read" with no tile and no
    // label over it; the figures row's three cells (the board's).
    expect(text).toMatch(/^Market \/ This week’s read Market The week’s read Week 5 to 11 October Your market this week 241 videos, 3,912 comments October so far 318 videos /)
    expect(html).not.toContain('data-level-tile')
    expect(html).toContain('data-stat-strip')
    expect(html).not.toContain('aria-haspopup')
    expect(html).not.toContain('aria-label="Period"')
  })

  it('the week in one line, then what happened, each quote after the paragraph that carries it', () => {
    const [p1, p2, p3] = OSSUR_WEEK.story
    // Each quote's source in commas (commaCite), the grid 3fr / 2fr.
    expect(text).toContain(`${OSSUR_WEEK.line} What happened ${p1} “${STORY_QUOTE_WORDS[0]}” YouTube, 9 Oct ${p2} “${STORY_QUOTE_WORDS[1]}” Instagram, 9 Oct ${p3} What it means`)
    expect(html.match(/data-copy="quote"/g)).toHaveLength(2)
    expect(html).toContain('min-[1180px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]')
    expect(html).toMatch(/<h3 class="[^"]*text-\[15px\][^"]*">What happened<\/h3>/)
    // No icon tile and no capital label in the read (the eyebrow is gone).
    expect(html.slice(html.indexOf('id="week-read"'))).not.toMatch(/uppercase|<svg/)
  })

  it('what it means, new this week, worth watching (as stored), then the Agent and every conversation', () => {
    // The board's foot: the conversations first, then the Agent, as links
    // with no arrow; Worth watching a list.
    expect(text).toContain(`What it means ${OSSUR_WEEK.means.join(' ')} New this week Swimmers asking whether a knee can go in a pool or the shower. How to keep a liner from smelling. Worth watching ${OSSUR_WEEK.watch.join(' ')} See all 17 conversations this week Ask the Agent about this week`)
    expect(html.match(/<li>/g)).toHaveLength(OSSUR_WEEK.watch.length)
    expect(text).not.toContain('→')
    expect(html).toContain('href="/dashboard/market#conversations"')
    expect(html).toContain('href="/dashboard/agent?ask=What%20happened%20in%20my%20market%20this%20week%3F"')
  })

  it('every written node is stored week_read prose with no digit', () => {
    const stored = copyNodes(html).filter((n) => n.kind === 'stored')
    expect(stored.length).toBe(1 + 3 + 3 + 2 + 2)
    for (const n of stored) {
      expect(n.slot).toBe('week_read')
      expect(n.text).not.toMatch(/\d/)
    }
    assertCopyContract(<MarketWeekPage data={READ} />)
  })

  it('new this week says so where nothing was first heard', () => {
    const d = marketWeekFixture()
    const quiet = { ...d, weekPage: { ...d.weekPage!, fresh: [] } }
    expect(renderText(<MarketWeekPage data={quiet} />)).toContain(`New this week ${WEEK_NOTHING_NEW} Worth watching`)
  })

  it('thin, failed or no read: one calm line in the page', () => {
    // A heading in the removed eyebrow's place: the week by its dates.
    expect(renderText(<MarketWeekPage data={marketWeekFixture({ week: 'thin' })} />)).toMatch(new RegExp(`The week of 5 to 11 October ${WEEK_THIN}$`))
    expect(renderText(<MarketWeekPage data={marketWeekFixture({ week: 'failed' })} />)).toMatch(new RegExp(`(The week of [^ ]+ to [^ ]+ [A-Za-z]+|This week) ${WEEK_UNREAD}$`))
    const none = { ...READ, weekPage: { ...READ.weekPage!, state: 'none' as const, dates: null } }
    expect(renderText(<MarketWeekPage data={none} />)).toMatch(new RegExp(`This week ${WEEK_NONE}$`))
    assertCopyContract(<MarketWeekPage data={marketWeekFixture({ week: 'thin' })} />)
  })
})
