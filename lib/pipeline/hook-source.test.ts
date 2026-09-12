import { describe, it, expect } from 'vitest'
import { hookSource } from './hook-source'

// Derived hook provenance (WP7b M4, 2026-09-12). It exists because on-screen
// text is now eligible to BE the hook, and without a marker every hook analytic
// shifts for newly classified videos with nothing on the row to explain why.

describe('hookSource', () => {
  const blocks = {
    transcript: 'so I tried six prosthetic legs this year and this one actually fit',
    ocr: 'I TRIED 6 PROSTHETIC LEGS\nthis one actually fit',
    caption: 'day 3 of testing #blade',
  }

  it('reads a spoken hook out of the transcript', () => {
    expect(hookSource('so I tried six prosthetic legs this year', blocks)).toBe('spoken')
  })

  it('reads a typed hook off the cover frame', () => {
    expect(hookSource('this one actually fit', { ...blocks, transcript: null })).toBe('typed')
  })

  it('gives ties to spoken, so "typed" stays a strong signal', () => {
    // The creator reading their own title card is common. Awarding 'typed' only
    // when the words appear NOWHERE else keeps the label worth reading.
    expect(hookSource('this one actually fit', blocks)).toBe('spoken')
  })

  it('falls back to the caption', () => {
    expect(hookSource('day 3 of testing', { transcript: null, ocr: null, caption: blocks.caption })).toBe('caption')
  })

  it('is null when the hook matches nothing it was shown', () => {
    // A paraphrase. Better an honest null than a guessed provenance.
    expect(hookSource('the creator compares six legs', blocks)).toBeNull()
    expect(hookSource(null, blocks)).toBeNull()
    expect(hookSource('   ', blocks)).toBeNull()
  })

  it('never welds two cover lines into one "hook"', () => {
    // Same rule as the [o] evidence validator: the newlines separate text
    // blocks, so a hook spanning two of them is a hook nobody wrote.
    expect(hookSource('I TRIED 6 PROSTHETIC LEGS this one actually fit', { ...blocks, transcript: null })).toBeNull()
  })

  it('is tolerant of case and spacing, like every other quote match here', () => {
    expect(hookSource('THIS   One Actually Fit', { ...blocks, transcript: null })).toBe('typed')
  })
})
