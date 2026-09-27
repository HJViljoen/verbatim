import { describe, expect, it } from 'vitest'

import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { voiceBoard } from './board'
import { VoiceSurfacePage } from './index'
import { voiceFixture } from './fixture'
import {
  cotopaxiAllVoiceFixture,
  cotopaxiVoiceFixture,
  freitagVoiceFixture,
  ottobockVoiceFixture,
  rareformVoiceFixture,
} from './fixture-brand'

// Conversation filtered by brand (`?brand=`, the Brands page's B2 footer), on
// staging's own ninety days (./fixture-brand.ts).

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('', EMAIL, {})
const STATES = [cotopaxiVoiceFixture(), cotopaxiAllVoiceFixture(), freitagVoiceFixture(), rareformVoiceFixture(), ottobockVoiceFixture()]
const text = (data = cotopaxiVoiceFixture(), mode: RenderMode = 'app') => renderText(voiceBoard.render(data, mode, ctx)).replace(/\s+/g, ' ')

describe('the board under ?brand=', () => {
  it('keeps the copy contract in every state and mode', () => {
    for (const data of STATES) for (const mode of MODES) assertCopyContract(render(voiceBoard.render(data, mode, ctx)))
  })

  it('heads the block with the brand and B2’s window, and its footer with links alone (25 Sep rulings)', () => {
    for (const data of STATES) {
      const markup = render(voiceBoard.render(data, 'app', ctx))
      const header = /<header[^>]*>([\s\S]*?)<\/header>/.exec(markup)?.[1] ?? ''
      expect(header.replace(/<[^>]+>/g, '')).toBe(`${data.brandView?.name}’s videos, last 90 days`)
      const footer = /<footer[^>]*>([\s\S]*?)<\/footer>/.exec(markup)?.[1] ?? ''
      expect(footer.replace(/<a [\s\S]*?<\/a>/g, '').replace(/<[^>]+>/g, '').trim()).toBe('')
    }
  })

  it('lists Cotopaxi’s twelve biggest themes of 43, counted in its 32 videos, with each kind', () => {
    const t = text()
    expect(t).toContain('Theme kind Videos of 32')
    expect(t).toContain('1 Carry-on size compliance anxiety Asking how it works 12')
    expect(t).toContain('2 Durability that earns trust Praising it 7')
    expect(t).toContain('7 Comparing brands by carry experience Leaving for something else 3')
    expect(t).toContain('12 Feature-by-feature bag scrutiny Asking how it works 2')
    expect(t).not.toContain('Worry about bag theft')
    // No share: a brand's 32 never reaches the share floor, and a window has
    // no month before, flag or provenance.
    expect(t).not.toMatch(/\d%/)
    expect(t).not.toMatch(/Now 10\+|From searches|of 625/)
  })

  it('opens every theme from its footer, and goes back to the market’s board', () => {
    const markup = render(voiceBoard.render(cotopaxiVoiceFixture(), 'app', ctx))
    expect(markup).toContain('href="/dashboard/voice?brand=Cotopaxi&amp;board=all#board"')
    expect(text()).toContain('Show all 43 →')
    expect(markup).toContain('href="/dashboard/voice#board"')
    expect(text()).toContain('Your market’s themes at 10 or more →')
  })

  it('lists all 43 under board=all, and offers no "Show all" then', () => {
    const t = text(cotopaxiAllVoiceFixture())
    expect(t).toContain('43 Versatile gear wins praise Praising it 1')
    expect(t).not.toContain('Show all')
    expect(t).toContain('Your market’s themes at 10 or more →')
  })

  it('keeps the reader’s month on both footer links', () => {
    const data = cotopaxiVoiceFixture({ params: { month: '2026-08', brand: 'Cotopaxi' } })
    const markup = render(voiceBoard.render(data, 'app', ctx))
    expect(markup).toContain('href="/dashboard/voice?month=2026-08&amp;brand=Cotopaxi&amp;board=all#board"')
    expect(markup).toContain('href="/dashboard/voice?month=2026-08#board"')
  })

  it('says so in one line where nothing was filed under the brand, or the themes were not read', () => {
    expect(text(rareformVoiceFixture())).toContain('No video was filed under Rareform in the last 90 days.')
    expect(voiceBoard.emptyState(rareformVoiceFixture())).toBe('No video was filed under Rareform in the last 90 days.')
    const notRead = cotopaxiVoiceFixture({ brandView: { ...cotopaxiVoiceFixture().brandView!, themes: null, total: 0 } })
    expect(text(notRead)).toContain('Cotopaxi’s themes over the last 90 days are not read yet.')
    expect(text(notRead)).not.toContain('Show all')
  })

  it('draws a small brand’s themes on one video each (Freitag, 8 videos)', () => {
    const t = text(freitagVoiceFixture())
    expect(t).toContain('Videos of 8')
    expect(t).toContain('1 Curiosity about tarp logo origins Asking how it works 1')
    expect(t).toContain('Show all 14 →')
  })

  it('renders for Össur (paused, §2.13): Ottobock’s 12 of 61 in its 88 videos', () => {
    const t = text(ottobockVoiceFixture())
    expect(t).toContain('Ottobock’s videos, last 90 days')
    expect(t).toContain('Videos of 88')
    expect(t).toContain('1 Encouragement through rehabilitation Praising it 25')
    expect(t).toContain('Show all 61 →')
  })

  it('declares the base every row is counted in', () => {
    expect(voiceBoard.figures?.(cotopaxiVoiceFixture())).toEqual({
      brand_videos: { value: 32, unit: 'videos', label: 'videos filed under Cotopaxi over the last 90 days' },
    })
  })

  it('prints in the email and print arms without the app’s links in print', () => {
    const email = text(cotopaxiVoiceFixture(), 'email')
    expect(email).toContain('Carry-on size compliance anxiety · Asking how it works 12')
    expect(email).toContain('Videos of 32')
    const print = render(voiceBoard.render(cotopaxiVoiceFixture(), 'print', ctx))
    expect(print).not.toContain('<footer')
  })
})

describe('the page under ?brand=', () => {
  it('puts the brand’s list at #board on its whole section, so the title is on screen', () => {
    const markup = render(<VoiceSurfacePage data={cotopaxiVoiceFixture()} params={{ brand: 'Cotopaxi' }} />)
    expect(markup).toMatch(/<section id="board"[^>]*>(?:(?!<\/section>)[\s\S])*?Cotopaxi’s videos, last 90 days/)
    expect((markup.match(/id="board"/g) ?? []).length).toBe(1)
  })

  it('leaves the market’s page as it was without the parameter', () => {
    const markup = render(<VoiceSurfacePage data={voiceFixture()} />)
    expect(markup).not.toContain('<section id="board"')
    expect(markup).toContain('Every theme at 10 videos or more')
    expect(markup).not.toContain('last 90 days')
  })
})
