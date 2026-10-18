import { describe, expect, it } from 'vitest'

import { briefFixture, octoberFixture, subjectsFixture } from '../../../components/briefs/fixture'
import { appSectionsFor, type BriefAppInputs } from './app'
import { ROLE_SECTIONS } from './sections'
import { OSSUR_APP, OSSUR_HOOKS, OSSUR_IDEAS, OSSUR_MOVES, OSSUR_PEOPLE, OSSUR_PRODUCTS, SEALAND_APP, SEALAND_NAMED, WORST_NAMED, WORST_PRODUCTS } from './app-fixture'
import { canvasOf, printsSection } from './canvas'
import { contentsOf, deckPages, H, planDeck, printedSections, productLines } from './deck'
import { printedLines, printedPages } from './inshort'
import { APP_SECTION_KEYS, type BriefRole, type MonthlyBriefData } from './types'

// The October canvas's page plan (the boards approved 18 Oct): which pages
// each role prints, in which order, what a page needs to print (PAGE_NEEDS),
// and what In short's check reads. Pure.

const eyebrows = (d: MonthlyBriefData) => deckPages(d).map((p) => p.eyebrow || 'Cover')
const left = (d: MonthlyBriefData) => planDeck(d).left.map((l) => `${l.key}: ${l.why}`)
const app = (over: Partial<BriefAppInputs>): BriefAppInputs => ({ ...OSSUR_APP, ...over })

describe('the page set on the October canvas, each role', () => {
  it('Sales: Who is buying is Voices\' groups on two sheets, in place of the writer\'s buyer types', () => {
    const d = octoberFixture('sales')
    expect(canvasOf(d)).toBe('v2')
    expect(eyebrows(d)).toEqual(['Cover', 'In short', 'The finding', 'Who is buying', 'Who is buying, continued', 'What stops them', 'What tips them into buying', 'Who buyers compare you with', 'Language to handle with care'])
    const sheets = printedSections(d).filter((s) => s.key === 'sales.groups')
    expect(sheets.map((s) => s.people!.groups.map((g) => g.name))).toEqual([['Caretaker', 'First-time buyer'], ['Athlete', 'New amputee']])
    // The fifth is named at the foot of the last sheet, with its page.
    expect(sheets[1].people!.rest).toEqual([{ name: 'Long-term user', videos: 50, href: '/dashboard/voices/groups/long-term-user?month=2026-10' }])
    expect(sheets[1].link).toEqual({ href: '/dashboard/voices/groups/long-term-user?month=2026-10', text: 'Open Long-term user in Voices →' })
    expect(sheets[0].link).toBeUndefined()
    // The writer's buyers are stored and do not print.
    expect(d.sections.some((s) => s.key === 'sales.buyers')).toBe(true)
    expect(printedSections(d).some((s) => s.key === 'sales.buyers')).toBe(false)
  })

  it('Marketing: Your products (Össur) or Who gets named (Sealand) after how rivals are heard', () => {
    expect(eyebrows(octoberFixture('marketing')).slice(-2)).toEqual(['How rivals are heard', 'Your products'])
    expect(eyebrows(octoberFixture('marketing', { tenant: 'sealand' })).slice(-2)).toEqual(['How rivals are heard', 'Named without being asked'])
    const both = octoberFixture('marketing', { app: app({ named: SEALAND_NAMED }) })
    expect(eyebrows(both).slice(-2)).toEqual(['Your products', 'Named without being asked'])
  })

  it('Content: What to post next stands where The questions people ask stood, and Hooks and formats is Content\'s measure', () => {
    const d = octoberFixture('content')
    expect(eyebrows(d)).toEqual(['Cover', 'In short', 'The finding', 'What to post next', 'Hooks and formats', 'What viewers come for', 'What people want shown', 'Where the confusion starts'])
    expect(printedSections(d).find((s) => s.key === 'content.hooks')?.hooks?.rival).toBe('Ottobock')
    for (const gone of ['content.questions', 'content.formats'] as const) {
      expect(d.sections.some((s) => s.key === gone)).toBe(true)
      expect(printsSection(gone, 'v2')).toBe(false)
      expect(printsSection(gone, 'v1')).toBe(true)
    }
  })

  it('Leadership: the market, who is in it and where the company stands, then the findings, the risks, your moves and what holds; no What buyers weigh', () => {
    const d = octoberFixture('leadership')
    expect(eyebrows(d)).toEqual(['Cover', 'In short', 'Where the market stands', 'Who is in your market', 'Where Össur stands', 'The finding', 'The risks', 'Your moves', 'What holds so far'])
    expect(d.sections.some((s) => s.key === 'leadership.weigh')).toBe(true)
    expect(eyebrows(d)).not.toContain('What buyers weigh')
    // The cover's contents are the printed pages', by their short names.
    expect(contentsOf(deckPages(d)).map((t) => t.title)).toEqual(['Where the market stands', 'Who is in your market', 'Where Acme stands against its rivals', 'Rivals own concrete jobs', 'The risks, in business terms', 'Your moves', 'What holds so far'])
  })

  it('a brief stored before the October canvas keeps the 12 Oct page set', () => {
    const d = briefFixture('content')
    expect(canvasOf(d)).toBe('v1')
    expect(eyebrows(d)).toContain('The questions people ask')
    expect(deckPages(d).every((p) => p.href === undefined)).toBe(true)
  })
})

