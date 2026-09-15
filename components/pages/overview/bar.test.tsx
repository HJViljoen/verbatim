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

  it('prints the one counter the design asks OV0 for', () => {
    for (const mode of MODES) {
      expect(renderText(overviewBar.render(overviewFixture(), mode, ctx)), mode).toContain('your 3rd monthly reading')
    }
  })
})
