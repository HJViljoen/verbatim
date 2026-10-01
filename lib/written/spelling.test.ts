import { describe, expect, it } from 'vitest'

import { scrubLongRun } from './longrun'
import { scrubWeekRead, scrubWeekText } from './scrub'
import { BRITISH_SPELLINGS, britishSpelling } from './spelling'
import { written } from './test-fixtures'
import { WEEK_READ_MAX } from './write'

// British spelling on the written reads' own prose: whole words from one list,
// case kept, never inside quotation marks.

const cap = (s: string): string => s[0].toUpperCase() + s.slice(1)

describe('britishSpelling', () => {
  it('converts every family on the list, case kept', () => {
    for (const [us, gb] of Object.entries(BRITISH_SPELLINGS)) {
      expect(britishSpelling(`Buyers mention the ${us} here.`), us).toBe(`Buyers mention the ${gb} here.`)
      expect(britishSpelling(`Buyers mention the ${us.toUpperCase()} here.`), us).toBe(`Buyers mention the ${gb.toUpperCase()} here.`)
      expect(britishSpelling(`${cap(us)} comes up. ${cap(us)} again.`), us).toBe(`${cap(gb)} comes up. ${cap(gb)} again.`)
    }
  })

  it('reads as British on the families named', () => {
    expect(britishSpelling('Color matters, and COLOR is shouted.')).toBe('Colour matters, and COLOUR is shouted.')
    expect(britishSpelling('Buyers want more colors, a colorful colorway and colored zips.')).toBe('Buyers want more colours, a colourful colourway and coloured zips.')
    expect(britishSpelling('Their favorite bag is favored by owners who favor gray.')).toBe('Their favourite bag is favoured by owners who favour grey.')
    expect(britishSpelling('Buyers organized by behavior traveled with the organizer centered.')).toBe('Buyers organised by behaviour travelled with the organiser centred.')
    expect(britishSpelling('A labeled fiber, customized jewelry, a personalized catalog.')).toBe('A labelled fibre, customised jewellery, a personalised catalogue.')
    expect(britishSpelling('Owners realize, recognize, prioritize and analyze it.')).toBe('Owners realise, recognise, prioritise and analyse it.')
    expect(britishSpelling('Neighbors honor the warranty.')).toBe('Neighbours honour the warranty.')
  })

  it('whole words only', () => {
    for (const s of [
      'Buyers in Colorado ask about it.',
      'A colorado trip.',
      'A decolorize step.',
      'Un bolso colorido.',
      'Des sacs colorés.',
      'Search for #color and @colors online.',
      'See color.com for it.',
      'A computer program runs it.',
    ]) {
      expect(britishSpelling(s), s).toBe(s)
    }
    expect(britishSpelling('A multi-color strap, color-coded zips and the color\'s depth.')).toBe('A multi-colour strap, colour-coded zips and the colour\'s depth.')
  })

  it('leaves a Capitalised name mid-sentence and a mixed-case product name alone', () => {
    expect(britishSpelling('Buyers compare the Honor phone and Center Parcs.')).toBe('Buyers compare the Honor phone and Center Parcs.')
    expect(britishSpelling('The ColorWay range sells in gray.')).toBe('The ColorWay range sells in grey.')
  })

  it('never reaches inside a quotation, straight or curly', () => {
    expect(britishSpelling('One buyer wrote "the color is off" about the color.')).toBe('One buyer wrote "the color is off" about the colour.')
    expect(britishSpelling('One buyer wrote “my favorite gray bag” about the gray.')).toBe('One buyer wrote “my favorite gray bag” about the grey.')
    expect(britishSpelling('One buyer wrote ‘the color is off’ about the color.')).toBe('One buyer wrote ‘the color is off’ about the colour.')
    expect(britishSpelling('One buyer wrote \'the color is off\' about the color.')).toBe('One buyer wrote \'the color is off\' about the colour.')
    expect(britishSpelling('"Color me happy," one owner said.')).toBe('"Color me happy," one owner said.')
  })

  it('an apostrophe does not open a quotation', () => {
    expect(britishSpelling("Sealand's color isn't the buyers' favorite gray.")).toBe("Sealand's colour isn't the buyers' favourite grey.")
    expect(britishSpelling('Sealand’s color is the owners’ favorite.')).toBe('Sealand’s colour is the owners’ favourite.')
  })

  it('leaves a text with nothing to change as it was', () => {
    expect(britishSpelling('')).toBe('')
    expect(britishSpelling('Buyers want a hip belt.')).toBe('Buyers want a hip belt.')
  })
})

describe('the scrubs apply it to the prose they keep', () => {
  it('scrubWeekText: kept prose turns British, quotes stay, nothing else moves', () => {
    const r = scrubWeekText('Buyers want the color in gray. One owner wrote "this color is perfect".', 700)
    expect(r.text).toBe('Buyers want the colour in grey. One owner wrote "this color is perfect".')
    expect(r.counts).toMatchObject({ dropped: 0, leaked: false })
    const d = scrubWeekText('Buyers favor the gray strap. About 40 people said so.', 700)
    expect(d.text).toBe('Buyers favour the grey strap.')
    expect(d.counts).toMatchObject({ dropped: 1, droppedDigits: 1, leaked: true })
    expect(scrubWeekText('Color decides the sale.', WEEK_READ_MAX.headline, { headline: true }).text).toBe('Colour decides the sale')
    expect(scrubWeekText('Many buyers name a favorite color.', 700).text).toBe('Buyers name a favourite colour.')
  })

  it('scrubWeekRead: every field goes through it', () => {
    const { output } = scrubWeekRead(written({ story: [{ paragraph: 'Owners describe the gray as their favorite.', based_on: ['C1'], quote_from: 'C1' }] }), {})
    expect(output.story[0].paragraph).toBe('Owners describe the grey as their favourite.')
  })

  it('scrubLongRun: the long-run read too', () => {
    const out = scrubLongRun({
      ideas: [{ headline: 'Buyers pick a favorite color', body: 'Owners describe the gray as their favorite. One owner wrote "love this color".', based_on: ['C1'] }],
      in_short: 'Buyers organize the bag by color.',
    }, { company: 'Sealand' })
    expect(out.output.ideas[0].headline).toBe('Buyers pick a favourite colour')
    expect(out.output.ideas[0].body).toBe('Owners describe the grey as their favourite. One owner wrote "love this color".')
    expect(out.output.in_short).toBe('Buyers organise the bag by colour.')
  })
})
