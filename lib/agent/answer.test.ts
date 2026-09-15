import { describe, it, expect } from 'vitest'
import { movementBlock } from './answer'
import type { TrendContext } from './trend'

// The answering call itself is I/O (retrieval, one synthesis call, the audit
// log) and is not tested here. What is pinned is the one block that decides
// whether the agent may say a direction at all — the only place in the prompt
// where it is told it may.

const trend: TrendContext = {
  themes: [
    { registryId: 'reg-a', canonicalLabel: 'Socket comfort', bucket: 'client', movement: 'rising', points: [{ runDate: '2026-08-23', evidenceCount: 8, label: 'Socket comfort' }, { runDate: '2026-08-30', evidenceCount: 14, label: 'Comfort by evening' }] },
    { registryId: 'reg-b', canonicalLabel: 'Never heard', bucket: 'client', movement: 'new', points: [] },
  ],
  profiles: [],
  summaries: [{ runDate: '2026-08-30', totalVideos: 469, totalComments: 3270, sentimentPositive: 69, sentimentNegative: 8 }],
  runsCovered: 2,
}

describe('movementBlock', () => {
  it('says nothing at all unless the question asked about change', () => {
    expect(movementBlock(trend, 'latest', true)).toBe('')
    expect(movementBlock(null, 'all_time', true)).toBe('')
    expect(movementBlock(null, 'latest')).toBe('')
  })

  it('hands over the readings, and the permission to read direction from them, when the words are on', () => {
    const block = movementBlock(trend, 'trend', true)
    expect(block).toContain('MOVEMENT OVER TIME')
    expect(block).toContain('- Socket comfort: rising (2026-08-23:8, 2026-08-30:14)')
    expect(block).toContain('You may describe direction from them.')
    expect(block).not.toContain('Never heard') // no points, no line
  })

  // D1: the counts are per UPDATE, so the agent is told the history is not
  // readable rather than left to infer a direction from one reading of the
  // corpus in front of it.
  it('tells a trend question the history is not readable yet while the direction words are gated off', () => {
    const gated = movementBlock(trend, 'trend', false)
    expect(gated).toContain('- no per-topic history for these topics yet')
    expect(gated).toContain('You may NOT claim a topic is growing, fading or steady')
    // Scoped to A TOPIC's history: the update's own banded sentiment and share
    // verdicts survive D1 (run_summary period layers, with an n and a band),
    // and the digest leads on them — the agent must not deny them.
    expect(gated).toContain('a topic’s history is not readable yet')
    expect(gated).not.toContain('that the history is not readable yet')
    expect(gated).not.toContain('rising')
    expect(gated).not.toContain('You may describe direction from them.')
    // The shipped default, and the loader is skipped so `trend` is null anyway.
    expect(movementBlock(null, 'trend')).toBe(gated)
  })
})
