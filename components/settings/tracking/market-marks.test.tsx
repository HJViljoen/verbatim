import { describe, expect, it } from 'vitest'

import { segmentCounts, type SegmentCounts } from '@/lib/settings/your-market'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'

import { MAKER_RULES, MakersSection, NotMyMarketSection } from './market-marks'

// Settings › What we read: "Makers" and "This is not my market" (WP3.10).
// Staging, read-only, 27 Sep 2026 (Sealand, September, the page's own reads):
// 625 category videos, 220 of them makers' (35%); 53 of the market's 654
// off-topic (8%);
// no video marked "not my market" yet.

const MONTH = '2026-09-01'
const SEALAND: SegmentCounts = { category: 625, categoryMakers: 220, marketNoise: 53, market: 654 }
const read = (t: string): string => t.replace(/\s+([,.)])/g, '$1').replace(/\(\s+/g, '(')

describe('segmentCounts', () => {
  it('counts the category’s makers and the market’s off-topic videos, by each video’s segment', () => {
    const market = [
      { id: 'a', platform: 'youtube', audience: 'industry-other' },
      { id: 'b', platform: 'youtube', audience: 'industry-other' },
      { id: 'c', platform: 'tiktok', audience: 'industry-other' },
      { id: 'd', platform: 'tiktok', audience: 'competitor:Cotopaxi' },
      { id: 'e', platform: 'reddit', audience: 'competitor:Cotopaxi' },
    ]
    // A rival-filed maker is not a category maker; a video with no row is the market's.
    const seg = new Map([['a', 'maker'], ['b', 'noise'], ['d', 'maker'], ['e', 'noise']])
    expect(segmentCounts(market, seg)).toEqual({ category: 3, categoryMakers: 1, marketNoise: 2, market: 5 })
  })
})

describe('Makers', () => {
  const el = <MakersSection month={MONTH} makers="measured" counts={SEALAND} conversationLabel="Conversation" conversationHref="/dashboard/voice" />

  it('gives the month’s maker share of the category, with its base', () => {
    expect(read(renderText(el))).toContain('In September, makers’ own videos (sewing, crochet and DIY) are 35% of 625 category videos in your market.')
  })

  it('states decision F’s four rules at the shares the board applies', () => {
    const t = renderText(el)
    expect(MAKER_RULES.map((r) => r.label)).toEqual(['Kept', 'Grouped', 'Marked', 'Not quoted'])
    expect(t).toContain('A theme where half or more of the videos are makers’ becomes one makers line.')
    expect(t).toContain('A theme where a fifth or more of the videos are makers’ prints its maker share.')
    expect(t).toContain('The headline quotes only a theme that is a quarter makers or fewer.')
    expect(t).toContain('Makers stay in your market’s size, subjects, kinds of comment and mood.')
  })

  it('promises no view switch and no call date the code does not keep', () => {
    const t = renderText(el)
    expect(t).not.toContain('Buyers')
    expect(t).not.toMatch(/late November|13 Oct/)
  })

  it('links to the makers line on Conversation, and nothing else', () => {
    expect(renderText(el)).toContain('See the makers line on Conversation →')
    expect(render(el).match(/<a /g)).toHaveLength(1)
  })

  it('draws nothing where no maker rule is switched on (Össur, plan §2.13), and "not measured" before MF1', () => {
    expect(render(<MakersSection month={MONTH} makers="no_rule" counts={null} conversationLabel="Conversation" conversationHref="/dashboard/voice" />)).toBe('')
    expect(renderText(<MakersSection month={MONTH} makers="not_measured" counts={null} conversationLabel="Conversation" conversationHref="/dashboard/voice" />)).toContain('not measured')
  })

  it('keeps the copy contract, with no em dash', () => {
    assertCopyContract(el)
    expect(renderText(el)).not.toContain('—')
  })
})

describe('This is not my market', () => {
  const el = <NotMyMarketSection month={MONTH} byYou={0} counts={SEALAND} />

  it('says what a mark does today: a label that keeps the video in every count', () => {
    const t = renderText(el)
    expect(t).toContain('we mark it off-topic. It stays in every count, marked, and is grouped with the off-topic videos.')
    // Nothing the code does not do: no menu on every video, no set aside from
    // the count, no putting it back (lib/segments/override.ts).
    expect(t).not.toMatch(/put it back|open its menu|leave your count/)
  })

  it('lists what is set aside, by you, by us and by rule', () => {
    const t = read(renderText(el))
    expect(t).toContain('By you nothing yet')
    expect(t).toContain('8% of 654 market videos in September.')
    expect(t).toContain('By rule your own posts, and the comments under brands’ own posts. Neither is counted in your market.')
    expect(read(renderText(<NotMyMarketSection month={MONTH} byYou={2} counts={SEALAND} />))).toContain('By you 2 videos you marked')
  })

  it('says nothing is marked by us where no rule is on (Össur), rather than "not measured"', () => {
    const t = read(renderText(<NotMyMarketSection month={MONTH} byYou={0} counts={null} makers="no_rule" />))
    expect(t).toContain('By us nothing: no off-topic rule is switched on for your workspace.')
    expect(t).not.toContain('not measured')
  })

  it('reads "not measured" where a table is not there', () => {
    const t = renderText(<NotMyMarketSection month={MONTH} byYou={null} counts={null} />)
    expect(t.match(/not measured/g)).toHaveLength(2)
  })

  it('keeps the copy contract, with no em dash', () => {
    assertCopyContract(el)
    expect(renderText(el)).not.toContain('—')
  })
})
