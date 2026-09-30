import { describe, expect, it } from 'vitest'

import type { FigureTable } from '../reports/types'
import { ADVICE, BANNED_PHRASES, bannedHits, FORECAST, scrubWeekRead, scrubWeekText, toldWhatToDo, weekAllowTokens, WHOLE_SLACK } from './scrub'
import { candidate, written } from './test-fixtures'
import { WEEK_READ_MAX } from './write'

// The written read's scrub (plan T3): digits, direction, dashes, the caps, and
// the §0a backstop, on made-up sentences.

const FIGURES: FigureTable = { c1_week: { label: 'videos this week', value: '14', kind: 'count' } }

const scrub = (raw: string, o: Parameters<typeof scrubWeekText>[2] = {}) => scrubWeekText(raw, 700, o)

describe('the product rules, policy both, no verdicts', () => {
  it('drops a sentence with a digit the model typed, keeps the rest', () => {
    const r = scrub('Buyers weigh the price. About 40 people said so. The fit decides it.')
    expect(r.text).toBe('Buyers weigh the price. The fit decides it.')
    expect(r.counts).toMatchObject({ droppedDigits: 1, leaked: true })
  })

  it('drops any sentence naming a direction, because nothing licensed one', () => {
    for (const s of ['Complaints about straps are growing.', 'Interest in rolltops rose this week.', 'Price talk is higher than last week.', 'The objection has momentum.']) {
      const r = scrub(`Buyers describe the straps. ${s}`)
      expect(r.text).toBe('Buyers describe the straps.')
      expect(r.counts.droppedDirection).toBe(1)
    }
  })

  it('and the product words the prompt warns about go the same way', () => {
    expect(scrub('The weight sits on the lower back. Buyers want a hip belt.').text).toBe('Buyers want a hip belt.')
  })

  it('turns a dash between clauses into a comma', () => {
    expect(scrub('Buyers want one bag — for work and for travel.').text).toBe('Buyers want one bag, for work and for travel.')
    expect(scrub('A carry-on sized bag – the airline decides.').text).toBe('A carry-on sized bag, the airline decides.')
  })

  it('strips the magnitude words as words, and puts a capital back', () => {
    expect(scrub('Many buyers mention the zip.').text).toBe('Buyers mention the zip.')
    expect(scrub('Most eBay sellers list it.').text).toBe('eBay sellers list it.')
  })

  it('strips the ids a model types', () => {
    expect(scrub('Buyers describe the zip [C2]. Owners report the seam (C1, C3).').text).toBe('Buyers describe the zip. Owners report the seam.')
  })
})

describe('figures only in saw', () => {
  it('keeps a known key where the field may cite one, drops an unknown one', () => {
    expect(scrub('It reached [[c1_week]] videos.', { figures: FIGURES }).text).toBe('It reached [[c1_week]] videos.')
    expect(scrub('It reached [[c9_week]] videos. Buyers agree.', { figures: FIGURES }).text).toBe('Buyers agree.')
  })

  it('drops a placeholder in every other field', () => {
    const w = written({
      findings: [{
        headline: 'Price decides [[c1_week]] sales',
        saw: 'It reached [[c1_week]] videos. Buyers agree.',
        means: 'It matters. It reached [[c1_week]] videos.',
        based_on: ['C1'],
        quote_from: 'C1',
      }],
      story: [{ paragraph: 'The week turned on price. It reached [[c1_week]] videos.', based_on: ['C1'], quote_from: 'C1' }],
      implications: [{ implication: 'Price is judged against lifespan. [[c1_week]] videos say so.', based_on: ['C1'] }],
      new_this_week: [{ candidate: 'C1', sentence: 'People ask for a red one. [[c1_week]] videos.' }],
      watch: [{ question: 'Whether [[c1_week]] buyers keep asking', based_on: ['C1'] }],
      week_in_one_line: 'The week in [[c1_week]] videos.',
      standing: [{ subject_id: 'S1', sentence: 'Buyers talk about [[c1_week]] straps.' }],
    })
    const { output } = scrubWeekRead(w, FIGURES)
    expect(output.findings[0]).toEqual({
      headline: '',
      saw: 'It reached [[c1_week]] videos. Buyers agree.',
      means: 'It matters.',
      based_on: ['C1'],
      quote_from: 'C1',
    })
    expect(output.story).toEqual([{ paragraph: 'The week turned on price.', based_on: ['C1'], quote_from: 'C1' }])
    expect(output.implications).toEqual([{ implication: 'Price is judged against lifespan.', based_on: ['C1'] }])
    expect(output.new_this_week).toEqual([{ candidate: 'C1', sentence: 'People ask for a red one.' }])
    expect(output.watch).toEqual([{ question: '', based_on: ['C1'] }])
    expect(output.week_in_one_line).toBe('')
    expect(output.standing).toEqual([{ subject_id: 'S1', sentence: '' }])
  })
})

