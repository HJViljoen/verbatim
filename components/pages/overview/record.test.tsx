import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { figureLine, overviewRecord } from './record'
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

  it('prints labelled figures only, none the page bar already prints (ruling B)', () => {
    const data = overviewFixture()
    const text = renderText(overviewRecord.render(data, 'app', ctx))
    // On screen each figure is its own label/value cell; the email arm joins
    // them as figureLine does.
    for (const f of data.record.figures) expect(text).toContain(`${f.label} ${f.value}`)
    expect(renderText(overviewRecord.render(data, 'email', ctx))).toContain(figureLine(data))
    expect(text).toContain('read depth, all time speech 71%')
    expect(text).toContain('comparisons refused 2')
    // No sentences: the freeze, the change record, and the bar's own figures
    // live in the page bar and its modal.
    expect(text).not.toContain('This month stops moving')
    expect(text).not.toContain('Reading as at')
    expect(text).not.toContain('No change record before')
    expect(text).not.toContain('not in English')
    expect(text).not.toContain('Of everything we have ever read for you')
    // Read depth prints once.
    expect(text.split('read depth').length - 1).toBe(1)
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
    const body = markup.indexOf('comments read')
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
    const empty = { ...data, record: { ...data.record, lines: [], figures: [] } }
    expect(overviewRecord.emptyState(empty)).toBe('Nothing about this reading has been recorded yet.')
  })
})
