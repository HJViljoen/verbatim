import { describe, expect, it } from 'vitest'
import { render, renderText as rawText } from '@/lib/test/render'
import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { SEALAND_CLIENT_ID } from '@/lib/config'
import { MEDICAL_LINE } from '@/lib/post-ideas/medical'
import { ideaPanelFixture, OCT } from '@/lib/pages/v2/content-fixture'
import type { ContentState } from '@/lib/pages/v2/content'
import { IdeaPanelView } from './idea-panel'

/** The page's words as read: a tag between a word and its comma is not a space. */
const renderText = (node: Parameters<typeof rawText>[0]): string => rawText(node).replace(/\s+([,.])/g, '$1')

const STATE: ContentState = { period: 'week', open: { kind: 'idea', rank: 1 }, asked: false }
const panel = (rank: 1 | 2 | 3 = 1, clientId?: string) => (
  <IdeaPanelView panel={ideaPanelFixture(rank, clientId)} state={{ ...STATE, open: { kind: 'idea', rank } }} count={3} month={OCT} />
)

describe('A post idea, opened in place', () => {
  it('is the full-width panel under the row, its notch at the card that opened it, and keeps the copy contract', () => {
    const m = render(panel(1))
    expect(m).toMatch(/^<section id="idea-panel" aria-labelledby="idea-title" data-panel=""/)
    expect(m).toContain('calc(16.67% - 9px)')
    expect(render(panel(3))).toContain('calc(83.33% - 9px)')
    expect(m).toContain('href="/dashboard/content"')
    assertCopyContract(panel(1))
    assertCopyContract(panel(2))
  })

  it('states the four weeks the ideas read, the month beside them, each week as a count and your posts, as levels where they are levels', () => {
    const levels = copyNodes(render(panel(1))).filter((n) => n.kind === 'level').map((n) => n.text)
    expect(levels).toEqual([
      '48 of 640 videos in your market where it came up, 14 Sep to 11 Oct',
      '31 of 318 videos in October so far',
      '0 of 13 posts of yours since August touched on it',
    ])
    const text = renderText(panel(1))
    // Four bare counts, one a week the ideas read, with no word (decision 1).
    expect(text).toContain('6 · 9 · 14 · 23 videos a week, the weeks of 14 Sep, 21 Sep, 28 Sep, 5 Oct')
    expect(text).not.toMatch(/this week where it came up|Rising|trend/i)
    expect(text).not.toMatch(/new amputees in their first year/)
  })

  it('suggests the post: format, opening, the stored cover and length, and the medical team line in a medical market', () => {
    const text = renderText(panel(1))
    expect(text).toContain('Format Tutorial · 2.1×')
    expect(text).toContain('Open with A question · 1.8×')
    expect(text).toContain('Cover How long liners usually last, the signs it is time, and what wears them out faster')
    // The length is code's numbers (T13's `cover.length`), a figure, with its basis.
    expect(text).toContain('Length 30 to 45 seconds The middle half of 9 tutorial videos on this question that drew at least a typical response')
    expect(renderText(panel(2))).toContain('Length 25 to 75 seconds The middle half of 50 videos, in any format, on this question that drew at least a typical response')
    expect(copyNodes(render(panel(1))).filter((n) => n.kind === 'figure').map((n) => n.text)).toContain('30 to 45 seconds')
    expect(text).toContain('against a typical market video on this question')
    expect(text).toContain(MEDICAL_LINE)
    expect(renderText(panel(1, SEALAND_CLIENT_ID))).not.toContain(MEDICAL_LINE)
    // No length stored: no Length.
    expect(renderText(panel(3))).not.toContain('Length')
  })

  it('counts what they want to know off the ids, and names who asks with no count, each opening in Voices', () => {
    const text = renderText(panel(1))
    // Each sub-question's videos are OF the videos whose comments went to the
    // writer (`cover.asked.videos`), never the union of their own.
    expect(text).toContain('What they want to know · of 23 videos How long it should last 11 The signs it is worn out 8 Whether liners differ 5 Whether medical aid pays 4')
    expect(render(panel(1))).toContain('aria-label="11 of 23 videos"')
    expect(text).toContain("Who's asking New amputees, first year → Caregivers and family → Long-time users upgrading → Each opens in Voices")
    expect(render(panel(1))).toContain('href="/dashboard/voices?group=new-amputees"')
  })

  it('relabels the market videos honestly (decision 5): where it came up, best response first', () => {
    const text = renderText(panel(1))
    expect(text).toContain('Market videos where this came up, best response first')
    expect(text).not.toMatch(/answered it well/)
    // The videos' multiple is against a typical market video this month, not
    // the format's (against a typical video on this question).
    expect(text).toContain('Each video’s response against a typical market video published in October so far.')
    expect(text).toContain('2.6× a typical video')
  })

  it('prints the comments’ words here, one click down, as quote nodes', () => {
    const quotes = copyNodes(render(panel(1))).filter((n) => n.kind === 'quote').map((n) => n.text)
    expect(quotes).toContain('“Is it normal that my liner feels loose after six months? Nobody told me they wear out.”')
    expect(quotes).toContain('“nobody told me they wear out”')
  })

  it('offers the Agent and the conversation in Market', () => {
    const m = render(panel(1))
    expect(m).toContain('href="/dashboard/agent?ask=Draft%20an%20outline')
    expect(m).toContain(`href="/dashboard/market?conv=`)
  })

  it('names the days the idea read its questions from (Heinrich, 13 Oct: four weeks to its update)', () => {
    expect(renderText(panel(1))).toMatch(/^Post idea 1 From questions asked 14 Sep to 11 Oct Fit & comfort/)
    const older = <IdeaPanelView panel={ideaPanelFixture(1, undefined, true)} state={STATE} count={3} month={OCT} />
    expect(renderText(older)).toMatch(/^Post idea 1 From questions asked 31 Aug to 27 Sep/)
    assertCopyContract(older)
  })

  it('words a null format and opening neutrally (T13 also leaves one null when none clears 1.1×)', () => {
    const base = ideaPanelFixture(1)
    const node = <IdeaPanelView panel={{ ...base, card: { ...base.card, format: null, opening: null } }} state={STATE} count={3} month={OCT} />
    const text = renderText(node)
    expect(text).toContain('Format No format stands out on this question yet')
    expect(text).toContain('Open with No opening stands out on this question yet')
    expect(text).not.toMatch(/Too few|multiples? (are|is) the response/)
    expect(text).toContain(MEDICAL_LINE)
    assertCopyContract(node)
    const one = renderText(<IdeaPanelView panel={{ ...base, card: { ...base.card, opening: null } }} state={STATE} count={3} month={OCT} />)
    expect(one).toContain('The multiple is the response of the market’s videos on this question made that way against a typical market video on this question.')
  })

  it('says when the videos are ordered by views, not response', () => {
    const base = ideaPanelFixture(1)
    const none = renderText(<IdeaPanelView panel={{ ...base, videos: base.videos.map((v) => ({ ...v, multiple: null })) }} state={STATE} count={3} month={OCT} />)
    expect(none).toContain('Market videos where this came up, the most viewed first None of these videos has a response figure, so they are ordered by views.')
    const some = renderText(<IdeaPanelView panel={{ ...base, videos: base.videos.map((v, i) => (i === 2 ? { ...v, multiple: null } : v)) }} state={STATE} count={3} month={OCT} />)
    expect(some).toContain('a video with no response figure follows, the most viewed first')
  })
})
