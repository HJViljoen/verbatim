import { describe, expect, it } from 'vitest'
import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { freezeQuotes, resolveQuotes } from '@/lib/renderables/quotes-freeze'
import { renderText } from '@/lib/test/render'
import { MONTHLY_BLOCKS } from '@/components/blocks/monthly'
import { monthlyFixture } from '@/components/blocks/monthly/fixture'
import { QUARTERLY_BLOCKS } from '@/components/blocks/quarterly'
import { quarterlyFixture } from '@/components/blocks/quarterly/fixture'

// A COMMENT WITHDRAWN AFTER THE ARTEFACT WAS FROZEN (Block C, both artefacts).
//
// `resolveQuotes` DROPS an unresolvable quote from an array but NULLS one that
// is a FIELD of a wrapper — `{ quote: null, cite: 'tiktok · 14 Sep …' }` — and
// every `{ quote, cite }` shape in the block layer is that second case. Three
// blocks then read `q.quote.ref` or handed `q.quote` to a renderer and threw:
// on the share link (/r/<token>) and the PDF render route, on the one event the
// ref spine exists for, under a header that says "quoted voices read live, so a
// withdrawn comment never travels".
//
// Freezing and re-resolving against an EMPTY map is that moment exactly.

const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const erased = <T,>(data: T): T => resolveQuotes(freezeQuotes(data).data, new Map())

describe('every quote withdrawn', () => {
  it('leaves the quarterly read page standing, quoting nobody', () => {
    const data = erased(quarterlyFixture())
    const text = renderText(QUARTERLY_BLOCKS['quarterly.read'].render(data, 'app', ctx))
    // The argument and its counted figures survive; the voices are simply gone.
    expect(text).toContain('What is counted under it')
    expect(QUARTERLY_BLOCKS['quarterly.read'].quotes?.(data)).toEqual([])
  })

  // "September in your market" (market-first WP2.1): the month's voices are
  // the front page's lead-theme quotes, each a `{ quote, cite }` wrapper.
  it('leaves the monthly month page standing, quoting nobody', () => {
    const full = monthlyFixture()
    const before = MONTHLY_BLOCKS['monthly.month'].quotes?.(full) ?? []
    expect(before.length).toBeGreaterThan(0)
    const data = erased(full)
    for (const mode of ['app', 'print', 'email'] as const) {
      const text = renderText(MONTHLY_BLOCKS['monthly.month'].render(data, mode, ctx))
      expect(text).toContain('Your market in September')
      expect(text).not.toContain('About time they do something')
    }
    expect(MONTHLY_BLOCKS['monthly.month'].quotes?.(data)).toEqual([])
  })

  it('leaves the monthly asks standing, their lists whole and their quotes gone', () => {
    const data = erased(monthlyFixture())
    for (const mode of ['app', 'print', 'email'] as const) {
      const text = renderText(MONTHLY_BLOCKS['monthly.asks'].render(data, mode, ctx))
      expect(text).toContain('Wished for')
      expect(text).not.toContain('If you made it in pink')
    }
    expect(MONTHLY_BLOCKS['monthly.asks'].quotes?.(data)).toEqual([])
  })
})
