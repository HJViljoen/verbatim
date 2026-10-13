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
  <IdeaPanelView panel={ideaPanelFixture(rank, clientId)} state={{ ...STATE, open: { kind: 'idea', rank } }} count={3} month={OCT} weekWord="this week" />
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

  it('states the week, the month beside it, the three weeks as counts and your posts, as levels where they are levels', () => {
    const levels = copyNodes(render(panel(1))).filter((n) => n.kind === 'level').map((n) => n.text)
    expect(levels).toEqual([
      '23 of 241 videos in your market this week where it came up',
      '31 of 318 videos in October so far',
      '0 of 9 posts of yours in October so far touched on it',
    ])
    const text = renderText(panel(1))
    expect(text).toContain('9 · 14 · 23 videos a week, the weeks of 21 Sep, 28 Sep, 5 Oct')
    expect(text).not.toMatch(/new amputees in their first year/)
  })

  it('suggests the post: format, opening, the stored cover and length, and the medical team line in a medical market', () => {
    const text = renderText(panel(1))
    expect(text).toContain('Format Tutorial · 2.1×')
    expect(text).toContain('Open with A question · 1.8×')
    expect(text).toContain('Cover How long liners usually last, the signs it is time, and what wears them out faster')
    expect(text).toContain('Length 30 to 45 seconds')
    expect(text).toContain(MEDICAL_LINE)
    expect(renderText(panel(1, SEALAND_CLIENT_ID))).not.toContain(MEDICAL_LINE)
    // No length stored: no Length.
    expect(renderText(panel(2))).not.toContain('Length')
  })

  it('counts what they want to know off the ids, and names who asks with no count, each opening in Voices', () => {
    const text = renderText(panel(1))
    expect(text).toContain('What they want to know · in 20 videos How long it should last 11 The signs it is worn out 8 Whether liners differ 5 Whether medical aid pays 4')
    expect(text).toContain("Who's asking New amputees, first year → Caregivers and family → Long-time users upgrading → Each opens in Voices")
    expect(render(panel(1))).toContain('href="/dashboard/voices?group=new-amputees"')
  })

  it('relabels the market videos honestly (decision 5): where it came up, best response first', () => {
    const text = renderText(panel(1))
    expect(text).toContain('Market videos where this came up, best response first')
    expect(text).not.toMatch(/answered it well/)
    expect(text).toContain('2.6× typical response')
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
})
