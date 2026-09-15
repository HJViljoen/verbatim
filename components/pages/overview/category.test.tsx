import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract, copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { overviewCategory } from './category'
import { overviewFixture, refusedFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

describe('OV3 · what the category is saying', () => {
  it('renders in all three modes and keeps the copy contract', () => {
    for (const data of [overviewFixture(), refusedFixture()]) {
      for (const mode of MODES) {
        assertCopyContract(render(overviewCategory.render(data, mode, ctx)))
      }
    }
  })

  it('prints the four lines with their headings', () => {
    const text = renderText(overviewCategory.render(overviewFixture(), 'app', ctx))
    for (const heading of ['Kind of thing said', 'What moved most', 'Mood', 'Attention']) {
      expect(text).toContain(heading)
    }
  })

  it('states each kind against one denominator and names the Reddit share', () => {
    const text = renderText(overviewCategory.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('470 of 1,388')
    expect(text).toContain('Reddit carried 200 of 590')
    expect(text).toContain('a video carrying both is counted in each')
  })

  it('keeps every direction word inside a verdict node', () => {
    const markup = render(overviewCategory.render(overviewFixture(), 'app', ctx))
    expect(markup).toContain('growing, 3 months')
    expect(markup).toContain('fading, 3 months')
    expect(copyViolations(markup).filter((v) => v.rule === 'direction-word')).toEqual([])
  })

  it('prints the mood with its judged denominator and the framing footnote', () => {
    const text = renderText(overviewCategory.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('of 1,112 judged')
    expect(text).toContain('judged on the video’s own framing instead')
  })

  it('says what is not recorded rather than printing zeros', () => {
    const text = renderText(overviewCategory.render(refusedFixture(), 'app', ctx))
    expect(text).toContain('What kind of thing is being said is not recorded month by month')
    expect(text).toContain('How the month was received is not recorded month by month')
    expect(text).toContain('No panel has been frozen')
    // The movers still read, because the theme months are seeded.
    expect(text).toContain('Will it survive a wet commute')
  })

  it('draws the attention line as a month chart and names its exclusion', () => {
    const markup = render(overviewCategory.render(overviewFixture(), 'app', ctx))
    expect(markup).toContain('<svg')
    expect(markup).toContain('Reddit is left out of this comparison')
  })

  it('falls back to the numbers in an email with no image', () => {
    const markup = render(overviewCategory.render(overviewFixture(), 'email', ctx))
    expect(markup).not.toContain('<svg')
    expect(markup).toContain('41,200')
    expect(markup).not.toContain('class=')
    expect(markup).not.toContain('var(--')
  })

  it('declares the block’s own figures and hands back every verdict behind them', () => {
    const { figures, verdicts } = blockAnswers(overviewCategory, overviewFixture())
    expect(Object.keys(figures).sort()).toEqual([
      'attention_comments', 'category_videos', 'kind_pain_point_share', 'kind_praise_share', 'kind_question_share', 'mood_negative_share',
    ])
    expect(verdicts.length).toBeGreaterThanOrEqual(5)
  })
})
