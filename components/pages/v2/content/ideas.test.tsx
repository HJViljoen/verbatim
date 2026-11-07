import { describe, expect, it } from 'vitest'
import { render, renderText as rawText } from '@/lib/test/render'
import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '@/lib/config'
import { MEDICAL_LINE } from '@/lib/post-ideas/medical'
import { contentEmptyFixture, contentFixture, contentThinFixture, ideaCards, OCT } from '@/lib/pages/v2/content-fixture'
import { IDEA_SLOTS, questionSlotsContext, type ContentPageData } from '@/lib/pages/v2/content'
import { IdeaCardView, IdeasSection, OwnTouchLine, QuestionCardView } from './ideas'

/** The page's words as read: a tag between a word and its comma is not a space. */
const renderText = (node: Parameters<typeof rawText>[0]): string => rawText(node).replace(/\s+([,.])/g, '$1')

const section = (clientId = OSSUR_CLIENT_ID) => {
  const data = contentFixture({ clientId })
  return <IdeasSection block={data.ideas} month={OCT} ctx={questionSlotsContext(data)} />
}
/** The row as the page draws it for these data. */
const row = (data: ContentPageData) => <IdeasSection block={data.ideas} month={OCT} ctx={questionSlotsContext(data)} />
/** Each card's kind, in order (`idea`, `question` or `empty`). */
const slots = (m: string): string[] => [...m.matchAll(/<article id="idea-\d"|data-idea-slot="(question|empty)"/g)].map((x) => x[1] ?? 'idea')

