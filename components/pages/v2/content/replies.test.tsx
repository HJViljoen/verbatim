import { describe, expect, it } from 'vitest'
import { render, renderText as rawText } from '@/lib/test/render'
import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { contentFixture } from '@/lib/pages/v2/content-fixture'
import { REPLIES_ANCHOR, repliesView, type ContentState } from '@/lib/pages/v2/content'
import { WEEK_ANCHORS } from '@/components/pages/week/came-in'
import { RepliesCard, RepliesPanel } from './replies'

/** The page's words as read: a tag between a word and its comma is not a space. */
const renderText = (node: Parameters<typeof rawText>[0]): string => rawText(node).replace(/\s+([,.])/g, '$1')

const STATE: ContentState = { period: 'week', open: null, asked: false }

describe('Worth a reply', () => {
  const view = () => contentFixture().replies
  it('counts the comments it picked, split by whose post, and never says they are waiting (decision 5)', () => {
    const node = <RepliesCard view={view()} state={STATE} selected={false} />
    const text = renderText(node)
    expect(text).toContain('Comments written between 5 and 11 Oct worth an answer from you')
    expect(text).toContain('12 comments · 6 under your posts, 3 under posts about you, 3 elsewhere')
    expect(text).toContain('4 ready to buy 5 questions 2 objections 1 wrong information')
    expect(text).not.toMatch(/waiting|oldest/i)
    expect(copyNodes(render(node)).filter((n) => n.kind === 'quote')).toEqual([])
    assertCopyContract(node)
  })

  it('lists the comments one click down, with a reply link where a reply can land and none for wrong information', () => {
    const node = <RepliesPanel view={view()} state={{ ...STATE, open: { kind: 'replies' } }} />
    const m = render(node)
    expect(m).toMatch(/^<section id="replies-panel"/)
    expect(copyNodes(m).filter((n) => n.kind === 'quote')).toHaveLength(12)
    expect(renderText(node)).toContain('Under a post about you')
    expect(renderText(node)).toContain('We cannot see whether you have replied')
    expect((m.match(/Reply on YouTube|Open the post on/g) ?? []).length).toBe(11)
    assertCopyContract(node)
  })

  it('carries the anchor old reply links land on (`/dashboard/content#worth-a-reply`)', () => {
    expect(REPLIES_ANCHOR).toBe(WEEK_ANCHORS.reply)
    expect(render(<RepliesCard view={view()} state={STATE} selected={false} />)).toMatch(/^<article id="worth-a-reply"[^>]*class="[^"]*scroll-mt-6/)
  })

  it('splits the comments by whose post only where there is more than one part', () => {
    const one = { ...view(), total: 9, under: { own: 0, about: 0, elsewhere: 9 } }
    const text = renderText(<RepliesCard view={one} state={STATE} selected={false} />)
    expect(text).toContain('9 comments')
    expect(text).not.toMatch(/9 comments ·|9 elsewhere/)
    assertCopyContract(<RepliesCard view={one} state={STATE} selected={false} />)
    const two = { ...view(), total: 9, under: { own: 2, about: 0, elsewhere: 7 } }
    expect(renderText(<RepliesCard view={two} state={STATE} selected={false} />)).toContain('9 comments · 2 under your posts, 7 elsewhere')
  })

  it('says why there is no list', () => {
    const none = repliesView(null, null)
    expect(renderText(<RepliesCard view={{ ...none, unread: 'No update has covered a week yet, so there is no reply list.' }} state={STATE} selected={false} />)).toContain('No update has covered a week yet')
  })
})