describe('the caps', () => {
  it('cuts a field at a sentence boundary', () => {
    const long = Array.from({ length: 12 }, (_, i) => `Buyers describe the thing plainly in sentence ${'abcdefghijkl'[i]}.`).join(' ')
    const r = scrubWeekText(long, WEEK_READ_MAX.implication)
    expect(r.text.length).toBeLessThanOrEqual(WEEK_READ_MAX.implication)
    expect(r.text.endsWith('.')).toBe(true)
  })

  it('keeps paragraphs, an implication to two sentences and the week to one line', () => {
    expect(scrubWeekText('One point here.\n\nAnother point there.', 700).text).toBe('One point here.\n\nAnother point there.')
    const { output } = scrubWeekRead(written({
      implications: [{ implication: 'First point. Second point. Third point.', based_on: ['C1'] }],
      week_in_one_line: 'Buyers judged bags by what they carry. A second sentence.',
    }), {})
    expect(output.implications[0].implication).toBe('First point. Second point.')
    expect(output.week_in_one_line).toBe('Buyers judged bags by what they carry.')
  })

  it('drops a one-line field over its cap whole, never cut mid-claim', () => {
    const long = `Buyers judged ${'bags by what they carry, '.repeat(10)}and the colour.`
    expect(long.length).toBeGreaterThan(WEEK_READ_MAX.weekLine * WHOLE_SLACK)
    const r = scrubWeekRead(written({ week_in_one_line: long, watch: [{ question: `Whether ${'buyers keep naming shades and '.repeat(8)}sizes`, based_on: ['C1'] }] }), {})
    expect(r.output.week_in_one_line).toBe('')
    expect(r.output.watch[0].question).toBe('')
    expect(r.counts.droppedLong).toBe(2)
    // A line a little over the stated cap still reads.
    const near = `Buyers judged bags this week by what they carry, how long they last and whether the exact colour exists, and they said so plainly.`
    expect(near.length).toBeGreaterThan(WEEK_READ_MAX.weekLine - 40)
    expect(scrubWeekRead(written({ week_in_one_line: near }), {}).output.week_in_one_line).toBe(near)
  })

  it('a watch line is one clause with no full stop', () => {
    const r = scrubWeekRead(written({ watch: [{ question: 'Whether buyers who ask for exact shades keep naming the same ones.', based_on: ['C3'] }] }), {})
    expect(r.output.watch[0].question).toBe('Whether buyers who ask for exact shades keep naming the same ones')
  })

  it('a headline is one line with no full stop', () => {
    expect(scrubWeekText('Fit decides the sale.', WEEK_READ_MAX.headline, { headline: true }).text).toBe('Fit decides the sale')
  })
})

describe('the §0a backstop', () => {
  // Each entry with a sentence it must drop: the machinery, never the market.
  const PROCESS: Record<string, string> = {
    'searches': 'Our search terms picked up more travel bags.',
    'data': 'The data shows buyers care about zips.',
    'coverage': 'Coverage of Reddit was light this week.',
    'sources': 'Across sources, buyers agree on the straps.',
    'scraped': 'Scraped comments point to the zip.',
    'gathered': 'Comments gathered this week point to the zip.',
    'collected': 'Videos collected on the topic point to the zip.',
    'platform': 'On every platform, buyers ask about size.',
    'the tool': 'The tool shows a price objection.',
    'Verbatim': 'Verbatim reads this as a price objection.',
    'this report': 'This report covers the price objection.',
    'updates': 'With this update the price objection appears.',
    'sample': 'In a small sample, buyers ask about size.',
    'readiness': 'The subject is provisional, so its size is held back.',
    'cannot say': 'It is too early to say whether price matters.',
    'what is ours': 'The change is what is ours, not the market.',
    'methodology': 'The methodology counts each video once.',
  }

  it('has a drop sentence for every entry, and drops it', () => {
    expect(Object.keys(PROCESS).sort()).toEqual(BANNED_PHRASES.map((b) => b.name).sort())
    for (const [name, sentence] of Object.entries(PROCESS)) {
      expect(bannedHits(sentence), name).toContain(name)
      const r = scrub(`Buyers describe the straps. ${sentence}`)
      expect(r.text, name).toBe('Buyers describe the straps.')
      expect(r.counts.droppedBanned, name).toBe(1)
    }
  })

  // The market talking, in the words the list steps round: none may drop.
  const MARKET = [
    'Buyers describe the search for a bag that lasts a decade.',
    'Owners ask what the warranty coverage includes after a strap breaks.',
    'The zips are the main sources of frustration.',
    'Owners describe a bag scraped against airport floors that still holds.',
    'Travellers want a pocket for a phone on a data plan abroad.',
    'A tool roll inside the lid is what trades people ask about.',
    'Buyers can’t tell the two zips apart in photos.',
    'The sample sale drew buyers who wanted the old colour.',
    'Buyers describe one bag for work and for travel.',
    'Readers of the reviews ask how the bag holds up in rain.',
    'Carry-on rules decide the size buyers settle on.',
  ]

  it('leaves the market alone', () => {
    for (const s of MARKET) {
      expect(bannedHits(s), s).toEqual([])
      expect(scrub(s).text, s).toBe(s)
    }
  })

  it('drops the first person and the pipeline\'s own words', () => {
    expect(scrub('We see buyers asking about size. Buyers want a hip belt.').text).toBe('Buyers want a hip belt.')
    expect(scrub('Our read is that price matters. Buyers want a hip belt.').text).toBe('Buyers want a hip belt.')
    expect(scrub('The candidate themes point to price. Buyers want a hip belt.').text).toBe('Buyers want a hip belt.')
    expect(scrub('Buyers in the US want a hip belt.').text).toBe('Buyers in the US want a hip belt.')
  })
})

