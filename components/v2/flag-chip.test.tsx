import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract, copyViolations } from '@/lib/test/copy-contract'
import { FLAG_WORDS, FlagChip, flagWordOf } from './flag-chip'
import { GONE_QUIET, GROWING, MOVED, NEW_FLAG, NO_CLEAR, REFUSED, WEEK_FLAG } from './fixture'

// Decision 1: the boards' "Rising", "3× usual" and "▲ 7 pts" on a week are
// not allowed. A flag chip prints only a word code assigned from a Verdict,
// inside a verdict node, and nothing at all where nothing was earned.

describe('FlagChip', () => {
  it('reads its word off the verdict, and only these five words exist', () => {
    expect(flagWordOf(WEEK_FLAG)).toBe('unusual')
    expect(flagWordOf(NEW_FLAG)).toBe('new')
    expect(flagWordOf(GONE_QUIET)).toBe('gone_quiet')
    expect(flagWordOf(GROWING)).toBe('growing')
    expect(flagWordOf({ ...MOVED, direction: 'fading' })).toBe('fading')
    expect(Object.values(FLAG_WORDS)).toEqual(['Growing', 'Fading', 'Unusual this week', 'New', 'Gone quiet'])
  })

  it('prints nothing for a month that moved, a month that did not, a refusal or no verdict', () => {
    // A month that cleared its band is MovementBadge's "▲ 7 pts", never a chip:
    // one comparison earns no direction word.
    for (const v of [MOVED, NO_CLEAR, REFUSED, null, undefined]) {
      expect(flagWordOf(v)).toBeNull()
      expect(render(<FlagChip verdict={v} />)).toBe('')
    }
    // `flat` is a reading, not a flag.
    expect(flagWordOf({ ...MOVED, direction: 'flat' })).toBeNull()
  })

  it('is an orange fill with ink words, inside a verdict node', () => {
    const m = render(<FlagChip verdict={NEW_FLAG} />)
    expect(m).toMatch(/^<span data-copy="verdict" data-flag="new" title="[^"]+" class="[^"]*bg-orange[^"]*text-brand-foreground[^"]*">New<\/span>$/)
    expect(m).toContain('rounded-full')
    expect(m).toContain('whitespace-nowrap')
    expect(m).not.toMatch(/text-orange(?!-text)/)
    expect(render(<FlagChip verdict={NEW_FLAG} size="sm" />)).toContain('text-[10.5px]')
  })

  it('keeps the copy contract, direction words included, because they sit in the verdict node', () => {
    for (const v of [WEEK_FLAG, NEW_FLAG, GONE_QUIET, GROWING]) assertCopyContract(<p>Insurance refusals <FlagChip verdict={v} /></p>)
    // The same words outside a verdict node fail: the chip is what makes them legal.
    expect(copyViolations(<p>Insurance refusals <span>Growing</span></p>).map((v) => v.rule)).toContain('direction-word')
    expect(copyViolations(<p><span>Gone quiet</span></p>).map((v) => v.rule)).toContain('direction-word')
  })

  it('explains a flagged week in its title with both sides, and prints no number', () => {
    const m = render(<FlagChip verdict={WEEK_FLAG} />)
    expect(m).toContain('title="19 of 241 videos this week, against 39 of 1,906 in the months before, outside a band of 3.6 pts"')
    expect(renderText(<FlagChip verdict={WEEK_FLAG} />)).toBe('Unusual this week')
  })
})
