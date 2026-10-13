import { describe, expect, it } from 'vitest'
import { render, renderText as rawText } from '@/lib/test/render'
import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { contentEmptyFixture, contentFixture } from '@/lib/pages/v2/content-fixture'
import { ContentPage, weekWordOf } from './page'

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
    expect(renderText(<ContentPage data={contentFixture()} />)).toContain('5 to 11 Oct · 241 videos in your market this week, 318 in October so far · 9 posts of your own in October so far')
    expect(m).toContain('href="/dashboard/content?period=month"')
    expect(m).toMatch(/aria-current="page"[^>]*>This week</)
    expect(renderText(<ContentPage data={contentFixture({ period: 'month' })} />)).toContain('October so far · 318 videos in your market · 9 posts of your own in October so far')
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

  it('opens one panel, in place, under its own row', () => {
    const idea = render(<ContentPage data={contentFixture({ open: { kind: 'idea', rank: 1 } })} />)
    expect(idea.indexOf('id="idea-panel"')).toBeGreaterThan(idea.indexOf('id="idea-3"'))
    expect(idea.indexOf('id="idea-panel"')).toBeLessThan(idea.indexOf('id="works-title"'))
    const replies = render(<ContentPage data={contentFixture({ open: { kind: 'replies' } })} />)
    expect(replies.indexOf('id="replies-panel"')).toBeGreaterThan(replies.indexOf('id="posts-title"'))
    expect(replies.indexOf('id="replies-panel"')).toBeLessThan(replies.indexOf('id="also-asked"'))
    expect(replies).not.toContain('id="idea-panel"')
  })

  it('draws every block’s empty state for a workspace with no update yet', () => {
    const text = renderText(<ContentPage data={contentEmptyFixture()} />)
    expect(text).toContain('Post ideas are not switched on for this workspace yet.')
    expect(text).toContain('No update has covered a week yet, so there is no reply list.')
    expect(text).toContain('You published nothing of your own in October so far.')
  })

  it('calls a window a week only when it is seven days', () => {
    expect(weekWordOf(contentFixture())).toBe('this week')
    const long = contentFixture()
    expect(weekWordOf({ week: { ...long.week!, isWeek: false, first: '2026-09-10', last: '2026-10-10' } })).toBe('between 10 Sep and 10 Oct')
  })
})
