import { describe, expect, it } from 'vitest'
import { render, renderText as rawText } from '@/lib/test/render'
import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { postsFixture } from '@/lib/pages/v2/content-fixture'
import { PostsCard } from './posts'

/** The page's words as read: a tag between a word and its comma is not a space. */
const renderText = (node: Parameters<typeof rawText>[0]): string => rawText(node).replace(/\s+([,.])/g, '$1')

describe('Your posts this month', () => {
  it('lists where your posts went, your typical response and the best one (the count is the figures row’s)', () => {
    const node = <PostsCard block={postsFixture()} />
    const text = renderText(node)
    expect(text).toContain('Your posts in October so far Published on your own accounts Where Instagram 5, TikTok 2, YouTube 2')
    expect(text).toContain('Typical response 0.8× your typical post against the market’s, read from the 6 posts with a response figure')
    expect(text).toContain('Best in October so far How-to, 2.2× “Meet the Navii.”')
    expect(text).not.toContain('·')
    // Its own page (depth as pages, 17 Oct).
    expect(render(node)).toContain('href="/dashboard/content/posts"')
    assertCopyContract(node)
  })

  it('says so when you published nothing, in the board’s shape: both cells, and the best post’s place', () => {
    const none = { ...postsFixture(), total: 0, byPlatform: [], response: null, rated: 0, best: null, rows: [] }
    const text = renderText(<PostsCard block={none} />)
    expect(text).toContain('Where Nowhere yet Typical response No response to state. Best in October so far You published nothing of your own in October so far.')
    expect(text).not.toContain('All your posts')
    assertCopyContract(<PostsCard block={none} />)
    const unread = { ...none, unread: 'Your posts could not be read just now.' }
    const u = renderText(<PostsCard block={unread} />)
    expect(u).toContain('Where Not read Typical response No response to state. Best in October so far Your posts could not be read just now.')
    expect(copyNodes(render(<PostsCard block={unread} />)).filter((n) => n.kind === 'figure')).toEqual([])
  })

  it('where too few posts have a response figure, states how many have one, of all, and names no best post', () => {
    const none = { ...postsFixture(), response: null, rated: 0, best: null, rows: postsFixture().rows.map((r) => ({ ...r, multiple: null })) }
    const node = <PostsCard block={none} />
    expect(renderText(node)).toContain('0 of 9 with a response figure, too few to state a typical one Best in October so far None to name without a response figure. All your posts')
    expect(copyNodes(render(node)).filter((n) => n.kind === 'level').map((n) => n.text)).toEqual(['0 of 9'])
    assertCopyContract(node)
    // The market's typical video not read: that is the reason, not too few.
    const noTypical = <PostsCard block={{ ...none, rated: 6, marketTypical: false }} />
    expect(renderText(noTypical)).toContain('6 of 9 with a response figure; the market’s typical video could not be read to compare them Best in October so far None to name: the market’s typical video could not be read.')
    assertCopyContract(noTypical)
    // A page dumped before `rated` was carried counts the rows with a multiple.
    const { rated: _drop, ...old } = { ...none, rated: 0 }
    expect(renderText(<PostsCard block={old} />)).toContain('0 of 9 with a response figure')
  })
})
