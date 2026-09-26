import { describe, expect, it } from 'vitest'

import { directionHits } from '../calibration'
import { MAGNITUDE_RE } from '../prose/scrub'
import { ATTRIBUTION_NOTE, CAPPED_NOTE, GATE_RULE_NOTE } from '../../scripts/log-tracking-eras'
import { SEGMENT_NOTE } from '../../scripts/label-segments'

// The notes the Stage 1 scripts write to `config_changes` in production (plan
// WP1.4: log-tracking-eras' three, label-segments' one; reconstruct-provenance
// and measure-comparability write no note). The app prints them as they are
// stored (Settings › What we changed), and a stored row is not rewritten, so
// each is held here to the copy rules of plan §4.0 before Heinrich reads them
// on Mon 28 Sep: no direction word (they come only from `directionWord`), no
// magnitude word, no digit, no em dash, "complete" never, and no "how sound".
const NOTES: Record<string, string> = { GATE_RULE_NOTE, ATTRIBUTION_NOTE, CAPPED_NOTE, SEGMENT_NOTE }

describe('the notes the Stage 1 scripts store (plan §4.0)', () => {
  it.each(Object.entries(NOTES))('%s carries no direction or magnitude word, digit, em dash, "complete" or "how sound"', (_name, note) => {
    expect(directionHits(note)).toEqual([])
    expect(note.match(MAGNITUDE_RE)).toBeNull()
    expect(note).not.toMatch(/\d/)
    expect(note).not.toMatch(/[—–]/)
    expect(note).not.toMatch(/\bcomplete\b/i)
    expect(note).not.toMatch(/how sound/i)
  })

  it('names the attribution change and claims nothing it did (no "improved", no "fewer")', () => {
    expect(ATTRIBUTION_NOTE).toBe('We changed how we tell which brand a post is about.')
    expect(directionHits('We improved how we tell which brand a post is about.')).toEqual(['improved'])
  })
})
