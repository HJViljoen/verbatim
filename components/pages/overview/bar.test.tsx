import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { overviewBar } from './bar'
import { overviewFixture, refusedFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

describe('OV0 · the month so far', () => {
  it('renders in all three modes and keeps the copy contract', () => {
    for (const mode of MODES) {
      const markup = render(overviewBar.render(overviewFixture(), mode, ctx))
      expect(markup.length).toBeGreaterThan(0)
      assertCopyContract(markup)
    }
  })

  it('prints the month against the same point last month', () => {
    const text = renderText(overviewBar.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('2,359')
    expect(text).toContain('2,044')
    expect(text).toContain('last month at this point')
  })

  it('says the comparison is not recorded rather than printing a zero', () => {
    const text = renderText(overviewBar.render(refusedFixture(), 'app', ctx))
    expect(text).toContain('last month at this point: not recorded yet')
    expect(text).not.toContain('last month at this point: 0')
  })

  it('keeps the update count out of the figure table — a run count is not a reading', () => {
    const { figures } = blockAnswers(overviewBar, overviewFixture())
    expect(Object.keys(figures).sort()).toEqual(['month_at_last_month', 'month_expected', 'month_videos'])
  })

  it('drops the unrecorded comparison from the figure table too', () => {
    const { figures } = blockAnswers(overviewBar, refusedFixture())
    expect(figures.month_at_last_month).toBeUndefined()
  })

  it('is email-safe: a table, no classes, no CSS variables', () => {
    const markup = render(overviewBar.render(overviewFixture(), 'email', ctx))
    expect(markup).toContain('<table')
    expect(markup).not.toContain('class=')
    expect(markup).not.toContain('var(--')
  })

  it('has nothing to say only when nothing has been read into the month', () => {
    expect(overviewBar.emptyState(overviewFixture())).toBeNull()
    const data = overviewFixture()
    expect(overviewBar.emptyState({ ...data, bar: { ...data.bar, videos: null } })).toContain('Nothing has been read')
  })

  it('prints the one counter where there is no band above it, and nowhere else', () => {
    // CHANGED BY THE FIX PASS (design review High 4, code review I7). The
    // counter is the soundness band's opening clause on the app surface
    // (`main.bar.soundness`, composed at the page's `SurfacePageBar` call), so
    // printing it on this tile as well said the same sentence twice down one
    // page — three times, with the record block's header meta. An email and a
    // print sheet have no band above them, so there it still leads.
    const app = renderText(overviewBar.render(overviewFixture(), 'app', ctx))
    expect(app).not.toContain('your 3rd monthly reading')
    // `SurfacePageBar` is the app shell's and travels into neither a PDF nor an
    // email, so on both of those this tile is where the counter leads.
    for (const mode of ['email', 'print'] as const) {
      expect(renderText(overviewBar.render(overviewFixture(), mode, ctx)), mode).toContain('your 3rd monthly reading')
    }
  })

  it('states what the stats do not, and does not restate what they do', () => {
    // Design review High 5: the tile drew three stats and then restated all
    // three in prose, so nothing in it was new and the page's lead began below
    // the fold. What is left is the residual — the trailing median, and the
    // gate that suppresses every change below.
    const app = renderText(overviewBar.render(overviewFixture(), 'app', ctx))
    expect(app).toContain('trailing median 2,240')
    expect(app).not.toContain('September, 18 days in · 3 updates')
    expect(app).not.toContain('last month at this point: 2,044')
    // The stats themselves are untouched.
    expect(app).toContain('2,359')
    expect(app).toContain('last month at this point')
  })
})
