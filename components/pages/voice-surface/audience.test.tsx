import { describe, expect, it } from 'vitest'

import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { marketTitle, voiceAudience } from './audience'
import { ossurVoiceFixture, refusedVoiceFixture, voiceFixture } from './fixture'

// C1 · the market in the month (market-first WP2.4, plan §2.4 C1), on staging's
// own figures (the fixture's header).

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('', EMAIL, {})

const draw = (data = voiceFixture(), mode: RenderMode = 'app') => renderText(voiceAudience.render(data, mode, ctx))

describe('voiceAudience (C1)', () => {
  it('names the market once, then the category where themes are grouped, and what its themes at 10+ hold', () => {
    const text = draw()
    expect(text).toContain('654 videos in your market in September.')
    expect(text).toContain('625 are in the category, where themes are grouped, and 29 are filed under a brand you track.')
    expect(text).toMatch(/In the 625 ?, 21 themes reached 10 videos or more; 7 of them are led by makers and sit on their own at the end of the list\./)
    // 325 of the category's 625 September videos sit in a theme at 10+.
    expect(text).toContain('52% of 625 sit in a theme of 10 or more.')
  })

  it('names the month in its title, never "this month" (R6: on 1 to 15 Oct the page reads an ended September)', () => {
    expect(marketTitle('2026-09-01')).toBe('The market in September')
    expect(draw()).toContain('The market in September')
    expect(draw()).not.toContain('this month')
  })

  it('says "so far" only while the month is so far', () => {
    const data = voiceFixture()
    const soFar = { ...data, reading: { ...data.reading!, state: 'so_far' as const } }
    expect(draw(soFar)).toContain('654 videos in your market in September so far.')
  })

  it('draws where it was said as the category’s counts, with no view switch before deploy 5', () => {
    const text = draw()
    expect(text).toContain('Where it was said')
    expect(text).toContain('category videos')
    expect(text).toMatch(/YouTube\s*277/)
    expect(text).toMatch(/Instagram\s*53/)
    expect(text).not.toContain('Buyers')
    expect(text).not.toContain('Makers')
  })

  it('has no makers clause for a tenant with no maker rule (Össur), and names Ottobock’s filing', () => {
    const text = draw(ossurVoiceFixture())
    expect(text).toContain('362 videos in your market in September.')
    expect(text).toContain('338 are in the category, where themes are grouped, and 24 are filed under a brand you track.')
    expect(text).toMatch(/In the 338 ?, 12 themes reached 10 videos or more\./)
    expect(text).not.toContain('makers')
  })

  it('prints no makers clause and no share line where MF1 has not measured them', () => {
    const text = draw(refusedVoiceFixture())
    expect(text).toMatch(/In the 625 ?, 21 themes reached 10 videos or more\./)
    expect(text).not.toContain('sit in a theme of 10 or more')
  })

  it('carries no header meta and no footer (25 Sep rulings)', () => {
    const markup = render(voiceAudience.render(voiceFixture(), 'app', ctx))
    expect(markup).not.toContain('<footer class="flex min-h-12')
    expect(markup).not.toMatch(/<header[^>]*>.*<span class="min-w-0 font-mono/)
  })

  it('renders in all three modes and keeps the copy contract', () => {
    for (const data of [voiceFixture(), ossurVoiceFixture(), refusedVoiceFixture()]) {
      for (const mode of MODES) {
        expect(copyViolations(voiceAudience.render(data, mode, ctx)), `${data.brand} · ${mode}`).toEqual([])
      }
    }
  })

  it('declares the market, the category and the rival-filed videos, each on its own token', () => {
    const figures = voiceAudience.figures?.(voiceFixture()) ?? {}
    expect(figures.market_videos?.value).toBe(654)
    expect(figures.category_videos?.value).toBe(625)
    expect(figures.rival_filed_videos?.value).toBe(29)
  })

  it('says the month is empty in words when nothing was read into it', () => {
    const data = voiceFixture()
    const empty = { ...data, market: { ...data.market, videos: 0 } }
    expect(voiceAudience.emptyState(empty)).toBe('Nothing has been read into September for your market yet.')
  })
})
