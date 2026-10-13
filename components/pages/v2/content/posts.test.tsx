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

  it('says so when you published nothing', () => {
    const none = { ...postsFixture(), total: 0, byPlatform: [], response: null, best: null, rows: [] }
    expect(renderText(<PostsCard block={none} state={STATE} selected={false} />)).toContain('You published nothing of your own in October so far.')
  })
})
