import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract, copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { gapBasisLine, gapLine, type Gap } from '@/lib/reading/gap'
import { overviewSubjects } from './subjects'
import { overviewFixture, refusedFixture, renamedRivalFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

describe('OV2 · your subjects', () => {
  it('renders in all three modes and keeps the copy contract', () => {
    for (const data of [overviewFixture(), refusedFixture()]) {
      for (const mode of MODES) {
        assertCopyContract(render(overviewSubjects.render(data, mode, ctx)))
      }
    }
  })

  it('prints every side as a level with its count', () => {
    const text = renderText(overviewSubjects.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('31% 26 of 84')
    expect(text).toContain('44% 62 of 142')
    expect(text).toContain('22% 305 of 1,388')
  })

  it('bands the category and refuses your own side, without hiding it', () => {
    const text = renderText(overviewSubjects.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('too few to compare') // P0 item 6 / §6 D11 — the badge's one word
    expect(text).toContain('the category column carries the month')
  })

  it('prints a direction word only inside a verdict node', () => {
    const markup = render(overviewSubjects.render(overviewFixture(), 'app', ctx))
    expect(markup).toContain('growing, 3 months')
    // The contract's rule (c) is what proves it: no direction word survives
    // outside a verdict node.
    expect(copyViolations(markup).filter((v) => v.rule === 'direction-word')).toEqual([])
  })

  it('says "— not tracked" for a side nothing was read for, never 0%', () => {
    const data = overviewFixture()
    const rows = data.subjects.rows.map((r) => ({ ...r, rival: null }))
    const text = renderText(overviewSubjects.render({ ...data, subjects: { ...data.subjects, rows } }, 'app', ctx))
    expect(text).toContain('— not tracked')
  })

  it('offers the proposer’s candidates rather than a blank form', () => {
    const data = overviewFixture()
    const withCandidates = {
      ...data,
      subjects: {
        ...data.subjects,
        state: 'candidates' as const,
        rows: [],
        candidates: [{ name: 'Durability', origin: 'category_theme', because: 'the category raised it in the videos we read' }],
      },
    }
    const text = renderText(overviewSubjects.render(withCandidates, 'app', ctx))
    expect(text).toContain('We have proposed 1 subject')
    expect(text).toContain('the category raised it in the videos we read')
  })

  it('says subjects are not recorded when M4 is not applied', () => {
    expect(overviewSubjects.emptyState(refusedFixture())).toBe('Your subjects are not recorded for this workspace yet.')
    const text = renderText(overviewSubjects.render(refusedFixture(), 'app', ctx))
    expect(text).toContain('not recorded for this workspace yet')
  })

  it('declares one figure per subject — the side that carries the month', () => {
    const { figures, verdicts } = blockAnswers(overviewSubjects, overviewFixture())
    expect(Object.keys(figures)).toEqual(['subject_s1_share', 'subject_s2_share'])
    expect(verdicts.length).toBeGreaterThan(0)
  })

  it('is email-safe', () => {
    const markup = render(overviewSubjects.render(overviewFixture(), 'email', ctx))
    expect(markup).toContain('<table')
    expect(markup).not.toContain('class=')
    expect(markup).not.toContain('var(--')
    expect(markup).not.toContain('<svg')
  })

  it('refuses to draw two readings as a trend line', () => {
    const data = overviewFixture()
    const rows = data.subjects.rows.map((r) => ({ ...r, spark: [null, null, null, null, 19, 19.2] }))
    const markup = render(overviewSubjects.render({ ...data, subjects: { ...data.subjects, rows } }, 'app', ctx))
    expect(markup).toContain('Aug \u2192 Sep only')
    expect(markup).not.toContain('<svg')
  })

  it('prints "at this point last month" on the category side, in both drawn modes', () => {
    for (const mode of ['app', 'email'] as const) {
      const text = renderText(overviewSubjects.render(overviewFixture(), mode, ctx))
      expect(text, mode).toContain('at this point last month 20.5% 264 of 1,290')
    }
  })
})

// ---- D1 · the gap beside the row ----------------------------------------------

describe('the two-audience gap OV2 carries', () => {
  it('reads the two levels the ROW prints, so the difference can never disagree with them', () => {
    const s = overviewFixture().subjects
    expect(Object.keys(s.gaps).length).toBeGreaterThan(0)
    for (const row of s.rows) {
      const gap = s.gaps[row.id]
      if (!gap) continue
      expect(gap.a.pct, row.id).toBe(row.you.pct)
      expect(gap.a.value, row.id).toEqual({ k: row.you.k, n: row.you.n })
      expect(gap.b.pct, row.id).toBe(row.rival?.pct ?? null)
      expect(gap.b.value, row.id).toEqual({ k: row.rival?.k, n: row.rival?.n })
    }
  })

  it('refuses the difference across a rename, and keeps both levels', () => {
    const s = renamedRivalFixture().subjects
    const gap = s.gaps.s1 as Gap
    expect(gap.state).toBe('refused')
    expect(gap.refusedReason).toBe('rename')
    expect(gap.gapPts).toBeNull()
    const line = gapLine(gap)
    expect(line).toBe('you 31% of 84 · Freitag 44% of 142 · comparison refused')
    // And the refusal travels to the earlier month rather than printing beside it.
    expect(gapBasisLine(gap)).toBe('comparison refused in August')
  })

  it('renders the refused state in all three modes and keeps the copy contract', () => {
    for (const mode of MODES) {
      assertCopyContract(render(overviewSubjects.render(renamedRivalFixture(), mode, ctx)))
    }
  })

  it('prints the same figures in the gapline as the row prints in the table', () => {
    const data = overviewFixture()
    const text = renderText(overviewSubjects.render(data, 'app', ctx))
    const line = gapLine(data.subjects.gaps.s1 as Gap)
    // The row prints "44% 62 of 142"; the gapline prints "Freitag 44% of 142".
    expect(text).toContain('44% 62 of 142')
    expect(line).toContain('Freitag 44% of 142')
    expect(line).toContain('you 31% of 84')
  })
})
