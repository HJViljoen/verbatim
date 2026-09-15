import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { overviewMoves } from './moves'
import { overviewRecord } from './record'
import { overviewFixture, refusedFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

describe('OV5 · your moves', () => {
  it('renders in all three modes and keeps the copy contract', () => {
    for (const data of [overviewFixture(), refusedFixture()]) {
      for (const mode of MODES) {
        assertCopyContract(render(overviewMoves.render(data, mode, ctx)))
      }
    }
  })

  it('lists each dated move with the month its first score lands in', () => {
    const text = renderText(overviewMoves.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('Advanced technology · tracked 14 Sep')
    expect(text).toContain('first scoring lands with the Oct 2026 reading')
  })

  it('names the unlock on the block rather than leaving it to be wondered about', () => {
    const text = renderText(overviewMoves.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('Scoring, and the pre-filled monthly card, arrive with Market’s bottom section in Oct 2026.')
  })

  it('carries the masthead that stops every line reading as a causal claim', () => {
    const text = renderText(overviewMoves.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('We never claim you caused it')
  })

  it('is honest rather than empty when nothing has been dated', () => {
    const text = renderText(overviewMoves.render(refusedFixture(), 'app', ctx))
    expect(text).toContain('Nothing dated yet. Press Track this on a subject or a theme')
    // Nothing is scored and nothing is ticked.
    expect(text).not.toMatch(/\b(working|worked|succeeded|up \d)\b/i)
  })

  it('declares no figures — nothing on it is a reading', () => {
    expect(blockAnswers(overviewMoves, overviewFixture()).figures).toEqual({})
  })

  it('is email-safe', () => {
    const markup = render(overviewMoves.render(overviewFixture(), 'email', ctx))
    expect(markup).toContain('<table')
    expect(markup).not.toContain('class=')
    expect(markup).not.toContain('var(--')
  })
})

describe('OV6 · how sound is this month', () => {
  it('renders in all three modes and keeps the copy contract', () => {
    for (const data of [overviewFixture(), refusedFixture()]) {
      for (const mode of MODES) {
        assertCopyContract(render(overviewRecord.render(data, mode, ctx)))
      }
    }
  })

  it('prints the page bar’s own line and the record behind it', () => {
    const text = renderText(overviewRecord.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('3 updates · 2,359 videos')
    expect(text).toContain('2,359 videos carried conversation in this window')
  })

  it('counts the comparisons this page refused, and dates the freeze', () => {
    const text = renderText(overviewRecord.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('2 comparisons were refused on this page')
    expect(text).toContain('This month stops moving on 31 Oct 2026')
  })

  it('says so when nothing was refused', () => {
    const data = overviewFixture()
    const text = renderText(overviewRecord.render({ ...data, record: { ...data.record, refused: 0 } }, 'app', ctx))
    expect(text).toContain('Every comparison this page asked for was drawn.')
  })

  it('links to the record, absolutely, in an email', () => {
    const markup = render(overviewRecord.render(overviewFixture(), 'email', ctx))
    expect(markup).toContain('https://app.verbatimintel.com/dashboard/settings')
    expect(markup).not.toContain('class=')
  })

  it('declares no figures — the blocks above already print them', () => {
    expect(blockAnswers(overviewRecord, overviewFixture()).figures).toEqual({})
  })
})