describe('every page links to its page in the app (v2 only)', () => {
  it('the header of every page but the cover', () => {
    const pages = deckPages(octoberFixture('leadership'))
    expect(pages[0].href).toBeUndefined()
    expect(pages.slice(1).every((p) => p.href?.startsWith('/dashboard'))).toBe(true)
    expect(pages.find((p) => p.eyebrow === 'Who is in your market')?.href).toBe('/dashboard/voices?month=2026-10')
    expect(pages.find((p) => p.eyebrow === 'What holds so far')?.href).toBe('/dashboard/market?period=month&month=2026-10#long-run')
  })
})

describe('a thin page is left out (PAGE_NEEDS), and a partial landing prints the rest', () => {
  const role = (r: BriefRole, a: Partial<BriefAppInputs>) => octoberFixture(r, { app: app(a) })

  it('one group: no Who is buying, no Who is in your market', () => {
    const one = { ...OSSUR_PEOPLE, groups: OSSUR_PEOPLE.groups.slice(0, 1) }
    // A lone group too short to fill a sheet is not drawn alone (v1's buyer rule).
    expect(left(role('sales', { people: one }))).toContain('sales.groups: nothing fits its page')
    expect(left(role('leadership', { people: one }))).toContain('leadership.groups: 1 of the 2 groups a page needs')
    expect(eyebrows(role('sales', { people: null }))).not.toContain('Who is buying')
  })

  it('three groups: two on the sheet, the third named rather than alone on a sheet it would not fill', () => {
    const three = { ...OSSUR_PEOPLE, groups: OSSUR_PEOPLE.groups.slice(0, 3) }
    const sheets = printedSections(role('sales', { people: three })).filter((s) => s.key === 'sales.groups')
    expect(sheets).toHaveLength(1)
    expect(sheets[0].people!.rest?.map((g) => g.name)).toEqual(['Athlete'])
  })

  it('Your moves: one piece of advice and no move is too thin; the record is the card it always draws', () => {
    expect(left(role('leadership', { moves: { ...OSSUR_MOVES, pool: OSSUR_MOVES.pool.slice(0, 1), moves: [] } }))).toContain('leadership.moves: 1 of the 2 pieces of advice and moves a page needs')
    expect(eyebrows(role('leadership', { moves: { ...OSSUR_MOVES, moves: [] } }))).toContain('Your moves')
    expect(left(role('leadership', { moves: { ...OSSUR_MOVES, record: { ...OSSUR_MOVES.record, total: 0 } } }))).toContain('leadership.moves: missing: The record')
  })

  it('Your products: a row is as tall as its products wrap, a name and its count never apart, so no row runs into the foot', () => {
    // The worst case's rows as Chrome draws them (18 Oct): Sockets four lines
    // (each name whole, the mark on a line of its own), Hands three, Feet five.
    const [sockets, hands, feet] = WORST_PRODUCTS.categories
    expect([sockets, hands, feet].map((c) => productLines(c.products, 222))).toEqual([4, 3, 5])
    expect(productLines([], 222)).toBe(1)
    expect(H.category(sockets)).toBe(21 + 4 * 13.5 * 1.5)
    // A name of two lines makes its row two lines tall.
    expect(H.category({ name: 'Hands and Accessories', products: [] })).toBeGreaterThan(H.category({ name: 'Hands', products: [] }))
    // So the worst case prints the rows that fit, and Bracing & Supports (its
    // fifth, which ran into the foot) waits in the stored brief.
    const page = printedSections(octoberFixture('marketing', { app: app({ products: WORST_PRODUCTS }) })).find((s) => s.key === 'marketing.products')!
    expect(page.products!.categories.map((c) => c.name)).toEqual(['Sockets & Locks', 'Hands and Accessories', 'Feet', 'Liners and Accessories'])
  })

  it('Your products: no standout, or one category, leaves it out', () => {
    expect(left(role('marketing', { products: { ...OSSUR_PRODUCTS, standouts: [] } }))).toContain('marketing.products: missing: What stands out')
    expect(left(role('marketing', { products: { ...OSSUR_PRODUCTS, categories: OSSUR_PRODUCTS.categories.slice(0, 1) } }))).toContain('marketing.products: 1 of the 2 categories a page needs')
  })

  it('What to post next: one idea is too thin; Hooks and formats needs your posts and both tables', () => {
    expect(left(role('content', { ideas: { ...OSSUR_IDEAS, ideas: OSSUR_IDEAS.ideas.slice(0, 1) } }))).toContain('content.ideas: 1 of the 2 ideas a page needs')
    expect(left(role('content', { hooks: { ...OSSUR_HOOKS, posts: null } }))).toContain('content.hooks: missing: Your posts')
    expect(left(role('content', { hooks: { ...OSSUR_HOOKS, openings: null } }))).toContain('content.hooks: missing: The openings')
    // The rest of the brief prints.
    expect(eyebrows(role('content', { ideas: null, hooks: null }))).toEqual(['Cover', 'In short', 'The finding', 'What viewers come for', 'What people want shown', 'Where the confusion starts'])
  })

  it('Where the market stands needs its bars and the kinds and the mood', () => {
    const noPanel = octoberFixture('leadership', { subjects: subjectsFixture(OSSUR_APP.subjectReads, { panel: false }) })
    expect(left(noPanel)).toContain('leadership.subjects: missing: What people do in the comments')
    expect(eyebrows(octoberFixture('leadership', { subjects: null }))[2]).toBe('Who is in your market')
  })

  it('Who gets named: where not every brand fits, the notes speak of the rows that print', () => {
    const d = octoberFixture('marketing', { app: { ...SEALAND_APP, named: WORST_NAMED } })
    const page = printedSections(d).find((s) => s.key === 'marketing.named')!
    const shown = page.named!.rows.map((r) => r.label)
    expect(shown.length).toBeLessThan(WORST_NAMED.rows.length)
    const named = WORST_NAMED.rows.map((r) => r.label).filter((l) => !shown.includes(l))
    for (const line of page.lines ?? []) for (const gone of named) expect(line).not.toContain(gone)
  })

  it('Sealand: no products page, no moves where none were read, brands named where counted', () => {
    expect(eyebrows(octoberFixture('leadership', { tenant: 'sealand' }))).not.toContain('Your moves')
    expect(eyebrows(octoberFixture('marketing', { tenant: 'sealand' }))).not.toContain('Your products')
    expect(eyebrows(octoberFixture('marketing', { app: { ...SEALAND_APP, named: null } }))).not.toContain('Named without being asked')
  })
})

