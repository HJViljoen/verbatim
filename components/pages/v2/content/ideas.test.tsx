import { describe, expect, it } from 'vitest'
import { render, renderText as rawText } from '@/lib/test/render'
import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '@/lib/config'
import { MEDICAL_LINE } from '@/lib/post-ideas/medical'
import { contentFixture, ideaCards, OCT } from '@/lib/pages/v2/content-fixture'
import type { ContentState } from '@/lib/pages/v2/content'
import { IdeaCardView, IdeasSection, OwnTouchLine } from './ideas'

/** The page's words as read: a tag between a word and its comma is not a space. */
const renderText = (node: Parameters<typeof rawText>[0]): string => rawText(node).replace(/\s+([,.])/g, '$1')

const STATE: ContentState = { period: 'week', open: null, asked: false }
const section = (clientId = OSSUR_CLIENT_ID, state = STATE) => {
  const data = contentFixture({ clientId })
  return <IdeasSection block={data.ideas} state={state} month={OCT} weekWord="this week" />
}

describe('What to post next', () => {
  it('draws one card an idea, biggest first, and keeps the copy contract', () => {
    const text = renderText(section())
    expect(text).toMatch(/^What to post next Questions people asked this week that your posts in October have not touched on, biggest first/)
    expect(text.indexOf('How long does a liner last')).toBeLessThan(text.indexOf('What to do when insurance'))
    expect(text.indexOf('What to do when insurance')).toBeLessThan(text.indexOf('Can you get a prosthetic leg wet?'))
    assertCopyContract(section())
  })

  it('prints no comment’s words on a card: level 1 holds no quote', () => {
    expect(copyNodes(render(section())).filter((n) => n.kind === 'quote')).toEqual([])
  })

  it('states the week beside its month, and the last three weeks as bare counts with no word', () => {
    const [card] = ideaCards()
    const m = render(<IdeaCardView card={card} state={STATE} selected={false} month={OCT} weekWord="this week" />)
    const levels = copyNodes(m).filter((n) => n.kind === 'level').map((n) => n.text)
    expect(levels).toEqual(['23 of 241 videos this week', '31 of 318 in October so far'])
    // The three weekly counts are the bars' own figures: 9, 14 and 23.
    expect(copyNodes(m).filter((n) => n.kind === 'figure').map((n) => n.text)).toEqual(expect.arrayContaining(['9', '14', '23']))
    expect(renderText(<IdeaCardView card={card} state={STATE} selected={false} month={OCT} weekWord="this week" />)).not.toMatch(/Rising|usual level|trend/i)
  })

  it('prints a flag only where one was earned: the anomaly check’s, or the week read’s new', () => {
    const cards = ideaCards()
    const flag = (i: number) => copyNodes(render(<IdeaCardView card={cards[i]} state={STATE} selected={false} month={OCT} weekWord="this week" />)).filter((n) => n.kind === 'verdict').map((n) => n.text)
    expect(flag(0)).toEqual([])
    expect(flag(1)).toEqual(['Unusual this week'])
    expect(flag(2)).toEqual(['New'])
  })

  it('names who asks without a count (decision 5), and whether your posts touched on it', () => {
    const cards = ideaCards()
    const one = renderText(<IdeaCardView card={cards[0]} state={STATE} selected={false} month={OCT} weekWord="this week" />)
    expect(one).toContain("Who's asking New amputees, first year, Caregivers and family")
    expect(one).not.toMatch(/\d+ of \d+ new amputees/i)
    expect(one).toContain('Your posts None of your 9 posts in October so far touched on it')
    expect(renderText(<IdeaCardView card={cards[2]} state={STATE} selected={false} month={OCT} weekWord="this week" />)).toContain('1 of your 9 posts in October so far touched on it')
    expect(renderText(<OwnTouchLine own={{ state: 'no_posts', touched: 0, posts: 0 }} month={OCT} />)).toBe('You published nothing of your own in October so far')
  })

  it('suggests the format and the opening with their multiples', () => {
    const text = renderText(<IdeaCardView card={ideaCards()[0]} state={STATE} selected={false} month={OCT} weekWord="this week" />)
    expect(text).toContain('Suggested format and opening Tutorial 2.1× Open with a question 1.8×')
  })

  it('carries the medical team line on every Össur idea, and on no Sealand one', () => {
    const ossur = renderText(section(OSSUR_CLIENT_ID))
    expect(ossur.split(MEDICAL_LINE)).toHaveLength(4)
    expect(renderText(section(SEALAND_CLIENT_ID))).not.toContain(MEDICAL_LINE)
  })

  it('opens the idea in place, and the open card wears the ring and closes', () => {
    expect(render(section())).toContain('href="/dashboard/content?idea=1#idea-panel"')
    const open = render(section(OSSUR_CLIENT_ID, { ...STATE, open: { kind: 'idea', rank: 2 } }))
    expect(open).toMatch(/<article id="idea-2"[^>]*class="[^"]*ring-2 ring-foreground/)
    expect(open).toContain('Close ↑')
    expect(open).toMatch(/aria-expanded="true" aria-controls="idea-panel"/)
  })

  it('marks the model’s title as stored under the post_idea slot', () => {
    const titles = copyNodes(render(section())).filter((n) => n.kind === 'stored')
    expect(titles.map((n) => n.slot)).toEqual(['post_idea', 'post_idea', 'post_idea'])
  })

  it('says honestly why there is no idea, and where the questions are', () => {
    const notOn = contentFixture({ ideas: 'not_on' })
    const text = renderText(<IdeasSection block={notOn.ideas} state={STATE} month={OCT} weekWord="this week" />)
    expect(text).toContain('Post ideas are not switched on for this workspace yet.')
    expect(text).toContain('The questions people asked are listed under Also asked.')
    const none = renderText(<IdeasSection block={{ state: 'none', cards: [] }} state={STATE} month={OCT} weekWord="this week" />)
    expect(none).toContain('No post ideas were written for this week.')
    assertCopyContract(<IdeasSection block={notOn.ideas} state={STATE} month={OCT} weekWord="this week" />)
  })
})
