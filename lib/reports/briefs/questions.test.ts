import { describe, expect, it } from 'vitest'

import { allBriefQuestions, briefQuestions, nameList, RIVALS_PER_QUESTION } from './questions'
import { BRIEF_ROLES } from './types'

const SEALANDISH = { company: 'Acme', industryKeywords: ['eco backpack', '#hashtag', 'travel gear'], rivals: ['Rival One', 'Rival Two'] }
const PROSTHETIC = { company: 'Össur', industryKeywords: ['amputee', 'prosthetic leg', 'prosthetic arm'], rivals: ['Ottobock'] }

describe('the research questions', () => {
  it('no question is asked twice: every id and every wording belongs to one role', () => {
    const qs = allBriefQuestions(SEALANDISH)
    expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length)
    expect(new Set(qs.map((q) => q.text)).size).toBe(qs.length)
    for (const q of qs) expect(q.id.startsWith(`${q.role}.`)).toBe(true)
  })

  it('asks about the rivals from each reader\'s own angle, and content not at all', () => {
    const rivalQs = allBriefQuestions(SEALANDISH).filter((q) => q.text.includes('Rival One'))
    expect(rivalQs.map((q) => q.id).sort()).toEqual(['leadership.stand', 'marketing.rivals', 'sales.rivals'])
    expect(rivalQs.find((q) => q.id === 'sales.rivals')?.text).toMatch(/buy .* for/)
    expect(rivalQs.find((q) => q.id === 'marketing.rivals')?.text).toMatch(/known for/)
    expect(rivalQs.find((q) => q.id === 'leadership.stand')?.text).toMatch(/ahead .* behind/)
  })

  it('without rivals, drops the rival questions and asks leadership against the other choices', () => {
    const qs = allBriefQuestions({ ...SEALANDISH, rivals: [] })
    expect(qs.map((q) => q.id)).not.toContain('sales.rivals')
    expect(qs.map((q) => q.id)).not.toContain('marketing.rivals')
    expect(qs.find((q) => q.id === 'leadership.stand')?.text).toMatch(/other choices people consider/)
  })

  it('names at most four rivals in one question', () => {
    const many = briefQuestions('sales', { ...SEALANDISH, rivals: ['A1', 'B2', 'C3', 'D4', 'E5'] }).find((q) => q.id === 'sales.rivals')!
    expect(many.text).toContain(nameList(['A1', 'B2', 'C3', 'D4'].slice(0, RIVALS_PER_QUESTION)))
    expect(many.text).not.toContain('E5')
  })

  it('is tenant-general: what the tenant sells comes from its own keywords, never a product category in the template', () => {
    const qs = allBriefQuestions(PROSTHETIC)
    expect(qs[0].text).toContain("products like Össur's (amputee, prosthetic leg, prosthetic arm)")
    for (const r of BRIEF_ROLES) for (const q of briefQuestions(r, { company: 'X', industryKeywords: [], rivals: [] })) {
      expect(q.text).not.toMatch(/\bbags?\b|backpack|prosthe|sailcloth/i)
    }
  })

  it('feeds every question to its own section', () => {
    for (const q of allBriefQuestions(SEALANDISH)) expect(q.section.startsWith(`${q.role}.`)).toBe(true)
  })
})
