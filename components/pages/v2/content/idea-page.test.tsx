import { describe, expect, it } from 'vitest'
import { render, renderText as rawText } from '@/lib/test/render'
import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { SEALAND_CLIENT_ID } from '@/lib/config'
import { MEDICAL_LINE } from '@/lib/post-ideas/medical'
import { IDEA_MISSING, IDEA_NOT_ON, IDEA_UNREAD, SUB_NONE_QUOTABLE } from '@/lib/pages/v2/content-idea'
import { contentIdeaFixture } from '@/lib/pages/v2/content-levels-fixture'
import { ContentIdeaPage, ideaStats } from './idea-page'
import { weeksOverlapNote } from './ideas'

// A POST IDEA'S PAGE, THE HUB (G5-Content-Idea, -Idea-Switcher, -Idea-Thin,
// -Idea-Phone): what it prints, in the board's order, in every state.

/** The page's words as read: a tag between a word and its comma is not a space. */
const renderText = (node: Parameters<typeof rawText>[0]): string => rawText(node).replace(/\s+([,.])/g, '$1')
const page = (o: Parameters<typeof contentIdeaFixture>[0] = {}) => <ContentIdeaPage data={contentIdeaFixture(o)} />

// A video commented on in two weeks counts in each week's bar and once in
// the total, so the bars can add up to more (Sealand, 5 Nov: 8 + 1 + 2 + 5
// beside "15 over the four weeks"). Said under the bars only where they do.
describe('the weekly bars beside the four weeks\' total', () => {
  it('says why the weeks add up to more, only where they do', () => {
    const weeks = [8, 1, 2, 5].map((count, i) => ({ label: `w${i}`, count }))
    expect(weeksOverlapNote(weeks, 15)).toBe('A video commented on in two of these weeks counts in both, so the weeks add up to more than 15.')
    expect(weeksOverlapNote(weeks, 16)).toBeNull()
    expect(weeksOverlapNote([{ count: null }], 0)).toBeNull()
    const d = contentIdeaFixture()
    const over = { ...d, weeks: [30, 10, 6, 9].map((count, i) => ({ label: `w${i}`, count })) } as typeof d
    const text = renderText(<ContentIdeaPage data={over} />)
    expect(text).toContain('48 over the four weeks')
    expect(text).toContain('so the weeks add up to more than 48.')
    assertCopyContract(<ContentIdeaPage data={over} />)
  })
})

