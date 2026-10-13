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
/** A queue that read and found nothing. */
const OSSUR_EMPTY_QUEUE = { rows: [], flagged: [], counts: [], total: 0, window: { from: '2026-10-04T04:03:00.000Z', to: '2026-10-11T04:02:00.000Z', basis: 'previous_run' as const }, unread: null }

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

  it('always says where the comments sit (the board’s line): in words where they all sit in one place', () => {
    const one = { ...view(), total: 9, under: { own: 0, about: 0, elsewhere: 9 } }
    const text = renderText(<RepliesCard view={one} state={STATE} selected={false} />)
    // "9 comments · 9 elsewhere" repeated the count and read oddly (Phase 4).
    expect(text).toContain('9 comments · all elsewhere in your market')
    expect(text).not.toContain('9 elsewhere')
    assertCopyContract(<RepliesCard view={one} state={STATE} selected={false} />)
    expect(renderText(<RepliesCard view={{ ...one, under: { own: 9, about: 0, elsewhere: 0 } }} state={STATE} selected={false} />)).toContain('9 comments · all under your posts')
    const two = { ...view(), total: 9, under: { own: 2, about: 0, elsewhere: 7 } }
    expect(renderText(<RepliesCard view={two} state={STATE} selected={false} />)).toContain('9 comments · 2 under your posts, 7 elsewhere')
  })

  it('keeps its count, its four cells and its foot where there is no list, and says why once', () => {
    const none = repliesView(null, null)
    const unread = <RepliesCard view={{ ...none, unread: 'No update has covered a week yet, so there is no reply list.' }} state={STATE} selected={false} />
    const text = renderText(unread)
    expect(text).toContain('No update has covered a week yet')
    // The cells keep their frames and labels, with no number they cannot know.
    expect(text).toContain('· ready to buy · questions · objections · wrong information')
    expect(copyNodes(render(unread)).filter((n) => n.kind === 'figure')).toEqual([])
    assertCopyContract(unread)
    const empty = <RepliesCard view={{ ...repliesView({ ...OSSUR_EMPTY_QUEUE }, view().window) }} state={STATE} selected={false} />
    const zero = renderText(empty)
    expect(zero).toContain('0 comments 0 ready to buy 0 questions 0 objections 0 wrong information No comment from these days read as a question')
    expect(zero).not.toContain('Open the replies')
    assertCopyContract(empty)
  })
})
