import { describe, expect, it } from 'vitest'

import { briefBreaks, scrubBriefText } from './scrub'

const clean = (text: string, field: 'market' | 'interpret' | 'headline' = 'market') =>
  scrubBriefText(text, 2000, { company: 'Acme', field }).text

describe('the time-comparison scrub', () => {
  it('drops the two trend claims the 30 Sep Leadership draft printed', () => {
    const a = 'Compared with earlier asks centered on craft, demand now reads as more validation driven.'
    const b = 'Demand is settling around a higher bar.'
    expect(clean(a)).toBe('')
    expect(clean(b)).toBe('')
    expect(briefBreaks(a)).toEqual(expect.arrayContaining(['change over time', 'now reads as']))
    expect(briefBreaks(b)).toEqual(expect.arrayContaining(['became', 'settling']))
  })

  it('drops a sentence that compares months or says something is now so', () => {
    for (const s of [
      'Buyers are now asking about the zips.',
      'Owners ask about repairs more than before.',
      'Last month the talk was about price.',
      'People increasingly ask for proof.',
      'The talk has shifted toward comfort.',
      'Colour came up for the first time.',
      'Price is no longer the first question.',
      'In earlier months owners praised the straps.',
      'Buyers no longer ask about the zip.',
    ]) expect(clean(s), s).toBe('')
  })

  it('keeps the market talking, where the same words mean something else', () => {
    for (const s of [
      'Interest stalls when the route to buy stays unclear.',
      'Buyers who are ready to buy now ask where to order.',
      'Buyers treat a working zip as settled and argue about the straps.',
      'Owners complain about thin straps that dig in.',
      'Buyers research the material before they pay.',
      'People lack confidence in the waterproof claim.',
      'The buying moment comes when the current bag no longer suits the commute.',
      'Owners describe the bag they used to carry.',
      'Buyers ask what life with the leg feels like over time.',
    ]) expect(clean(s), s).toBe(s)
  })
})

describe('the §0a backstop', () => {
  it('drops what the 30 Sep drafts printed about how they were made', () => {
    for (const s of [
      'This is the first brief, and the reading is thin.',
      'The reading rests on several strands of the research.',
      'It remains unclear which models buyers compare.',
      'Confidence is higher on how rivals are framed.',
      'The analysis extracted grounded points from the data.',
      'Our searches found fewer videos this update.',
      'Elsewhere this month, buyers ask about price.',
      'Other briefs cover adult style cues and price.',
      'Separate work covers size and pockets.',
    ]) expect(clean(s), s).toBe('')
  })

  it('drops a digit or a direction word, as the week read does', () => {
    expect(clean('Buyers asked about the 35L size.')).toBe('')
    expect(clean('Interest in colour is growing.')).toBe('')
  })

  it('drops advice only where the writer interprets, never in what people said', () => {
    const said = 'Buyers say a bag should last for years.'
    expect(clean(said, 'market')).toBe(said)
    expect(clean('Acme should show the stitching.', 'interpret')).toBe('')
    expect(clean('The stitching is an opportunity for Acme.', 'interpret')).toBe('')
    expect(clean('Acme could explain the warranty.', 'interpret')).toBe('')
  })

  it('strips the ids the writer is told never to print', () => {
    expect(clean('Buyers ask where to order (G12, G14).')).toBe('Buyers ask where to order.')
  })

  it('writes British spelling and no dashes between clauses', () => {
    expect(clean('Buyers ask about the color — and the price.')).toBe('Buyers ask about the colour, and the price.')
  })

  it('a headline loses its full stop', () => {
    expect(clean('Buyers stall on the route to buy.', 'headline')).toBe('Buyers stall on the route to buy')
  })
})
