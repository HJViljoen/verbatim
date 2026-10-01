import { describe, expect, it } from 'vitest'

import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { voiceTheme } from './theme'
import { ossurVoiceFixture, refusedVoiceFixture, voiceFixture } from './fixture'

// C3 · a theme in full (market-first WP2.4, plan §2.4 C3), on staging's own
// September: the lead "Price and sale questions" (a fifth makers, the front
// page's lead on staging), and Össur's "Admiration for personal resilience".

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('', EMAIL, {})

const draw = (data = voiceFixture(), mode: RenderMode = 'app') => renderText(voiceTheme.render(data, mode, ctx))
/** HYPOTHETICAL: the themes pair read the same way (no refusal on the
 *  theme), so the month before and the flag print. The fixture's own pair is
 *  refused (our September searches), and then neither prints (T0a). */
const joined = (data = voiceFixture()) => ({ ...data, theme: { ...data.theme, chip: null } })

describe('voiceTheme (C3)', () => {
  it('opens the lead with its kind and its maker share (a quarter or less), and its flag where the pair joins', () => {
    const text = draw(joined())
    expect(text).toContain('Price and sale questions')
    expect(text).toContain('Ready to buy')
    expect(text).toContain('a fifth of its videos are makers’ own')
    expect(text).toContain('Now 10+')
    const markup = render(voiceTheme.render(joined(), 'app', ctx))
    expect(markup).toContain('too few last month to call it a change')
    // T0a (CV-20): the fixture's own refused pair prints no flag.
    expect(draw()).not.toContain('Now 10+')
  })

  it('prints levels, never a change: the month, and the month before only where the pair joins; never "from searches"', () => {
    const text = draw(joined())
    // 18 of 625 in September; 7 of 351 in August.
    expect(text).toMatch(/18\s*videos\s*in September,\s*3%\s*of 625 category videos/)
    expect(text).toMatch(/2%\s*in August\s*7\s*of 351 category videos/)
    expect(text).not.toMatch(/[▲▼]/)
    // T0a (CV-18, CV-19): no August beside the refused September, and no
    // count of what our added searches found, in any mode.
    for (const mode of MODES) {
      const refused = draw(voiceFixture(), mode)
      expect(refused, mode).toMatch(/18\s*(videos\s*in September|of 625 category videos in September)/)
      expect(refused, mode).not.toContain('of 351')
      expect(refused, mode).not.toContain('came from searches we added')
    }
  })

  it('says "so far" only while the month is so far', () => {
    const data = voiceFixture()
    expect(draw({ ...data, reading: { ...data.reading!, state: 'so_far' } })).toMatch(/in September so far,/)
  })

  it('says what people did in its comments, counted over its own videos in the month', () => {
    expect(draw()).toMatch(/What people did in its comments, of its 18 videos: Ready to buy 13 · Asking how it works 4 · Asking for something 1/)
  })

  it('prints its voices dated in the month, never from the video’s own account, with the English beneath', () => {
    const text = draw()
    expect(text).toContain('Voices from this theme')
    expect(text).toContain('dated in September · never the video’s own account')
    expect(text).toContain('Wow so your bags cost K363 in Zambia?')
    expect(text).toContain('How much do you sell each leaf for?')
    expect(text).toContain('TikTok · 18 Sep · under a category video')
  })

  it('"Ask about this" pre-fills the Ask box: `?ask=`, never `?q=` (plan §2.8)', () => {
    const markup = render(voiceTheme.render(voiceFixture(), 'app', ctx))
    // The question Ask's lead starter writes for the same theme (WP3.9).
    expect(markup).toContain('href="/dashboard/agent?ask=What%20does%20my%20market%20say%20about%20price%20and%20sale%3F"')
    expect(markup).not.toContain('agent?q=')
    expect(renderText(voiceTheme.render(voiceFixture(), 'app', ctx))).toContain('The 18 videos behind this →')
  })

  it('draws no in-app control on paper', () => {
    const markup = render(voiceTheme.render(voiceFixture(), 'print', ctx))
    expect(markup).not.toContain('Ask about this')
    expect(markup).not.toContain('videos behind this')
  })

  it('Össur (no maker rule): no maker words, and no provenance beyond the month’s none', () => {
    const text = draw(ossurVoiceFixture())
    expect(text).toContain('Admiration for personal resilience')
    expect(text).toContain('Praising it')
    expect(text).not.toContain('makers’ own')
    expect(text).toMatch(/34\s*videos\s*in September,\s*10%\s*of 338 category videos/)
    expect(text).not.toContain('came from searches we added')
  })

  // "AUG 0%" (the lead's ruling of 27 Sep): a theme August did not read has
  // no August figure, so the pane draws no "0% in August"; its flag says New.
  // Össur's "Brand boycott over politics" (16 of 338; not read in August).
  it('draws no August figure for a theme August did not read, never "0%"', () => {
    const base = ossurVoiceFixture()
    const boycott = base.board.rows.find((t) => t.label === 'Brand boycott over politics')!
    const data = { ...base, theme: { ...base.theme, id: boycott.registryId, label: boycott.label, k: boycott.k, n: boycott.n, prev: boycott.prev, flags: boycott.flags, provenance: null, kinds: null, voices: [] } }
    for (const mode of ['app', 'email'] as const) {
      const text = draw(data, mode)
      expect(text, mode).toMatch(/16\s*(videos\s*in September,\s*5%\s*)?of 338 category videos/)
      expect(text, mode).not.toContain('in August')
      expect(text, mode).not.toMatch(/(^|\s)0%/)
    }
  })

  it('before MF1: no maker words, no provenance, and says when nothing can be quoted', () => {
    const text = draw(refusedVoiceFixture())
    expect(text).not.toContain('makers’ own')
    expect(text).not.toContain('came from searches')
    expect(text).toContain('No comment from this theme dated in September can be quoted.')
  })

  it('has a title alone in its header and no footer (the preview; 25 Sep rulings)', () => {
    const markup = render(voiceTheme.render(voiceFixture(), 'app', ctx))
    expect(markup).toMatch(/<h2[^>]*>A theme in full<\/h2>/)
    // No block footer: the frame's footer rail (a quote's own cite is a <footer> too).
    expect(markup).not.toContain('<footer class="flex min-h-12')
  })

  it('renders in all three modes and keeps the copy contract', () => {
    for (const data of [voiceFixture(), ossurVoiceFixture(), refusedVoiceFixture()]) {
      for (const mode of MODES) {
        expect(copyViolations(voiceTheme.render(data, mode, ctx)), `${data.brand} · ${mode}`).toEqual([])
      }
    }
  })

  it('hands its voices up as refs, and declares the theme’s videos', () => {
    expect(voiceTheme.quotes?.(voiceFixture())).toEqual(voiceFixture().theme.voices.map((v) => v.quote.ref))
    expect(voiceTheme.figures?.(voiceFixture()).theme_videos?.value).toBe(18)
  })

  it('says why nothing is open when the month holds no theme', () => {
    const data = voiceFixture()
    const none = { ...data, theme: { ...data.theme, state: 'none' as const, k: null, n: null, notes: ['No theme carried 3 videos or more in September yet, so there is nothing to open.'] } }
    expect(draw(none)).toContain('No theme carried 3 videos or more in September yet')
  })
})
