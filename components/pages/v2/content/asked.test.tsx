import { describe, expect, it } from 'vitest'
import { render, renderText as rawText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { askedFixture, OCT } from '@/lib/pages/v2/content-fixture'
import type { ContentState } from '@/lib/pages/v2/content'
import { AskedCard } from './asked'

/** The page's words as read: a tag between a word and its comma is not a space. */
const renderText = (node: Parameters<typeof rawText>[0]): string => rawText(node).replace(/\s+([,.])/g, '$1')

const STATE: ContentState = { period: 'week', open: null, asked: false }
const card = (over: Partial<Parameters<typeof AskedCard>[0]> = {}) => (
  <AskedCard block={askedFixture()} state={STATE} month={OCT} weekWord="this week" weekHead="This week" {...over} />
)

describe('Also asked, and not yet in your posts', () => {
  it('lists the questions with who asks (no counts), the subject, the week beside its month, and three bare weekly counts', () => {
    const text = renderText(card())
    expect(text).toContain('Question people asked Who asks Subject This week October so far The last three weeks')
    // The month beside the week; on a phone the same month under it, in its cell.
    expect(text).toContain('How a socket should fit as a child grows Caregivers and family Fit & comfort 12 17 in October so far 17 8 · 9 · 12')
    expect(text).not.toMatch(/Trend|▲|steady/)
    expect(text).toContain('1 more was touched on by your posts and is left out.')
    expect(render(card())).toContain(`href="/dashboard/market?conv=`)
    assertCopyContract(card())
  })

  it('does not claim to be the step’s ranking: conversations filed as questions, besides the cards above', () => {
    const text = renderText(card())
    expect(text).toContain('Conversations filed as questions this week, besides those above, that none of your posts since August touched on, the most videos first')
    expect(text).not.toMatch(/next questions|in line/)
    expect(renderText(card({ afterIdeas: false }))).toContain('Conversations filed as questions this week that none of your posts since August touched on, the most videos first')
  })

  it('names a window that is not a week by its days (decision 1), and ranks the month by the month', () => {
    const long = renderText(card({ weekWord: 'between 10 Sep and 10 Oct', weekHead: '10 Sep to 10 Oct' }))
    expect(long).toContain('Question people asked Who asks Subject 10 Sep to 10 Oct October so far')
    expect(long).not.toContain('This week')
    const month = renderText(card({ block: askedFixture('month'), state: { ...STATE, period: 'month' } }))
    expect(month).toContain('Conversations filed as questions in October so far')
    // Ranked by the month: the knee question (14 in October) before the skin one (13).
    expect(month.indexOf('Which knee suits')).toBeLessThan(month.indexOf('Looking after the skin'))
  })

  it('keeps its frame where it has no row: the headings, and one line in the table', () => {
    const none = { ...askedFixture(), rows: [], total: 0, touched: 0 }
    const text = renderText(card({ block: none }))
    expect(text).toContain('Question people asked Who asks Subject This week October so far The last three weeks No other question came up this week.')
    expect(renderText(card({ block: none, afterIdeas: false }))).toContain('No question came up this week.')
    const unread = { ...none, unread: 'The questions people asked could not be read just now.' }
    expect(renderText(card({ block: unread }))).toContain('The last three weeks The questions people asked could not be read just now.')
    assertCopyContract(card({ block: unread }))
  })

  it('claims nothing about your posts where they could not be read: nothing was left out as touched', () => {
    const text = renderText(card({ block: { ...askedFixture(), posts: null } }))
    expect(text).toContain('Conversations filed as questions this week, besides those above, the most videos first')
    expect(text).not.toContain('none of your posts')
  })

  it('lists them all on request', () => {
    const all = askedFixture('week', true)
    expect(all.rows.length).toBe(all.total)
  })
})
