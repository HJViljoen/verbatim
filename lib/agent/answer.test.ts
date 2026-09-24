import { describe, it, expect } from 'vitest'
import { movementBlock } from './answer'
import { NO_MOVEMENT_BLOCK, type MovementReading } from './movement'

// The answering call itself is I/O (retrieval, one synthesis call, the audit
// log) and is not tested here. What is pinned is the one block that decides
// whether the agent may say a direction at all — the only place in the prompt
// where it is told it may.

const reading = (over: Partial<MovementReading> = {}): MovementReading => ({
  label: 'Socket comfort',
  audience: 'The category',
  curr: { month: '2026-09-01', k: 14, n: 118 },
  prev: { month: '2026-08-01', k: 8, n: 182 },
  verdict: {
    objectKind: 'theme', objectId: 'reg-a', objectLabel: 'Socket comfort', audience: 'industry-other',
    window: { kind: 'month', from: '2026-09-01', to: '2026-10-01' },
    basis: { from: '2026-08-01', to: '2026-09-01' },
    value: { k: 14, n: 118 }, baseline: { k: 8, n: 182 },
    changePts: 7.5, bandPts: 6.6, state: 'moved', flags: [],
  },
  direction: null,
  readableMonths: 4,
  filling: false,
  ...over,
})

describe('movementBlock', () => {
  it('says nothing at all unless the question asked about change', () => {
    expect(movementBlock([reading()], 'latest', true)).toBe('')
    expect(movementBlock(null, 'all_time', true)).toBe('')
    expect(movementBlock(null, 'latest')).toBe('')
  })

  it('hands over the monthly readings and their verdicts when the words are on', () => {
    const block = movementBlock([reading()], 'trend', true)
    expect(block).toContain('MOVEMENT OVER TIME (calendar months, each with its own denominator).')
    expect(block).toContain('- Socket comfort · The category: Aug 2026 8 of 182 videos (4.4%) → Sep 2026 14 of 118 videos (11.9%); moved (+7.5 pts, band 6.6 pts)')
    expect(block).toContain('no direction word has been earned here')
    expect(block).toContain('You may name a direction ONLY where a line says growing, fading or flat')
  })

  it('carries a direction word only when the series earned one', () => {
    expect(movementBlock([reading({ direction: 'growing' })], 'trend', true))
      .toContain('direction over the last three months: growing')
  })

  // D1 stays a rule about WHICH series may carry a direction word, not a switch
  // flipped once. With the reader off the agent returns to silence about
  // direction rather than to the run-indexed series it used to read.
  it('tells a trend question the history is not readable yet when the reader is off', () => {
    const gated = movementBlock([reading()], 'trend', false)
    expect(gated).toBe(NO_MOVEMENT_BLOCK)
    expect(gated).toContain('- no monthly readings for these topics yet')
    expect(gated).toContain('You may NOT claim a topic is growing, fading or steady')
    // Scoped to A TOPIC's history: the update's own banded sentiment and share
    // verdicts survive D1, and the digest leads on them — the agent must not
    // deny them.
    expect(gated).toContain('a topic’s history is not readable yet')
    expect(gated).not.toContain('that the history is not readable yet')
    expect(gated).not.toContain('moved')
  })

  it('says the same thing when the months hold nothing for what was retrieved', () => {
    // The monthly reading is not applied everywhere yet, and a workspace can
    // have a corpus with no months read. Neither is "the topic was never
    // mentioned", and the block must not let the model say it was.
    expect(movementBlock([], 'trend', true)).toBe(NO_MOVEMENT_BLOCK)
    expect(movementBlock(null, 'trend', true)).toBe(NO_MOVEMENT_BLOCK)
  })
})
