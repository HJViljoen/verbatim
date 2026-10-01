import { describe, expect, it } from 'vitest'

import { copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { ConversationsBlockView, KindsBlockView } from './conversations'
import { LONG_RUN_FIXTURE, PICTURE_FIXTURE } from './fixture'
import { HoldsBlock } from './holds'
import { FIRST_RUN_LINE, MarketPicturePage } from './index'
import { MarketPictureSkeleton } from './skeleton'
import { StandsBlockView } from './stands'

// Your market as "the bigger picture" (pages build): each block against the
// copy contract, the design bans (no em dash, no left stripe, no highlight),
// and the client rules (no totals line, a block with nothing is not drawn,
// every tracked subject by name, nothing about how it was made).

const page = () => render(<MarketPicturePage data={PICTURE_FIXTURE} />)

/** The design bans, as markup: no left-stripe accent, no marker highlight,
 *  no gradient wash, no em dash. */
function bans(markup: string): string[] {
  const out: string[] = []
  if (/border-l(?:-|\b)|border-left|\bborder-s-/.test(markup)) out.push('left stripe')
  if (/<mark\b|highlight/i.test(markup)) out.push('highlight')
  if (/gradient/i.test(markup)) out.push('gradient')
  if (/—/.test(markup)) out.push('em dash')
  return out
}

describe('the page', () => {
  it('keeps the copy contract and the design bans', () => {
    expect(copyViolations(<MarketPicturePage data={PICTURE_FIXTURE} />)).toEqual([])
    expect(bans(page())).toEqual([])
  })

  it('draws the four blocks in the design\'s order, under the page\'s name, with no totals line', () => {
    const text = renderText(<MarketPicturePage data={PICTURE_FIXTURE} />)
    const at = (s: string) => text.indexOf(s)
    expect(at('Your market')).toBe(0)
    expect(at('What holds across August and September')).toBeGreaterThan(0)
    expect(at('What holds across August and September')).toBeLessThan(at('Where your market stands'))
    expect(at('Where your market stands')).toBeLessThan(at('The biggest conversations'))
    expect(at('The biggest conversations')).toBeLessThan(at('What people do in the comments'))
    // Each block states its base once, in its subtitle; nothing above them.
    expect(text.slice(0, at('What holds')).trim()).toBe('Your market')
  })

  it('says nothing about how it was made', () => {
    const text = renderText(<MarketPicturePage data={PICTURE_FIXTURE} />)
    expect(text).not.toMatch(/\b(?:search|update|gathered|we read|coverage|readiness|calibrat|as at|method)\w*/i)
  })

  it('omits a block with nothing to show; the first run is one neutral line', () => {
    const bare = renderText(<MarketPicturePage data={{ ...PICTURE_FIXTURE, longRun: null, conversations: null, kinds: null }} />)
    expect(bare).not.toContain('What holds')
    expect(bare).not.toContain('The biggest conversations')
    expect(bare).not.toContain('What people do')
    expect(bare).toContain('Where your market stands')
    expect(renderText(<MarketPicturePage data={null} />)).toBe(`Your market ${FIRST_RUN_LINE}`)
  })
})

describe('(a) What holds across the months', () => {
  const markup = render(<HoldsBlock read={LONG_RUN_FIXTURE} brand="Sealand" noun="bags" />)
  const text = renderText(<HoldsBlock read={LONG_RUN_FIXTURE} brand="Sealand" noun="bags" />)

  it('prints the lead, each idea numbered, and its evidence line', () => {
    expect(text).toContain('What holds across August and September')
    expect(text).toContain('Buyers like the idea of a sustainable bag')
    expect(text).toContain('Interest stalls when the way to buy isn’t clear')
    expect(text).toContain('Heard in August and September, 42 videos')
    expect(markup).toContain('data-copy="stored" data-slot="week_read"')
  })

  it('says who each idea is about: Sealand first in its gold chip, the rivals in theirs, the category last', () => {
    const rows = text.slice(text.indexOf('Heard in August and September, 30 videos'))
    expect(rows).toContain('Sealand 6 Cotopaxi 10 The North Face 2 Patagonia 1 Other bags in your market 11')
    expect(markup).toMatch(/data-who-chip="you"[^>]*bg-you[^>]*text-you-foreground[^>]*>Sealand</)
    expect(markup).toMatch(/data-who-chip="rival"[^>]*>(?:<span[^>]*><\/span>)?Cotopaxi</)
  })

  it('draws nothing for a read with no idea', () => {
    expect(render(<HoldsBlock read={{ ...LONG_RUN_FIXTURE, ideas: [] }} brand="Sealand" noun="bags" />)).toBe('')
  })
})

describe('(b) Where your market stands', () => {
  const block = PICTURE_FIXTURE.stands!
  const text = renderText(<StandsBlockView block={block} monthText="September so far" />)
  const markup = render(<StandsBlockView block={block} monthText="September so far" />)

  it('states its base once and prints bare shares as figures', () => {
    expect(text).toContain('Share of the 852 videos in September so far')
    expect(markup).toMatch(/data-copy="figure"[^>]*>23%</)
  })

  it('every tracked subject appears; one with no reading is its name alone', () => {
    for (const name of ['Buying & delivery', 'Looks & style', 'Community & purpose', 'Repair & warranty', 'Waterproofing']) expect(text).toContain(name)
    const tail = text.slice(text.indexOf('Community & purpose'))
    expect(tail).toBe('Community & purpose Repair & warranty Waterproofing')
  })

  it('the quote in the serif on a plain panel, the English under another language, where and when', () => {
    expect(text).toContain('“I think it’s time to buy the bluey purple smaller backpack!')
    expect(text).toContain('YouTube · 21 Sep')
    expect(text).toContain('Dutch · machine translation')
    expect(text).toContain('I wish they matched the zip to the colour of the bag.')
    expect(markup).toContain('data-copy="quote"')
  })

  it('the conversations inside a subject are the model\'s labels, marked', () => {
    expect(markup).toMatch(/data-copy="subject" data-slot="pass_b_theme"[^>]*>Ready to buy the bag</)
  })
})

describe('(c) The biggest conversations', () => {
  const block = PICTURE_FIXTURE.conversations!
  const text = renderText(<ConversationsBlockView block={block} brand="Sealand" noun="bags" />)

  it('states the category\'s base, says who each is about, and sets makers apart in one line', () => {
    expect(text).toContain('Share of the category’s 814 videos')
    expect(text).toContain('Ready to buy the bag Other bags in your market 11%')
    expect(text).toContain('Cotopaxi 2 · other bags 31')
    const markup = render(<ConversationsBlockView block={block} brand="Sealand" noun="bags" />)
    const line = markup.slice(markup.indexOf('Makers’'), markup.indexOf('threads.') + 'threads.'.length).replace(/<[^>]+>/g, '')
    // The design's sentence from the count (Heinrich, 1 Oct), no theme labels.
    expect(line).toBe('Makers’ own talk is set apart: three of the month’s five largest threads.')
    expect(markup).not.toContain('admiration for handmade bag design')
    expect(text).toContain('Every conversation →')
  })

  it('no makers line where none is set apart', () => {
    expect(renderText(<ConversationsBlockView block={{ ...block, makers: null }} brand="Sealand" noun="bags" />)).not.toContain('Makers')
  })
})

describe('(d) What people do in the comments', () => {
  const block = PICTURE_FIXTURE.kinds!
  const text = renderText(<KindsBlockView block={block} brand="Sealand" noun="bags" monthText="September so far" />)

  it('levels only, on the market\'s base, with who the videos are about, the category first', () => {
    expect(text).toContain('Share of the 852 videos in September so far, and who the videos are about')
    expect(text).toContain('Praised a bag 74% other bags 599 · Patagonia 11 · The North Face 8 · Cotopaxi 5 · Freitag 4')
  })
})

describe('the skeleton', () => {
  it('renders the page\'s shape, with no words but the page title', () => {
    const markup = render(<MarketPictureSkeleton />)
    expect(markup).toContain('role="status"')
    // The shared PageBar draws the title while the page loads (integration).
    expect(renderText(<MarketPictureSkeleton />)).toBe('Your market')
    expect(bans(markup)).toEqual([])
  })
})
