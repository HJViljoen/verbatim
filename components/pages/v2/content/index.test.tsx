import { describe, expect, it } from 'vitest'
import { render, renderText as rawText } from '@/lib/test/render'
import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { contentEmptyFixture, contentFixture, contentThinFixture } from '@/lib/pages/v2/content-fixture'
import { ContentPage, weekWordOf } from './index'

/** The page's words as read: a tag between a word and its comma is not a space. */
const renderText = (node: Parameters<typeof rawText>[0]): string => rawText(node).replace(/\s+([,.])/g, '$1')

describe('Content', () => {
  it('draws the board’s order: the bar, the ideas, What works beside its rail, Also asked', () => {
    const text = renderText(<ContentPage data={contentFixture()} />)
    const at = (s: string) => text.indexOf(s)
    expect(at('Content')).toBe(0)
    expect(at('What to post next')).toBeLessThan(at('What works in your market’s videos'))
    expect(at('What works in your market’s videos')).toBeLessThan(at('Worth a reply'))
    expect(at('Worth a reply')).toBeLessThan(at('Your posts this month'))
    expect(at('Your posts this month')).toBeLessThan(at('Also asked, and not yet in your posts'))
  })

  it('states the week beside its month in the bar, and switches the period by link', () => {
    const m = render(<ContentPage data={contentFixture()} />)
    // Each total names its clock: the market's by comment, your posts by publishing.
    expect(renderText(<ContentPage data={contentFixture()} />)).toContain('5 to 11 Oct · 241 videos in your market with a comment this week, 318 in October so far · 9 posts of your own published in October so far')
    expect(m).toContain('href="/dashboard/content?period=month"')
    expect(m).toMatch(/aria-current="page"[^>]*>This week</)
    expect(renderText(<ContentPage data={contentFixture({ period: 'month' })} />)).toContain('October so far · 318 videos in your market with a comment · 9 posts of your own published in October so far')
  })

  it('keeps the copy contract closed, with each panel open, and empty', () => {
    assertCopyContract(<ContentPage data={contentFixture()} />)
    assertCopyContract(<ContentPage data={contentFixture({ open: { kind: 'idea', rank: 1 } })} />)
    assertCopyContract(<ContentPage data={contentFixture({ open: { kind: 'replies' } })} />)
    assertCopyContract(<ContentPage data={contentFixture({ open: { kind: 'posts' }, period: 'month', asked: true })} />)
    assertCopyContract(<ContentPage data={contentFixture({ ideas: 'not_on' })} />)
    assertCopyContract(<ContentPage data={contentEmptyFixture()} />)
    assertCopyContract(<ContentPage data={contentFixture({ olderIdeas: true, open: { kind: 'idea', rank: 2 } })} />)
    assertCopyContract(<ContentPage data={contentFixture({ ideas: 'stale' })} />)
  })

  it('prints no quote at level 1: every comment’s words are one click down', () => {
    const closed = copyNodes(render(<ContentPage data={contentFixture()} />)).filter((n) => n.kind === 'quote')
    // The one quote node at level 1 is your own best post's title: your words,
    // not a commenter's.
    expect(closed.map((n) => n.text)).toEqual(['“Meet the Navii.”'])
    expect(copyNodes(render(<ContentPage data={contentFixture({ open: { kind: 'idea', rank: 1 } })} />)).filter((n) => n.kind === 'quote').length).toBeGreaterThan(3)
  })

  it('opens one panel, in place, under its own card at every width (T9)', () => {
    const idea = render(<ContentPage data={contentFixture({ open: { kind: 'idea', rank: 1 } })} />)
    // In the markup right after the first idea, before the second; ordered
    // after the card on a phone and after the row of three from 1280.
    expect(idea.indexOf('id="idea-panel"')).toBeGreaterThan(idea.indexOf('id="idea-1"'))
    expect(idea.indexOf('id="idea-panel"')).toBeLessThan(idea.indexOf('id="idea-2"'))
    expect(idea).toContain('--panel-o-base:1;--panel-o-sm:1;--panel-o-md:1;--panel-o-lg:1;--panel-o-w1180:1;--panel-o-xl:5')
    expect(idea).toContain('--notch-base:50%;--notch-sm:50%;--notch-md:50%;--notch-lg:50%;--notch-w1180:50%;--notch-xl:16.67%')
    const replies = render(<ContentPage data={contentFixture({ open: { kind: 'replies' } })} />)
    // Between Worth a reply and Your posts on a phone; under the pair, at the
    // right-hand column, from 1280.
    expect(replies.indexOf('id="replies-panel"')).toBeGreaterThan(replies.indexOf('id="posts-title"'))
    expect(replies.indexOf('id="replies-panel"')).toBeLessThan(replies.indexOf('id="also-asked"'))
    expect(replies).toContain('--panel-o-base:3;--panel-o-sm:3;--panel-o-md:3;--panel-o-lg:3;--panel-o-w1180:3;--panel-o-xl:5')
    expect(replies).toContain('--notch-xl:83.33%')
    // The cards' orders are the kit's (`panelItemOrder`), never hand-set
    // classes (Phase 4 fix round): Worth a reply is the second card.
    expect(replies).toMatch(/aria-labelledby="replies-title" style="order:2"/)
    expect(replies).toMatch(/aria-labelledby="works-title" style="order:0"/)
    expect(replies).toMatch(/aria-labelledby="posts-title" style="order:4"/)
    expect(replies).not.toMatch(/class="[^"]*\border-\d/)
    expect(replies).not.toContain('id="idea-panel"')
    const posts = render(<ContentPage data={contentFixture({ open: { kind: 'posts' }, period: 'month' })} />)
    expect(posts).toContain('--panel-o-base:5;--panel-o-sm:5;--panel-o-md:5;--panel-o-lg:5;--panel-o-w1180:5;--panel-o-xl:5')
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
    expect(text).toContain('9 comments · all elsewhere in your market 4 ready to buy 5 questions 0 objections 0 wrong information Open the replies')
    // No post has a response figure: the cell states how many have one, of all, and the best post's place says why it names none.
    expect(text).toContain('13 posts · Instagram 13 0 of 13 with a response figure, too few to state a typical one Best this month None to name without a response figure. All your posts')
    expect(text).toContain('Question people asked Who asks Subject This week October so far The last three weeks')
    // Thirteen posts' marks stay one row: each narrows rather than wraps.
    expect(m).toContain('data-units="2/13"')
    expect(m).toMatch(/data-units="2\/13" class="[^"]*flex-nowrap/)
    assertCopyContract(node)
  })

  it('calls a window a week only when it is seven days', () => {
    expect(weekWordOf(contentFixture())).toBe('this week')
    const long = contentFixture()
    expect(weekWordOf({ week: { ...long.week!, isWeek: false, first: '2026-09-10', last: '2026-10-10' } })).toBe('between 10 Sep and 10 Oct')
  })
})
