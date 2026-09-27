import { isValidElement } from 'react'
import { describe, expect, it } from 'vitest'

import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { EMAIL } from '@/lib/email/theme'
import { copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { ossurVoiceFixture, refusedVoiceFixture, voiceFixture } from './fixture'
import { voiceWords } from './words'

// C5 · The market's words (market-first WP3.8, plan §2.4 C5), on staging's
// September for Sealand and Össur (the fixture's real quotes and counts).

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('', EMAIL, {})

describe('voiceWords (C5)', () => {
  it('draws one card per kind, biggest first, each with the kind’s videos in the market', () => {
    const text = renderText(voiceWords.render(voiceFixture(), 'app', ctx))
    const cards = ['Praising it', 'Ready to buy', 'Asking how it works', 'Hitting a problem', 'Asking for something', 'Pushing back']
    const at = cards.map((c) => text.indexOf(c))
    expect(at.every((i) => i >= 0)).toBe(true)
    expect(at).toEqual([...at].sort((a, b) => a - b))
    expect(text).toMatch(/Praising it\s*468 videos/)
    expect(text).toMatch(/Pushing back\s*115 videos/)
  })

  it('prints real quotes with their theme, platform, date and likes, never who wrote them', () => {
    const text = renderText(voiceWords.render(voiceFixture(), 'app', ctx))
    expect(text).toContain('“If you made it in pink and a bigger size I would buy it immediately 😭”')
    expect(text).toContain('More colors and variants wanted · TikTok · 19 Sep · 78 likes')
    // The Spanish original leads and its English sits under it, labelled.
    expect(text).toContain('“qué original y qué precioso! ❤️”')
    expect(text).toContain('How original and how beautiful! ❤️')
  })

  it('marks a quote under a maker’s video, as the preview does', () => {
    const data = voiceFixture()
    const makers = data.words!.kinds.flatMap((k) => k.quotes).filter((q) => q.maker)
    expect(makers.length).toBeGreaterThan(0)
    const text = renderText(voiceWords.render(data, 'app', ctx))
    expect(text.split('under a maker’s video').length - 1).toBe(makers.length)
    // Össur has no maker rule: nothing is marked.
    expect(renderText(voiceWords.render(ossurVoiceFixture(), 'app', ctx))).not.toContain('under a maker’s video')
  })

  it('freezes every quote by its comment (c:), never by an evidence id', () => {
    const refs = voiceWords.quotes?.(voiceFixture()) ?? []
    expect(refs.length).toBe(18)
    expect(refs.every((r) => r.startsWith('c:'))).toBe(true)
  })

  it('says a card with nothing to quote in one line inside the card', () => {
    const data = voiceFixture()
    const words = { ...data.words!, kinds: data.words!.kinds.map((k, i) => (i === 5 ? { ...k, quotes: [] } : k)) }
    expect(renderText(voiceWords.render({ ...data, words }, 'app', ctx))).toContain('No comment of this kind from a theme at 10 or more can be quoted.')
  })

  it('says it was not read, or that no kind reached 10, in the month’s own words', () => {
    expect(voiceWords.emptyState(refusedVoiceFixture())).toBe('The market’s words for September are not read yet.')
    const data = voiceFixture()
    expect(voiceWords.emptyState({ ...data, words: { ...data.words!, kinds: [] } })).toBe('No kind of comment reached 10 videos in September yet.')
    // A snapshot stored before the block existed has no `words` at all.
    const { words: _words, ...stored } = data
    expect(voiceWords.emptyState(stored as typeof data)).toBe('The market’s words for September are not read yet.')
  })

  it('has its title alone in the header and one link in the footer: Ask (25 Sep rulings)', () => {
    for (const mode of MODES) {
      const el = voiceWords.render(voiceFixture(), mode, ctx)
      expect(isValidElement(el) && el.type === BlockFrame).toBe(true)
      const props = (el as { props: { meta?: unknown; footerNote?: unknown } }).props
      expect(props.meta, mode).toBeUndefined()
      expect(props.footerNote, mode).toBeUndefined()
    }
    const markup = render(voiceWords.render(voiceFixture(), 'app', ctx))
    expect(markup).toMatch(/<h2[^>]*>The market’s words<\/h2>/)
    expect(markup).toContain('href="/dashboard/agent"')
    expect(renderText(voiceWords.render(voiceFixture(), 'app', ctx))).toContain('Ask your market a question')
    // Print carries no link a reader outside the app cannot follow.
    expect(render(voiceWords.render(voiceFixture(), 'print', ctx))).not.toContain('/dashboard/agent')
  })

  it('renders in all three modes and keeps the copy contract', () => {
    for (const data of [voiceFixture(), ossurVoiceFixture(), refusedVoiceFixture()]) {
      for (const mode of MODES) {
        expect(copyViolations(voiceWords.render(data, mode, ctx)), `${data.brand} · ${mode}`).toEqual([])
      }
    }
  })
})
