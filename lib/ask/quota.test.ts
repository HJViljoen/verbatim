import { describe, it, expect } from 'vitest'
import { monthStartIso, nextMonthName, evaluateMonthlyCap, capLine, capNote } from './quota'
import { ASK_MONTHLY_CAP } from '../config'

// The cap, tested where it is decided (Phase 1 WP21, decision B). Every rule
// here is pure: what the month boundary is, what the refusal says, and what
// Settings prints.

describe('monthStartIso', () => {
  it('anchors to the first instant of the UTC month', () => {
    expect(monthStartIso(new Date('2026-09-16T05:48:02Z'))).toBe('2026-09-01T00:00:00.000Z')
    expect(monthStartIso(new Date('2026-09-01T00:00:00Z'))).toBe('2026-09-01T00:00:00.000Z')
    expect(monthStartIso(new Date('2026-09-30T23:59:59Z'))).toBe('2026-09-01T00:00:00.000Z')
  })

  it('is the WALL CLOCK month, not the reading layer’s comment-dated one', () => {
    // A period in this product is dated by the comment (AGENTS.md); a budget is
    // dated by the calendar. A question asked on 1 September about August's
    // conversation is a September question.
    expect(monthStartIso(new Date('2026-09-01T00:00:01Z'))).toBe('2026-09-01T00:00:00.000Z')
  })
})

describe('nextMonthName', () => {
  it('names the month the budget starts again in', () => {
    expect(nextMonthName(new Date('2026-09-16T00:00:00Z'))).toBe('October')
  })

  it('wraps at the end of the year', () => {
    expect(nextMonthName(new Date('2026-12-31T23:00:00Z'))).toBe('January')
  })
})

describe('evaluateMonthlyCap', () => {
  it('allows a workspace under the cap', () => {
    expect(evaluateMonthlyCap(39, 40, new Date('2026-09-16T00:00:00Z'))).toEqual({ ok: true, used: 39 })
  })

  it('refuses the 41st question in a month', () => {
    const out = evaluateMonthlyCap(40, 40, new Date('2026-09-16T00:00:00Z'))
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.message).toBe(
        'That is 40 questions this month, which is the limit on this workspace. It starts again in October, or tell us if you need more.',
      )
    }
  })

  it('refuses past the cap too — a count that overshot is still a refusal', () => {
    // Two requests can read the same count before either writes its row, so the
    // used count can land at 41. The line is `>=`, not `===`.
    expect(evaluateMonthlyCap(41, 40).ok).toBe(false)
  })

  it('says no jargon and no score, and names the way out', () => {
    const out = evaluateMonthlyCap(40, 40, new Date('2026-09-16T00:00:00Z'))
    if (out.ok) throw new Error('expected a refusal')
    expect(out.message).not.toMatch(/token|model|cap|quota|agent_messages|USD|\$/i)
    expect(out.message).toContain('tell us if you need more')
  })

  it('defaults to the shipped cap', () => {
    expect(evaluateMonthlyCap(ASK_MONTHLY_CAP).ok).toBe(false)
    expect(evaluateMonthlyCap(ASK_MONTHLY_CAP - 1).ok).toBe(true)
  })
})

describe('what Settings prints', () => {
  it('leads with the count, not the ceiling', () => {
    expect(capLine(7, 40)).toBe('7 of 40 questions asked')
  })

  it('says what counts and how much room is left', () => {
    expect(capNote(7, 40)).toBe(
      'A question counts one, and so does a document checked. There are 33 left this month. It starts again on the 1st.',
    )
    expect(capNote(39, 40)).toContain('There is 1 left this month.')
    expect(capNote(40, 40)).toContain('There is no room left this month.')
  })

  it('never reports negative room', () => {
    expect(capNote(45, 40)).toContain('no room left')
  })
})
