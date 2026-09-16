import { describe, expect, it } from 'vitest'

import { OVERVIEW_BLOCKS } from '../../../components/pages/overview'
import { SUBJECT_BLOCKS } from '../../../components/pages/subjects'
import { VOICE_BLOCKS } from '../../../components/pages/voice-surface'
import { MARKET_BLOCKS } from '../../../components/pages/market-surface'
import { COMPETITIVE_BLOCKS } from '../../../components/pages/competitive-surface'
import { DOCUMENT_ROLES } from './types'
import {
  BRIEF_MAPS,
  briefMap,
  missingInputs,
  missingSentence,
  missingSummary,
  pageKindsOf,
  sectionsOf,
  surfacesOf,
  type ReadinessLike,
} from './sections'

const KEYS: Record<string, readonly { key: string }[]> = {
  overview: OVERVIEW_BLOCKS,
  subjects: SUBJECT_BLOCKS,
  voice: VOICE_BLOCKS,
  market: MARKET_BLOCKS,
  competitive: COMPETITIVE_BLOCKS,
}

const READINESS: ReadinessLike[] = [
  { id: 'subject-set', input: 'the five to eight subjects this workspace is read against', status: 'missing', owner: 'Client', ownerRole: 'client', unlocks: 'Name the subjects in Settings › Subjects.' },
  { id: 'rival-accounts', input: 'the rival accounts we read', status: 'partial', owner: 'Client', ownerRole: 'client', unlocks: 'Add each rival\'s own accounts.' },
  { id: 'months-of-history', input: 'months carrying 100 videos', status: 'exists', owner: 'Verbatim ops', ownerRole: 'ops', unlocks: 'Nothing — it is there.' },
  { id: 'decisions', input: 'what was decided about each one', status: 'exists', owner: 'Client', ownerRole: 'client', unlocks: 'Mark each recommendation.' },
  { id: 'searchable-findings', input: 'every finding searchable', status: 'missing', owner: 'Verbatim engineering', ownerRole: 'engineering', unlocks: 'Phase 1 builds it; nothing can be entered before it.' },
]

