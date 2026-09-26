import { describe, it, expect } from 'vitest'

import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { buildCheckLines, recheckLines } from '@/lib/pages/overview-market'
import { monthlySlotsFrom } from '@/lib/reports/monthly-slots'
import { stagingBrandsRead } from '@/lib/test/brands-fixture'
import { RECHECK_BUYERS, RECHECK_READ_WITH, recheckRows, recheckRunFinish } from '@/lib/test/recheck-fixture'
import { FRONT_PAGE_BLOCKS } from '@/components/pages/overview/index'
import { MONTHLY_BLOCKS } from './index'
import { monthlyFixture } from './fixture'

// THE PAGE AND THE MONTHLY PRINT ONE SENTENCE EACH (WP2.3, WP2.6): the monthly's
// change and brands sections take their slots from the page's own blocks
// (`monthlySlotsFrom`), and print what the page prints.

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const read = (node: Parameters<typeof renderText>[0]): string =>
  renderText(node).replace(/\s+([,.)”’:])/g, '$1').replace(/([“(])\s+/g, '$1')

function built() {
  const base = monthlyFixture()
  const overview = {
    ...base.overview,
    change: {
      ...base.overview.change!,
      checks: buildCheckLines({ rows: recheckRows(), month: '2026-09-01', runFinish: recheckRunFinish() }),
      recheck: 'read' as const,
      buyers: { prevMonth: '2026-08-01', month: '2026-09-01', prev: RECHECK_BUYERS.august, curr: RECHECK_BUYERS.september, readWith: RECHECK_READ_WITH },
    },
    brands: stagingBrandsRead(),
  }
  return { ...base, overview, slots: monthlySlotsFrom(overview) }
}

describe('the page and the monthly print one sentence each', () => {
  it('the re-check: every line the page prints, the monthly prints, in every mode', () => {
    const data = built()
    const lines = recheckLines(data.overview.change!)
    expect(lines.length).toBe(2)
    const page = read(FRONT_PAGE_BLOCKS.find((b) => b.key === 'overview.change')!.render(data.overview, 'app', ctx))
    for (const mode of MODES) {
      const monthly = read(MONTHLY_BLOCKS['monthly.change'].render(data, mode, ctx))
      for (const l of lines) {
        expect(page).toContain(l.sentence)
        expect(monthly, mode).toContain(l.sentence)
        if (l.tag) expect(monthly, mode).toContain(l.tag)
      }
      // Once: the slot's lines replace the page block's, never beside them.
      expect(monthly.split('Re-checked').length - 1, mode).toBe(1)
      assertCopyContract(render(MONTHLY_BLOCKS['monthly.change'].render(data, mode, ctx)))
    }
  })

  it('the brands: the name line and each brand, as the page prints them, in every mode', () => {
    const data = built()
    const page = read(FRONT_PAGE_BLOCKS.find((b) => b.key === 'overview.rivals')!.render(data.overview, 'app', ctx))
    for (const mode of MODES) {
      const monthly = read(MONTHLY_BLOCKS['monthly.brands'].render(data, mode, ctx))
      for (const words of [
        'In September your name came up in none of your market’s 654 videos. The 8 videos that name you are your own posts.',
        'not counted yet',
        'Without our',
      ]) {
        expect(page).toContain(words)
        expect(monthly, mode).toContain(words)
      }
      expect(monthly, mode).toMatch(/Patagonia\s*26\s*45/)
      assertCopyContract(render(MONTHLY_BLOCKS['monthly.brands'].render(data, mode, ctx)))
    }
  })

  it('the section is absent from an artefact where the page kept deploy 2’s line', () => {
    const base = monthlyFixture()
    expect(monthlySlotsFrom(base.overview).brands.state).toBe('stub')
    expect(MONTHLY_BLOCKS['monthly.brands'].absent?.({ ...base, slots: monthlySlotsFrom(base.overview) })).toBe(true)
  })
})
