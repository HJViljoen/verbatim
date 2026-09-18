import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, figureConflicts, figureCount, mergeFigures, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { NUMBER_BUDGET, RIVAL_FIGURES_MAX, type OverviewData, type RivalRow, type SubjectRow } from '@/lib/pages/overview'
import { OVERVIEW_BLOCKS, OverviewPage } from './index'
import { overviewFixture, refusedFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

const tablesOf = (data: OverviewData) => OVERVIEW_BLOCKS.map((b) => blockAnswers(b, data).figures)

/**
 * The busiest page a tenant can have: eight subjects (SUBJECTS_MAX) and, on
 * OV4, your own row, the category's, and as many rivals as a tenant likes —
 * nothing caps `tracking_configs.competitor_names`. The fixture carries TEN, so
 * the budget is asserted against a tenant rather than against a number that
 * happens to fit.
 *
 * `base.rivals.rows` is one rival and the client row, so the count below is
 * ten rivals, the client and the category.
 */
function fullHouse(): OverviewData {
  const base = overviewFixture()
  const subject = (i: number): SubjectRow => ({ ...base.subjects.rows[0], id: `s${i}`, label: `Subject ${i}` })
  const rival = (i: number): RivalRow => ({
    ...base.rivals.rows[0],
    audience: `competitor:Rival ${i}`,
    label: `Rival ${i}`,
    attention: { k: 1000 + i, n: 41200, pct: 2 + i },
  })
  // THE CATEGORY ROW IS THE FIXTURE'S OWN. It used to be synthesised here,
  // because the fixture carried none; now that it does, building a second one
  // put two rows under `industry-other` on one table, and the figures they
  // declare are keyed by audience — so the two collided and the cap silently
  // declared one fewer figure than it was asked for.
  return {
    ...base,
    subjects: { ...base.subjects, rows: Array.from({ length: 8 }, (_, i) => subject(i)) },
    rivals: { ...base.rivals, rows: [...Array.from({ length: 9 }, (_, i) => rival(i)), ...base.rivals.rows] },
  }
}

describe('the Overview’s blocks', () => {
  it('are the seven the design names, keyed stably', () => {
    expect(OVERVIEW_BLOCKS.map((b) => b.key)).toEqual([
      'overview.bar', 'overview.sentence', 'overview.subjects',
      'overview.category', 'overview.rivals', 'overview.moves', 'overview.record',
    ])
  })

  it('every one renders in all three modes, in both states, and keeps the copy contract', () => {
    for (const data of [overviewFixture(), refusedFixture()]) {
      for (const block of OVERVIEW_BLOCKS) {
        for (const mode of MODES) {
          const markup = render(block.render(data, mode, ctx))
          expect(markup.length).toBeGreaterThan(0)
          // No unsubstituted figure token ever reaches a reader — the defect
          // production found on an object id that begins with a digit.
          expect(markup, `${block.key}/${mode}`).not.toContain('[[')
          assertCopyContract(markup)
        }
      }
    }
  })

  it('every one either says something or says why it has nothing', () => {
    for (const data of [overviewFixture(), refusedFixture()]) {
      for (const block of OVERVIEW_BLOCKS) {
        const empty = block.emptyState(data)
        if (empty != null) expect(empty.length).toBeGreaterThan(20)
      }
    }
  })

  it('links onward from every block that carries a shortcut', () => {
    const data = overviewFixture()
    const shortcuts = ['overview.sentence', 'overview.subjects', 'overview.category', 'overview.rivals', 'overview.moves', 'overview.record']
    for (const block of OVERVIEW_BLOCKS.filter((b) => shortcuts.includes(b.key))) {
      expect(render(block.render(data, 'app', ctx))).toContain('href=')
    }
  })
})

describe('the 30-number budget', () => {
  it('holds on a month that read', () => {
    expect(figureCount(tablesOf(overviewFixture()))).toBeLessThanOrEqual(NUMBER_BUDGET)
  })

  it('holds on the busiest page a tenant can have', () => {
    const house = fullHouse()
    expect(house.rivals.rows.length).toBe(12)
    const count = figureCount(tablesOf(house))
    expect(count).toBeLessThanOrEqual(NUMBER_BUDGET)
    // Not trivially under it either — the budget is meant to bind.
    expect(count).toBeGreaterThan(20)
  })

  it('binds however many rivals a tenant tracks — nothing caps that list', () => {
    const house = fullHouse()
    const wider = {
      ...house,
      rivals: {
        ...house.rivals,
        rows: [
          ...house.rivals.rows,
          ...Array.from({ length: 20 }, (_, i) => ({
            ...house.rivals.rows[0],
            audience: `competitor:More ${i}`,
            label: `More ${i}`,
            attention: { k: 10 + i, n: 41200, pct: 0.1 * (i + 1) },
          })),
        ],
      },
    }
    expect(figureCount(tablesOf(wider))).toBeLessThanOrEqual(NUMBER_BUDGET)
    // Every rival keeps its ROW; only the declaration is capped.
    const markup = render(<OverviewPage data={wider} />)
    expect(markup).toContain('More 19')
    expect(Object.keys(blockAnswers(OVERVIEW_BLOCKS[4], wider).figures).filter((k) => k.startsWith('rival_')).length)
      .toBe(RIVAL_FIGURES_MAX)
  })

  it('holds when five of the seven blocks are refusing', () => {
    expect(figureCount(tablesOf(refusedFixture()))).toBeLessThanOrEqual(NUMBER_BUDGET)
  })

  it('never states one figure twice with two values', () => {
    for (const data of [overviewFixture(), refusedFixture(), fullHouse()]) {
      expect(figureConflicts(tablesOf(data))).toEqual([])
    }
  })

  it('counts only readings — every token carries a unit', () => {
    const merged = mergeFigures(tablesOf(overviewFixture()))
    for (const [token, figure] of Object.entries(merged)) {
      expect(['videos', 'comments', 'pts', 'pct'], token).toContain(figure.unit)
      expect(figure.label.length, token).toBeGreaterThan(3)
    }
  })
})

describe('the Overview page', () => {
  it('draws the page bar, the seven tiles and nothing else', () => {
    const markup = render(<OverviewPage data={overviewFixture()} />)
    expect(markup).toContain('Overview')
    expect(markup).toContain('still filling')
    expect((markup.match(/data-tile=""/g) ?? []).length).toBe(7)
    assertCopyContract(markup)
  })

  it('links inside the app relatively, so a page change is not a page load', () => {
    const markup = render(<OverviewPage data={overviewFixture()} />)
    expect(markup).toContain('href="/dashboard/market"')
    expect(markup).not.toContain('href="https://app.verbatimintel.com/dashboard/market"')
  })

  it('says so plainly when the workspace has never been read', () => {
    const text = renderText(<OverviewPage data={null} />)
    expect(text).toContain('Nothing has been read for this workspace yet')
  })

  it('prints the reading’s caveats once for the page, not once per bar', () => {
    const data = overviewFixture()
    const notes = [{ kind: 'read_back_at_setup' as const, text: 'Read back at setup: 61 months.', months: ['2026-01-01', '2026-02-01'] }]
    const text = renderText(<OverviewPage data={{ ...data, notes }} />)
    expect((text.match(/Read back at setup/g) ?? []).length).toBe(1)
  })
})