describe('weekAllowTokens', () => {
  it('lets a product name with a digit through, never a bare size', () => {
    const allow = weekAllowTokens([candidate({ id: 'C1', label: 'Questions about the X3 frame', notes: ['Asks whether the 35L fits.'] })], [])
    expect(allow).toContain('X3')
    expect(allow).not.toContain('35L')
    expect(scrubWeekText('Buyers ask about the X3 frame.', 700, { allow }).text).toBe('Buyers ask about the X3 frame.')
    expect(scrubWeekText('Buyers ask whether the 35L fits.', 700, { allow }).text).toBe('')
  })
})

describe('the report is intelligence, not instructions (v3)', () => {
  const report = (implication: string, question = 'Whether buyers keep naming shades') =>
    scrubWeekRead(written({ implications: [{ implication, based_on: ['C1'] }], watch: [{ question, based_on: ['C1'] }] }), {}, [], { company: 'Sealand' })

  it('drops advice from an implication, sentence by sentence', () => {
    for (const advice of [
      'Sealand should show the straps under load.',
      'The brand ought to show the straps.',
      'Make sure the straps are shown under load.',
      'There is an opportunity in showing the straps.',
      'Show the straps under a full load.',
      'Highlight the laptop sleeve in every video.',
      'Consider a second colour.',
      'Sealand could show the straps under load.',
      'Sealand needs to answer the price question.',
      "Sealand's team must lean into durability.",
    ]) {
      const r = report(`Buyers judge comfort with weight in the bag. ${advice}`)
      expect(r.output.implications[0].implication, advice).toBe('Buyers judge comfort with weight in the bag.')
      expect(r.counts.droppedAdvice, advice).toBe(1)
    }
  })

  it('drops a forecast from an implication or a watch line', () => {
    expect(report('Buyers weigh price against lifespan. Colour is likely to decide more sales.').output.implications[0].implication).toBe('Buyers weigh price against lifespan.')
    expect(report('x', 'Whether colour requests are going to spread').output.watch[0].question).toBe('')
    expect(report('x', 'Whether buyers will probably ask again').output.watch[0].question).toBe('')
  })

  it('leaves the market talking alone, in the words the lists step round', () => {
    for (const line of [
      'Sealand is judged on a shortlist beside rival brands, need by need.',
      'Sealand can be compared with Osprey on comfort, and buyers do so by name.',
      'Buyers consider the price against how long a bag lasts.',
      'Owners focus on the straps and the back panel.',
      'Buyers expect a premium bag to last for years.',
      'Build quality is what makes the price acceptable.',
      'Stock of the colour buyers want decides whether they wait.',
    ]) {
      expect(report(line).output.implications[0].implication, line).toBe(line)
    }
    // The one known cost: "should" drops even as the market's own word in an
    // implication. The prompt asks for the business, not a buyer's words, there.
    expect(report('Buyers say a bag should fit under the seat.').output.implications[0].implication).toBe('')
    expect(report('x', 'Whether buyers who ask for exact shades keep naming the same ones').output.watch[0].question)
      .toBe('Whether buyers who ask for exact shades keep naming the same ones')
  })

  it('applies only to the implications and the watch lines: the story and the findings may report what buyers say they will do', () => {
    const r = scrubWeekRead(written({
      findings: [{ headline: 'Buyers wait for a sale', saw: 'Buyers say they will probably wait for a sale.', means: 'The price should come down, buyers say.', based_on: ['C1'], quote_from: null }],
      story: [{ paragraph: 'Buyers say they are likely to wait for a sale.', based_on: ['C1'], quote_from: null }],
    }), {}, [], { company: 'Sealand' })
    expect(r.output.findings[0].saw).toBe('Buyers say they will probably wait for a sale.')
    expect(r.output.findings[0].means).toBe('The price should come down, buyers say.')
    expect(r.output.story[0].paragraph).toBe('Buyers say they are likely to wait for a sale.')
    expect(r.counts.droppedAdvice).toBe(0)
  })

  it('names each rule, and the company rule only for a name', () => {
    expect(ADVICE.map((a) => a.name)).toEqual(['should', 'advice verbs', 'opportunity', 'imperative'])
    expect(FORECAST.map((a) => a.name)).toEqual(['forecast'])
    expect(toldWhatToDo('')).toBeNull()
    expect(toldWhatToDo('Sealand')!.re.test('Sealand may want to show it')).toBe(true)
    expect(toldWhatToDo('Sealand')!.re.test('Sealand may be compared with Osprey')).toBe(false)
  })
})
