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
    expect(text).toMatch(/^Market Market \/ This week’s read 5 to 11 October · 241 videos · 3,912 comments · 318 videos in October so far This week · 5 to 11 October/)
    expect(html).not.toContain('aria-haspopup')
    expect(html).not.toContain('aria-label="Period"')
  })

  it('the week in one line, then what happened, each quote after the paragraph that carries it', () => {
    const [p1, p2, p3] = OSSUR_WEEK.story
    expect(text).toContain(`${OSSUR_WEEK.line} What happened ${p1} “${STORY_QUOTE_WORDS[0]}” YouTube · 9 Oct ${p2} “${STORY_QUOTE_WORDS[1]}” Instagram · 9 Oct ${p3} What it means`)
    expect(html.match(/data-copy="quote"/g)).toHaveLength(2)
  })

  it('what it means, new this week, worth watching (as stored), then the Agent and every conversation', () => {
    expect(text).toContain(`What it means ${OSSUR_WEEK.means.join(' ')} New this week Swimmers asking whether a knee can go in a pool or the shower. How to keep a liner from smelling. Worth watching ${OSSUR_WEEK.watch.join(' ')} Ask the Agent about this week Every conversation this week ( 17 ) →`)
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
    expect(renderText(<MarketWeekPage data={marketWeekFixture({ week: 'thin' })} />)).toMatch(new RegExp(`This week · 5 to 11 October ${WEEK_THIN}$`))
    expect(renderText(<MarketWeekPage data={marketWeekFixture({ week: 'failed' })} />)).toMatch(new RegExp(`This week ${WEEK_UNREAD}$`))
    const none = { ...READ, weekPage: { ...READ.weekPage!, state: 'none' as const, dates: null } }
    expect(renderText(<MarketWeekPage data={none} />)).toMatch(new RegExp(`This week ${WEEK_NONE}$`))
    assertCopyContract(<MarketWeekPage data={marketWeekFixture({ week: 'thin' })} />)
  })
})
