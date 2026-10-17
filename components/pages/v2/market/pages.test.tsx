import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract, copyViolations } from '@/lib/test/copy-contract'
import { marketConversationFixture } from '@/lib/pages/v2/market-fixture'
import { ConversationPanel } from './panel'

// MARKET'S LEVEL PAGES' BODIES (17 Oct): a conversation and a tracked
// subject, each its own page, from the page fixtures, against the copy
// contract and the rules the 14 Oct panels set (U6: no block rests on a
// membership that has not passed its check).

describe('ConversationPanel (a conversation\'s page body)', () => {
  const OPEN = marketConversationFixture(3)
  const panel = OPEN.convPage!.panel
  it('the conversation in full: its tags, its stats with their n, our read, its months, who, what, where', () => {
    const text = renderText(<ConversationPanel panel={panel} data={OPEN} />)
    expect(text).toMatch(/^Cost & access Unusual this week Insurance refusals for powered knees 19 of 226 category videos this week 31 of 300 category videos in October so far 19 of 780 category videos in September 39 of 1,906 videos in July to September, every audience together, your own posts included Our read People describe appeals/)
    expect(text).toContain('Month by month · share of the category’s videos')
    expect(text).toContain('October so far · 31 of 300')
    expect(text).toContain('What people did · of 31 in October so far Complained about something 14')
    expect(text).toContain('Who’s saying it Long-time users upgrading Caregivers and family Each opens in Voices')
    expect(text).toContain('Where TikTok 12')
    expect(text).toContain('Ask the Agent about this')
    assertCopyContract(<ConversationPanel panel={panel} data={OPEN} />)
  })

  it('three quotes at level 2, as quote nodes, with who the video is filed under', () => {
    const html = render(<ConversationPanel panel={panel} data={OPEN} />)
    expect(html.match(/data-copy="quote"/g)).toHaveLength(3)
    expect(renderText(<ConversationPanel panel={panel} data={OPEN} />)).toContain('YouTube · 3 Oct Ottobock')
  })

  it('our read is stored prose with its slot', () => {
    expect(render(<ConversationPanel panel={panel} data={OPEN} />)).toContain('data-copy="stored" data-slot="week_read"')
    const desc = { ...panel, ourRead: { slot: 'pass_b_theme' as const, lines: [{ body: 'A 16-inch liner.', figures: {} }] } }
    expect(copyViolations(<ConversationPanel panel={desc} data={OPEN} />)).toEqual([])
  })

})