describe('What to post next', () => {
  it('draws one card an idea, biggest first, and keeps the copy contract', () => {
    const text = renderText(section())
    // "when they were picked": a card can say a post has touched on it since,
    // and the heading must not be contradicted by one.
    // The ideas read four weeks of questions (Heinrich, 13 Oct), and say which.
    // The four weeks' base said once, in the lead (decision 2), and the note
    // "Biggest first" beside the heading (the audit design).
    expect(text).toMatch(/^What to post next Biggest first From questions asked 14 Sep to 11 Oct, across 640 market videos, that none of your posts since August had touched on when they were picked\./)
    expect(text.indexOf('How long does a liner last')).toBeLessThan(text.indexOf('What to do when insurance'))
    expect(text.indexOf('What to do when insurance')).toBeLessThan(text.indexOf('Can you get a prosthetic leg wet?'))
    assertCopyContract(section())
  })

  it('prints no comment’s words on a card: level 1 holds no quote', () => {
    expect(copyNodes(render(section())).filter((n) => n.kind === 'quote')).toEqual([])
  })

  it('states the four weeks the ideas read beside the month, and each of those weeks as a bare count with no word', () => {
    const [card] = ideaCards()
    // The bases said once on the screen (the lead's four weeks, the figures
    // row's month): the counts are bare figures in one sentence (decision 2).
    const node = <IdeaCardView card={card} month={OCT} readLabel="14 Sep to 11 Oct" readBase={640} monthBase={318} />
    const m = render(node)
    expect(copyNodes(m).filter((n) => n.kind === 'level')).toEqual([])
    expect(renderText(node)).toContain('48 videos from 14 Sep to 11 Oct, and 31 in October so far.')
    // Where the screen does not say a base, its count keeps its "of N".
    const own = copyNodes(render(<IdeaCardView card={card} month={OCT} readLabel="14 Sep to 11 Oct" />)).filter((n) => n.kind === 'level').map((n) => n.text)
    expect(own).toEqual([expect.stringMatching(/^48\s*of 640 videos, 14 Sep to 11 Oct$/), '31 of 318 in October so far'])
    // The four weekly counts are the bars' own figures: 6, 9, 14 and 23,
    // named by their weeks, at the boards' 12px (HTML, never a shrinking SVG).
    expect(copyNodes(m).filter((n) => n.kind === 'figure').map((n) => n.text)).toEqual(expect.arrayContaining(['6', '9', '14', '23']))
    expect(m).toContain('Market videos a week where it came up: 14 Sep 6, 21 Sep 9, 28 Sep 14, 5 Oct 23')
    expect(m).toMatch(/data-week-bars=""/)
    expect(m).not.toMatch(/text-\[(9|10|11)(\.5)?px\]/)
    expect(m).not.toMatch(/videos this week/)
    expect(renderText(<IdeaCardView card={card} month={OCT} readLabel="14 Sep to 11 Oct" />)).not.toMatch(/Rising|usual level|trend/i)
  })

  it('prints the four weeks only beside their month: no month, the four-week figure goes too (decision 1)', () => {
    const [card] = ideaCards()
    const noMonth = render(<IdeaCardView card={{ ...card, month: null }} month={OCT} readLabel="14 Sep to 11 Oct" />)
    expect(copyNodes(noMonth).filter((n) => n.kind === 'level')).toEqual([])
    expect(noMonth).not.toContain('of 640 videos')
    // The month alone where the four weeks were not read: bare beside the
    // figures row's base, its "of N" without it.
    const noRead = <IdeaCardView card={{ ...card, read: null }} month={OCT} readLabel="14 Sep to 11 Oct" monthBase={318} />
    expect(copyNodes(render(noRead)).filter((n) => n.kind === 'level')).toEqual([])
    expect(renderText(noRead)).toContain('31 videos in October so far.')
    expect(copyNodes(render(<IdeaCardView card={{ ...card, read: null }} month={OCT} readLabel="14 Sep to 11 Oct" />)).filter((n) => n.kind === 'level').map((n) => n.text))
      .toEqual([expect.stringMatching(/^31\s*of 318 videos in October so far\.$/)])
  })

  it('an older set prints its figure beside ITS month, never the page’s', () => {
    const older = contentFixture({ olderIdeas: true })
    expect(older.ideas.week?.month).toMatchObject({ month: '2026-08-01', complete: true })
    // Its month is not the figures row's, so the month keeps its "of N"; the
    // four weeks' base is the lead's, so that count is bare.
    const levels = copyNodes(render(row(older))).filter((n) => n.kind === 'level').map((n) => n.text)
    expect(levels[0]).toBe('31 of 318 in August')
    expect(levels.join(' ')).not.toContain('October so far')
    expect(renderText(row(older))).toContain('48 videos from 31 Aug to 27 Sep, and 31 of 318 in August.')
  })

  it('prints a flag only where one was earned: the anomaly check’s, or the week read’s new', () => {
    const cards = ideaCards()
    const flag = (i: number) => copyNodes(render(<IdeaCardView card={cards[i]} month={OCT} readLabel="14 Sep to 11 Oct" />)).filter((n) => n.kind === 'verdict').map((n) => n.text)
    expect(flag(0)).toEqual([])
    expect(flag(1)).toEqual(['Unusual this week'])
    expect(flag(2)).toEqual(['New'])
  })

  it('names who asks without a count (decision 5), and whether your posts touched on it', () => {
    const cards = ideaCards()
    const one = renderText(<IdeaCardView card={cards[0]} month={OCT} readLabel="14 Sep to 11 Oct" />)
    expect(one).toContain("Who's asking New amputees, first year, Caregivers and family")
    expect(one).not.toMatch(/\d+ of \d+ new amputees/i)
    // The post-ideas step's own test and window: the reading month and the
    // two before (since August), to the week's end.
    expect(one).toContain('Your posts None of your 13 posts since August touched on it')
    expect(renderText(<IdeaCardView card={cards[2]} month={OCT} readLabel="14 Sep to 11 Oct" />)).toContain('1 of your 13 posts since August touched on it')
    expect(renderText(<OwnTouchLine own={{ state: 'no_posts', touched: 0, posts: 0, since: '2026-08-01' }} />)).toBe('You published nothing of your own since August')
  })

  it('suggests the format and the opening with their multiples', () => {
    const text = renderText(<IdeaCardView card={ideaCards()[0]} month={OCT} readLabel="14 Sep to 11 Oct" />)
    expect(text).toContain('Suggested format Tutorial, 2.1× Suggested opening A question, 1.8×')
    // T13's multiples are on the question: what 1× is, said once over the
    // row (the audit design), never on each card.
    const row = renderText(section())
    expect(row.split('1× is a typical market video on this question')).toHaveLength(2)
    expect(text).not.toContain('1× is a typical')
  })

  it('carries the medical team line once under the Össur ideas (decision 14), and on no Sealand one', () => {
    const ossur = renderText(section(OSSUR_CLIENT_ID))
    expect(ossur.split(MEDICAL_LINE)).toHaveLength(2)
    expect(ossur.indexOf(MEDICAL_LINE)).toBeGreaterThan(ossur.lastIndexOf('Open the brief'))
    expect(renderText(section(SEALAND_CLIENT_ID))).not.toContain(MEDICAL_LINE)
  })

  it('opens each idea on its own page, by its row, and nothing in place (depth as pages, 17 Oct)', () => {
    const m = render(section())
    expect(m).toContain('href="/dashboard/content/ideas/i0000001-0000-4000-8000-000000000000"')
    expect(m).toContain('href="/dashboard/content/ideas/i0000003-0000-4000-8000-000000000000"')
    expect(m).not.toMatch(/Close ↑|aria-expanded|\?idea=/)
  })

  it('marks the model’s title as stored under the post_idea slot', () => {
    const titles = copyNodes(render(section())).filter((n) => n.kind === 'stored')
    expect(titles.map((n) => n.slot)).toEqual(['post_idea', 'post_idea', 'post_idea'])
  })

  it('keeps the board’s three cards in every state: ideas first, then the next questions in line, then empty cards (parity pass)', () => {
    expect(slots(render(section()))).toEqual(['idea', 'idea', 'idea'])
    expect(slots(render(row(contentFixture({ ideas: 'fewer' }))))).toEqual(['idea', 'question', 'question'])
    for (const ideas of ['not_on', 'none', 'stale', 'unread'] as const) {
      expect(slots(render(row(contentFixture({ ideas }))))).toEqual(['question', 'question', 'question'])
      assertCopyContract(row(contentFixture({ ideas })))
    }
    expect(slots(render(row(contentThinFixture())))).toHaveLength(IDEA_SLOTS)
    // No update yet: three cards still, each empty, the first two saying why.
    const empty = contentEmptyFixture()
    expect(slots(render(row(empty)))).toEqual(['empty', 'empty', 'empty'])
    expect(renderText(row(empty))).toContain('1 Post ideas are not switched on for this workspace. 2 No update has covered a week yet. 3')
    // Questions came up but your posts touched on all of them: the empty
    // card says that, not that none came up (the fresh check).
    const touched = contentFixture({ ideas: 'fewer' })
    const allTouched = { ...touched, ideas: { ...touched.ideas, questions: [] }, asked: { ...touched.asked, rows: [], total: 0, touched: 4 } }
    expect(renderText(row(allTouched))).toContain('2 Every other question people asked was touched on by one of your posts. 3')
    assertCopyContract(row(empty))
  })

  it('a question card draws the idea card’s anatomy from what the data holds, and says calmly why it holds no idea', () => {
    const data = contentFixture({ ideas: 'not_on' })
    const node = row(data)
    const text = renderText(node)
    // What the cards are, in the board's place over the row.
    // What the cards are, and that post ideas are off, said once over the row.
    expect(text).toMatch(/^What to post next Post ideas are not switched on\. Questions people asked this week that none of your posts since August touched on, the most videos first/)
    expect(text.split('not switched on')).toHaveLength(2)
    expect(text).not.toContain('Post idea ')
    // The top of the also-asked list, the most videos first.
    expect(text.indexOf('Liner lifespan and replacement')).toBeLessThan(text.indexOf('Insurance refusals for powered knees'))
    // The week's figure beside its month (decision 1), both bare: their bases
    // are the figures row's (decision 2).
    expect(copyNodes(render(node)).filter((n) => n.kind === 'level')).toEqual([])
    expect(text).toContain('Liner lifespan and replacement 23 videos this week, and 31 in October so far.')
    expect(text).toContain("Who's asking New amputees, first year, Caregivers and family")
    expect(text).toContain('Your posts None of your 13 posts since August touched on it')
    // The facts the data holds, flowing from the top as an idea card's do.
    expect(text).toContain("Who's asking New amputees, first year, Caregivers and family Came up on TikTok 12, YouTube 6, Instagram 3, Reddit 2 Comments 71 this week, 97 in October so far Subject No subject holds it Your posts None of your 13 posts since August touched on it Open in Market")
    expect(text).toContain('Subject Fit & comfort Your posts')
    expect(text).not.toContain('Open the brief')
    expect(render(node)).toContain('href="/dashboard/market/conversations/a1000000-0000-4000-8000-000000000001"')
    // The flag an idea on it would wear, only where it was earned.
    expect(copyNodes(render(node)).filter((n) => n.kind === 'verdict').map((n) => n.text)).toEqual(['Unusual this week'])
    // The label is the conversation's own, never a quote, and the three weeks are bare counts.
    expect(copyNodes(render(node)).filter((n) => n.kind === 'quote')).toEqual([])
    expect(copyNodes(render(node)).filter((n) => n.kind === 'subject' && n.slot === 'pass_b_theme').map((n) => n.text)).toEqual(['Liner lifespan and replacement', 'Insurance refusals for powered knees', 'How a socket should fit as a child grows'])
    expect(render(node)).toContain('Market videos a week where it came up: 21 Sep ')
    expect(text).not.toMatch(/Rising|usual level|trend/i)
    assertCopyContract(node)
  })

  it('a question card keeps its facts where the data is thin: no group, no posts read, a month read', () => {
    const data = contentThinFixture()
    const [q] = data.ideas.questions
    const ctx = questionSlotsContext(data)
    const card = (c = ctx) => renderText(<QuestionCardView row={{ ...q, groups: [] }} rank={1} state="not_on" ctx={c} />)
    expect(card()).toContain("Who's asking No group cites it")
    expect(card({ ...ctx, posts: null })).toContain('Your posts could not be read just now')
    expect(card({ ...ctx, posts: 0 })).toContain('You published nothing of your own since August')
    // A page dumped before the count was carried says it without one.
    expect(card({ ...ctx, posts: undefined })).toContain('None of your posts since August touched on it')
    // A fact not read is left out, never printed empty; the week's comments
    // never print without the month's (decision 1).
    const unreadFacts = renderText(<QuestionCardView row={{ ...q, platforms: null, comments: { week: 40, month: null } }} rank={1} state="not_on" ctx={ctx} />)
    expect(unreadFacts).not.toMatch(/Came up on|Comments/)
    // The month's figure leads where the page reads the month.
    const month = <QuestionCardView row={q} rank={1} state="not_on" ctx={{ ...ctx, period: 'month', when: 'in October so far' }} />
    expect(copyNodes(render(month)).filter((n) => n.kind === 'level')).toEqual([])
    expect(renderText(month)).toContain('31 videos in October so far.')
    // A set with fewer ideas says it of the question, not of the workspace.
    expect(renderText(<QuestionCardView row={q} rank={2} state="ready" ctx={ctx} />)).toContain('Your posts None of your 13 posts since August touched on it Post idea None was written for this question Open in Market')
  })

  it('a set of fewer than three ideas keeps its own line over the row, and its cards after it hold questions', () => {
    const data = contentFixture({ ideas: 'fewer' })
    const text = renderText(row(data))
    // The line over the row names the questions after the idea too.
    expect(text).toMatch(/^What to post next Biggest first From questions asked 14 Sep to 11 Oct, across 640 market videos, that none of your posts since August had touched on when they were picked, then the next questions asked this week\. /)
    expect(text).toContain('Open the brief')
    expect(text.split('Post idea None was written for this question')).toHaveLength(3)
    expect(text).not.toContain('not switched on')
    // The questions in the cards are not the idea's own.
    expect(data.ideas.questions.map((q) => q.registryId)).not.toContain(data.ideas.cards[0].registryId)
    assertCopyContract(row(data))
  })

  it('prints the days the ideas read, and says plainly when no newer ideas were written', () => {
    const current = renderText(section())
    expect(current).toContain('From questions asked 14 Sep to 11 Oct')
    expect(current).not.toContain('No new ideas this week')
    const older = contentFixture({ olderIdeas: true })
    const node = row(older)
    // An older set prints ITS four weeks, and the week it was written for.
    expect(renderText(node)).toContain('From questions asked 31 Aug to 27 Sep, across 640 market videos, that none of your posts')
    expect(renderText(node)).toContain('48 videos from 31 Aug to 27 Sep')
    expect(renderText(node)).toContain('No new ideas this week. These are from the week of 21 Sep.')
    assertCopyContract(node)
  })

  it('suggests what stands out and words a null one neutrally: no label over a chip that is not there', () => {
    const [card] = ideaCards()
    const view = (c: typeof card) => renderText(<IdeaCardView card={c} month={OCT} readLabel="14 Sep to 11 Oct" />)
    const noOpening = view({ ...card, opening: null })
    expect(noOpening).toContain('Suggested format Tutorial, 2.1× Open the brief')
    expect(noOpening).not.toContain('Suggested opening')
    expect(view({ ...card, format: null })).toContain('Your posts None of your 13 posts since August touched on it Suggested opening A question, 1.8×')
    const neither = view({ ...card, format: null, opening: null })
    expect(neither).not.toMatch(/Suggested|1× is a typical/)
    // The medical line is the row's, said once under the cards (decision 14).
    expect(neither).not.toContain(MEDICAL_LINE)
    assertCopyContract(<IdeaCardView card={{ ...card, format: null, opening: null }} month={OCT} readLabel="14 Sep to 11 Oct" />)
  })
})
