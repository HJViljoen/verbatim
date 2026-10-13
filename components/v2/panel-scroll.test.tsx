import { describe, expect, it } from 'vitest'
import { render } from '@/lib/test/render'
import { InPlacePanel } from './panel'
import { PANEL_HEAD_PX, panelScrollPlan } from './panel-scroll'

// THE OPENED PANEL COMES INTO VIEW (depth v2, T9). Panel links use
// `scroll={false}`: Next neither jumps to the top nor follows the `#…-panel`
// hash, so on a phone a panel can open below the fold. It scrolls only when
// its head is out of sight, and never moves a page whose panel already shows.
// The click-through in a real browser is the lead's (Phase 4): there is no
// local session.

const view = { top: 69, bottom: 844 } // a 390 × 844 phone under the 69px top bar

describe('panelScrollPlan', () => {
  it('leaves a panel whose head is on screen where it is', () => {
    expect(panelScrollPlan({ top: 300, bottom: 1900 }, view, { reducedMotion: false })).toBeNull()
    // Its head just fits above the foot.
    expect(panelScrollPlan({ top: 844 - PANEL_HEAD_PX, bottom: 2400 }, view, { reducedMotion: false })).toBeNull()
    // A short panel wholly on screen.
    expect(panelScrollPlan({ top: 700, bottom: 780 }, view, { reducedMotion: false })).toBeNull()
  })

  it('brings in a panel that opened below the fold, or with only its notch showing', () => {
    expect(panelScrollPlan({ top: 1200, bottom: 2800 }, view, { reducedMotion: false })).toEqual({ block: 'nearest', behavior: 'smooth' })
    expect(panelScrollPlan({ top: 800, bottom: 2400 }, view, { reducedMotion: false })).toEqual({ block: 'nearest', behavior: 'smooth' })
  })

  it('brings in a panel whose top is above the visible area (under the top bar)', () => {
    expect(panelScrollPlan({ top: 20, bottom: 1600 }, view, { reducedMotion: false })).toEqual({ block: 'nearest', behavior: 'smooth' })
    expect(panelScrollPlan({ top: -900, bottom: -100 }, view, { reducedMotion: false })).not.toBeNull()
  })

  it('jumps instead of gliding when the reader asked for reduced motion', () => {
    expect(panelScrollPlan({ top: 1200, bottom: 2800 }, view, { reducedMotion: true })).toEqual({ block: 'nearest', behavior: 'auto' })
  })

  it('counts only as much head as the panel has, and does nothing with no view to measure', () => {
    // A 60px panel whose 60px fit is in view though 120px would not be.
    expect(panelScrollPlan({ top: 780, bottom: 840 }, view, { reducedMotion: false })).toBeNull()
    expect(panelScrollPlan({ top: 1200, bottom: 2800 }, { top: 0, bottom: 0 }, { reducedMotion: false })).toBeNull()
    expect(panelScrollPlan({ top: 1200, bottom: 2800 }, view, { reducedMotion: false, head: 40 })).not.toBeNull()
  })
})

describe('InPlacePanel mounts the scroll-in', () => {
  it('renders nothing for it on the server, so the markup and the copy are unchanged', () => {
    const m = render(<InPlacePanel id="conv-panel" notchAt={0.5} closeHref="/dashboard/market"><p>x</p></InPlacePanel>)
    // The section's children: the notch, the head row, the content; the
    // scroll-in is a client effect with no markup.
    expect(m).toMatch(/<span aria-hidden="true" data-notch=""[^>]*><\/span><div class="flex items-start justify-between gap-4">/)
  })
})
