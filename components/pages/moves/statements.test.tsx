import { describe, expect, it } from 'vitest'

import { assertCopyContract } from '@/lib/test/copy-contract'
import { markupText, render } from '@/lib/test/render'
import { YourStatements } from './statements'
import { MIXED, bansBroken, statementsFixture } from './fixture'
import { pct, statementsBase, whyLead } from './words'

// "Your statements" (Page-Your-moves.dc.html): the artboard's three real rows,
// a row not yet measured, and a split brand line, against the copy contract
// and the design bans.

/** The markup of one statement's row, by its id. */
function rowOf(markup: string, id: string): string {
  const at = markup.indexOf(`data-statement="${id}"`)
  const start = markup.lastIndexOf('<', at)
  const ends = [markup.indexOf('data-statement="', at + 20), markup.indexOf('<script', at), markup.indexOf('</section>', at)].filter((i) => i > 0)
  return markup.slice(start, Math.min(...ends))
}

describe('Your statements', () => {
  const data = statementsFixture()
  const markup = render(<YourStatements data={data} />)
  const text = markupText(markup)

  it('states its base once, in the subtitle, with the month', () => {
    expect(text).toContain('Your statements')
    expect(text).toContain('Share of the 852 videos in your market in September')
    expect(text.match(/Share of the/g)).toHaveLength(1)
    expect(text).toContain('What you say about Sealand. For each statement, how much your market talks about the idea, and whether people back it up, doubt it or ask about it.')
    expect(statementsBase(852, '2026-10-01', false)).toBe('Share of the 852 videos in your market in October so far')
  })

  it('offers the add form and the column heads', () => {
    expect(markup).toContain('placeholder="Add a statement, e.g. Made from 100% recycled nylon"')
    expect(markup).toMatch(/<input[^>]*name="text"/)
    expect(text).toContain('You say Talked about in How people treat it')
  })

  it('draws the market row: the share against 100%, the count, how people treat it', () => {
    const row = rowOf(markup, data.statements[0].id)
    const t = markupText(row)
    expect(pct(125, 852)).toBe(15)
    expect(t).toContain('Every Sealand product is a small act of defiance against waste')
    expect(t).toContain('Other bags in your market')
    expect(t).toContain('15% of your market’s videos')
    expect(row).toContain('width:15%')
    expect(t).toContain('125 of 852 videos')
    expect(t).toContain('Of the 125 videos Back it up 74 Doubt it 2 Ask about it 7')
    // Each stance against the 125, never against the top row.
    expect(row).toContain('width:59.2%')
    expect(row).toContain('width:1.6%')
    expect(row).toContain('width:5.6%')
    expect(t).toContain('People love upcycling ideas and anti-waste design')
    expect(t).not.toContain('under your posts')
  })

  it('draws the own-posts row: the absence as a finding, then what is said under the posts', () => {
    const row = rowOf(markup, data.statements[1].id)
    const t = markupText(row)
    expect(t).toContain('0% of your market’s videos')
    expect(t).toContain('Nobody in your market raised it in September.')
    expect(t).toContain('Talked about under 5 of your own posts.')
    expect(t).toContain('Of the 5 videos under your posts Back it up 3 Doubt it 0 Ask about it 0')
    expect(row).toMatch(/text-\[#9A6B00\][^>]*>Sealand</)
  })

  it('draws the row nobody repeats', () => {
    const t = markupText(rowOf(markup, data.statements[2].id))
    expect(t).toContain('Nobody in your market raised it in September.')
    expect(t).toContain('Nobody repeats it, in your market or under your own posts.')
    expect(t).not.toContain('Back it up')
    expect(t).not.toContain('Talked about under')
  })

  it('draws a statement not yet measured as its words and nothing else', () => {
    const row = rowOf(markup, data.statements[3].id)
    const t = markupText(row)
    expect(t.trim()).toBe('Made from upcycled, recycled and responsibly sourced materials')
    expect(row).toContain('aria-label="Edit or remove this statement"')
  })

  it('splits a brand line with the counts, short names, most first', () => {
    const m = render(<YourStatements data={statementsFixture({ statements: [{ id: '55555555-5555-4555-8555-555555555555', text: 'We take back used gear and give it a new life', reading: MIXED }] })} />)
    expect(markupText(m)).toContain('other bags 105 · Patagonia 10')
    expect(markupText(m)).toContain('Talked about under 5 of your own posts.')
    assertCopyContract(m)
  })

  it('draws no form and no menu for a member who cannot change them', () => {
    const m = render(<YourStatements data={statementsFixture({ canEdit: false })} />)
    expect(m).not.toContain('<form')
    expect(m).not.toContain('Edit or remove this statement')
  })

  it('draws no column heads and no base with nothing measured or added yet', () => {
    const m = render(<YourStatements data={statementsFixture({ statements: [], month: null, base: null })} />)
    expect(markupText(m)).not.toContain('You say')
    expect(markupText(m)).not.toContain('Share of the')
    expect(m).toContain('<form')
  })

  it('keeps the copy contract and the design bans', () => {
    assertCopyContract(markup)
    expect(bansBroken(markup)).toEqual([])
    // The share and every count are code's figures; the sentence is stored prose under its slot.
    expect(markup).toMatch(/data-copy="figure"[^>]*>15%</)
    expect(markup).toMatch(/data-copy="stored" data-slot="statement_says"/)
    expect(markup).toMatch(/data-copy="quote"[^>]*>Every Sealand product/)
  })
})

describe('the argument a row prints', () => {
  it('takes the first sentence, and the second where both stay short', () => {
    expect(whyLead('One. Two.')).toBe('One. Two.')
    const long = `${'A'.repeat(150)}. ${'B'.repeat(150)}.`
    expect(whyLead(long)).toBe(`${'A'.repeat(150)}.`)
    expect(whyLead(null)).toBeNull()
  })
})
