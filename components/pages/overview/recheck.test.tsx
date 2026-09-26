import { describe, it, expect } from 'vitest'

import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { buildCheckLines } from '@/lib/pages/overview-market'
import type { OverviewData } from '@/lib/pages/overview'
import { RECHECK_BUYERS, recheckRows, recheckRunFinish } from '@/lib/test/recheck-fixture'
import { FRONT_PAGE_BLOCKS } from './index'
import { marketFrontFixture, ossurFrontFixture } from './fixture'

// WP2.3's re-check under the refusal in "What changed, and what is ours": the
// approved preview's inner block ("Re-checked · provisional"), on staging's
// planned rows of 26 Sep (lib/test/recheck-fixture.ts).

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const read = (node: Parameters<typeof renderText>[0]): string =>
  renderText(node).replace(/\s+([,.)”’:])/g, '$1').replace(/([“(])\s+/g, '$1')
const block = FRONT_PAGE_BLOCKS.find((b) => b.key === 'overview.change')!

function withRecheck(state: 'read' | 'pending'): OverviewData {
  const base = marketFrontFixture()
  return {
    ...base,
    change: {
      ...base.change!,
      checks: state === 'read' ? buildCheckLines({ rows: recheckRows(), month: '2026-09-01', runFinish: recheckRunFinish() }) : [],
      recheck: state,
      buyers: { prevMonth: '2026-08-01', month: '2026-09-01', prev: RECHECK_BUYERS.august, curr: RECHECK_BUYERS.september, readWith: '2026-09-20T08:33:47.358Z' },
    },
  }
}

describe('the re-check in "What changed, and what is ours" (WP2.3)', () => {
  it('prints "Re-checked", its provisional tag and at most three lines, each with its tag, in every mode', () => {
    for (const mode of MODES) {
      const t = read(block.render(withRecheck('read'), mode, ctx))
      expect(t, mode).toContain('Re-checked')
      expect(t, mode).toContain('provisional')
      expect(t, mode).toContain('Too few videos on the searches both months ran to check.')
      expect(t, mode).toContain('about half makers, about a tenth off-topic, left out · read with the 20 Sep update')
      expect(t, mode).toContain('Asking how it works, Praising it, Pushing back and Leaving for something else: the fall follows how deeply September’s videos have been read, not the market.')
      expect(t, mode).toContain('Buyers only, without makers and off-topic videos: checks pending.')
      assertCopyContract(render(block.render(withRecheck('read'), mode, ctx)))
    }
  })

  it('reads "checks pending" where no row was read', () => {
    for (const mode of MODES) {
      const t = read(block.render(withRecheck('pending'), mode, ctx))
      expect(t, mode).toContain('On the searches both months ran, without makers and off-topic videos: checks pending.')
      expect(t, mode).not.toContain('Too few videos')
    }
  })

  it('sits under the refusal, in its column (the preview), before the first pair read the same way', () => {
    const t = read(block.render(withRecheck('read'), 'app', ctx))
    expect(t.indexOf('Not read as a change')).toBeLessThan(t.indexOf('Re-checked'))
    expect(t.indexOf('Re-checked')).toBeLessThan(t.indexOf('The first comparison read the same way'))
  })

  it('prints no re-check on a block without one (deploy 2’s, a stored copy, Össur paused)', () => {
    for (const data of [marketFrontFixture(), ossurFrontFixture()]) {
      for (const mode of MODES) expect(read(block.render(data, mode, ctx)), mode).not.toContain('Re-checked')
    }
  })

  it('never says "holds up"', () => {
    for (const mode of MODES) expect(read(block.render(withRecheck('read'), mode, ctx))).not.toMatch(/holds up/i)
  })
})
