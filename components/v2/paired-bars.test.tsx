import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { PairedBars } from './paired-bars'
import { PAIRED } from './fixture'

const table = <PairedBars {...PAIRED} label="Your liners against liners in general" />

describe('PairedBars', () => {
  it('is a table: a caption, a header row and a row header for each thing people say', () => {
    const m = render(table)
    expect(m).toContain('<caption class="sr-only">Your liners against liners in general</caption>')
    expect(m.match(/<th scope="col"/g)).toHaveLength(5)
    expect(m.match(/<th scope="row"/g)).toHaveLength(5)
  })

  it('prints every cell as a level, "k of n", over its bar', () => {
    const levels = copyNodes(render(table)).filter((n) => n.kind === 'level').map((n) => n.text)
    expect(levels).toHaveLength(20)
    expect(levels.slice(0, 4)).toEqual(['19 of 52', '1 of 6', '1 of 3', '0 of 2'])
    assertCopyContract(table)
    expect(renderText(table)).toContain('Grip praised 8 of 52 4 of 6 0 of 3 1 of 2')
  })

  it('fills the category\'s column yellow and the client\'s gold, a zero with no fill', () => {
    const m = render(table)
    expect(m).toMatch(/<i class="[^"]*bg-brand" style="width:36\.53/)
    expect(m).toMatch(/<i class="[^"]*bg-you" style="width:16\.66/)
    // "0 of 2": the track alone.
    const zero = m.split('0 of 2')[1].split('</td>')[0]
    expect(zero).not.toContain('<i ')
  })

  it('sets the cell the page reads first in weight, never in a hue of its own', () => {
    expect(render(table)).toMatch(/<span data-copy="level" class="[^"]*font-semibold">4 of 6<\/span>/)
  })

  it('names the slot that wrote a row\'s label', () => {
    expect(copyNodes(render(table)).filter((n) => n.kind === 'subject').every((n) => n.slot === 'pass_b_theme')).toBe(true)
  })
})