describe('In short says only what prints: the check reads the October pages\' own words', () => {
  it('a group, an idea, an advice title and a standout are printed lines; a dropped writer section is not', () => {
    const lines = [
      ...printedLines(printedPages(octoberFixture('leadership'))),
      ...printedLines(printedPages(octoberFixture('content'))),
      ...printedLines(printedPages(octoberFixture('marketing'))),
    ].join('\n')
    expect(lines).toContain('Caretaker: 100 of 902 videos.')
    expect(lines).toContain('Why can a prosthetic feel heavy or hard to wear all day?')
    expect(lines).toContain('Create an Össur Access Navigator for new amputees and caregivers (would move Where can I get one)')
    expect(lines).toContain('65 pieces of advice since 13 June: 1 decided, 4 waiting.')
    expect(lines).toContain('Came up for the first time: Pro-Flex LP Align.')
    expect(lines).toContain('Visible independence earns the encouragement around a prosthetic leg')
    // What buyers weigh is written and stored, and not on a printed page.
    const weigh = briefFixture('leadership').sections.find((s) => s.key === 'leadership.weigh')!.groups[0].items[0].text
    expect(lines).not.toContain(weigh)
  })

  it('only what the October page draws: Who is in your market\'s cards name no products, and Your moves draws one move\'s card', () => {
    const second = { ...OSSUR_MOVES.moves[0], id: 'm2', title: 'Run a second campaign', sentence: 'A sentence only the second move earns.' }
    const d = octoberFixture('leadership', { app: app({ moves: { ...OSSUR_MOVES, moves: [...OSSUR_MOVES.moves, second] } }) })
    const lines = printedLines(printedPages(d)).join('\n')
    expect(lines).toContain('Talks most about Cost & access, 31 of their 88 videos.')
    expect(lines).not.toContain('Your products in them')
    expect(lines).toContain(OSSUR_MOVES.moves[0].sentence)
    expect(lines).not.toContain(second.sentence)
    // Who is buying's cards say both, as they print them.
    expect(printedLines(printedPages(octoberFixture('sales'))).join('\n')).toContain('Your products in them: Pro-Flex Terra and Direct Socket.')
  })
})

