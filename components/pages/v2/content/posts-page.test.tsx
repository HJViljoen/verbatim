import { describe, expect, it } from 'vitest'
import { render, renderText as rawText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { contentPostsFixture } from '@/lib/pages/v2/content-levels-fixture'
import { ContentPostsPage, openedPostNote, opensWords, postsMeta, showPostComments } from './posts-page'

// YOUR POSTS, THE EVIDENCE (G5-Content-Posts and -Posts-Phone): what it
// prints, in the board's order, in every state.

/** The page's words as read: a tag between a word and its comma is not a space. */
const renderText = (node: Parameters<typeof rawText>[0]): string => rawText(node).replace(/\s+([,.])/g, '$1')
const page = (o: Parameters<typeof contentPostsFixture>[0] = {}) => <ContentPostsPage data={contentPostsFixture(o)} />
const FIRST = 'p0000001-0000-4000-8000-000000000000'

describe('your posts\' page', () => {
  it('opens flat: "Content / Your posts", a person on the neutral, "Your own accounts", the month and the counts, no period switch', () => {
    const m = render(page())
    const text = renderText(page())
    expect(m).toMatch(/data-crumb-row=""[\s\S]*href="\/dashboard\/content"[^>]*>Content</)
    expect(m).toMatch(/data-level-tile="posts" class="[^"]*bg-track/)
    expect(text).toContain('Your own accounts Your posts October so far · 9 posts · Instagram 5, TikTok 2, YouTube 2')
    expect(m).not.toContain('aria-label="Period"')
  })

  it('leads with code\'s sentence about the mix, its formats half', () => {
    expect(renderText(page())).toContain('6 of your 9 posts in October so far were promotional videos, which draw 0.7× a typical video. Story videos draw 3.1×, and you made one.')
  })

  it('lists your posts newest first, each with its format, opening, response, the link out and what was said under it', () => {
    const text = renderText(page())
    expect(text).toContain('What you posted Newest first, each with what people said under it')
    expect(text).toContain('ossur Instagram · posted 10 Oct Best this month Meet the Navii. Built for wet days and long walks. How-to · opens by showing it · 2.2× a typical video Watch the post ↗ 6 comments on it “Can the Navii go in the sea or only the shower?” 10 Oct “Finally a knee I could take to the beach.” 10 Oct Show all 6 comments')
    expect(text).toContain('Promotional · opens with a before and after · no response figure')
    // Post 3: one of its eight comments may print, so no "Show all".
    expect(text).toContain('8 comments on it “Will you bring this to a fair in South Africa?”')
    expect(text).not.toContain('Show all 8 comments')
    const m = render(page())
    expect(m.match(/data-post-card=""/g)).toHaveLength(5)
    expect(m).toContain(`href="/dashboard/content/posts?post=${FIRST}#post-${FIRST}"`)
    expect(m).toMatch(/href="https:\/\/example\.com\/own\/1" target="_blank" rel="noopener noreferrer"/)
  })

  // Where the platform counts more comments than we hold, the line names the
  // gap the rule makes: the account's own replies are left out (the fresh
  // check: "6 of the 9 comments on it are here" read as if the rest were
  // never gathered).
  it('names your own replies where the platform counts more than it holds', () => {
    const d = contentPostsFixture()
    const replied = { ...d, cards: [{ ...d.cards[0], held: 6, onPlatform: 9, ownLeftOut: true }, ...d.cards.slice(1)] }
    const text = renderText(<ContentPostsPage data={replied} />)
    // The tail follows the level's node with no space, as a browser reads it.
    expect(render(<ContentPostsPage data={replied} />)).toMatch(/>6<\/b> of 9 comments<\/span> on it; your own replies are left out</)
    expect(text).toContain('6 of 9 comments on it; your own replies are left out')
    expect(text).not.toContain('comments on it are here')
    assertCopyContract(<ContentPostsPage data={replied} />)
    const unreplied = { ...d, cards: [{ ...d.cards[0], held: 6, onPlatform: 9, ownLeftOut: false }, ...d.cards.slice(1)] }
    expect(renderText(<ContentPostsPage data={unreplied} />)).toContain('6 of 9 comments on it are here')
    assertCopyContract(<ContentPostsPage data={unreplied} />)
  })

  it('offers the rest by an address: four more from 640, six on a phone where three show', () => {
    const m = render(page())
    expect(renderText(page())).toContain('Show 4 more posts')
    expect(renderText(page())).toContain('Show 6 more posts')
    expect(m).toContain('href="/dashboard/content/posts?all=1#posted"')
    expect(m.match(/data-post-card="" class="[^"]*max-sm:hidden/g)).toHaveLength(2)
    const all = render(page({ all: true }))
    expect(all.match(/data-post-card=""/g)).toHaveLength(9)
    expect(all).not.toContain('more posts')
  })

  it('opens one post\'s comments by its address, and closes it again', () => {
    const m = render(page({ post: FIRST }))
    const card = m.slice(m.indexOf(`id="post-${FIRST}"`), m.indexOf('</article>', m.indexOf(`id="post-${FIRST}"`)))
    expect(card.match(/data-post-comment=""/g)).toHaveLength(6)
    expect(card).toContain('Show fewer comments')
    expect(card).toContain(`href="/dashboard/content/posts#post-${FIRST}"`)
  })

  it('sets the facts beside them: how they were made, how they open, where, and the response with the way to What works', () => {
    const text = renderText(page())
    expect(text).toContain('The facts How they were made · of 9 Promotional 6 Behind the scenes 1 How-to 1 Story 1')
    expect(text).toContain('How they open · of 9 A before and after 6 A personal story 1 Showing it 1 1 not read yet')
    expect(text).toContain('Where · of 9 Instagram 5 TikTok 2 YouTube 2')
    expect(text).toContain('Response 0.8× your typical post against the market’s, read from 6 of 9 with a response figure')
    expect(render(page())).toContain('href="/dashboard/content#what-works"')
  })

  it('ends with elsewhere on Content (the reply list\'s days, no count) and the Agent', () => {
    const text = renderText(page())
    expect(text).toContain('Worth a reply Comments written between 5 and 11 Oct worth an answer from you')
    expect(text).toContain('Ask about your posts and what people said under them, in your own words.')
    expect(render(page())).toContain('href="/dashboard/content/replies"')
  })

  it('keeps its frame where you published nothing, where your posts or their comments could not be read', () => {
    const none = renderText(page({ state: 'none' }))
    expect(none).toContain('You published nothing of your own in October so far.')
    expect(renderText(page({ state: 'unread' }))).toContain('Your posts could not be read just now.')
    const comments = renderText(page({ state: 'comments_unread' }))
    expect(comments).toContain('The comments under it could not be read just now.')
    expect(comments).not.toContain('Show all')
  })

  it('keeps the copy contract in every state', () => {
    for (const o of [{}, { all: true }, { post: FIRST }, { state: 'none' as const }, { state: 'unread' as const }, { state: 'comments_unread' as const }, { noIdeas: true }]) assertCopyContract(page(o))
  })

  it('words its pieces', () => {
    expect(opensWords('Showing it')).toBe('opens by showing it')
    expect(opensWords('A question')).toBe('opens with a question')
    expect(showPostComments({ open: false, held: 6, quotable: 6, quotes: [{} as never, {} as never] })).toEqual({ shown: 6, of: null })
    expect(showPostComments({ open: false, held: 8, quotable: 5, quotes: [{} as never, {} as never] })).toEqual({ shown: 5, of: 8 })
    expect(showPostComments({ open: false, held: 8, quotable: 1, quotes: [{} as never] })).toBeNull()
    expect(openedPostNote({ open: true, held: 8, quotable: 1 })).toBe('The other 7 are not quoted: a comment prints only where it reads clearly.')
    expect(postsMeta(contentPostsFixture())[0]).toEqual(['October so far'])
  })
})
