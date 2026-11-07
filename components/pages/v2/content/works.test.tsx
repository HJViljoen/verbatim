import { describe, expect, it } from 'vitest'
import { render, renderText as rawText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { worksFixture } from '@/lib/pages/v2/content-fixture'
import { worksBasis } from '@/lib/pages/v2/content'
import { WorksCard } from './works'

/** The page's words as read: a tag between a word and its comma is not a space. */
const renderText = (node: Parameters<typeof rawText>[0]): string => rawText(node).replace(/\s+([,.])/g, '$1')

describe('What works in your market’s videos', () => {
  it('draws the two tables best response first, your posts as a plain count, and keeps the copy contract', () => {
    const node = <WorksCard block={worksFixture()} />
    const text = renderText(node)
    expect(text).toContain('How the video is made Kind of video Share of market videos Response Your posts')
    expect(text).toContain('How it opens Opening Share of market videos Response Your posts')
    expect(text).toContain('The dark line on each bar marks 1×, a typical video.')
    expect(text.indexOf('Story')).toBeLessThan(text.indexOf('Promotional'))
    // The share its own column, no middle dot; your posts a bare count (the
    // figures row says how many you published, decision 2).
    expect(text).toContain('Story 22% 3.1× 1')
    expect(text).not.toContain('·')
    const m = render(node)
    expect(m.match(/<table/g)).toHaveLength(2)
    expect(m.match(/<caption/g)).toHaveLength(2)
    expect(m).not.toContain('data-units=')
    assertCopyContract(node)
  })

  it('scales each table to its largest multiple, never below 1×, with the 1× tick at 100 / max (decision 5)', () => {
    const block = worksFixture()
    const max = Math.max(1, ...block.formats.map((r) => r.multiple))
    const m = render(<WorksCard block={block} />)
    expect(m).toContain('width:100%')
    expect(m).toContain(`left:${100 / max}%`)
    // A table whose best is under a typical video still draws 1× on the bar.
    const low = render(<WorksCard block={{ ...block, openings: [], formats: [{ key: 'x', label: 'Story', share: 10, multiple: 0.5, yours: 0 }] }} />)
    expect(low).toContain('width:50%')
    expect(low).toContain('left:100%')
  })

  it('marks a kind below a typical video: its figure in regular weight where the others are at 600, as the board does', () => {
    const m = render(<WorksCard block={worksFixture()} />)
    // Promotional 0.7×, A statistic 0.9× and A before and after 0.6×; 1.0×
    // and up print at 600, every bar the same yellow.
    expect(m.match(/data-below=""/g)).toHaveLength(3)
    expect(m.match(/class="tabular-nums w-10 shrink-0 text-right">/g)).toHaveLength(3)
    expect(m).not.toContain('bg-brand/35')
    // As printed: 0.96× prints 1.0×, so it is not below; 0.94× prints 0.9× and is.
    const one = (multiple: number) => render(<WorksCard block={{ ...worksFixture(), openings: [], formats: [{ key: 'x', label: 'Story', share: 10, multiple, yours: 0 }] }} />)
    expect(one(0.96)).not.toContain('data-below=""')
    expect(one(0.94)).toContain('data-below=""')
  })

  it('prints the sentence about your mix with every number a figure', () => {
    const text = renderText(<WorksCard block={worksFixture()} />)
    expect(text).toContain('6 of your 9 posts in October so far were promotional videos, which draw 0.7× a typical video.')
    expect(text).toContain('Read from 412 of 640 category videos posted in October so far that have a format.')
  })

  // The 6,416 of 5 Nov sat beside the market's 1,192: why it is bigger is
  // said where the numbers say it, and nowhere else.
  it('says why the posted videos outnumber the read ones only where they do', () => {
    const month = { month: '2026-10-01', complete: false }
    const words = (read: number | null) => worksBasis(412, 640, month, read).map((p) => (typeof p === 'string' ? p : p.figure)).join('')
    const MORE = 'These are all the videos posted in the month that we found, so there are more of them than the videos whose comments we read.'
    expect(words(318)).toContain(MORE)
    expect(words(700)).not.toContain(MORE)
    expect(words(null)).not.toContain(MORE)
    expect(words(318)).toMatch(/^Read from 412 of 640 category videos posted in October so far that have a format\. These/)
  })

  it('keeps both charts’ frames where it cannot be read, and says why once', () => {
    const empty = { ...worksFixture(), formats: [], openings: [], sentence: null, basis: null, unread: 'Too few videos.' }
    const text = renderText(<WorksCard block={empty} />)
    expect(text).toContain('How the video is made')
    expect(text).toContain('How it opens')
    expect(text.split('Too few videos.')).toHaveLength(2)
    // Each table keeps its caption, the dashed box in its place (decision 4).
    const m = render(<WorksCard block={empty} />)
    expect(m.match(/data-works-empty=""/g)).toHaveLength(2)
    expect(m.match(/data-empty-box=""/g)).toHaveLength(2)
    assertCopyContract(<WorksCard block={empty} />)
    // One table empty: that table says why, in its own box.
    const one = { ...worksFixture(), openings: [] }
    expect(renderText(<WorksCard block={one} />)).toContain('How it opens Too few rated videos of any one opening yet.')
  })

  it('prints your posts of each kind as a plain count however many you published, and no “0 of 0” where you published nothing', () => {
    // The fresh check: 28 posts and up ran the old marks past the card at 1440.
    for (const posts of [13, 14, 15, 28, 35, 60]) {
      const node = <WorksCard block={{ ...worksFixture(), posts }} />
      expect(render(node)).not.toContain('data-units=')
      expect(renderText(node)).toContain('Story 22% 3.1× 1')
      expect(renderText(node)).not.toContain(`of ${posts}`)
      assertCopyContract(node)
    }
    const none = <WorksCard block={{ ...worksFixture(), posts: 0, formats: worksFixture().formats.map((r) => ({ ...r, yours: 0 })) }} />
    expect(renderText(none)).toContain('Response Your posts')
    expect(renderText(none)).not.toContain('0 of 0')
    assertCopyContract(none)
  })
})
