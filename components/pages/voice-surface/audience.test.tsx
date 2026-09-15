import { describe, expect, it } from 'vitest'

import { blockContext, blockAnswers, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { copyViolations } from '@/lib/test/copy-contract'
import { renderText } from '@/lib/test/render'
import { voiceAudience } from './audience'
import { refusedVoiceFixture, voiceFixture } from './fixture'

// VO1 · the audience, the platform and the kind (Phase 1 WP13).

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('', EMAIL, {})

const draw = (data = voiceFixture(), mode: RenderMode = 'app') => renderText(voiceAudience.render(data, mode, ctx))

describe('voiceAudience', () => {
  it('renders in all three modes and keeps the copy contract', () => {
    for (const data of [voiceFixture(), refusedVoiceFixture()]) {
      for (const mode of MODES) {
        expect(copyViolations(voiceAudience.render(data, mode, ctx)), `${data.brand} · ${mode}`).toEqual([])
      }
    }
  })

  it('shows a thin audience WITH its count and marks it — never hides it', () => {
    const text = draw()
    expect(text).toContain('Your own brand 3')
    expect(text).toContain('too thin to compare')
  })

  it('says "not observed" for an audience with no row rather than 0', () => {
    const text = draw()
    expect(text).toContain('not observed')
    expect(text).not.toMatch(/Poler\s+0\b/)
  })

  it('names a rival that was tracked and stopped, with the date', () => {
    expect(draw()).toContain('was tracked, stopped 2026-09-09')
  })

  it('prints the platform mix as options, largest first, and omits what the month did not carry', () => {
    const text = draw()
    expect(text).toContain('TikTok 528')
    expect(text).toContain('Reddit 166')
  })

  it('prints the kind ladder with each share against the one denominator', () => {
    const text = draw()
    expect(text).toContain('Asking how it works 34% 472 of 1,388')
    expect(text).toContain('Saying it worked 28% 389 of 1,388')
  })

  it('says what is not recorded instead of a kind ladder when M5 is unapplied', () => {
    const text = draw(refusedVoiceFixture())
    expect(text).toContain('not recorded month by month for this workspace yet')
    expect(text).not.toContain('Asking how it works')
  })

  it('prints no kind filter where there is no ladder to narrow — a control that changes nothing is not drawn', () => {
    expect(refusedVoiceFixture().audience.kindFilters).toEqual([])
  })

  it('says the replies figure with its own n and its own caveat', () => {
    const text = draw()
    expect(text).toContain('21% of this month’s comments were replies to another comment — 1,972 of 9,397')
    expect(text).toContain('Counted across every audience')
  })

  it('declares the audience denominator and the leading kinds as figures', () => {
    const answers = blockAnswers(voiceAudience, voiceFixture())
    expect(answers.figures.audience_videos).toMatchObject({ value: 1388, unit: 'videos' })
    expect(Object.keys(answers.figures).filter((k) => k.startsWith('kind_'))).toHaveLength(3)
    expect(answers.figures.replies_share.value).toBe(21)
  })

  it('hands its kind verdicts up rather than making a reviewer read the markup', () => {
    expect(blockAnswers(voiceAudience, voiceFixture()).verdicts).toHaveLength(1)
    expect(blockAnswers(voiceAudience, refusedVoiceFixture()).verdicts).toEqual([])
  })

  it('is not empty while the month has a denominator, even with every other half refused', () => {
    expect(voiceAudience.emptyState(refusedVoiceFixture())).toBeNull()
  })

  it('has one honest sentence when nothing at all was read', () => {
    const data = voiceFixture()
    const bare = { ...data, audience: { ...data.audience, videos: null, kinds: [], replies: null } }
    expect(voiceAudience.emptyState(bare)).toBe('Nothing has been read into this month for any audience yet.')
  })

  it('keeps its key, which is a stored contract', () => {
    expect(voiceAudience.key).toBe('voice.audience')
  })
})
