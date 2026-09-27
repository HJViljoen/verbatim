import { describe, expect, it } from 'vitest'

import { buildAsks, buildThemeBoard } from '../pages/overview-market/board'
import { heroLead } from '../pages/overview-market/hero'
import { SEPTEMBER, SEPTEMBER_CATEGORY_N, septemberThemes } from '../test/market-fixture'
import { STARTERS_SHOWN, starterQuestions, topicOf } from './starters'

// Sealand's September front page, on production's category themes as at 24
// Sep with maker shares by analogy (lib/test/market-fixture.ts), and the
// market's subjects as plan §2.2 prints them: Looks & style 104 and
// Waterproofing 33, both provisional (category figures, WP1.8 measures the
// market's).
const board = buildThemeBoard(septemberThemes(), SEPTEMBER_CATEGORY_N, SEPTEMBER, 'measured')
const hero = heroLead(board, [], new Set())
const asks = buildAsks(septemberThemes(), SEPTEMBER, 'measured', new Map())
const subjects = [
  { label: 'Looks & style', calibration: 'provisional' as const, market: { k: 104 }, makerShare: 0.38 },
  { label: 'Waterproofing', calibration: 'provisional' as const, market: { k: 33 }, makerShare: null },
  { label: 'Repair & warranty', calibration: 'failed' as const, market: { k: 33 }, makerShare: null },
]

describe('starter questions, written by code from the front page’s biggest objects (WP3.9)', () => {
  const cards = starterQuestions({ themes: board, hero, asks, subjects })

  it('asks about the lead theme by its topic, with the lead’s own count', () => {
    const lead = cards.find((c) => c.question === 'What does my market ask about airline bag sizes?')
    expect(lead?.rows).toEqual([{ kind: 'theme', label: 'Confusion over airline bag sizes', k: 21, tags: [] }])
  })

  it('asks "ask about" only where the lead is a question, else "say about"', () => {
    // Össur's lead on staging's 13 Sep update: a praise theme.
    const praise = { ...board.rows[0], label: 'Admiration for personal resilience', kind: 'praise' }
    const theirs = starterQuestions({ themes: { ...board, rows: [praise] }, hero: { kind: 'themes', top: [praise], lead: praise } })
    expect(theirs.map((c) => c.question)).toContain('What does my market say about personal resilience?')
    expect(theirs.some((c) => c.question.includes('ask about personal resilience'))).toBe(false)
  })

  it('starts from what buys, with its maker share as the front page prints it', () => {
    expect(cards[0]).toEqual({ question: 'What makes people ready to buy?', rows: [{ kind: 'theme', label: 'Ready to buy handmade bags', k: 69, tags: ['about a third makers'] }] })
  })

  it('offers the complaints and the wishes as the lists the front page prints', () => {
    expect(cards.find((c) => c.question === 'What does my market complain about?')?.rows.map((r) => [r.label, r.k]))
      .toEqual([['Frustration with heavy travel bags', 11], ['Backpack comfort and fit issues', 10]])
    expect(cards.find((c) => c.question === 'What does my market wish for?')?.rows.map((r) => [r.label, r.k]))
      .toEqual([['Interest in specific colors', 11]])
  })

  it('offers the biggest subject in the words Subjects’ "Ask about this" sends, never a failed one', () => {
    const subject = cards.find((c) => c.question.startsWith('What does my market say about'))
    expect(subject).toEqual({ question: 'What does my market say about Looks & style?', rows: [{ kind: 'subject', label: 'Looks & style, a subject', k: 104, tags: ['provisional', 'over a third makers'] }] })
    expect(cards.some((c) => c.question.includes('Repair'))).toBe(false)
  })

  it('is six cards at most, none empty, none twice', () => {
    expect(cards.length).toBeLessThanOrEqual(STARTERS_SHOWN)
    expect(cards.every((c) => c.rows.length > 0)).toBe(true)
    expect(new Set(cards.map((c) => c.question)).size).toBe(cards.length)
    // No digit in a question: the counts are the rows', printed by code.
    expect(cards.every((c) => !/\d/.test(c.question))).toBe(true)
  })

  it('writes nothing for a month with nothing on the page', () => {
    expect(starterQuestions({})).toEqual([])
  })

  it('takes a theme label down to its topic', () => {
    expect(topicOf('Questions about buying and shipping')).toBe('buying and shipping')
    expect(topicOf('Interest in specific colors')).toBe('specific colors')
    expect(topicOf('Backpack comfort and fit issues')).toBe('backpack comfort and fit issues')
  })

  // Staging's labels on its 20 Sep update, where the cards read "ask about
  // confusion about airline size rules" and "ask about price and sale
  // questions" (the render of 27 Sep).
  it('takes any leading "X about / over / in" phrase and a trailing "questions" off', () => {
    expect(topicOf('Confusion about airline size rules')).toBe('airline size rules')
    expect(topicOf('Price and sale questions')).toBe('price and sale')
    expect(topicOf('Frustration with bag weight')).toBe('bag weight')
    expect(topicOf('Interest in shipping and locations')).toBe('shipping and locations')
    // A theme that merely contains the word keeps it.
    expect(topicOf('Buying interest and ordering questions')).toBe('buying interest and ordering')
    expect(topicOf('Questions and answers on sizing')).toBe('questions and answers on sizing')
  })
})
