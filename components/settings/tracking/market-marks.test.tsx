import { describe, expect, it } from 'vitest'

import { segmentCounts, type SegmentCounts } from '@/lib/settings/your-market'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'

import { MAKER_RULES, MakersCard, NotMyMarketCard } from './market-marks'

// Settings › What we read: "Makers" and "This is not my market", the two
// cards the approved preview ends on (WP3.10). Staging, read-only, 27 Sep
// 2026 (Sealand, September, the page's own reads): 625 category videos, 220
// of them makers' (35%); 53 of the market's 654 off-topic (8%); no video
// marked "not my market" yet; the makers line: 7 maker-led themes at 10 or
// more, led by "Love for creative upcycling" (72) and "Admiration for handmade
// craftsmanship" (65).

const MONTH = '2026-09-01'
const SEALAND: SegmentCounts = { category: 625, categoryMakers: 220, marketNoise: 53, market: 654 }
const read = (t: string): string => t.replace(/\s+([,.)])/g, '$1').replace(/\(\s+/g, '(').replace(/\s+/g, ' ')

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

const LINE = { count: 7, lead: [{ label: 'Love for creative upcycling', k: 72 }, { label: 'Admiration for handmade craftsmanship', k: 65 }] }

describe('Makers', () => {
  const el = <MakersCard month={MONTH} makers="measured" counts={SEALAND} line={LINE} askOnCall conversationLabel="Conversation" conversationHref="/dashboard/voice" />

  it('gives the month’s maker share of the category as its figure, with its base', () => {
    expect(read(renderText(el))).toContain('35% of 625 category videos in your market in September are makers’ own: sewing, crochet and DIY.')
  })

  it('states decision F’s four rules at the shares the board applies, with the month’s makers line under Grouped', () => {
    const t = read(renderText(el))
    expect(MAKER_RULES.map((r) => r.label)).toEqual(['Kept', 'Grouped', 'Marked', 'Not quoted'])
    expect(t).toContain('Makers stay in your market’s size, subjects, kinds of comment and mood.')
    expect(t).toContain('A theme where half or more of the videos are makers’ becomes one makers line. In September: 7 themes at 10 or more, led by Love for creative upcycling (72) and Admiration for handmade craftsmanship (65).')
    expect(t).toContain('A theme where a fifth or more of the videos are makers’ prints its maker share.')
    expect(t).toContain('The headline quotes only a theme that is a quarter makers or fewer.')
    expect(read(renderText(<MakersCard month={MONTH} makers="measured" counts={SEALAND} conversationLabel="Conversation" conversationHref="/dashboard/voice" />)))
      .toContain('becomes one makers line. Marked')
  })

  it('draws the view switch as the preview does: Everything on, Buyers and Makers from late November', () => {
    const html = render(el)
    expect(html).toContain('aria-pressed="true"')
    expect(html.match(/disabled=""/g)).toHaveLength(2)
    expect(read(renderText(el))).toContain('Everything Buyers Makers from late November')
  })

  it('asks about makers on our next call only where the searches are held still, and names no call date', () => {
    expect(renderText(el)).toContain('We ask you on our next call whether makers are part of your market.')
    const unlocked = renderText(<MakersCard month={MONTH} makers="measured" counts={SEALAND} conversationLabel="Conversation" conversationHref="/dashboard/voice" />)
    expect(unlocked).not.toContain('next call')
    expect(renderText(el)).not.toMatch(/13 Oct/)
  })

  it('links to the makers line on Conversation, and nothing else', () => {
    expect(read(renderText(el))).toContain('See the makers line on Conversation →')
    expect(render(el).match(/<a /g)).toHaveLength(1)
  })

  it('draws nothing where no maker rule is switched on (Össur, plan §2.13), and "not measured" before MF1', () => {
    expect(render(<MakersCard month={MONTH} makers="no_rule" counts={null} conversationLabel="Conversation" conversationHref="/dashboard/voice" />)).toBe('')
    expect(renderText(<MakersCard month={MONTH} makers="not_measured" counts={null} conversationLabel="Conversation" conversationHref="/dashboard/voice" />)).toContain('not measured')
  })

  it('keeps the copy contract, with no em dash', () => {
    assertCopyContract(el)
    expect(renderText(el)).not.toContain('—')
  })
})

describe('This is not my market', () => {
  const el = <NotMyMarketCard month={MONTH} byYou={0} counts={SEALAND} />

  it('says what a mark does today in three steps: tell us, it is marked and stays counted until late November, it is counted here', () => {
    const t = read(renderText(el))
    expect(t).toContain('Tell us when something we read is not your market, and we mark it off-topic.')
    expect(t).toContain('1 Tell us which video or quote, and we give it the mark: This is not my market')
    expect(t).toContain('2 It is marked off-topic and stays in every count until late November, when off-topic videos leave your count in the months still filling. A month that is already final keeps what it was read with.')
    expect(t).toContain('3 It is counted here, as set aside by you.')
    // Nothing the code does not do: no menu on every video, no account as a
    // target, no putting it back (lib/segments/override.ts).
    expect(t).not.toMatch(/put it back|open its menu|account/)
  })

  it('lists what is set aside, by you, by us and by rule', () => {
    const t = read(renderText(el))
    expect(t).toContain('Set aside By you nothing yet')
    expect(t).toContain('8% of 654 market videos in September. From late November they leave your count, and the count says so.')
    expect(t).toContain('By rule your own posts, and the comments under brands’ own posts. Neither is counted in your market.')
    expect(read(renderText(<NotMyMarketCard month={MONTH} byYou={2} counts={SEALAND} />))).toContain('By you 2 videos you marked')
  })

  it('promises nothing leaves a count where no rule is on (Össur), and marks nothing by us', () => {
    const t = read(renderText(<NotMyMarketCard month={MONTH} byYou={0} counts={null} makers="no_rule" />))
    expect(t).toContain('By us nothing: no off-topic rule is switched on for your workspace.')
    expect(t).toContain('2 It is marked off-topic and stays in every count.')
    expect(t).not.toMatch(/late November|not measured/)
  })

  it('reads "not measured" where a table is not there', () => {
    const t = renderText(<NotMyMarketCard month={MONTH} byYou={null} counts={null} />)
    expect(t.match(/not measured/g)).toHaveLength(2)
  })

  it('keeps the copy contract, with no em dash', () => {
    assertCopyContract(el)
    expect(renderText(el)).not.toContain('—')
  })
})
