import { describe, expect, it } from 'vitest'
import { render, renderText as rawText } from '@/lib/test/render'
import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { contentEmptyFixture, contentFixture, contentThinFixture } from '@/lib/pages/v2/content-fixture'
import { ContentPage, contentStats, weekWordOf } from './index'

/** The page's words as read: a tag between a word and its comma is not a space. */
const renderText = (node: Parameters<typeof rawText>[0]): string => rawText(node).replace(/\s+([,.])/g, '$1')

describe('Content', () => {
  it('draws the board’s order: the bar, the ideas, What works beside its rail, Also asked', () => {
    const text = renderText(<ContentPage data={contentFixture()} />)
    const at = (s: string) => text.indexOf(s)
    expect(at('Content')).toBe(0)
    expect(at('What to post next')).toBeLessThan(at('What works in your market’s videos'))
    expect(at('What works in your market’s videos')).toBeLessThan(at('Worth a reply'))
    expect(at('Worth a reply')).toBeLessThan(at('Your posts in October so far Published on your own accounts'))
    expect(at('Your posts in October so far Published on your own accounts')).toBeLessThan(at('Also asked, and not yet in your posts'))
  })

  it('states the week beside its month in the figures row, and switches the period by link, the month by its name', () => {
    const m = render(<ContentPage data={contentFixture()} />)
    // Each total names its clock: the market's by comment, your posts by publishing.
    expect(renderText(<ContentPage data={contentFixture()} />)).toContain('Content This week October so far Week 5 to 11 Oct Your market this week 241 videos with a comment October so far 318 videos Your posts in October so far 9 published')
    expect(m).toContain('data-stat-strip=""')
    expect(m).toContain('href="/dashboard/content?period=month"')
    expect(m).toMatch(/aria-current="page"[^>]*>This week</)
    expect(m).not.toContain('>This month<')
    expect(renderText(<ContentPage data={contentFixture({ period: 'month' })} />)).toContain('Month October so far Your market 318 videos with a comment Your posts in October so far 9 published')
  })

  it('builds the figures row from the page’s own counts: four cells for the week, three for the month, each base once', () => {
    const terms = (d: Parameters<typeof contentStats>[0]) => contentStats(d).map((c) => c.term)
    expect(terms(contentFixture())).toEqual(['Week', 'Your market this week', 'October so far', 'Your posts in October so far'])
    expect(terms(contentFixture({ period: 'month' }))).toEqual(['Month', 'Your market', 'Your posts in October so far'])
    // A read that failed is said in its cell, never a zero.
    const unread = contentFixture()
    const failed = { ...unread, market: { week: null, month: null }, posts: { ...unread.posts, unread: 'Your posts could not be read just now.' } }
    const text = renderText(<ContentPage data={failed} />)
    expect(text).toContain('Your market this week Not read yet October so far Not read yet Your posts in October so far Could not be read just now')
    assertCopyContract(<ContentPage data={failed} />)
  })

  it('keeps the copy contract, in every period and state', () => {
    assertCopyContract(<ContentPage data={contentFixture()} />)
    assertCopyContract(<ContentPage data={contentFixture({ period: 'month', asked: true })} />)
    assertCopyContract(<ContentPage data={contentFixture({ ideas: 'not_on' })} />)
    assertCopyContract(<ContentPage data={contentEmptyFixture()} />)
    assertCopyContract(<ContentPage data={contentFixture({ olderIdeas: true })} />)
    assertCopyContract(<ContentPage data={contentFixture({ ideas: 'stale' })} />)
  })

  it('prints no quote at level 1: every comment’s words are a page down', () => {
    const closed = copyNodes(render(<ContentPage data={contentFixture()} />)).filter((n) => n.kind === 'quote')
    // The one quote node at level 1 is your own best post's title: your words,
    // not a commenter's.
    expect(closed.map((n) => n.text)).toEqual(['“Meet the Navii.”'])
  })

  it('opens every card on a page of its own, and nothing in place (depth as pages, 17 Oct)', () => {
    const m = render(<ContentPage data={contentFixture()} />)
    // Each idea by its row; the reply list and your posts at their pages.
    expect(m).toContain('href="/dashboard/content/ideas/i0000001-0000-4000-8000-000000000000"')
    expect(m).toContain('href="/dashboard/content/ideas/i0000002-0000-4000-8000-000000000000"')
    expect(m).toContain('href="/dashboard/content/replies"')
    expect(m).toContain('href="/dashboard/content/posts"')
    // The reply list keeps the month.
    expect(render(<ContentPage data={contentFixture({ period: 'month' })} />)).toContain('href="/dashboard/content/replies?period=month"')
    // A question card and an Also asked row open the conversation in Market.
    const fewer = render(<ContentPage data={contentFixture({ ideas: 'fewer' })} />)
    expect(fewer).toMatch(/data-idea-slot="question"[\s\S]*href="\/dashboard\/market\/conversations\//)
    // No panel, no old panel param, no close link; the stored anchor stays on its card.
    for (const page of [m, fewer]) {
      expect(page).not.toMatch(/data-panel=""|\?idea=|replies=1|posts=1|Close ↑/)
      expect(page).toContain('id="worth-a-reply"')
      expect(page).toContain('id="what-works"')
    }
  })

  it('draws every block’s empty state for a workspace with no update yet', () => {
    const text = renderText(<ContentPage data={contentEmptyFixture()} />)
    expect(text).toContain('Post ideas are not switched on for this workspace.')
    expect(text).toContain('No update has covered a week yet, so there is no reply list.')
    expect(text).toContain('You published nothing of your own in October so far.')
    // No update yet is not a read that failed.
    expect(text).not.toContain('could not be read')
  })

  it('keeps the board’s shape in the thin real state (parity pass): three cards, both charts, four reply cells, two post cells and the best post’s line, the table’s headings', () => {
    const node = <ContentPage data={contentThinFixture()} />
    const m = render(node)
    expect(m.match(/data-idea-slot="question"/g)).toHaveLength(3)
    expect(m).not.toContain('data-ideas-empty')
    const text = renderText(node)
    expect(text).toContain('How the video is made')
    expect(text).toContain('How it opens')
    expect(text).toContain('9 comments, all elsewhere in your market Ready to buy 5 Questions 3 Objections 1 Wrong information 0 Open the replies')
    // No post has a response figure: the list states how many have one, of all, and the best post's place says why it names none.
    expect(text).toContain('Where Instagram 13 Typical response 0 of 13 with a response figure, too few to state a typical one Best in October so far None to name without a response figure. All your posts')
    expect(text).toContain('Question people asked Who asks Subject This week October Last three weeks, oldest first')
    // Your posts of each kind are a plain count (their base is the figures
    // row's "Your posts"), never marks that narrow or wrap.
    expect(m).not.toContain('data-units=')
    assertCopyContract(node)
  })

  it('calls a window a week only when it is seven days', () => {
    expect(weekWordOf(contentFixture())).toBe('this week')
    const long = contentFixture()
    expect(weekWordOf({ week: { ...long.week!, isWeek: false, first: '2026-09-10', last: '2026-10-10' } })).toBe('between 10 Sep and 10 Oct')
  })
})
