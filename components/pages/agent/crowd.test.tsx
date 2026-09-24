import { describe, expect, it } from 'vitest'
import { AskCrowd } from './crowd'
import { render, renderText } from '@/lib/test/render'

// Ask's crowd is decoration: it must print no words, hide itself from
// assistive tech, and only animate when the page asks it to.

describe('AskCrowd', () => {
  it('is hidden from assistive tech and prints nothing', () => {
    const html = render(<AskCrowd />)
    expect(html).toMatch(/^<div class="ask-crowd" aria-hidden="true"/)
    expect(renderText(<AskCrowd />).trim()).toBe('')
  })

  it('draws the six-ring field of 80 figures', () => {
    expect(render(<AskCrowd />).match(/class="ask-crowd-figure"/g)).toHaveLength(80)
  })

  it('marks the entrance only when asked', () => {
    expect(render(<AskCrowd />)).not.toContain('data-enter')
    expect(render(<AskCrowd enter />)).toContain('data-enter=""')
  })
})
