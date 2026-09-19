import { describe, expect, it } from 'vitest'
import { platformColour, personaColour } from './profile-stats'
import { tokenHex } from '@/lib/email/theme'

// The platform palette (Block D wave 3, SH9). Pure: it is a lookup table, and
// what it must not do is spend a colour the system has already spent.

describe('platformColour', () => {
  it('spends no reserved colour on a platform name', () => {
    const spent = ['tiktok', 'instagram', 'youtube', 'reddit', 'whatever'].map(platformColour)
    // The Verbatim green has exactly four jobs and a platform is not one of
    // them; the marketing theme's marker yellow is on DESIGN.md's anti-list
    // and the drift guard cannot see it, because it scans app/globals.css only.
    expect(spent).not.toContain('var(--chart-2)')
    expect(spent).not.toContain('var(--you)')
    expect(spent).not.toContain('var(--primary)')
    for (const c of spent) expect(c).not.toMatch(/^#/)
  })

  it('gives each of the four platforms its own step, in the app and in an email', () => {
    const four = ['tiktok', 'instagram', 'youtube', 'reddit'].map(platformColour)
    expect(new Set(four).size).toBe(4)
    expect(new Set(four.map(tokenHex)).size).toBe(4)
  })

  it('keeps a platform on its own step whatever else is in the data', () => {
    // Fixed per platform, not assigned by position, so a platform keeps its
    // step when another is absent from a tenant's data.
    expect(platformColour('tiktok')).toBe('var(--chart-1)')
    expect(platformColour('reddit')).toBe('var(--chart-5)')
  })

  it('cycles the persona palette rather than running off its end', () => {
    expect(personaColour(0)).toBe(personaColour(5))
  })
})
