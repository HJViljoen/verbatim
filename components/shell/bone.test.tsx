import { describe, expect, it } from 'vitest'

import { render } from '@/lib/test/render'
import { PageBar } from './page-grid'
import { Bone } from './skeleton'
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
    for (const html of [render(<PageBar title="Dashboard" meta={<Bone className="h-3 w-72" />} />), render(<HomeSkeleton />)]) {
      const meta = html.match(/<p data-bar-meta=""[^>]*>([\s\S]*?)<\/p>/)
      expect(meta).not.toBeNull()
      expect(meta![1]).not.toMatch(/<(div|section|article|p|ul|ol|h[1-6])\b/)
    }
  })
})
