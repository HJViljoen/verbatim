import { describe, expect, it } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { copyViolations } from '@/lib/test/copy-contract'
import { renderText } from '@/lib/test/render'
import { voiceTheme } from './theme'
import { refusedVoiceFixture, voiceFixture } from './fixture'

// VO3 · a theme in full (Phase 1 WP13).

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('', EMAIL, { audience: 'industry-other' })

const draw = (data = voiceFixture(), mode: RenderMode = 'app') => renderText(voiceTheme.render(data, mode, ctx))

describe('voiceTheme', () => {
  it('renders in all three modes and keeps the copy contract', () => {
    for (const data of [voiceFixture(), refusedVoiceFixture()]) {
      for (const mode of MODES) {
        expect(copyViolations(voiceTheme.render(data, mode, ctx)), `${data.brand} · ${mode}`).toEqual([])
      }
    }
  })

  it('prints the share with the count it rests on, never a bare percentage', () => {
    const text = draw()
    expect(text).toContain('9.4%')
    expect(text).toContain('130 of 1,388 videos this month')
  })

  it('prints the calibrated level only with its denominator', () => {
    expect(draw()).toContain('Widespread · 130 of 1,388 videos')
  })

  it('says when it was first heard and how many of the drawn months carried it', () => {
    expect(draw()).toContain('first heard July 2026 · seen in 3 of 3 months drawn')
  })

  it('answers "first heard" off the record even when that month is not drawn', () => {
    // The horizon pill moves the axis; it does not move the month a theme was
    // first said in. Off the drawn months this line read September, July,
    // March and June 2026 for one Össur theme the record carries from
    // November 2022.
    const base = voiceFixture()
    const text = draw({ ...base, theme: { ...base.theme, firstHeard: '2022-11-01', firstHeardOnAxis: false } })
    expect(text).toContain('first heard November 2022, before the months drawn here')
    expect(text).not.toContain('first read here')
  })

  it('heads the tone line as the AUDIENCE’s, because that is whose it is', () => {
    expect(draw()).toContain('Tone · the category, all judged videos')
  })

  it('says what is not recorded instead of a tone line when M5 is unapplied', () => {
    const text = draw(refusedVoiceFixture())
    expect(text).toContain('not recorded month by month for this workspace yet')
    expect(text).not.toContain('of 1,112 judged')
  })

  it('carries the original quote and its translation, labelled', () => {
    const text = draw()
    expect(text).toContain('Nach 14 Monaten ist der Reißverschluss hin')
    expect(text).toContain('After 14 months the zip is done')
  })

  it('prints the spoken line and the on-screen text with their provenance', () => {
    const text = draw()
    expect(text).toContain('Said on camera')
    expect(text).toContain('One bag, three years, no regrets.')
    expect(text).toContain('On screen')
    expect(text).toContain('1 bag. 3 years. 0 regrets')
  })

  it('says nothing about speech when no video carries any', () => {
    const text = draw(refusedVoiceFixture())
    expect(text).not.toContain('Said on camera')
    expect(text).toContain('No video behind this theme carries readable speech')
  })

  it('counts the withheld evidence and refuses to quote it', () => {
    expect(draw()).toContain('4 comments describe who these commenters are — counted, not quoted')
  })

  it('links to the conclusion rather than rebuilding Market’s list here (decision Q)', () => {
    const text = draw()
    expect(text).toContain('What we concluded from this →')
    // The mock draws four conclusions at the foot of Voice. Two lists of
    // conclusions is two lists; MK1 owns it.
    expect(text).not.toContain('What we concluded this month')
  })

  it('offers Track this, Ask about this and the videos behind it', () => {
    const text = draw()
    expect(text).toContain('Track this →')
    expect(text).toContain('Ask about this →')
    expect(text).toContain('The 130 videos behind it →')
  })

  it('carries the reader’s whole selection into the search', () => {
    const markup = renderText(voiceTheme.render(voiceFixture(), 'app', ctx))
    expect(markup).toContain('Have we seen this before?')
  })

  it('says the register matched nothing rather than showing an empty list', () => {
    const base = voiceFixture()
    const text = draw({ ...base, theme: { ...base.theme, search: { q: 'zzz', rows: [], total: 0 } } })
    expect(text).toContain('Nothing in the register matches “zzz”')
  })

  it('lists what the register found, with first-heard and months-seen', () => {
    const base = voiceFixture()
    const text = draw({
      ...base,
      theme: {
        ...base.theme,
        search: { q: 'zip', total: 1, rows: [{ id: 'z', label: 'Zips failing after a year', firstHeard: '2026-07-01', monthsSeen: 4, active: false, href: '/dashboard/voice?theme=z' }] },
      },
    })
    expect(text).toContain('Zips failing after a year first heard 2026-07 · 4 updates have carried it')
  })

  it('declares its share, its count and the cold share as figures', () => {
    const table = blockAnswers(voiceTheme, voiceFixture()).figures
    expect(table.theme_share.value).toBe(9.4)
    expect(table.theme_videos).toMatchObject({ value: 130, unit: 'videos' })
    expect(table.theme_tone_negative.value).toBe(18)
  })

  it('hands its quotes up as refs, so a snapshot freezes ids and not words', () => {
    expect(blockAnswers(voiceTheme, voiceFixture()).quotes).toEqual(['e:1', 'e:2'])
  })

  it('says which of the two silences it is when nothing can be opened', () => {
    const base = voiceFixture()
    const none = {
      ...base,
      theme: { ...base.theme, state: 'none' as const, notes: ['No theme in this audience carried enough of this month to be opened.'] },
    }
    expect(voiceTheme.emptyState(none)).toBe('No theme in this audience carried enough of this month to be opened.')
    // The search still renders, because "have we seen this before?" is a
    // question about the whole register and not about this month.
    expect(draw(none)).toContain('Have we seen this before?')
  })

  it('keeps its key, which is a stored contract', () => {
    expect(voiceTheme.key).toBe('voice.theme')
  })
})
