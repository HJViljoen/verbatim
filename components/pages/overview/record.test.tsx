import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { overviewRecord, recordColumns } from './record'
import { overviewFixture, refusedFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

// OV6's render tier. The block had none before Block D wave 2 — it was the one
// Overview block without a `components/**/*.test.tsx` file, which is why its
// two method paragraphs could be bound without anything checking that they say
// which clock each figure is on.

describe('OV6 · how sound is this month', () => {
  it('renders in all three modes, in both states, and keeps the copy contract', () => {
    for (const data of [overviewFixture(), refusedFixture()]) {
      for (const mode of MODES) {
        assertCopyContract(render(overviewRecord.render(data, mode, ctx)))
      }
    }
  })

  it('splits the corpus from the instrument, which is the artboard’s own split', () => {
    // `main.coverage.para1` / `.para2`: what was READ on the left, how it was
    // read and what would not compare on the right. They are on different
    // clocks, which is why they are two paragraphs and not one.
    const markup = render(overviewRecord.render(overviewFixture(), 'app', ctx))
    expect(markup).toContain('xl:grid-cols-2')
    expect(markup).toContain('What was read:')
    expect(markup).toContain('How it was read, and what would not compare:')
  })

  it('binds methodLines rather than re-deriving the five facts', () => {
    // Wave 1 wrote `methodLines` as the ONE composer for coverage, read depth,
    // language, the Reddit cap and the privacy line; eight surfaces had been
    // composing them separately, which is how "27% not in English" came to mean
    // two different things on two pages.
    const data = overviewFixture()
    const { method } = recordColumns(data)
    for (const line of data.method?.lines ?? []) expect(method).toContain(line)
    expect(data.method?.lines.length ?? 0).toBeGreaterThan(0)
  })

  it('states the basis of every figure that is not this month’s (D15)', () => {
    const text = renderText(overviewRecord.render(overviewFixture(), 'app', ctx))
    // Read depth is all-time BY CONSTRUCTION and the language share is about
    // what was said on camera, not about the comments a reader sees. The mock
    // prints both under a month heading.
    expect(text).toContain('Of everything we have ever read for you, not just this window')
    expect(text).toContain('was said on camera')
  })

  it('says when the month stops moving, on the instrument side', () => {
    const { method } = recordColumns(overviewFixture())
    expect(method[method.length - 1]).toContain('This month stops moving on 31 Oct 2026')
  })

  it('puts the record link in the header, not in the footer rail', () => {
    // This block has no onward page of its own — it IS the record — so the link
    // sits beside the eyebrow where the artboard puts it.
    //
    // AND THE ASSERTION SAYS WHICH (code review m16). "contains 'the record →'"
    // was true of the footer arm as well as the header arm the test names, so
    // it would have passed the very move it exists to prevent. `BlockFrame`
    // puts the header's slot before the block's body and the footer's after it,
    // so the link's position in the markup is the fact to pin.
    const markup = render(overviewRecord.render(overviewFixture(), 'app', ctx))
    const link = markup.indexOf('the record →')
    const body = markup.indexOf('What was read:')
    expect(link).toBeGreaterThan(-1)
    expect(body).toBeGreaterThan(-1)
    expect(link).toBeLessThan(body)
    // It really is in the header element, and the tile draws no footer rail at
    // all on this block — which was the thing the old assertion could not tell
    // apart, because the link was in the footer the whole time.
    expect(markup.slice(0, markup.indexOf('</header>'))).toContain('the record →')
    // And a reader who cannot click it does not get it.
    expect(render(overviewRecord.render(overviewFixture(), 'print', ctx))).not.toContain('the record →')
  })

  it('declares no figures, because every number in it is printed by the block it rests on', () => {
    const { figures } = blockAnswers(overviewRecord, overviewFixture())
    expect(Object.keys(figures)).toEqual([])
  })

  it('is email-safe', () => {
    const markup = render(overviewRecord.render(overviewFixture(), 'email', ctx))
    expect(markup).toContain('<table')
    expect(markup).not.toContain('class=')
    expect(markup).not.toContain('var(--')
  })

  it('says so plainly when nothing has been recorded', () => {
    const data = overviewFixture()
    const empty = { ...data, record: { ...data.record, lines: [] } }
    expect(overviewRecord.emptyState(empty)).toBe('Nothing about this reading has been recorded yet.')
  })
})
