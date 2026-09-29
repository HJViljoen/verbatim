import { describe, expect, it } from 'vitest'

import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { castHead, platformLine, voiceCast } from './cast'
import { ossurVoiceFixture, refusedVoiceFixture, voiceFixture } from './fixture'

// C4 · who is talking (market-first WP2.4, plan §2.4 C4), on staging's stored
// profiles (Sealand's of 20 Sep, Össur's of 13 Sep).

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('', EMAIL, {})

describe('voiceCast (C4)', () => {
  it('one row per group, biggest first, with its count and one of its own comments', () => {
    const text = renderText(voiceCast.render(voiceFixture(), 'app', ctx))
    const order = ['Supporter', 'Bag lover', 'Maker', 'Researcher', 'Traveler'].map((n) => text.indexOf(n))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(text).toMatch(/Supporter[\s\S]*?265/)
    expect(text).toContain('SO PRETTY, I WANT ONE!!')
    expect(text).toContain('one of this group’s own comments')
  })

  it('names when the groups were drawn in the column head, never as header meta (§2.4 C4)', () => {
    expect(castHead(voiceFixture().cast)).toBe('grouped at the 20 Sep update, over everything read to date')
    const markup = render(voiceCast.render(voiceFixture(), 'app', ctx))
    expect(markup).toContain('grouped at the 20 Sep update, over everything read to date')
    expect(markup).toMatch(/<h2[^>]*>Who is talking<\/h2>/)
    // No block footer: the frame's footer rail (a quote's own cite is a <footer> too).
    expect(markup).not.toContain('<footer class="flex min-h-12')
  })

  it('prints each group’s platforms as whole shares where its count carries one', () => {
    const bagLover = voiceFixture().cast.personas.find((p) => p.key === 'bag-lover')!
    expect(platformLine(bagLover)).toBe('TikTok 48% · Instagram 26% · YouTube 22% · Reddit 4%')
    expect(platformLine({ platformMix: [{ platform: 'reddit', label: 'Reddit', videos: 4, pct: 57.1 }, { platform: 'tiktok', label: 'TikTok', videos: 3, pct: 42.9 }] })).toBe('Reddit 4 · TikTok 3 (videos, too few for shares)')
    // The Supporter group of 27 Sep: 90 videos, counts said to be counts (finish-list item 9).
    expect(platformLine({ platformMix: [{ platform: 'youtube', label: 'YouTube', videos: 29, pct: 32 }, { platform: 'tiktok', label: 'TikTok', videos: 26, pct: 29 }, { platform: 'instagram', label: 'Instagram', videos: 20, pct: 22 }, { platform: 'reddit', label: 'Reddit', videos: 15, pct: 17 }] })).toBe('YouTube 29 · TikTok 26 · Instagram 20 · Reddit 15 (videos, too few for shares)')
  })

  it('prints no share of the month, no floor note and no overlap footnote (25 Sep rulings; How to read says it)', () => {
    const text = renderText(voiceCast.render(voiceFixture(), 'app', ctx))
    expect(text).not.toContain('3-video floor')
    expect(text).not.toContain('these counts overlap')
    expect(text).not.toContain('No persona')
  })

  it('tells "not switched on" apart, in words', () => {
    expect(renderText(voiceCast.render(refusedVoiceFixture(), 'app', ctx))).toContain('Reading who is talking is not switched on for this workspace yet.')
  })

  it('renders in all three modes and keeps the copy contract', () => {
    for (const data of [voiceFixture(), ossurVoiceFixture(), refusedVoiceFixture()]) {
      for (const mode of MODES) {
        expect(copyViolations(voiceCast.render(data, mode, ctx)), `${data.brand} · ${mode}`).toEqual([])
      }
    }
  })

  it('declares one figure, the largest group, as a count; and its voices as refs', () => {
    const figures = voiceCast.figures?.(voiceFixture()) ?? {}
    expect(Object.keys(figures)).toEqual(['cast_lead_videos'])
    expect(figures.cast_lead_videos.value).toBe(265)
    expect(voiceCast.quotes?.(voiceFixture())).toHaveLength(5)
  })
})
