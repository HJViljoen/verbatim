import { describe, expect, it } from 'vitest'
import { render, renderText as rawText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { worksFixture } from '@/lib/pages/v2/content-fixture'
import { WorksCard } from './works'

/** The page's words as read: a tag between a word and its comma is not a space. */
const renderText = (node: Parameters<typeof rawText>[0]): string => rawText(node).replace(/\s+([,.])/g, '$1')

describe('What works in your market’s videos', () => {
  it('draws the two charts best response first, your posts as marks, and keeps the copy contract', () => {
    const node = <WorksCard block={worksFixture()} />
    const text = renderText(node)
    expect(text).toContain('How the video is made')
    expect(text).toContain('How it opens')
    expect(text.indexOf('Story')).toBeLessThan(text.indexOf('Promotional'))
    expect(text).toContain('Response · 1× = typical Your 9 posts')
    const m = render(node)
    expect(m).toContain('data-units="6/9"')
    expect(m).toContain('aria-label="6 of your 9 posts"')
    assertCopyContract(node)
  })

  it('prints the sentence about your mix with every number a figure', () => {
    const text = renderText(<WorksCard block={worksFixture()} />)
    expect(text).toContain('6 of your 9 posts in October so far were promotional videos, which draw 0.7× a typical video.')
    expect(text).toContain('Read from 412 of 640 market videos published in October so far that have a format.')
  })

  it('keeps both charts’ frames where it cannot be read, and says why once', () => {
    const empty = { ...worksFixture(), formats: [], openings: [], sentence: null, basis: null, unread: 'Too few videos.' }
    const text = renderText(<WorksCard block={empty} />)
    expect(text).toContain('How the video is made')
    expect(text).toContain('How it opens')
    expect(text.split('Too few videos.')).toHaveLength(2)
    // Each chart keeps its axis: an empty track with the 1× tick.
    expect(render(<WorksCard block={empty} />).match(/data-works-empty=""/g)).toHaveLength(2)
    assertCopyContract(<WorksCard block={empty} />)
    // One chart empty: that chart says why, beside its axis.
    const one = { ...worksFixture(), openings: [] }
    expect(renderText(<WorksCard block={one} />)).toContain('How it opens Kind of video Response · 1× = typical Your 9 posts Too few rated videos of any one opening yet')
  })

  it('fits more posts than the board’s nine in one row of marks, and prints no “0 of 0” where you published nothing', () => {
    const m = render(<WorksCard block={{ ...worksFixture(), posts: 13 }} />)
    expect(m).toMatch(/data-units="6\/13" class="[^"]*flex-nowrap[^"]*\[&amp;&gt;span\]:flex-1/)
    const none = <WorksCard block={{ ...worksFixture(), posts: 0, formats: worksFixture().formats.map((r) => ({ ...r, yours: 0 })) }} />
    expect(renderText(none)).toContain('Response · 1× = typical Your posts')
    expect(renderText(none)).not.toContain('0 of 0')
    assertCopyContract(none)
  })
})
