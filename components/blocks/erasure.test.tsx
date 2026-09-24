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

  it('leaves the monthly month page standing, and stops counting the voices', () => {
    const full = monthlyFixture()
    const before = MONTHLY_BLOCKS['monthly.month'].quotes?.(full) ?? []
    expect(before.length).toBeGreaterThan(0)
    const data = erased(full)
    const text = renderText(MONTHLY_BLOCKS['monthly.month'].render(data, 'app', ctx))
    expect(text).toContain('The month')
    expect(text).not.toMatch(/\d+ of \d+ voices/)
    expect(MONTHLY_BLOCKS['monthly.month'].quotes?.(data)).toEqual([])
  })

  // THE VOICES PAGE KEEPS ITS CELLS. One cell per subject is the page; a
  // withdrawn comment says "counted, not quotable" there rather than falling
  // through to the note about a subject nobody said anything about, which is a
  // different claim.
  it('leaves the monthly voices page standing, saying what happened per cell', () => {
    const data = erased(monthlyFixture())
    const text = renderText(MONTHLY_BLOCKS['monthly.voices'].render(data, 'app', ctx))
    expect(text).toContain('counted, not quotable: this comment has since been removed')
    expect(MONTHLY_BLOCKS['monthly.voices'].quotes?.(data)).toEqual([])
  })
})
