import { describe, expect, it } from 'vitest'

import type { FigureTable } from '../reports/types'
import { BANNED_PHRASES, bannedHits, scrubWeekRead, scrubWeekText, weekAllowTokens } from './scrub'
import { candidate } from './test-fixtures'
import { WEEK_READ_MAX, type WeekReadOutput } from './write'

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
    const w: WeekReadOutput = {
      findings: [{
        headline: 'Price decides [[c1_week]] sales',
        saw: 'It reached [[c1_week]] videos. Buyers agree.',
        means: 'It matters. It reached [[c1_week]] videos.',
        for: { sales: 'Ask about [[c1_week]] things. It is the first question.', marketing: '', content: '', leadership: '' },
        based_on: ['C1'],
        quote_from: 'C1',
      }],
      in_short: 'The week in [[c1_week]] videos. Price is the question.',
      standing: [{ subject_id: 'S1', sentence: 'Buyers talk about [[c1_week]] straps.' }],
    }
    const { output } = scrubWeekRead(w, FIGURES)
    expect(output.findings[0]).toMatchObject({
      headline: '',
      saw: 'It reached [[c1_week]] videos. Buyers agree.',
      means: 'It matters.',
      for: { sales: 'It is the first question.', marketing: '', content: '', leadership: '' },
      based_on: ['C1'],
      quote_from: 'C1',
    })
    expect(output.in_short).toBe('Price is the question.')
    expect(output.standing).toEqual([{ subject_id: 'S1', sentence: '' }])
  })
})

describe('the caps', () => {
  it('cuts a field at a sentence boundary', () => {
    const long = Array.from({ length: 12 }, (_, i) => `Buyers describe the thing plainly in sentence ${'abcdefghijkl'[i]}.`).join(' ')
    const r = scrubWeekText(long, WEEK_READ_MAX.for)
    expect(r.text.length).toBeLessThanOrEqual(WEEK_READ_MAX.for)
    expect(r.text.endsWith('.')).toBe(true)
  })

  it('keeps paragraphs, and the In short to three sentences', () => {
    expect(scrubWeekText('One point here.\n\nAnother point there.', 700).text).toBe('One point here.\n\nAnother point there.')
    const w: WeekReadOutput = { findings: [], in_short: 'First. Second.\n\nThird. Fourth.', standing: [] }
    expect(scrubWeekRead(w, {}).output.in_short).toBe('First. Second.\n\nThird.')
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
