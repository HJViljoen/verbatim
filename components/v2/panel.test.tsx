import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { InPlacePanel, PanelSection, PanelTitle, SELECTED_CARD_RING } from './panel'
import { FlagChip } from './flag-chip'
import { StatCell, StatRow } from './stat-cell'
import { WEEK_FLAG } from './fixture'

const panel = (notchAt = 0.22) => (
  <InPlacePanel
    id="conv-panel"
    notchAt={notchAt}
    closeHref="/dashboard/market?period=week"
    labelledBy="conv-title"
    closeLabel="Close this conversation"
    head={<><FlagChip verdict={WEEK_FLAG} /><PanelTitle id="conv-title">Insurance refusals for powered knees</PanelTitle></>}
  >
    <StatRow>
      <StatCell value={19} of={241} label="videos this week" />
      <StatCell value={31} of={318} label="videos in October so far" />
    </StatRow>
    <PanelSection label="Our read">
      <p data-copy="stored" data-slot="pass_c_finding">People describe appeals that drag on for months.</p>
    </PanelSection>
  </InPlacePanel>
)

describe('InPlacePanel', () => {
  it('is a full-width white card on the panel shadow, its anchor margin and its id', () => {
    const m = render(panel())
    expect(m).toMatch(/^<section id="conv-panel" aria-labelledby="conv-title" data-panel="" class="[^"]*"/)
    for (const c of ['rounded-[16px]', 'bg-card', 'shadow-panel', 'scroll-mt-6', 'relative']) expect(m).toContain(c)
    // No hand-written shadow, no stripe.
    expect(m).not.toMatch(/shadow-\[/)
    expect(m).not.toMatch(/border-l-[2-9]/)
  })

  it('points its notch at the clicked item, kept clear of the corners', () => {
    expect(render(panel(0.22))).toContain('left:clamp(20px, calc(22% - 9px), calc(100% - 38px))')
    expect(render(panel(1.4))).toContain('calc(100% - 9px)')
    expect(render(panel(-1))).toContain('calc(0% - 9px)')
    expect(render(panel(0.22))).toMatch(/<span aria-hidden="true" data-notch="" class="[^"]*rotate-45[^"]*bg-card/)
  })

  it('closes with a link back to the page that keeps the reader where they were', () => {
    const m = render(panel())
    expect(m).toMatch(/<a aria-label="Close this conversation" class="[^"]*" href="\/dashboard\/market\?period=week">/)
    expect(renderText(panel())).toContain('Close')
  })

  it('carries its title as an h2 under the page bar\'s h1, and keeps the copy contract', () => {
    expect(render(panel())).toContain('<h2 id="conv-title"')
    assertCopyContract(panel())
    expect(renderText(panel())).toContain('19 of 241 videos this week')
  })

  it('exports the selected source card\'s ring, an ink ring beside the card shadow', () => {
    expect(SELECTED_CARD_RING).toBe('ring-2 ring-foreground')
  })

  it('labels a section in the small grey caps', () => {
    expect(render(<PanelSection label="Who it's about"><p>x</p></PanelSection>)).toContain('uppercase tracking-[0.06em] text-muted-foreground')
  })
})
