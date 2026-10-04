import { describe, expect, it } from 'vitest'

import { briefBreaks, hyphenatedNames, restoreNames, scrubBriefText, tradeOff, varySubjects } from './scrub'

const clean = (text: string, field: 'market' | 'interpret' | 'headline' = 'market') =>
  scrubBriefText(text, 2000, { company: 'Acme', field }).text

describe('the time-comparison scrub', () => {
  it('drops the two trend claims the 30 Sep Leadership draft printed', () => {
    const a = 'Compared with earlier asks centered on craft, demand now reads as more validation driven.'
    const b = 'Demand is settling around a higher bar.'
    expect(clean(a)).toBe('')
    expect(clean(b)).toBe('')
    expect(briefBreaks(a)).toEqual(expect.arrayContaining(['change over time', 'now reads as']))
    expect(briefBreaks(b)).toEqual(expect.arrayContaining(['became']))
  })

  it('drops a sentence that compares months, says the market moved, or leans on time', () => {
    for (const s of [
      'Interest is now more practical.',
      'Owners ask about repairs more than before.',
      'Last month the talk was about price.',
      'People increasingly ask for proof.',
      'Demand has shifted toward comfort.',
      'Colour was talked about for the first time.',
      'Price is no longer the first question.',
      'In earlier months owners praised the straps.',
      'Buyers no longer ask about the zip.',
      'Buyers still ask about the zip.',
      'Owners question the current quality.',
      'Buyers finally find a bag that fits.',
    ]) expect(clean(s), s).toBe('')
  })

  it('keeps a buyer\'s own life, where the same words are not a market claim', () => {
    for (const s of [
      'Interest stalls when the route to buy stays unclear.',
      'Buyers who are ready to buy now ask where to order.',
      'The buying moment comes when the bag they own no longer suits the commute.',
      'Owners describe the bag they used to carry.',
      'Buyers ask what life with the leg feels like over time.',
      // Prosthetics phrasing (the review, 4 Oct): every one of these was dropped.
      'Users describe the weeks since they became amputees.',
      'People who are now amputees ask about running blades.',
      'Recently fitted users ask how long the socket takes to feel right.',
      'First-time users ask whether a provisional socket is normal.',
      'Clinics talk about readiness for a first prosthesis.',
      'Owners ask how the prosthetist will calibrate the knee.',
      'Users ask whether gait analysis is part of the fitting.',
      'A move to a new socket is the moment users ask about comfort.',
      'People are beginning to walk again after the fitting.',
    ]) expect(clean(s), s).toBe(s)
  })
})

describe('claims nothing measures', () => {
  it('drops a ranking, a sale won or lost, an order of asking, and what an audience does with a post', () => {
    for (const s of [
      'Ottobock owns knee technology talk.',
      'Rival leads the category on comfort.',
      'Acme draws the second largest share of comments.',
      'Cotopaxi wins travel sales on durability.',
      'Ottobock loses buyers when the total burden looks too high.',
      'Buyers ask for the bag name before they ask how to pay.',
      'Buyers start with budget fit.',
      'Viewers stay when the bag looks good on screen.',
      'Recovery stories keep people watching.',
      'Personal story makes posts shareable.',
      'Visible progress stops people on the post.',
      'Plain talk about lived experience drives comments.',
      'Owners mention repairs more than comfort.',
    ]) expect(clean(s), s).toBe('')
  })

  it('keeps what the comments say', () => {
    for (const s of [
      'Comments ask for the backstory behind the amputation.',
      'Price stops people from buying when the cover is unclear.',
      'Buyers want a bag that covers more than one job.',
      'Owners praise the warranty.',
    ]) expect(clean(s), s).toBe(s)
  })
})

describe('the §0a backstop', () => {
  it('drops what the 30 Sep drafts printed about how they were made, and records the rule', () => {
    for (const s of [
      'This is the first brief, and the reading is thin.',
      'The reading rests on several strands of the research.',
      'It remains unclear which models buyers compare.',
      'Confidence is higher on how rivals are framed.',
      'The analysis of the comments shows a pattern.',
      'Our searches found fewer videos this update.',
      'Elsewhere this month, buyers ask about price.',
      'Other briefs cover adult style cues and price.',
      'Separate work covers size and pockets.',
      'Tracked rivals are talked about in concrete terms.',
      'Subjects with provisional figures look small.',
    ]) expect(clean(s), s).toBe('')
    expect(scrubBriefText('Tracked rivals are talked about.', 200, { company: 'Acme', field: 'market' }).dropped).toEqual([{ sentence: 'Tracked rivals are talked about.', rule: 'tracked' }])
  })

  it('drops a digit or a direction word, as the week read does, and says which', () => {
    expect(scrubBriefText('Buyers asked about the 35L size.', 200, { company: 'Acme', field: 'market' }).dropped[0].rule).toBe('a digit')
    expect(clean('Interest in colour is growing.')).toBe('')
  })

  it('drops advice only where the writer interprets, never in what people said', () => {
    const said = 'Buyers say a bag should last for years.'
    expect(clean(said, 'market')).toBe(said)
    expect(clean('Acme should show the stitching.', 'interpret')).toBe('')
    expect(clean('The stitching is an opportunity for Acme.', 'interpret')).toBe('')
  })

  it('strips the ids the writer is told never to print, writes British spelling and no dashes', () => {
    expect(clean('Buyers ask where to order (G12, G14).')).toBe('Buyers ask where to order.')
    expect(clean('Buyers ask about the color and odor — and the price.')).toBe('Buyers ask about the colour and odour, and the price.')
    expect(clean('Buyers stall on the route to buy.', 'headline')).toBe('Buyers stall on the route to buy')
  })
})

describe('what survives, put right', () => {
  it('product names keep their hyphens as the points write them', () => {
    const names = hyphenatedNames(['Users praise the Pro-Flex Terra foot and the Black-Hole duffel.', 'day-to-day use'])
    expect(names).toEqual(['Pro-Flex', 'Black-Hole'])
    expect(restoreNames('People prefer the Pro Flex Terra.', names)).toBe('People prefer the Pro-Flex Terra.')
  })

  it('one spelling of trade-off', () => {
    expect(tradeOff('a tradeoff, two trade offs and a trade-off')).toBe('a trade-off, two trade-offs and a trade-off')
  })

  it('no robotic repeated subjects', () => {
    expect(varySubjects('Current leg users want comfort. Current leg users talk about gait. Buyers ask about cost.'))
      .toBe('Current leg users want comfort. They talk about gait. Buyers ask about cost.')
    expect(varySubjects('Buyers ask about cost. Buyers compare clinics.')).toBe('Buyers ask about cost. They compare clinics.')
  })
})
