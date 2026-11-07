import { describe, expect, it } from 'vitest'
import { render, renderText as rawText } from '@/lib/test/render'
import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { contentFixture } from '@/lib/pages/v2/content-fixture'
import { REPLIES_ANCHOR, repliesView, type ContentState } from '@/lib/pages/v2/content'
import { WEEK_ANCHORS } from '@/components/pages/week/came-in'
import { RepliesCard } from './replies'

/** The page's words as read: a tag between a word and its comma is not a space. */
const renderText = (node: Parameters<typeof rawText>[0]): string => rawText(node).replace(/\s+([,.])/g, '$1')

const STATE: ContentState = { period: 'week', asked: false }
/** A queue that read and found nothing. */
const OSSUR_EMPTY_QUEUE = { rows: [], flagged: [], counts: [], total: 0, window: { from: '2026-10-04T04:03:00.000Z', to: '2026-10-11T04:02:00.000Z', basis: 'previous_run' as const }, unread: null }

describe('Worth a reply', () => {
  const view = () => contentFixture().replies
  it('counts the comments it picked, split by whose post, and never says they are waiting (decision 5)', () => {
    const node = <RepliesCard view={view()} state={STATE} />
    const text = renderText(node)
    expect(text).toContain('Comments written between 5 and 11 Oct worth an answer from you')
    expect(text).toContain('12 comments, 6 under your posts, 3 under posts about you and 3 elsewhere')
    expect(text).toContain('Ready to buy 5 Questions 3 Objections 3 Wrong information 1')
    // The four kinds as a list of names and counts, as the board draws them.
    expect(render(node).match(/<dt/g)).toHaveLength(4)
    expect(text).not.toMatch(/waiting|oldest/i)
    expect(copyNodes(render(node)).filter((n) => n.kind === 'quote')).toEqual([])
    assertCopyContract(node)
  })

  it('opens the list on its own page, the period kept (depth as pages, 17 Oct)', () => {
    expect(render(<RepliesCard view={view()} state={STATE} />)).toContain('href="/dashboard/content/replies"')
    expect(render(<RepliesCard view={view()} state={{ ...STATE, period: 'month' }} />)).toContain('href="/dashboard/content/replies?period=month"')
  })

  it('carries the anchor old reply links land on (`/dashboard/content#worth-a-reply`)', () => {
    expect(REPLIES_ANCHOR).toBe(WEEK_ANCHORS.reply)
    expect(render(<RepliesCard view={view()} state={STATE} />)).toMatch(/^<article id="worth-a-reply"[^>]*class="[^"]*scroll-mt-6/)
  })

  it('always says where the comments sit (the board’s line): in words where they all sit in one place', () => {
    const one = { ...view(), total: 9, under: { own: 0, about: 0, elsewhere: 9 } }
    const text = renderText(<RepliesCard view={one} state={STATE} />)
    // "9 comments, 9 elsewhere" repeated the count and read oddly (Phase 4).
    expect(text).toContain('9 comments, all elsewhere in your market')
    expect(text).not.toContain('9 elsewhere')
    assertCopyContract(<RepliesCard view={one} state={STATE} />)
    expect(renderText(<RepliesCard view={{ ...one, under: { own: 9, about: 0, elsewhere: 0 } }} state={STATE} />)).toContain('9 comments, all under your posts')
    const two = { ...view(), total: 9, under: { own: 2, about: 0, elsewhere: 7 } }
    expect(renderText(<RepliesCard view={two} state={STATE} />)).toContain('9 comments, 2 under your posts and 7 elsewhere')
  })

  it('keeps its four kinds where there is no list, and says why once, in the dashed box', () => {
    const none = repliesView(null, null)
    const unread = <RepliesCard view={{ ...none, unread: 'No update has covered a week yet, so there is no reply list.' }} state={STATE} />
    const text = renderText(unread)
    expect(text).toContain('No update has covered a week yet')
    // The kinds keep their names, with no number they cannot know (decision 4).
    expect(render(unread)).toContain('data-empty-box=""')
    // The reason is said once, in the box: no "Not read" beside each kind.
    expect(text).toContain('Ready to buy Questions Objections Wrong information')
    expect(text).not.toContain('Not read')
    expect(text.split('No update has covered a week yet')).toHaveLength(2)
    expect(copyNodes(render(unread)).filter((n) => n.kind === 'figure')).toEqual([])
    assertCopyContract(unread)
    const empty = <RepliesCard view={{ ...repliesView({ ...OSSUR_EMPTY_QUEUE }, view().window) }} state={STATE} />
    const zero = renderText(empty)
    expect(zero).toContain('0 comments Ready to buy 0 Questions 0 Objections 0 Wrong information 0 No comment from these days read as a question')
    expect(zero).not.toContain('Open the replies')
    assertCopyContract(empty)
  })
})
