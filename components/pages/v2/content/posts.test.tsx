import { describe, expect, it } from 'vitest'
import { render, renderText as rawText } from '@/lib/test/render'
import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { postsFixture } from '@/lib/pages/v2/content-fixture'
import type { ContentState } from '@/lib/pages/v2/content'
import { PostsCard, PostsPanel } from './posts'

/** The page's words as read: a tag between a word and its comma is not a space. */
const renderText = (node: Parameters<typeof rawText>[0]): string => rawText(node).replace(/\s+([,.])/g, '$1')

const STATE: ContentState = { period: 'week', open: null, asked: false }

describe('Your posts this month', () => {
  it('counts your own posts by platform, your typical response and the best one', () => {
    const node = <PostsCard block={postsFixture()} state={STATE} selected={false} />
    const text = renderText(node)
    expect(text).toContain('9 posts · Instagram 5, TikTok 2, YouTube 2')
    expect(text).toContain('0.8× response of your typical post against the market’s, read from 6 of 9 with a response figure')
    expect(text).toContain('Best this month “Meet the Navii.”, how-to · 2.2×')
    expect(render(node)).toContain('href="/dashboard/content?posts=1#posts-panel"')
    assertCopyContract(node)
  })

  it('lists them all in place', () => {
    const node = <PostsPanel block={postsFixture()} state={{ ...STATE, open: { kind: 'posts' } }} />
    expect(copyNodes(render(node)).filter((n) => n.kind === 'quote')).toHaveLength(9)
    assertCopyContract(node)
  })

  it('says so when you published nothing, in the board’s shape: both cells, and the best post’s place', () => {
    const none = { ...postsFixture(), total: 0, byPlatform: [], response: null, rated: 0, best: null, rows: [] }
    const text = renderText(<PostsCard block={none} state={STATE} selected={false} />)
    expect(text).toContain('0 posts · response of your typical post against the market’s Best this month You published nothing of your own in October so far.')
    expect(text).not.toContain('All your posts')
    assertCopyContract(<PostsCard block={none} state={STATE} selected={false} />)
    const unread = { ...none, unread: 'Your posts could not be read just now.' }
    const u = renderText(<PostsCard block={unread} state={STATE} selected={false} />)
    expect(u).toContain('Best this month Your posts could not be read just now.')
    expect(copyNodes(render(<PostsCard block={unread} state={STATE} selected={false} />)).filter((n) => n.kind === 'figure')).toEqual([])
  })

  it('where too few posts have a response figure, states how many have one, of all, and names no best post', () => {
    const none = { ...postsFixture(), response: null, rated: 0, best: null, rows: postsFixture().rows.map((r) => ({ ...r, multiple: null })) }
    const node = <PostsCard block={none} state={STATE} selected={false} />
    expect(renderText(node)).toContain('0 of 9 with a response figure, too few to state a typical one Best this month None to name without a response figure. All your posts')
    expect(copyNodes(render(node)).filter((n) => n.kind === 'level').map((n) => n.text)).toEqual(['0 of 9 with a response figure, too few to state a typical one'])
    assertCopyContract(node)
    // A page dumped before `rated` was carried counts the rows with a multiple.
    const { rated: _drop, ...old } = { ...none, rated: 0 }
    expect(renderText(<PostsCard block={old} state={STATE} selected={false} />)).toContain('0 of 9 with a response figure')
  })
})
