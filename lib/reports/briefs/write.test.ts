import { describe, expect, it } from 'vitest'

import { fact } from '../../written/test-fixtures'
import { allBriefQuestions } from './questions'
import { point } from './test-fixtures'
import { BRIEF_ROLES } from './types'
import { PARTS, briefSchema, buildBriefPrompts, buildIdeasPrompts, heardWord, ideasSchema, whoWords } from './write'

const questions = allBriefQuestions({ company: 'Össur', industryKeywords: ['prosthetic leg'], rivals: ['Ottobock'] })
const points = [
  point('G1', 'sales', 20, { questionId: 'sales.stops', text: 'Users hold back over the cost of a new socket.' }),
  point('G2', 'marketing', 4, { questionId: 'marketing.recall', text: 'People credit Össur with its running blades.' }),
]

describe('the ideas call', () => {
  it('shows every role\'s points under the question that produced them, in words and without a number', () => {
    const { system, user } = buildIdeasPrompts({ company: 'Össur', month: '2026-09-01', noun: null, points, questions, context: null })
    expect(user).toContain('sales: "What stops people')
    expect(user).toContain('G1 (heard widely, in September; about others in your market): Users hold back over the cost of a new socket.')
    expect(system).toMatch(/NO TIME COMPARISONS/)
    expect(user.replace(/\d{4}/g, '')).not.toMatch(/\b\d+\s+videos\b/)
  })
  it('asks for one home per idea among the four readers', () => {
    const shape = ideasSchema().shape.ideas.element.shape
    expect(shape.home.options).toEqual(['sales', 'marketing', 'content', 'leadership'])
  })
})

describe('the brief call', () => {
  it('each role writes its own parts, and only marketing and leadership the extras', () => {
    for (const r of BRIEF_ROLES) {
      const keys = Object.keys(briefSchema(r).shape)
      expect(keys[0]).toBe('findings')
      expect(keys).toEqual(expect.arrayContaining(PARTS[r].map((p) => p.key)))
      expect(keys.includes('say_hear')).toBe(r === 'marketing')
      expect(keys.includes('subjects')).toBe(r === 'leadership')
      expect(keys[keys.length - 1]).toBe('in_short')
    }
  })

  it('is told the month\'s other ideas by headline, never to argue them, and the rivals it may name', () => {
    const { system, user } = buildBriefPrompts({
      role: 'content', company: 'Össur', month: '2026-09-01', noun: null, ideas: [], others: [{ headline: 'Cost holds users back', brief: 'sales' }],
      points, questions, context: null, rivals: ['Ottobock'],
    })
    expect(user).toContain('- Sales brief: Cost holds users back')
    expect(user).toContain('never argue them here')
    expect(system).toContain('name only the tracked rivals listed (Ottobock)')
    expect(user).toContain('Your findings: none.')
  })

  it('leadership is shown the subjects with their notes, never a level', () => {
    const { user } = buildBriefPrompts({
      role: 'leadership', company: 'Össur', month: '2026-09-01', noun: null, ideas: [], others: [], points, questions, context: null, rivals: [],
      subjects: [{ id: 'S1', fact: fact({ subjectId: 's', name: 'Cost & access', calibration: 'provisional', level: null, notes: ['Users describe waiting for funding.'] }) }],
    })
    expect(user).toContain('S1: Cost & access')
    expect(user).toContain('Users describe waiting for funding.')
    expect(user).not.toMatch(/\d+%/)
  })

  it('no example or instruction names what a tenant sells', () => {
    for (const r of BRIEF_ROLES) {
      const { system } = buildBriefPrompts({ role: r, company: 'X', month: '2026-09-01', noun: null, ideas: [], others: [], points: [], questions: [], context: null, rivals: [] })
      expect(system).not.toMatch(/\bbags?\b|backpack|prosthe|socket|sailcloth/i)
    }
  })
})

describe('material in words', () => {
  it('how widely a point was heard, never a count', () => {
    expect([heardWord(20), heardWord(6), heardWord(3), heardWord(1)]).toEqual(['heard widely', 'heard on several videos', 'heard on a few videos', 'barely heard'])
  })
  it('whose talk, by name, the market in the product\'s one wording', () => {
    expect(whoWords([{ about: 'client', videos: 2 }, { about: 'rival:Ottobock', videos: 3 }, { about: 'market', videos: 9 }], 'Össur', null))
      .toBe("Össur's own posts and talk about Össur; Ottobock; others in your market")
    expect(whoWords([{ about: 'market', videos: 9 }], 'Acme', 'bags')).toBe('other bags in your market')
  })
})
