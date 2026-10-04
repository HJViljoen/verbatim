import { describe, expect, it } from 'vitest'

import { FINDINGS_AFTER, ITEM_MIN_VIDEOS, ROLE_SECTIONS, groundedRival, itemStands, sectionTitle, selectRoleSections, standingItems } from './sections'
import type { BriefRole, BriefSection } from './types'
import { BRIEF_ROLES } from './types'

const sec = (key: BriefSection['key'], items: string[], extra: Partial<BriefSection> = {}): BriefSection => ({
  key, title: key, groups: [{ items: items.map((text) => ({ text })) }], ...extra,
})

describe('the role sections', () => {
  it('every role has its own sections, none shared with another role', () => {
    const keys = BRIEF_ROLES.flatMap((r) => ROLE_SECTIONS[r].map((s) => s.key))
    expect(new Set(keys).size).toBe(keys.length)
    for (const r of BRIEF_ROLES) for (const s of ROLE_SECTIONS[r]) expect(s.key.startsWith(`${r}.`)).toBe(true)
  })

  it('carries the sections the rebuild named for each reader', () => {
    expect(ROLE_SECTIONS.sales.map((s) => s.key)).toEqual(['sales.buyers', 'sales.stops', 'sales.settle', 'sales.triggers', 'sales.rivals', 'sales.care'])
    expect(ROLE_SECTIONS.marketing.map((s) => s.key)).toEqual(expect.arrayContaining(['marketing.believe', 'marketing.words', 'marketing.say_hear', 'marketing.recall', 'marketing.rivals']))
    expect(ROLE_SECTIONS.content.map((s) => s.key)).toEqual(expect.arrayContaining(['content.questions', 'content.formats', 'content.borrow']))
    expect(ROLE_SECTIONS.leadership.map((s) => s.key)).toEqual(expect.arrayContaining(['leadership.market', 'leadership.shares', 'leadership.risks', 'leadership.decisions']))
  })

  it('leadership opens on where the market and the company stand; the others on the findings', () => {
    expect(FINDINGS_AFTER.leadership).toBe('leadership.shares')
    for (const r of ['sales', 'marketing', 'content'] as BriefRole[]) expect(FINDINGS_AFTER[r]).toBeNull()
  })

  it('names the company in a title, never another tenant\'s words', () => {
    const spec = ROLE_SECTIONS.marketing.find((s) => s.key === 'marketing.say_hear')!
    expect(sectionTitle(spec, 'Össur')).toBe('What Össur says, and what comes back')
    const all = BRIEF_ROLES.flatMap((r) => ROLE_SECTIONS[r].map((s) => s.title)).join(' ')
    expect(all).not.toMatch(/\bbags?\b|backpack|prosthe/i)
  })
})

describe('what prints', () => {
  it('prints a section with something to say, in the role order, and holds the rest with why', () => {
    const r = selectRoleSections('sales', {
      'sales.triggers': sec('sales.triggers', ['The old one breaks']),
      'sales.stops': sec('sales.stops', ['Price']),
      'sales.settle': sec('sales.settle', ['  ']),
      'sales.rivals': null,
    })
    expect(r.sections.map((s) => s.key)).toEqual(['sales.stops', 'sales.triggers'])
    expect(r.held).toEqual(expect.arrayContaining([
      { what: 'sales.settle', reason: 'nothing in it stood' },
      { what: 'sales.rivals', reason: 'no material for it this month' },
      { what: 'sales.buyers', reason: 'no material for it this month' },
    ]))
  })

  it('a section of counted lines or of real voices prints with no written item', () => {
    const r = selectRoleSections('content', {
      'content.formats': { key: 'content.formats', title: 'x', groups: [], lines: ['Story videos run at a median engagement of 5.0%.'] },
      'content.borrow': { key: 'content.borrow', title: 'x', groups: [], voices: [{ ref: 'e:1', text: '', date: null, platform: 'reddit', about: 'market', ownPost: false, lang: null }] },
    })
    expect(r.sections.map((s) => s.key)).toEqual(['content.formats', 'content.borrow'])
  })

  it('an item prints only on enough distinct videos', () => {
    expect(itemStands(ITEM_MIN_VIDEOS)).toBe(true)
    expect(itemStands(ITEM_MIN_VIDEOS - 1)).toBe(false)
    const r = standingItems([{ text: 'Heard widely', videos: 12 }, { title: 'One voice', text: 'Heard once', videos: 1 }, { text: 'Two threads', videos: 2 }])
    expect(r.kept.map((i) => i.text)).toEqual(['Heard widely', 'Two threads'])
    expect(r.held).toEqual([{ what: 'One voice', reason: 'too little behind it (1 videos)' }])
  })
})

describe('a rival is named only where the research names it', () => {
  const tracked = ['Ottobock', 'Cotopaxi']
  it('takes the tracked spelling, accents and case folded', () => {
    expect(groundedRival('ottobock', tracked, ['Users compare the Ottobock knee with the alternatives'])).toBe('Ottobock')
  })
  it('refuses a rival no cited point names, and a brand the tenant does not track', () => {
    expect(groundedRival('Ottobock', tracked, ['Users praise the socket fit'])).toBeNull()
    expect(groundedRival('Osprey', tracked, ['Osprey owners praise the hip belt'])).toBeNull()
  })
})
