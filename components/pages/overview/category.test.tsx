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

  // A CHANGE WITHOUT ITS BAND OR ITS BASIS IS A NUMBER A READER CANNOT WEIGH.
  // The band lived in a `title` attribute — invisible in print and in email,
  // where the email arm dropped it entirely — and nothing on OV3 said what the
  // two sides of "▲ 5.3 pts" were, while This week prints a different figure for
  // the same theme in the same month.
  it('prints the band and the basis, not a tooltip', () => {
    for (const mode of MODES) {
      const text = renderText(overviewCategory.render(overviewFixture(), mode, ctx))
      expect(text).toContain('band')
      expect(text).toContain('What moved most · Sep 2026 against Aug 2026')
    }
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

describe('the quotes this block declares (mkt.p3.quote)', () => {
  it('claims the month’s voices only where the lead is a theme in this audience', () => {
    const data = overviewFixture()
    const lead = data.sentence.lead
    const refs = blockAnswers(overviewCategory, data).quotes
    if (lead && lead.objectKind === 'theme' && lead.audience === data.category.audience) {
      expect(refs).toEqual(data.sentence.voices.map((v) => v.quote.ref))
      // Refs, never words — a snapshot freezes ids and resolves at render.
      for (const ref of refs) expect(ref).toMatch(/^[ecvmp]:|^h:|^b:/)
    } else {
      expect(refs).toEqual([])
    }
  })

  it('claims none when the month’s lead is a subject — a quote is only about the category when its citation was', () => {
    const data = overviewFixture()
    const asSubject = { ...data, sentence: { ...data.sentence, lead: data.sentence.lead ? { ...data.sentence.lead, objectKind: 'subject' as const } : null } }
    expect(blockAnswers(overviewCategory, asSubject).quotes).toEqual([])
  })

  it('claims none on a workspace whose month could not be read', () => {
    expect(blockAnswers(overviewCategory, refusedFixture()).quotes).toEqual([])
  })
})
