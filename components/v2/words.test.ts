import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { translationLabel } from '@/components/quote-block'
import { commaCite, listWords, longDay, shortDates, translationLine } from './words'

// The screens' own wording (the audit design, 7 Nov): commas where `lib/`
// builds " · ", so the email's and the briefs' words never move.

describe('commaCite', () => {
  it('turns a loader-built cite\'s dots into commas', () => {
    expect(commaCite('TikTok · 9 Oct')).toBe('TikTok, 9 Oct')
    expect(commaCite('Instagram · 30 Oct')).toBe('Instagram, 30 Oct')
  })

  it('keeps every part of a cite with an account', () => {
    expect(commaCite('TikTok · 29 Sep · video by @x')).toBe('TikTok, 29 Sep, video by @x')
  })

  it('leaves a cite with no dot as it is', () => {
    expect(commaCite('YouTube')).toBe('YouTube')
    expect(commaCite('')).toBe('')
  })
})

describe('translationLine', () => {
  it('names the language and who translated it, with a comma', () => {
    expect(translationLine({ language: 'Thai', english: 'It fits well' })).toBe('Thai, machine translation')
  })

  it('says where there is no English yet', () => {
    expect(translationLine({ language: 'Thai', english: null })).toBe('Thai, no English rendering yet')
  })

  it('says nothing for a quote with no language to name', () => {
    expect(translationLine({ language: null, english: null })).toBeNull()
    expect(translationLine({ language: null, english: 'x' })).toBeNull()
  })

  it('is the same words as print\'s label, the dot a comma', () => {
    for (const note of [{ language: 'Thai', english: 'x' }, { language: 'Dutch', english: null }]) {
      expect(translationLine(note)).toBe((translationLabel(note) as string).replace(' · ', ', '))
    }
  })
})

describe('listWords', () => {
  it('joins the parts with commas and drops the empty ones', () => {
    expect(listWords(['Össur (41)', null, 'Ottobock (37)', undefined, '', '  '])).toBe('Össur (41), Ottobock (37)')
    expect(listWords(['One'])).toBe('One')
    expect(listWords([])).toBe('')
  })
})

describe('longDay', () => {
  it('names the weekday, the day and the month, in UTC', () => {
    expect(longDay('2026-11-08')).toBe('Sunday 8 Nov')
    expect(longDay('2026-11-08T23:30:00.000Z')).toBe('Sunday 8 Nov')
    expect(longDay('2026-10-01T00:00:00Z')).toBe('Thursday 1 Oct')
  })

  it('gives back an unreadable date as it came', () => {
    expect(longDay('not a date')).toBe('not a date')
  })
})

describe('shortDates', () => {
  it('shortens each month\'s name in a week\'s dates, as the boards print them', () => {
    expect(shortDates('5 to 11 October')).toBe('5 to 11 Oct')
    expect(shortDates('26 October to 1 November')).toBe('26 Oct to 1 Nov')
    expect(shortDates('28 December 2026 to 3 January 2027')).toBe('28 Dec 2026 to 3 Jan 2027')
    expect(shortDates('5 to 11 Oct')).toBe('5 to 11 Oct')
  })
})

describe('the file', () => {
  it('imports only the translation stamp, so it carries nothing else onto a screen', () => {
    const imports = readFileSync(join(__dirname, 'words.ts'), 'utf8').match(/^import .*$/gm) ?? []
    expect(imports).toEqual(["import { MACHINE_TRANSLATION_STAMP } from '@/components/quote-block'"])
  })
})
