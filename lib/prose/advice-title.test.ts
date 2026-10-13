import { describe, expect, it } from 'vitest'
import { DERIVED_TITLE_MAX, titleFromBody, titleOrBody } from './advice-title'

// A piece of advice whose stored title is blank (one of Össur's, 12 Oct: the
// slot's scrub dropped it whole) is named by its body's first clause. The
// pipeline stores by this rule and every surface names advice by it.

describe('titleFromBody', () => {
  it('takes the first clause: up to a sentence end, a semicolon or a colon', () => {
    expect(titleFromBody('Build a guided access path for first-time buyers. Cost questions come first.')).toBe('Build a guided access path for first-time buyers')
    expect(titleFromBody('Answer the insurance question on every product reel; buyers stall there.')).toBe('Answer the insurance question on every product reel')
    expect(titleFromBody('Lead with fit: the market asks about it most.')).toBe('Lead with fit')
    expect(titleFromBody('Show the liner on the leg - not on a table')).toBe('Show the liner on the leg')
  })

  it('cuts a long clause on a word boundary at about 70 characters, with an ellipsis', () => {
    const body = 'Create a guided access path that walks a first-time buyer from the first question about cost through coverage, fitting and the first months of wear. More follows.'
    const t = titleFromBody(body)!
    expect(t.length).toBeLessThanOrEqual(DERIVED_TITLE_MAX)
    expect(t.endsWith('…')).toBe(true)
    expect(t).toBe('Create a guided access path that walks a first-time buyer from the…')
    // The cut is on a word boundary: the word before the ellipsis is whole.
    expect(body.startsWith(t.slice(0, -1))).toBe(true)
    expect(body.charAt(t.length - 1)).toBe(' ')
  })

  it('folds whitespace, drops trailing punctuation, and cuts inside one word longer than the measure', () => {
    expect(titleFromBody('  Put   the answer\nfirst ,  ')).toBe('Put the answer first')
    const long = 'x'.repeat(200)
    expect(titleFromBody(long)).toBe(`${'x'.repeat(DERIVED_TITLE_MAX - 1)}…`)
  })

  it('is null where the body is blank, and a title stored is always kept', () => {
    expect(titleFromBody('')).toBeNull()
    expect(titleFromBody('   ')).toBeNull()
    expect(titleFromBody(null)).toBeNull()
    expect(titleOrBody(' Help desk ', 'Something else entirely.')).toBe('Help desk')
    expect(titleOrBody('', 'Lead with fit: the market asks about it most.')).toBe('Lead with fit')
    expect(titleOrBody('', '')).toBeNull()
  })

  it('always fits a dated move\'s title (1 to 120 characters)', () => {
    for (const b of ['a', 'Lead with fit.', 'word '.repeat(80), 'y'.repeat(500)]) {
      const t = titleFromBody(b)!
      expect(t.length).toBeGreaterThanOrEqual(1)
      expect(t.length).toBeLessThanOrEqual(120)
    }
  })
})
