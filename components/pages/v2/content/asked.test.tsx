import { describe, expect, it } from 'vitest'
import { render, renderText as rawText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { askedFixture, OCT } from '@/lib/pages/v2/content-fixture'
import type { ContentState } from '@/lib/pages/v2/content'
import { AskedCard } from './asked'

/** The page's words as read: a tag between a word and its comma is not a space. */
const renderText = (node: Parameters<typeof rawText>[0]): string => rawText(node).replace(/\s+([,.])/g, '$1')

const STATE: ContentState = { period: 'week', open: null, asked: false }

describe('Also asked, and not yet in your posts', () => {
  it('lists the next questions with who asks (no counts), the subject, the videos and three bare weekly counts', () => {
    const node = <AskedCard block={askedFixture()} state={STATE} month={OCT} weekWord="this week" />
    const text = renderText(node)
    expect(text).toContain('Question people asked Who asks Subject Videos this week The last three weeks')
    expect(text).toContain('How a socket should fit as a child grows Caregivers and family Fit & comfort 12 8 · 9 · 12')
    expect(text).not.toMatch(/Trend|▲|steady/)
    expect(text).toContain('1 more was touched on by your posts and is left out.')
    expect(render(node)).toContain(`href="/dashboard/market?conv=`)
    assertCopyContract(node)
  })

  it('reads the month instead when the switch says so, and lists them all on request', () => {
    expect(renderText(<AskedCard block={askedFixture('month')} state={{ ...STATE, period: 'month' }} month={OCT} weekWord="this week" />)).toContain('Videos October so far')
    const all = askedFixture('week', true)
    expect(all.rows.length).toBe(all.total)
  })
})
