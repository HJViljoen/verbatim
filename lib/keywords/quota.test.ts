import { describe, it, expect } from 'vitest'
import { evaluateSuggestQuota, hourAgoIso } from './quota'

describe('evaluateSuggestQuota', () => {
  it('lets a user who has asked four times this hour ask again', () => {
    expect(evaluateSuggestQuota(4)).toEqual({ ok: true, used: 4 })
  })

  it('stops the fifth call from becoming a sixth', () => {
    const q = evaluateSuggestQuota(5)
    expect(q.ok).toBe(false)
    expect(q.ok === false && q.message).toContain('5 sets of suggestions in an hour')
  })

  it('stays closed once the count is past the limit', () => {
    expect(evaluateSuggestQuota(400).ok).toBe(false)
  })

  it('takes a caller-supplied limit', () => {
    expect(evaluateSuggestQuota(1, 1).ok).toBe(false)
    expect(evaluateSuggestQuota(1, 2).ok).toBe(true)
  })
})

describe('hourAgoIso', () => {
  it('is exactly one hour before the moment given', () => {
    expect(hourAgoIso(new Date('2026-09-12T09:30:00.000Z'))).toBe('2026-09-12T08:30:00.000Z')
  })
})
