import { describe, it, expect } from 'vitest'
import { inWindow } from './gather'
import { periodWindowDays } from '../config'

// The baseline-vs-flow window rule (teardown §Run 1, defect 6). The invariant
// worth locking: only content KNOWN older than the window is excluded — null
// dates always stay, and a null window (baseline run) keeps everything.

describe('inWindow', () => {
  it('keeps everything on a baseline run (no window)', () => {
    expect(inWindow('2020-01-01', null)).toBe(true)
    expect(inWindow(null, null)).toBe(true)
  })

  it('drops content known older than the window', () => {
    expect(inWindow('2026-07-01', '2026-07-04')).toBe(false)
  })

  it('keeps content inside the window, boundary inclusive', () => {
    expect(inWindow('2026-07-04', '2026-07-04')).toBe(true)
    expect(inWindow('2026-07-09', '2026-07-04')).toBe(true)
  })

  it('keeps null/unknown dates — a patchy platform must never be blanked', () => {
    expect(inWindow(null, '2026-07-04')).toBe(true)
    expect(inWindow(undefined, '2026-07-04')).toBe(true)
  })
})

describe('periodWindowDays', () => {
  it('maps report periods to the shared window lengths', () => {
    expect(periodWindowDays('daily')).toBe(1)
    expect(periodWindowDays('weekly')).toBe(7)
    expect(periodWindowDays('monthly')).toBe(30)
    expect(periodWindowDays('anything-else')).toBe(7) // weekly is the default
  })
})
