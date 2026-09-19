import { describe, expect, it } from 'vitest'

import { OVERVIEW_BLOCKS } from '../../../components/pages/overview'
import { SUBJECT_BLOCKS } from '../../../components/pages/subjects'
import { VOICE_BLOCKS } from '../../../components/pages/voice-surface'
import { MARKET_BLOCKS } from '../../../components/pages/market-surface'
import { COMPETITIVE_BLOCKS } from '../../../components/pages/competitive-surface'
import { CONTENT_BRIEF_BLOCKS, contentMake } from '../../../components/blocks/content-brief'
import { OWNER_LABEL } from '../../readiness/types'
import { DOCUMENT_ROLES } from './types'
import {
  BRIEF_MAPS,
  BRIEF_SURFACES,
  briefMap,
  missingInputs,
  missingSentence,
  missingSummary,
  pageKindsOf,
  sectionsOf,
  surfacesOf,
  untrackedNotes,
  untrackedSentence,
  type BriefEntry,
  type ReadinessLike,
} from './sections'

// MIRRORS `BLOCKS` IN `load-reading.ts`, WHICH IS THE ONE TABLE. Imported by
// hand rather than from there because that module imports five page loaders,
// each of which reaches Supabase at module scope, and this tier is pure. Two
// entries are not a page's block array and say why:
//   · `content` is the content brief's own surface (Block D wave 2, E-content):
//     its two blocks are the brief's, not a page's, because the formats table
//     is CO7 (unmounted) and the record slide is a Settings drawer.
//   · `contentMake` renders `MarketSurfaceData` in the content artboard's card
//     anatomy and is reachable on the MARKET surface without being in
//     `MARKET_BLOCKS` — adding it there would mount a tile on the Market page.
const KEYS: Record<string, readonly { key: string }[]> = {
  overview: OVERVIEW_BLOCKS,
  subjects: SUBJECT_BLOCKS,
  voice: VOICE_BLOCKS,
  market: [...MARKET_BLOCKS, contentMake],
  competitive: COMPETITIVE_BLOCKS,
  content: CONTENT_BRIEF_BLOCKS,
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

  // THE MIRROR IS CHECKED AGAINST THE SURFACE LIST IT MIRRORS (E-content code
  // review 8). `KEYS` is a hand-written copy of `BLOCKS` in `load-reading.ts`,
  // for the reason above it; nothing forced the two to name the same surfaces,
  // so a surface added there and forgotten here would simply not be asserted.
  it('the mirrored block table names every brief surface and no other', () => {
    expect(Object.keys(KEYS).sort()).toEqual([...BRIEF_SURFACES].sort())
  })

  // `content.make` IS REACHABLE ON THE MARKET SURFACE WITHOUT BEING A MARKET
  // PAGE BLOCK, and `blockReading` runs every block of a loaded surface — so
  // the day a second map borrows any market block, it would inherit this
  // block's figures, verdicts and quote refs into its own `BriefReading`, and
  // `confidenceOf` / `countRefused` / the cover prompt would all argue from
  // them. Contained today by the fact that only CONTENT_MAP names the market
  // surface at all; that containment is asserted here rather than left to luck.
  it('content.make is drawn by the content map and by no other', () => {
    for (const role of DOCUMENT_ROLES) {
      const blocks = sectionsOf(briefMap(role)).map((s) => s.block)
      if (role === 'content_brief') expect(blocks).toContain('content.make')
      else expect(blocks, `${role} borrows content.make`).not.toContain('content.make')
    }
    const borrowsMarket = DOCUMENT_ROLES.filter((role) => surfacesOf(briefMap(role)).includes('market'))
    expect(borrowsMarket).toEqual(['content_brief'])
  })

  it('a section id is unique across every map — it names a slide and an edit', () => {
    const ids = Object.values(BRIEF_MAPS).flatMap((m) => sectionsOf(m).map((s) => s.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  // EVERY MAP OPENS WITH THE SHORT READ AND CLOSES ON HOW IT WAS MADE — and
  // for three of the four that closing sheet is `page('method')`. The content
  // brief's is `ct.record`, the artboard's own slide 5, which prints
  // `methodLines` (PRIVACY_LINE included) plus eleven figures `MethodPage`
  // does not; it had BOTH until the fix pass, two consecutive "How this brief
  // was made" sheets disagreeing about Videos (reports-25).
  it('every map ends on how the brief was made and opens with the short read', () => {
    const closes: Record<string, BriefEntry> = {
      content_brief: { kind: 'block', section: expect.objectContaining({ id: 'ct.record' }) as never },
    }
    for (const role of DOCUMENT_ROLES) {
      const map = briefMap(role)
      expect(map[0]).toEqual({ kind: 'page', page: 'in_short' })
      expect(map[map.length - 1]).toEqual(closes[role] ?? { kind: 'page', page: 'method' })
    }
  })

  // And exactly one of the two, on every map: a brief may not print its method
  // twice.
  it('never draws two method sheets on one brief', () => {
    for (const role of DOCUMENT_ROLES) {
      const map = briefMap(role)
      const methods = map.filter((e) => e.kind === 'page' && e.page === 'method').length
      const records = sectionsOf(map).filter((s) => s.block === 'content.record').length
      expect(methods + records, role).toBe(1)
    }
  })

  it('surfacesOf names only the surfaces a map borrows from', () => {
    expect(surfacesOf(briefMap('leadership_brief'))).toEqual(['overview', 'competitive'])
    // The content brief gained `overview` (the `ct.ways` block-key fix: it
    // draws `overview.category`, the block its own words describe) and
    // `content` (its own two slides) in Block D wave 2 (E-content).
    expect(surfacesOf(briefMap('content_brief'))).toEqual(['overview', 'subjects', 'market', 'content'])
    // E-marketing: the artboard's slide 2 carries the monthly line, which is
    // `subjects.line`, so the marketing brief now pays for a second loader.
    expect(surfacesOf(briefMap('market_brief'))).toEqual(['overview', 'subjects'])
  })

  it('pageKindsOf is what the writer is still asked for', () => {
    expect(pageKindsOf(briefMap('leadership_brief')).sort()).toEqual(['finding', 'in_short', 'method'])
    expect(pageKindsOf(briefMap('sales_brief'))).toContain('language')
  })

  it('the marketing map is RP1\'s own list: subjects, category, rivals, moves, method', () => {
    const titles = sectionsOf(briefMap('market_brief')).map((s) => s.title)
    expect(titles).toEqual(['Your subjects', 'Month by month', 'The month', 'What changed this month', 'Rivals', 'Your moves'])
    expect(pageKindsOf(briefMap('market_brief'))).toContain('method')
  })

  // E-marketing, the artboard's seven sheets. The map used to paginate to
  // twelve landscape sheets for a month the artboard spends seven on, because
  // every section had a sheet of its own. The sheets are the assertion, not the
  // section count: a section may be added to a sheet, and the day one is given
  // a sheet of its own again is the day this line has to be argued for.
  it('the marketing map cuts one sheet, and every sheeted section states its span', () => {
    const sections = sectionsOf(briefMap('market_brief'))
    expect(sections.filter((s) => s.sheet).map((s) => s.id)).toEqual(['mk.subjects', 'mk.subjectline'])
    for (const s of sections) {
      if (!s.sheet) { expect(s.span, s.id).toBeUndefined(); continue }
      expect(s.span, s.id).toBeGreaterThan(0)
      expect(s.span!, s.id).toBeLessThanOrEqual(12)
    }
  })

  // The other three maps are untouched by the sheets, which is what makes the
  // grouping additive rather than a re-pagination of every brief.
  it('no other map declares a sheet', () => {
    for (const role of ['leadership_brief', 'sales_brief', 'content_brief'] as const) {
      for (const s of sectionsOf(briefMap(role))) expect(s.sheet, `${role} · ${s.id}`).toBeUndefined()
    }
  })

  // Block D wave 2, E-leadership · "Fix first". `ld.standing` named
  // `competitive.rivals` — the rival SELECTOR — under a framing that promises a
  // measurement ("Your own share of the month beside every tracked rival"). The
  // block that answers that framing is `competitive.months`, the standings
  // table. Named here so the key cannot drift back in silence: the generic
  // "every section names a block that exists" test above passed on the wrong
  // one, because both keys exist on the same surface.
  it('“Where you stand” borrows the STANDINGS table, never the rival picker', () => {
    const standing = sectionsOf(briefMap('leadership_brief')).find((s) => s.id === 'ld.standing')
    expect(standing?.block).toBe('competitive.months')
    expect(standing?.block).not.toBe('competitive.rivals')
  })

  // `lead.fig2`: the panel's monthly levels, its size and the latest banded
  // step all live on `overview.category`, and no map borrowed it — so no
  // attention reading has ever reached this document.
  it('the leadership map borrows the category, so the attention reading reaches the brief', () => {
    const category = sectionsOf(briefMap('leadership_brief')).find((s) => s.id === 'ld.category')
    expect(category?.block).toBe('overview.category')
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
    // The sales map's own order, which is the artboard's (E-sales).
    expect(missing[0].sections).toEqual(['What they are pushing back on', 'What sells, in their words'])
    // …and the sentence splices the SHORT names, which is what a reader meets.
    expect(missing[0].labels).toEqual(['Objections', 'Selling points'])
    expect(missingSentence(missing[0])).toContain('The Objections and Selling points sections could not be filled.')
  })
})

describe('missingSentence', () => {
  const m = missingInputs(briefMap('leadership_brief'), READINESS)[0]

  // A SECTION IS NAMED AS A SECTION. The name spliced in is the short one
  // (`labelOf` — `context` where a section has it) and it is introduced as a
  // section, because a map title is written to be read as a heading and the
  // sales map took the artboard's own eleven-word titles in this wave.
  it('names the input and who closes it — and no work package', () => {
    expect(missingSentence(m)).toBe(
      'The Your subjects section could not be filled. We have not recorded the five to eight subjects this workspace is read against. This one is yours to close. Name the subjects in Settings › Subjects.',
    )
  })

  it('never puts our own owner taxonomy in front of the reader', () => {
    // OWNER_LABEL is the readiness screen's vocabulary: "Client", "Verbatim
    // ops", "Verbatim engineering". A brief is read by the client, so none of
    // the three may be printed AT them.
    for (const role of ['client', 'ops', 'engineering'] as const) {
      const line = missingSentence({ ...m, ownerRole: role, owner: OWNER_LABEL[role] })
      for (const label of Object.values(OWNER_LABEL)) expect(line).not.toContain(label)
    }
  })

  it('does not hang a capitalised imperative off a dash', () => {
    // `unlocks` opens with a capital. Mid-sentence it read "Client closes this
    // — Name the subjects…"; it is its own sentence now.
    expect(missingSentence(m)).not.toMatch(/— [A-Z]/)
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

  it('sends nobody to our readiness screen — the sentence is printed on paper', () => {
    // Composed once and frozen: the same string is the PDF, the share link and
    // the Studio's deck. A reader of /r/<token> has no Settings to open.
    for (const role of ['client', 'ops', 'engineering'] as const) {
      expect(missingSentence({ ...m, ownerRole: role, owner: OWNER_LABEL[role] })).not.toContain('Settings › Readiness')
    }
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

describe('untrackedNotes — the readiness NOTE rule (sales.p4.untracked)', () => {
  it('notes a partial input the section still draws without, and refuses nothing', () => {
    const notes = untrackedNotes(briefMap('sales_brief'), READINESS)
    expect(notes.map((n) => n.id)).toEqual(['rival-accounts'])
    // The SAME row is `partial`, so it is deliberately NOT a missing input:
    // the two functions answer two different questions about one row.
    expect(missingInputs(briefMap('sales_brief'), READINESS).map((m) => m.id)).not.toContain('rival-accounts')
    expect(notes[0].sections).toEqual(['Who is being talked about, rival by rival'])
    // THE RENDERED SENTENCE, not just the sections it names. The map took the
    // artboard's own titles in this wave — "By rival" became "What they
    // complain about with each rival" — and `untrackedSentence` splices a
    // section into running prose, so the rename turned the line into "What
    // they complain about with each rival is read without it", which is not a
    // sentence. It splices the SHORT name now (`context`, the artboard's own
    // two-word slot) and says "section" out loud.
    expect(notes[0].line).toBe(
      'Not tracked: the rival accounts we read. The Rivals section is read without it. Yours to name in Settings.',
    )
  })

  it('says nothing about an input that exists', () => {
    const notes = untrackedNotes(briefMap('sales_brief'), [
      { ...READINESS[1], status: 'exists' },
    ])
    expect(notes).toHaveLength(0)
  })

  it('names the ROLE and never a date or a person', () => {
    const line = untrackedSentence({ input: 'the rival accounts we read', ownerRole: 'ops', sections: ['By rival'], labels: ['Rivals'] })
    expect(line).toContain('Not tracked: the rival accounts we read.')
    expect(line).toContain('Ours to set up.')
    // D14: ReadinessRow carries a role token and never a person or a due date,
    // so neither may appear here.
    expect(line).not.toMatch(/\b(by|before|due|from)\s+\d/i)
    expect(line).not.toMatch(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/)
  })

  it('points a client-owned row at the client', () => {
    expect(untrackedSentence({ input: 'x', ownerRole: 'client', sections: [], labels: [] })).toContain('Yours to name in Settings.')
  })

  it('is empty for a map that notes nothing', () => {
    expect(untrackedNotes(briefMap('content_brief'), READINESS)).toHaveLength(0)
  })
})
