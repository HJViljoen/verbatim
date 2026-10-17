import { describe, expect, it } from 'vitest'
import { render, renderText as rawText } from '@/lib/test/render'
import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { SEALAND_CLIENT_ID } from '@/lib/config'
import { MEDICAL_LINE } from '@/lib/post-ideas/medical'
import { IDEA_MISSING, IDEA_NOT_ON, IDEA_UNREAD } from '@/lib/pages/v2/content-idea'
import { contentIdeaFixture } from '@/lib/pages/v2/content-levels-fixture'
import { ContentIdeaPage, ideaMeta } from './idea-page'

// A POST IDEA'S PAGE, THE HUB (G5-Content-Idea, -Idea-Switcher, -Idea-Thin,
// -Idea-Phone): what it prints, in the board's order, in every state.

/** The page's words as read: a tag between a word and its comma is not a space. */
const renderText = (node: Parameters<typeof rawText>[0]): string => rawText(node).replace(/\s+([,.])/g, '$1')
const page = (o: Parameters<typeof contentIdeaFixture>[0] = {}) => <ContentIdeaPage data={contentIdeaFixture(o)} />

describe('a post idea\'s page', () => {
  it('opens with the path and the title block: "Content / {idea}", the lightbulb, "Post idea 1, from {conversation}", the days it read beside its month', () => {
    const m = render(page())
    const text = renderText(page())
    expect(m).toMatch(/data-crumb-row=""[\s\S]*href="\/dashboard\/content"[^>]*>Content</)
    expect(m).toContain('data-level-bar="idea"')
    expect(m).toContain('data-level-tile="idea"')
    expect(m).toMatch(/data-level-tile="idea" class="[^"]*bg-accent text-orange-text/)
    expect(text).toContain('Post idea 1, from How long a liner lasts')
    expect(m).toContain('href="/dashboard/market/conversations/a1000000-0000-4000-8000-000000000001"')
    expect(text).toContain('From questions asked 14 Sep to 11 Oct · 48 of 640 videos · 31 of 318 in October so far')
    // The page's one h1 is the idea's title, the model's, stored.
    expect(m.match(/<h1\b/g)).toHaveLength(1)
    expect(m).toMatch(/<h1[^>]*><span data-copy="stored" data-slot="post_idea">How long does a liner last/)
    // No period switch: the four weeks are fixed.
    expect(m).not.toContain('aria-label="Period"')
  })

  it('leads with what the post should cover, the medical line, and four figures in the header card', () => {
    const text = renderText(page())
    const at = (s: string) => text.indexOf(s)
    expect(at('What the post should cover')).toBeGreaterThan(0)
    expect(at('How long liners usually last, the signs it is time, and what wears them out faster')).toBeGreaterThan(at('What the post should cover'))
    expect(text).toContain(MEDICAL_LINE)
    expect(text).toContain('Came up in 48 of 640 videos in your market, 14 Sep to 11 Oct 31 of 318 in October so far')
    expect(text).toContain('Make it as Tutorial 2.1× a typical video on this question')
    expect(text).toContain('Open with A question 1.8× a typical video on this question')
    expect(text).toContain('Length 30 to 45 seconds The middle half of 9 tutorial videos on this question that drew at least a typical response')
  })

  it('then what they want to know, the numbers, the market videos, the conversation in Market and the Agent, in the board\'s order', () => {
    const text = renderText(page())
    const order = ['What they want to know', 'Four questions inside it, sorted from 33 comments on 23 videos, the most videos first', 'The numbers', 'Over the four weeks the idea read, beside October so far', 'Market videos where this came up, best response first', 'It comes from the conversation How long a liner lasts', 'Draft this post with the Agent, from what people asked.']
    for (let i = 1; i < order.length; i++) expect(text.indexOf(order[i]), order[i]).toBeGreaterThan(text.indexOf(order[i - 1]))
    expect(text).toContain('48 over the four weeks · 31 in October so far')
    expect(text).toContain('Where it came up · of 48 TikTok 21 Instagram 16 YouTube 11')
    expect(text).toContain('None of your 13 posts since August touched on it')
    expect(text).toContain('Read over your posts published since 1 August, the touch test the idea was picked by.')
    expect(text).toContain('New amputees, first year → Caregivers and family → Long-time users upgrading → Each opens in Voices')
    // Each opens its group's page in Voices (Voices' levels are pages, 17 Oct).
    expect(render(page())).toContain('href="/dashboard/voices/groups/new-amputees"')
    expect(text).toContain('“Your liner has an expiry date. Here is how to read it.” The Amputee Diaries · YouTube · tutorial · opens with a question 2.6× a typical video')
  })

  it('gives each sub-question its card: its videos of the videos asked, its bar, its comments, two of them and "Show all"', () => {
    const m = render(page())
    const text = renderText(page())
    expect(m.match(/data-sub-card=""/g)).toHaveLength(4)
    expect(text).toContain('11 of 23 videos How long it should last 14 comments asking it')
    expect(m.match(/data-sub-comment=""/g)!.length).toBeGreaterThanOrEqual(7)
    expect(m).toContain('href="/dashboard/content/ideas/i0000001-0000-4000-8000-000000000000?sub=1#sub-1"')
    expect(text).toContain('Show all 14 comments')
    // A comment in Spanish carries its English, as every quote does.
    expect(renderText(page({ sub: 4 }))).toContain('“¿El seguro cubre un liner nuevo cada año?” Spanish · machine translation Does insurance cover a new liner every year?')
  })

  it('opens one sub-question\'s comments by its address, and closes it again', () => {
    const m = render(page({ sub: 1 }))
    expect(m).toMatch(/id="sub-1"[\s\S]*Show fewer comments/)
    expect(m).toContain('href="/dashboard/content/ideas/i0000001-0000-4000-8000-000000000000#sub-1"')
    const card = m.slice(m.indexOf('id="sub-1"'), m.indexOf('id="sub-2"'))
    expect(card.match(/data-sub-comment=""/g)).toHaveLength(14)
  })

  it('opens its switcher on the set\'s ideas, the flagged one\'s state in words, the board\'s wide menu', () => {
    const m = render(<ContentIdeaPage data={contentIdeaFixture()} switcherOpen />)
    expect(m).toContain('aria-label="Switch to another post idea"')
    expect(m).toMatch(/role="menu" aria-label="Post ideas for 5 to 11 Oct"/)
    expect(m).toContain('w-[460px]')
    expect(m).toMatch(/aria-checked="true"[\s\S]*How long does a liner last/)
    expect(renderText(<ContentIdeaPage data={contentIdeaFixture()} switcherOpen />)).toContain('What to do when insurance says no to a powered knee Unusual this week')
  })

  it('draws the thin idea in the board\'s shape: no chevron with one idea, a figure with nothing to state keeps its frame and says so', () => {
    const m = render(page({ thin: true }))
    const text = renderText(page({ thin: true }))
    expect(m).not.toContain('data-crumb-chevron')
    expect(text).toContain('Post idea 1, from How the prosthesis works')
    expect(text).toContain('Make it as Story 1.1× a typical video on this question')
    expect(text).toContain('Open with · No opening stands out on this question yet')
    expect(text).toContain('Length 10 to 60 seconds The middle half of 28 story videos')
    expect(text).toContain('Two questions inside it, sorted from 9 comments on 6 videos, the most videos first')
    expect(text).toContain('No group in your market’s profile cites it yet.')
    expect(text).toContain('No short phrase in these comments reads well enough to borrow.')
    expect(text).toContain('Market videos where this came up, the most viewed first None of these videos has a response figure, so they are ordered by views.')
    expect(text).toContain('no response figure')
  })

  it('wears the anomaly check\'s chip where the check flagged it, and no other', () => {
    expect(copyNodes(render(page({ rank: 2 }))).filter((n) => n.kind === 'verdict').map((n) => n.text)).toContain('Unusual this week')
    expect(copyNodes(render(page())).filter((n) => n.kind === 'verdict')).toEqual([])
  })

  it('an older idea still opens, and says which week it was written for', () => {
    const text = renderText(page({ older: true }))
    // From an earlier set while a newer one exists: never "No new ideas this week".
    expect(text).toContain('This idea was written for the week of 21 Sep, before the ideas Content shows now.')
    expect(text).not.toContain('No new ideas this week')
    // Beside its own read window's month, in full.
    expect(text).toMatch(/of \d+ in (August|September)/)
  })

  it('a sub-question whose comments could not be read keeps its card and says so', () => {
    const text = renderText(page({ commentsUnread: true }))
    expect(text).toContain('14 comments asking it Its comments could not be read just now.')
    expect(text).not.toContain('Show all')
  })

  it('carries the medical line only in a medical market', () => {
    expect(renderText(page({ clientId: SEALAND_CLIENT_ID }))).not.toContain(MEDICAL_LINE)
  })

  it('an address that names no idea prints one calm line and the way back, never a 404', () => {
    for (const [state, line] of [['missing', IDEA_MISSING], ['not_on', IDEA_NOT_ON], ['unread', IDEA_UNREAD]] as const) {
      const m = render(page({ state }))
      expect(renderText(page({ state }))).toContain(`${line} Back to Content →`)
      expect(m).toContain('href="/dashboard/content"')
      assertCopyContract(page({ state }))
    }
  })

  it('keeps the copy contract in every state, and puts no comment\'s words in a prose node', () => {
    for (const o of [{}, { rank: 2 as const }, { thin: true }, { sub: 1 }, { sub: 4 }, { older: true }, { commentsUnread: true }, { clientId: SEALAND_CLIENT_ID }]) {
      assertCopyContract(page(o))
    }
    expect(copyNodes(render(page())).filter((n) => n.kind === 'prose')).toEqual([])
  })

  it('breaks its meta into its phone lines: the days, then the four weeks beside the month', () => {
    const lines = ideaMeta(contentIdeaFixture().page!)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toEqual(['From questions asked 14 Sep to 11 Oct'])
    expect(lines[1]).toHaveLength(2)
    // No month, no four-week figure (decision 1).
    const noMonth = ideaMeta({ ...contentIdeaFixture().page!, month: null })
    expect(noMonth[1]).toEqual([])
  })
})