describe('a deck from before the October canvas, handed an October brief (a rollback)', () => {
  // The 12 Oct deck reads `sections` alone and ignores a field it does not
  // know: an October brief, to it, is the same brief with no `fromApp`. That
  // is the v1 path here, byte for byte the old deck (the September goldens).
  it('draws it on the 12 Oct canvas, from the writer\'s sections, without throwing', () => {
    for (const role of ['sales', 'marketing', 'content', 'leadership'] as const) {
      const october = octoberFixture(role)
      expect(october.sections.some((s) => APP_SECTION_KEYS.includes(s.key))).toBe(false)
      const { fromApp: _ignored, ...asOld } = october
      expect(canvasOf(asOld as MonthlyBriefData)).toBe('v1')
      expect(deckPages(asOld).length).toBeGreaterThan(2)
    }
  })

  it('and composeBrief cannot put one there: `sections` are the writer\'s specs alone (`selectRoleSections` over ROLE_SECTIONS), which name no October key, and every page read from the app is one', () => {
    for (const role of ['sales', 'marketing', 'content', 'leadership'] as const) {
      expect(ROLE_SECTIONS[role].filter((s) => APP_SECTION_KEYS.includes(s.key))).toEqual([])
      const fromApp = appSectionsFor(role, { company: 'Össur', app: { ...OSSUR_APP, named: SEALAND_NAMED }, subjects: null, vectors: null })
      expect(fromApp.length).toBeGreaterThan(0)
      expect(fromApp.every((s) => APP_SECTION_KEYS.includes(s.key))).toBe(true)
    }
  })

  it('which is why the new keys never go in `sections`: the old deck has no PAGE_NEEDS row for them and would throw', () => {
    const { fromApp, ...asOld } = octoberFixture('leadership')
    expect(() => planDeck({ ...asOld, sections: [...asOld.sections, ...(fromApp ?? [])].map((s) => (APP_SECTION_KEYS.includes(s.key) ? { ...s, key: 'not.a.key' as never } : s)) })).toThrow()
  })
})
