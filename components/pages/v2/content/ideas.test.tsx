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
  return <IdeasSection block={data.ideas} state={state} month={OCT} />
}

describe('What to post next', () => {
  it('draws one card an idea, biggest first, and keeps the copy contract', () => {
    const text = renderText(section())
    // "when they were picked": a card can say a post has touched on it since,
    // and the heading must not be contradicted by one.
    // The ideas read four weeks of questions (Heinrich, 13 Oct), and say which.
    expect(text).toMatch(/^What to post next From questions asked 14 Sep to 11 Oct that none of your posts since August had touched on when they were picked, biggest first/)
    expect(text.indexOf('How long does a liner last')).toBeLessThan(text.indexOf('What to do when insurance'))
    expect(text.indexOf('What to do when insurance')).toBeLessThan(text.indexOf('Can you get a prosthetic leg wet?'))
    assertCopyContract(section())
  })

  it('prints no comment’s words on a card: level 1 holds no quote', () => {
    expect(copyNodes(render(section())).filter((n) => n.kind === 'quote')).toEqual([])
  })

  it('states the four weeks the ideas read beside the month, and each of those weeks as a bare count with no word', () => {
    const [card] = ideaCards()
    const m = render(<IdeaCardView card={card} state={STATE} selected={false} month={OCT} readLabel="14 Sep to 11 Oct" />)
    const levels = copyNodes(m).filter((n) => n.kind === 'level').map((n) => n.text)
    expect(levels).toEqual(['48 of 640 videos, 14 Sep to 11 Oct', '31 of 318 in October so far'])
    // The four weekly counts are the bars' own figures: 6, 9, 14 and 23,
    // named by their weeks.
    expect(copyNodes(m).filter((n) => n.kind === 'figure').map((n) => n.text)).toEqual(expect.arrayContaining(['6', '9', '14', '23']))
    expect(m).toContain('the weeks of 14 Sep, 21 Sep, 28 Sep, 5 Oct')
    expect(m).not.toMatch(/videos this week/)
    expect(renderText(<IdeaCardView card={card} state={STATE} selected={false} month={OCT} readLabel="14 Sep to 11 Oct" />)).not.toMatch(/Rising|usual level|trend/i)
  })

  it('prints the four weeks only beside their month: no month, the four-week figure goes too (decision 1)', () => {
    const [card] = ideaCards()
    const noMonth = render(<IdeaCardView card={{ ...card, month: null }} state={STATE} selected={false} month={OCT} readLabel="14 Sep to 11 Oct" />)
    expect(copyNodes(noMonth).filter((n) => n.kind === 'level')).toEqual([])
    expect(noMonth).not.toContain('of 640 videos')
    // The month alone where the four weeks were not read.
    const noRead = render(<IdeaCardView card={{ ...card, read: null }} state={STATE} selected={false} month={OCT} readLabel="14 Sep to 11 Oct" />)
    expect(copyNodes(noRead).filter((n) => n.kind === 'level').map((n) => n.text)).toEqual(['31 of 318 in October so far'])
  })

  it('an older set prints its figure beside ITS month, never the page’s', () => {
    const older = contentFixture({ olderIdeas: true })
    expect(older.ideas.week?.month).toMatchObject({ month: '2026-08-01', complete: true })
    const levels = copyNodes(render(<IdeasSection block={older.ideas} state={STATE} month={OCT} />)).filter((n) => n.kind === 'level').map((n) => n.text)
    expect(levels[0]).toBe('48 of 640 videos, 31 Aug to 27 Sep')
    expect(levels[1]).toBe('31 of 318 in August')
    expect(levels.join(' ')).not.toContain('October so far')
  })

  it('prints a flag only where one was earned: the anomaly check’s, or the week read’s new', () => {
    const cards = ideaCards()
    const flag = (i: number) => copyNodes(render(<IdeaCardView card={cards[i]} state={STATE} selected={false} month={OCT} readLabel="14 Sep to 11 Oct" />)).filter((n) => n.kind === 'verdict').map((n) => n.text)
    expect(flag(0)).toEqual([])
    expect(flag(1)).toEqual(['Unusual this week'])
    expect(flag(2)).toEqual(['New'])
  })

  it('names who asks without a count (decision 5), and whether your posts touched on it', () => {
    const cards = ideaCards()
    const one = renderText(<IdeaCardView card={cards[0]} state={STATE} selected={false} month={OCT} readLabel="14 Sep to 11 Oct" />)
    expect(one).toContain("Who's asking New amputees, first year, Caregivers and family")
    expect(one).not.toMatch(/\d+ of \d+ new amputees/i)
    // The post-ideas step's own test and window: the reading month and the
    // two before (since August), to the week's end.
    expect(one).toContain('Your posts None of your 13 posts since August touched on it')
    expect(renderText(<IdeaCardView card={cards[2]} state={STATE} selected={false} month={OCT} readLabel="14 Sep to 11 Oct" />)).toContain('1 of your 13 posts since August touched on it')
    expect(renderText(<OwnTouchLine own={{ state: 'no_posts', touched: 0, posts: 0, since: '2026-08-01' }} />)).toBe('You published nothing of your own since August')
  })

  it('suggests the format and the opening with their multiples', () => {
    const text = renderText(<IdeaCardView card={ideaCards()[0]} state={STATE} selected={false} month={OCT} readLabel="14 Sep to 11 Oct" />)
    // T13's multiples are on the question: 1× is a typical market video on it.
    expect(text).toContain('Suggested format and opening Tutorial 2.1× Open with a question 1.8× 1× is a typical market video on this question')
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
    const text = renderText(<IdeasSection block={notOn.ideas} state={STATE} month={OCT} />)
    expect(text).toContain('Post ideas are not switched on for this workspace.')
    expect(text).toContain('The questions people asked are listed under Also asked.')
    const none = renderText(<IdeasSection block={{ state: 'none', cards: [], week: null }} state={STATE} month={OCT} />)
    expect(none).toContain('No post ideas were written for this week.')
    const stale = contentFixture({ ideas: 'stale' })
    expect(renderText(<IdeasSection block={stale.ideas} state={STATE} month={OCT} />)).toContain('No new post ideas in the last four weeks.')
    assertCopyContract(<IdeasSection block={notOn.ideas} state={STATE} month={OCT} />)
  })

  it('prints the days the ideas read, and says plainly when no newer ideas were written', () => {
    const current = renderText(section())
    expect(current).toContain('From questions asked 14 Sep to 11 Oct')
    expect(current).not.toContain('No new ideas this week')
    const older = contentFixture({ olderIdeas: true })
    const node = <IdeasSection block={older.ideas} state={STATE} month={OCT} />
    // An older set prints ITS four weeks, and the week it was written for.
    expect(renderText(node)).toContain('From questions asked 31 Aug to 27 Sep that none of your posts')
    expect(renderText(node)).toContain('of 640 videos, 31 Aug to 27 Sep')
    expect(renderText(node)).toContain('No new ideas this week. These are from the week of 21 Sep.')
    assertCopyContract(node)
  })

  it('suggests what stands out and words a null one neutrally: no label over a chip that is not there', () => {
    const [card] = ideaCards()
    const view = (c: typeof card) => renderText(<IdeaCardView card={c} state={STATE} selected={false} month={OCT} readLabel="14 Sep to 11 Oct" />)
    const noOpening = view({ ...card, opening: null })
    expect(noOpening).toContain('Suggested format Tutorial 2.1× 1× is a typical market video on this question')
    expect(noOpening).not.toContain('format and opening')
    expect(view({ ...card, format: null })).toContain('Suggested opening Open with a question 1.8×')
    const neither = view({ ...card, format: null, opening: null })
    expect(neither).not.toMatch(/Suggested|1× is a typical/)
    expect(neither).toContain(MEDICAL_LINE)
    assertCopyContract(<IdeaCardView card={{ ...card, format: null, opening: null }} state={STATE} selected={false} month={OCT} readLabel="14 Sep to 11 Oct" />)
  })
})