describe('the four section maps', () => {
  it('every role has one', () => {
    expect(Object.keys(BRIEF_MAPS).sort()).toEqual([...DOCUMENT_ROLES].sort())
  })

  it('every section names a block that exists on its surface', () => {
    for (const role of DOCUMENT_ROLES) {
      for (const s of sectionsOf(briefMap(role))) {
        const blocks = KEYS[s.surface]
        expect(blocks, `${role} names surface ${s.surface}`).toBeTruthy()
        expect(blocks.map((b) => b.key), `${role} · ${s.id}`).toContain(s.block)
      }
    }
  })

  it('a section id is unique across every map — it names a slide and an edit', () => {
    const ids = Object.values(BRIEF_MAPS).flatMap((m) => sectionsOf(m).map((s) => s.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every map ends on the method page and opens with the short read', () => {
    for (const role of DOCUMENT_ROLES) {
      const map = briefMap(role)
      expect(map[0]).toEqual({ kind: 'page', page: 'in_short' })
      expect(map[map.length - 1]).toEqual({ kind: 'page', page: 'method' })
    }
  })

  it('surfacesOf names only the surfaces a map borrows from', () => {
    expect(surfacesOf(briefMap('leadership_brief'))).toEqual(['overview', 'competitive'])
    expect(surfacesOf(briefMap('content_brief'))).toEqual(['subjects', 'market'])
    expect(surfacesOf(briefMap('market_brief'))).toEqual(['overview'])
  })

  it('pageKindsOf is what the writer is still asked for', () => {
    expect(pageKindsOf(briefMap('leadership_brief')).sort()).toEqual(['finding', 'in_short', 'method'])
    expect(pageKindsOf(briefMap('sales_brief'))).toContain('language')
  })

  it('the marketing map is RP1\'s own list: subjects, category, rivals, moves, method', () => {
    const titles = sectionsOf(briefMap('market_brief')).map((s) => s.title)
    expect(titles).toEqual(['The month', 'Your subjects', 'The category', 'Rivals', 'Your moves'])
    expect(pageKindsOf(briefMap('market_brief'))).toContain('method')
  })

  it('no framing line carries a direction word or pipeline vocabulary', () => {
    for (const role of DOCUMENT_ROLES) {
      for (const s of sectionsOf(briefMap(role))) {
        const words = `${s.title} ${s.framing}`.toLowerCase()
        for (const banned of ['pass ', 'run ', 'tier', 'conversations analysed', 'growing', 'fading', 'rising']) {
          expect(words, `${role} · ${s.id}`).not.toContain(banned)
        }
      }
    }
  })
})

describe('missingInputs', () => {
  it('names only what is MISSING — partial is thinner, not absent', () => {
    const missing = missingInputs(briefMap('leadership_brief'), READINESS)
    expect(missing.map((m) => m.id)).toEqual(['subject-set'])
  })

  it('gathers every section that went without one input', () => {
    const missing = missingInputs(briefMap('content_brief'), READINESS)
    expect(missing).toHaveLength(1)
    expect(missing[0].sections).toEqual(['The words to borrow'])
  })

  it('does not refuse a section over an input the block does not need', () => {
    // `rival-accounts` is about the rivals' OWN accounts; the standings block
    // reads the category corpus either way. Measured on production: declaring
    // it refused a section both tenants could draw.
    const rows = READINESS.map((r) => (r.id === 'rival-accounts' ? { ...r, status: 'missing' as const } : r))
    expect(missingInputs(briefMap('leadership_brief'), rows).map((m) => m.id)).toEqual(['subject-set'])
  })

  it('an unmeasured row is not a missing one — the record is allowed to say nothing', () => {
    expect(missingInputs(briefMap('sales_brief'), [])).toEqual([])
  })

  it('one input needed by two sections is named once, with both', () => {
    const missing = missingInputs(briefMap('sales_brief'), READINESS)
    expect(missing).toHaveLength(1)
    expect(missing[0].sections).toEqual(['In their words, by subject', 'What they asked and nobody answered'])
  })
})

describe('missingSentence', () => {
  const m = missingInputs(briefMap('leadership_brief'), READINESS)[0]

  it('names the input, the owner and the screen — and no work package', () => {
    expect(missingSentence(m)).toBe(
      'Your subjects could not be filled. We have not recorded the five to eight subjects this workspace is read against. Client closes this — Name the subjects in Settings › Subjects. It is on Settings › Readiness.',
    )
  })

  it('an engineering-owned gap is a promise, never that row\'s own sentence', () => {
    const engineering = { ...m, owner: 'Verbatim engineering', ownerRole: 'engineering' as const, unlocks: 'Phase 1 builds the subject set and the form that names them.' }
    const line = missingSentence(engineering)
    expect(line).toContain('We are building it, and it appears here the moment it is there.')
    expect(line).not.toContain('Phase 1')
    expect(line).not.toContain('closes this')
  })

  // months-of-history is OPS and is a `needs` of most sections in all four
  // maps, so on a workspace whose months are not seeded — the new-tenant case,
  // and the case a brief most wants to explain — this is the sentence the
  // client's brief prints most often.
  it('an ops-owned gap is a promise too, never our own set-up instruction', () => {
    const ops = { ...m, id: 'months-of-history' as const, owner: 'Verbatim ops', ownerRole: 'ops' as const, unlocks: 'Apply the monthly reading and seed it once per workspace; every update after that keeps it.' }
    const line = missingSentence(ops)
    expect(line).toContain('We are setting it up, and it appears here the moment it is there.')
    expect(line).not.toContain('Apply the monthly reading')
    expect(line).not.toContain('seed it')
    expect(line).not.toContain('closes this')
  })

  it('never doubles a full stop', () => {
    expect(missingSentence(m)).not.toMatch(/\.\./)
  })
})

describe('missingSummary', () => {
  it('is null when nothing is missing, and counts otherwise', () => {
    expect(missingSummary([])).toBeNull()
    expect(missingSummary(missingInputs(briefMap('market_brief'), READINESS))).toContain('One thing')
  })
})