describe('a post idea\'s page', () => {
  it('opens with the path and the title block: "Content / {idea}", the title, "Post idea 1, from the conversation {conversation}", the figures row with the days it read beside its month', () => {
    const m = render(page())
    const text = renderText(page())
    expect(m).toMatch(/data-crumb-row=""[\s\S]*href="\/dashboard\/content"[^>]*>Content</)
    expect(m).toContain('data-level-bar="idea"')
    // The audit design's title block: no tile, no label over the title.
    expect(m).toContain('data-level-block="audit"')
    expect(m).not.toContain('data-level-tile')
    expect(text).toContain('Post idea 1, from the conversation How long a liner lasts')
    expect(m).toContain('href="/dashboard/market/conversations/a1000000-0000-4000-8000-000000000001"')
    // The four weeks beside their month, in the figures row (decision 1).
    expect(text).toContain('Questions asked 14 Sep to 11 Oct Came up in 48 of 640 videos in your market October so far 31 of 318 videos')
    expect(m).toContain('data-stat-strip=""')
    expect(text).not.toContain('·')
    // The page's one h1 is the idea's title, the model's, stored.
    expect(m.match(/<h1\b/g)).toHaveLength(1)
    expect(m).toMatch(/<h1[^>]*><span data-copy="stored" data-slot="post_idea">How long does a liner last/)
    // No period switch: the four weeks are fixed.
    expect(m).not.toContain('aria-label="Period"')
  })

  it('leads with what the post should cover, the medical line once, and how to make it in three facts in the header tile', () => {
    const text = renderText(page())
    const at = (s: string) => text.indexOf(s)
    expect(at('What the post should cover')).toBeGreaterThan(0)
    expect(at('How long liners usually last, the signs it is time, and what wears them out faster')).toBeGreaterThan(at('What the post should cover'))
    expect(text.split(MEDICAL_LINE)).toHaveLength(2)
    // Where it came up is the figures row's now, said once.
    expect(text.split('Came up in')).toHaveLength(2)
    expect(at('Came up in')).toBeLessThan(at('What the post should cover'))
    expect(text).toContain('Make it as Tutorial 2.1× a typical video on this question')
    expect(text).toContain('Open with A question 1.8× a typical video on this question')
    expect(text).toContain('Length 30 to 45 seconds The middle half of 9 tutorial videos on this question that drew at least a typical response')
  })

  it('then what they want to know, the numbers, the market videos, the conversation in Market and the Agent, in the board\'s order', () => {
    const text = renderText(page())
    const order = ['What they want to know', 'Four questions inside it, sorted from 33 comments on 23 videos, the most videos first', 'The numbers', 'Over the four weeks the idea read, beside October so far', 'Market videos where this came up, best response first', 'It comes from the conversation How long a liner lasts', 'Draft this post with the Agent, from what people asked.']
    for (let i = 1; i < order.length; i++) expect(text.indexOf(order[i]), order[i]).toBeGreaterThan(text.indexOf(order[i - 1]))
    // The month is the figures row's (decision 1), so the line says the four
    // weeks alone; where it came up is a bare count of the row's 48 with bars
    // against the largest (decisions 2 and 5).
    expect(text).toContain('Market videos where it came up, week by week')
    expect(text).toContain('48 over the four weeks.')
    expect(text).toContain('Where it came up TikTok 21 Instagram 16 YouTube 11')
    expect(text).toContain('None of your 13 posts since August touched on it. Read over your posts published since 1 August, the touch test the idea was picked by.')
    expect(text).toContain('Who’s asking New amputees, first year in Voices Caregivers and family in Voices Long-time users upgrading in Voices')
    expect(text).not.toMatch(/[→↗↓·]/)
    expect(render(page())).toContain('data-week-bars="lg"')
    // Each opens its group's page in Voices (Voices' levels are pages, 17 Oct).
    expect(render(page())).toContain('href="/dashboard/voices/groups/new-amputees"')
    // Each market video a whole link, its title in the commenters' serif, its
    // line a sentence.
    expect(text).toContain('“Your liner has an expiry date. Here is how to read it.” The Amputee Diaries on YouTube. Tutorial, opens with a question. 2.6× a typical video')
    expect(render(page())).toMatch(/<a data-market-video="" href="[^"]+" target="_blank" rel="noopener noreferrer"/)
  })

  it('gives each sub-question its card: its videos of the videos asked and its comments in one sentence, its bar, two comments and "Show all"', () => {
    const m = render(page())
    const text = renderText(page())
    expect(m.match(/data-sub-card=""/g)).toHaveLength(4)
    expect(text).toContain('How long it should last In 11 of the 23 videos, with 14 comments asking it.')
    // Its bar against the largest sub-question's (decision 5): the first full.
    expect(m).toMatch(/data-sub-card=""[\s\S]*?width:100%/)
    expect(m.match(/data-sub-comment=""/g)!.length).toBeGreaterThanOrEqual(7)
    expect(m).toContain('href="/dashboard/content/ideas/i0000001-0000-4000-8000-000000000000?sub=1#sub-1"')
    expect(text).toContain('Show all 14 comments')
    // A comment in Spanish carries its English, as every quote does.
    expect(renderText(page({ sub: 4 }))).toContain('“¿El seguro cubre un liner nuevo cada año?” Spanish, machine translation Does insurance cover a new liner every year?')
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
    expect(text).toContain('Post idea 1, from the conversation How the prosthesis works')
    expect(text).toContain('Make it as Story 1.1× a typical video on this question')
    expect(text).toContain('Open with No opening stands out on this question yet')
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
    expect(text).toMatch(/(August|September) \d+ of \d+ videos/)
  })

  it('a sub-question whose comments could not be read keeps its card and says so', () => {
    const text = renderText(page({ commentsUnread: true }))
    expect(text).toContain('with 14 comments asking it. Its comments could not be read just now.')
    expect(text).not.toContain('Show all')
  })

  it('carries the medical line only in a medical market', () => {
    expect(renderText(page({ clientId: SEALAND_CLIENT_ID }))).not.toContain(MEDICAL_LINE)
  })

  it('an address that names no idea prints one calm line and the way back, never a 404', () => {
    for (const [state, line] of [['missing', IDEA_MISSING], ['not_on', IDEA_NOT_ON], ['unread', IDEA_UNREAD]] as const) {
      const m = render(page({ state }))
      expect(renderText(page({ state }))).toContain(`${line} Back to Content`)
      expect(renderText(page({ state }))).not.toContain('→')
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

  it('builds its figures row: the days, the four weeks of the market\'s, the month beside them', () => {
    const cells = ideaStats(contentIdeaFixture().page!)
    expect(cells.map((c) => c.term)).toEqual(['Questions asked', 'Came up in', 'October so far'])
    expect(cells[0].value).toBe('14 Sep to 11 Oct')
    // No month, no four-week figure (decision 1): each cell says so.
    const noMonth = ideaStats({ ...contentIdeaFixture().page!, month: null })
    expect(noMonth[1].value).toBe('Could not be counted just now')
    expect(noMonth[2].value).toBe('Not read yet')
  })

  it('says once, under the tiles, that no comment can be quoted where none of them can', () => {
    const d = contentIdeaFixture()
    const none = { ...d, page: { ...d.page!, subquestions: d.page!.subquestions.map((c) => ({ ...c, quotes: [], quotable: 0 })) } }
    const text = renderText(<ContentIdeaPage data={none} />)
    expect(text.split(SUB_NONE_QUOTABLE)).toHaveLength(2)
    expect(render(<ContentIdeaPage data={none} />)).toContain('data-sub-none-once=""')
    assertCopyContract(<ContentIdeaPage data={none} />)
    // Where only some have none, each says so in its own tile.
    expect(render(page())).not.toContain('data-sub-none-once')
  })
})
