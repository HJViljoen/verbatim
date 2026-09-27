import { describe, expect, it } from 'vitest'

import { directionHits } from '../calibration'
import {
  activationSql,
  CONFIRMED_ACTOR,
  CONFIRMED_NOTE,
  NEW_SUBJECTS_CAP,
  parseConfirmedSet,
  sqlText,
} from '../../scripts/new-subjects'

// scripts/new-subjects.ts (plan WP3.1): the confirmed set as paste lines, with
// no read. The candidates are §2.3's shortlist for the 13 Oct call.

const SEALAND = 'ac16988e-c4f3-4baf-b388-73895852a554'
const FILE = {
  confirmedOn: '2026-10-13',
  subjects: [
    { name: 'Travel fit & carry-on', description: 'How the bags fit airline cabins, one-bag travel and packing.' },
    { name: 'Materials & origin', description: "What the bags are made of and where it comes from, in the buyer's words." },
    { name: 'Looks & style' },
  ],
}

describe('parseConfirmedSet', () => {
  it('reads the file, trims names and defaults the origin to the market', () => {
    const set = parseConfirmedSet({ ...FILE, subjects: [{ name: '  Travel fit & carry-on ', description: 'x' }] })
    expect(set.subjects).toEqual([{ name: 'Travel fit & carry-on', description: 'x', origin: 'category_theme' }])
    expect(set.confirmedOn).toBe('2026-10-13')
  })

  it('keeps a name without a description as a confirmation only', () => {
    expect(parseConfirmedSet(FILE).subjects[2]).toEqual({ name: 'Looks & style', description: null, origin: 'category_theme' })
  })

  it('refuses a bad file whole, naming every problem', () => {
    const bad = {
      confirmedOn: '13 Oct',
      subjects: [
        { name: 'x'.repeat(61) },
        { name: 'Price' },
        { name: 'price' },
        { name: 'Fit — and carry', description: '' },
        { name: 'Other', origin: 'mock' },
        {},
      ],
    }
    let message = ''
    try { parseConfirmedSet(bad) } catch (e) { message = (e as Error).message }
    expect(message).toMatch(/confirmedOn/)
    expect(message).toMatch(/over 60 characters/)
    expect(message).toMatch(/named twice/)
    expect(message).toMatch(/em dash/)
    expect(message).toMatch(/a description, when given/)
    expect(message).toMatch(/origin must be one of/)
    expect(message).toMatch(/a name is required/)
  })

  it(`refuses more than ${NEW_SUBJECTS_CAP} subjects`, () => {
    const many = { confirmedOn: '2026-10-13', subjects: Array.from({ length: NEW_SUBJECTS_CAP + 1 }, (_, i) => ({ name: `S${i}` })) }
    expect(() => parseConfirmedSet(many)).toThrow(/the cap is 10/)
  })

  it('refuses an empty set', () => {
    expect(() => parseConfirmedSet({ confirmedOn: '2026-10-13', subjects: [] })).toThrow(/non-empty/)
  })
})

describe('activationSql', () => {
  const lines = activationSql(parseConfirmedSet(FILE), SEALAND)

  it('is one transaction, closed by a select that shows each name', () => {
    expect(lines[1]).toBe('begin;')
    expect(lines.filter((l) => l === 'commit;')).toHaveLength(1)
    expect(lines.at(-1)).toMatch(/^select s\.name, s\.status, s\.origin/)
    expect(lines.at(-1)).toContain("lower(trim('Looks & style'))")
  })

  it('activates a proposed row, or inserts one as active only when no live row of that name exists', () => {
    const insert = lines.find((l) => l.startsWith('insert into public.subjects') && l.includes('Travel fit'))!
    expect(insert).toContain("'category_theme', 'active' where not exists")
    expect(insert).toContain("status <> 'retired'")
    // created_by is not set, so M14's insert trigger logs the row.
    expect(insert).not.toContain('created_by')
    const update = lines.find((l) => l.startsWith('update public.subjects') && l.includes('Travel fit'))!
    expect(update).toContain("status = 'proposed' and description is not distinct from")
  })

  it('inserts nothing for a kept subject, and confirms it', () => {
    const kept = lines.filter((l) => l.includes("'Looks & style'") && !l.startsWith('select') && !l.startsWith('do $$'))
    expect(kept).toHaveLength(1)
    expect(kept[0]).toMatch(/^insert into public\.config_changes/)
  })

  it('writes one confirmation row per subject, once', () => {
    const rows = lines.filter((l) => l.startsWith('insert into public.config_changes'))
    expect(rows).toHaveLength(3)
    for (const r of rows) {
      expect(r).toContain("'subjects', 'confirmed'")
      expect(r).toContain("'confirmed_on', '2026-10-13'")
      expect(r).toContain("x.field = 'confirmed' and x.after ->> 'id' = s.id::text")
    }
  })

  it('carries the cap and rolls back past it', () => {
    const cap = lines.find((l) => l.startsWith('do $$'))!
    expect(cap).toContain(`> ${NEW_SUBJECTS_CAP} then raise exception`)
    expect(lines.indexOf(cap)).toBeLessThan(lines.indexOf('commit;'))
  })

  it('rolls back unless every named subject is active, naming the ones that are not', () => {
    const guard = lines.filter((l) => l.startsWith('do $$'))[1]
    expect(guard).toContain("unnest(array[lower(trim('Travel fit & carry-on')), lower(trim('Materials & origin')), lower(trim('Looks & style'))])")
    expect(guard).toContain("s.status = 'active'")
    expect(guard).toContain("raise exception 'new-subjects: not active after the paste: %; nothing written'")
    expect(lines.indexOf(guard)).toBeLessThan(lines.indexOf('commit;'))
  })

  it('quotes an apostrophe', () => {
    expect(sqlText("buyer's words")).toBe("'buyer''s words'")
    expect(lines.join('\n')).toContain("in the buyer''s words.")
  })

  it('refuses a client that is not a uuid', () => {
    expect(() => activationSql(parseConfirmedSet(FILE), 'sealand')).toThrow(/uuid/)
  })

  it('stores a note and an actor that hold to the copy rules (plan §4.0)', () => {
    expect(CONFIRMED_NOTE).not.toMatch(/\d|—/)
    expect(directionHits(CONFIRMED_NOTE)).toEqual([])
    expect(CONFIRMED_ACTOR).toBe('scripts/new-subjects.ts')
  })
})
