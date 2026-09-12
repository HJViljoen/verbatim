import { describe, expect, it } from 'vitest'
import { buildBlockedReason, inFlightDecision, BUILD_PHASE_WORDS } from './builds'
import { DEFAULT_DOCUMENT_SETTINGS } from './types'
import { DOCUMENT_BUILD_STALE_MS } from '../../config'

const now = Date.parse('2026-08-31T09:00:00Z')
const at = (msAgo: number) => new Date(now - msAgo).toISOString()

describe('inFlightDecision — one build at a time per report', () => {
  it('no row, a finished build or a failed one leaves the report free', () => {
    expect(inFlightDecision(null, now)).toBe('free')
    expect(inFlightDecision({ status: 'done', started_at: at(1000) }, now)).toBe('free')
    expect(inFlightDecision({ status: 'failed', started_at: at(1000) }, now)).toBe('free')
  })
  it('a young active build belongs to whoever is on it', () => {
    for (const status of ['queued', 'researching', 'writing', 'checking', 'rendering'] as const) {
      expect(inFlightDecision({ status, started_at: at(DOCUMENT_BUILD_STALE_MS - 1000) }, now)).toBe('busy')
    }
  })
  it('an active build older than the stale window is taken over', () => {
    expect(inFlightDecision({ status: 'researching', started_at: at(DOCUMENT_BUILD_STALE_MS + 1000) }, now)).toBe('takeover')
  })
})

describe('BUILD_PHASE_WORDS', () => {
  it('has a phrase for every status and no em dash', () => {
    for (const w of Object.values(BUILD_PHASE_WORDS)) {
      expect(w.length).toBeGreaterThan(0)
      expect(w).not.toMatch(/[—–]/)
    }
  })
})

describe('buildBlockedReason', () => {
  it('will not build a custom brief that has no brief written', () => {
    const reason = buildBlockedReason({ template_key: 'custom', settings: DEFAULT_DOCUMENT_SETTINGS })
    expect(reason).toContain('Write the brief first')
    expect(buildBlockedReason({ template_key: 'custom', settings: { brief: '   ' } })).toBe(reason)
    expect(buildBlockedReason({ template_key: 'custom', settings: { brief: 'Review the athlete campaign.' } })).toBeNull()
    // Blocks alone are not an instruction: the brief is the point of it.
    expect(buildBlockedReason({ template_key: 'custom', settings: { blocks: ['consumer_profiles'] } })).toBe(reason)
  })

  it('never blocks one of the four, whose brief is the template\'s own', () => {
    for (const key of ['sales_brief', 'leadership_brief', 'market_brief', 'content_brief', null]) {
      expect(buildBlockedReason({ template_key: key, settings: {} }), String(key)).toBeNull()
    }
  })
})
