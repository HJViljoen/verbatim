import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { SpikeBars } from './spike-bars'
import { SPIKE_WEEKS, VOLUME_WEEKS } from './fixture'

const figures = (m: string) => [...m.matchAll(/data-copy="figure"[^>]*>([^<]*)</g)].map((x) => x[1])

describe('SpikeBars', () => {
  it('draws a yellow bar a week and the newest in the orange, its count over it', () => {
    const m = render(<SpikeBars weeks={SPIKE_WEEKS} label="Videos a week about insurance refusals" />)
    expect(m.match(/class="fill-brand"/g)).toHaveLength(11)
    expect(m).toMatch(/<rect [^>]*class="fill-orange" data-week="newest"/)
    expect(figures(m)).toEqual(['19'])
    expect(m).toMatch(/^<svg viewBox="0 0 480 132" role="img" aria-label="Videos a week about insurance refusals: 20 Jul 5, 27 Jul 6, [^"]*5 Oct 19\."/)
    assertCopyContract(<SpikeBars weeks={SPIKE_WEEKS} label="Videos a week about insurance refusals" />)
  })

  it('labels the first week, two between and the newest, and never a word of movement', () => {
    const text = renderText(<SpikeBars weeks={SPIKE_WEEKS} label="x" />)
    expect(text).toBe('19 20 Jul 17 Aug 14 Sep 5 Oct')
  })

  it('draws a comparison line, dashed, short of the newest week, with its label and figure', () => {
    const m = render(<SpikeBars weeks={SPIKE_WEEKS} compare={{ value: 6, label: 'usual' }} label="x" />)
    expect(m).toMatch(/<line x1="0" y1="[\d.]+" x2="440" y2="[\d.]+" class="stroke-foreground" stroke-width="1" stroke-dasharray="3 4"/)
    expect(renderText(<SpikeBars weeks={SPIKE_WEEKS} compare={{ value: 6, label: 'usual' }} label="x" />)).toContain('usual · 6')
    expect(figures(m)).toEqual(['6', '19'])
    assertCopyContract(<SpikeBars weeks={SPIKE_WEEKS} compare={{ value: 6, label: 'usual' }} label="x" />)
  })

  it('keeps a week with no reading as an empty slot, and draws a zero as a stub', () => {
    const weeks = [{ label: '21 Sep', count: null }, { label: '28 Sep', count: 0 }, { label: '5 Oct', count: 8 }]
    const m = render(<SpikeBars weeks={weeks} label="x" />)
    expect(m.match(/<rect /g)).toHaveLength(2)
    expect(m).toContain('class="fill-border"')
    expect(m).toContain('21 Sep not read, 28 Sep 0, 5 Oct 8')
  })

  it('draws the rail\'s weekly volume in ink, every count printed, at the rail\'s size', () => {
    const m = render(<SpikeBars weeks={VOLUME_WEEKS} variant="ink" counts="all" size="md" label="Videos a week" />)
    expect(m).toContain('viewBox="0 0 300 112"')
    expect(m.match(/class="fill-foreground"/g)?.length).toBeGreaterThanOrEqual(8)
    expect(m).not.toContain('fill-orange')
    expect(figures(m)).toEqual(['198', '205', '214', '188', '230', '226', '219', '241'])
    assertCopyContract(<SpikeBars weeks={VOLUME_WEEKS} variant="ink" counts="all" size="md" label="Videos a week" />)
  })

  it('draws nothing with no weeks', () => {
    expect(render(<SpikeBars weeks={[]} label="x" />)).toBe('')
  })
})
