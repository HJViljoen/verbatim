import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { HowSound } from './how-sound'

// The record's own pill. Two things it must not get wrong: it renders at all
// outside a Next router (useSearchParams() is null in a static render, and a
// bar that throws there is a bar nothing can check), and both of its addresses
// carry the reading the reader is on.

const RECORD = {
  line: '2 updates · 394 videos · 34% of what was said on camera was not in English',
  lines: ['Four updates were delivered in this window.', 'Nothing was set aside.'],
}

describe('HowSound', () => {
  it('renders outside a router instead of throwing', () => {
    expect(renderText(<HowSound basePath="/dashboard" {...RECORD} />)).toContain('How sound is this')
  })

  it('opens the record at the reader’s own horizon and selection', () => {
    const markup = render(<HowSound basePath="/dashboard/voice" params={{ themes: 'product_usefulness', horizon: 'last_3' }} {...RECORD} />)
    expect(markup).toContain('href="/dashboard/voice?themes=product_usefulness&amp;horizon=last_3&amp;detail=record"')
    expect(markup).not.toContain('href="/dashboard/voice?detail=record"')
  })

  it('never prints itself into an export', () => {
    expect(render(<HowSound basePath="/dashboard" {...RECORD} />)).toContain('data-print-hide')
  })
})
