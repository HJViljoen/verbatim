import { describe, expect, it } from 'vitest'

import { render } from '@/lib/test/render'
import { PageBar } from './page-grid'
import { Bone, SkeletonStatStrip } from './skeleton'
import { HomeSkeleton } from '@/components/pages/v2/home/skeleton'

// A bone stands where a line of text will, and PageBar's meta is a <p>. A
// <div> there is invalid HTML: the browser closes the paragraph early and
// React's hydration meets a tree it did not send (#418 on the Dashboard,
// 5 Nov, whose bar meta streams behind a bone).
describe('Bone', () => {
  it('is phrasing content, drawn as a block', () => {
    expect(render(<Bone className="h-3 w-72" />)).toBe('<span aria-hidden="true" class="block animate-pulse rounded-[4px] bg-muted h-3 w-72"></span>')
  })

  it('leaves no block element inside a page bar\'s meta paragraph, on the Dashboard\'s loading screen too', () => {
    for (const html of [render(<PageBar title="Dashboard" meta={<Bone className="h-3 w-72" />} />)]) {
      const meta = html.match(/<p data-bar-meta=""[^>]*>([\s\S]*?)<\/p>/)
      expect(meta).not.toBeNull()
      expect(meta![1]).not.toMatch(/<(div|section|article|p|ul|ol|h[1-6])\b/)
    }
    // The Dashboard's loading screen has no meta paragraph since the audit
    // design (7 Nov): its figures row's bones are spans in a <div>, never a
    // block inside a <p>.
    const home = render(<HomeSkeleton />)
    expect(home).not.toContain('data-bar-meta')
    const strip = home.slice(home.indexOf('data-stat-strip-bones'), home.indexOf('</div>', home.indexOf('data-stat-strip-bones')))
    expect(strip).not.toMatch(/<(p|section|article|ul|ol|h[1-6])\b/)
  })
})

// The figures row's bones (the audit design, 7 Nov): the strip's own grid, a
// term and a value a cell, nothing a screen reader reads.
describe('SkeletonStatStrip', () => {
  it('draws a term and a value bone a cell, in the strip\'s grid', () => {
    const html = render(<SkeletonStatStrip cells={4} />)
    expect(html).toMatch(/^<div aria-hidden="true" data-stat-strip-bones="" class="m-0 grid grid-cols-1 gap-6 border-b border-border pb-5 min-\[900px\]:grid-cols-4">/)
    expect(html.match(/animate-pulse/g)).toHaveLength(8)
    expect(html).not.toMatch(/<(div|p)\b[^>]*>[^<]*<div/)
  })

  it('holds between one and six cells', () => {
    expect(render(<SkeletonStatStrip cells={0} />).match(/animate-pulse/g)).toHaveLength(2)
    expect(render(<SkeletonStatStrip cells={9} />)).toContain('min-[900px]:grid-cols-6')
  })
})
