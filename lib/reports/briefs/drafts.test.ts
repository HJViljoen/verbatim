import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { briefFixture } from '../../../components/briefs/fixture'
import { briefOfFile, draftSetOf, readDraftFiles, type DraftExpect, type DraftFiles } from './drafts'
import { BRIEF_ROLES, storedBrief, type BriefRole, type MonthlyBriefData } from './types'

// The script's --from: a month's four briefs an earlier build saved, read
// back and checked to be the expected client's month before anything is
// stored. Made-up briefs (the deck's fixture); nothing here is a reading.

const CLIENT = 'e52cac94-30e1-426a-9a36-31b11e0b30b6'
const EXPECT: DraftExpect = { clientId: CLIENT, company: 'Acme', month: '2026-09-01', noun: null }

/** A brief as the 4 Oct dry harness saved it: written before `noun`. */
function saved(role: BriefRole): MonthlyBriefData {
  const { noun: _noun, ...d } = briefFixture(role)
  return d
}
/** The harness's file: `{ brief, workings }`. */
const harness = (role: BriefRole) => ({ brief: saved(role), workings: { questions: [], costUsd: 0 } })
const allFour = (f: (r: BriefRole) => unknown = harness): DraftFiles['briefs'] => Object.fromEntries(BRIEF_ROLES.map((r) => [r, f(r)]))

describe('briefOfFile', () => {
  it("reads the harness's { brief, workings } and the bare brief --out writes", () => {
    expect(briefOfFile(harness('sales'))?.role).toBe('sales')
    expect(briefOfFile(saved('content'))?.role).toBe('content')
  })
  it('refuses what is not a brief, and a stored snapshot (no held for the ledger)', () => {
    expect(briefOfFile({ brief: { kind: 'weekly' } })).toBeNull()
    expect(briefOfFile(null)).toBeNull()
    expect(briefOfFile(storedBrief(saved('sales')))).toBeNull()
  })
})

describe('draftSetOf', () => {
  it("is the four briefs in the roles' order, as saved, with the noun the build would give", () => {
    const r = draftSetOf({ briefs: allFour(), set: { clientId: CLIENT, month: '2026-09-01', builtAt: '2026-10-04T16:11:08.133Z' } }, { ...EXPECT, noun: 'packs' })
    if (!r.ok) throw new Error(r.errors.join('; '))
    expect(r.set.briefs.map((d) => d.role)).toEqual([...BRIEF_ROLES])
    expect(r.set.briefs.every((d) => d.noun === 'packs')).toBe(true)
    expect(r.set.builtAt).toBe('2026-10-04T16:11:08.133Z')
    // Nothing else is touched: the words, the quotes as refs, what was held.
    const { noun: _noun, ...asSaved } = r.set.briefs[0]
    expect(asSaved).toEqual(saved('sales'))
  })

  it('keeps a noun the brief already has, and needs no _set.json', () => {
    const r = draftSetOf({ briefs: allFour((role) => ({ ...saved(role), noun: 'bags' })) }, EXPECT)
    if (!r.ok) throw new Error(r.errors.join('; '))
    expect(r.set.briefs.map((d) => d.noun)).toEqual(['bags', 'bags', 'bags', 'bags'])
    expect(r.set.builtAt).toBeNull()
  })

  it('takes the company however its letters are composed', () => {
    const decomposed = 'Össur'
    const r = draftSetOf({ briefs: allFour((role) => ({ brief: { ...saved(role), company: decomposed } })) }, { ...EXPECT, company: 'Össur' })
    expect(r.ok).toBe(true)
  })

  it('names every reason a folder is not this client\'s month, and stores nothing of it', () => {
    const briefs = allFour()
    delete briefs.leadership
    briefs.sales = { brief: { ...saved('sales'), month: '2026-08-01' } }
    briefs.marketing = { brief: { ...saved('content') } }
    briefs.content = { brief: { ...saved('content'), company: 'Sealand' } }
    const r = draftSetOf({ briefs, set: { clientId: 'ac16988e-c4f3-4baf-b388-73895852a554', month: '2026-08-01' } }, EXPECT)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors).toEqual([
      'sales_brief.json is for 2026-08-01, not 2026-09-01',
      'marketing_brief.json is the content brief',
      "content_brief.json is Sealand's, not Acme's",
      'leadership_brief.json is missing',
      `_set.json is client ac16988e-c4f3-4baf-b388-73895852a554, not ${CLIENT}`,
      '_set.json is for 2026-08-01, not 2026-09-01',
    ])
  })

  it('refuses a file that is not a brief', () => {
    const r = draftSetOf({ briefs: { ...allFour(), content: { brief: { kind: 'monthly_brief' } } } }, EXPECT)
    expect(r.ok ? [] : r.errors).toEqual(['content_brief.json is not a monthly brief'])
  })
})

describe('readDraftFiles', () => {
  it("reads a saved folder's four briefs and _set.json, and says which file is not JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), 'brief-drafts-'))
    try {
      for (const role of BRIEF_ROLES) writeFileSync(join(dir, `${role}_brief.json`), JSON.stringify(harness(role)))
      writeFileSync(join(dir, `${'sales'}_brief.md`), '# not read')
      writeFileSync(join(dir, '_set.json'), JSON.stringify({ clientId: CLIENT, month: '2026-09-01' }))
      const files = readDraftFiles(dir)
      expect(Object.keys(files.briefs)).toEqual([...BRIEF_ROLES])
      const r = draftSetOf(files, EXPECT)
      expect(r.ok).toBe(true)
      writeFileSync(join(dir, 'content_brief.json'), '{ not json')
      expect(() => readDraftFiles(dir)).toThrow(/content_brief\.json is not JSON/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('leaves a missing file out, for draftSetOf to name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'brief-drafts-'))
    try {
      writeFileSync(join(dir, 'sales_brief.json'), JSON.stringify(harness('sales')))
      const files = readDraftFiles(dir)
      expect(Object.keys(files.briefs)).toEqual(['sales'])
      expect(files.set).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
