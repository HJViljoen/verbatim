import { describe, it, expect } from 'vitest'
import { movementLine, movementDirection, renderMovement, rankMovement, NO_MOVEMENT_BLOCK, type MovementReading } from './movement'
import type { SeriesPoint } from '../reading/bands'
import type { MonthLabel } from '../reading/series'
import type { Verdict, VerdictFlag, VerdictState } from '../reading/verdicts'

// The MOVEMENT block, re-based on the comment-dated monthly reading (WP21,
// decision D1). Everything here is the block's own words; the loader above it
// is I/O and is exercised against production read-only instead.

const verdict = (over: Partial<Verdict> = {}): Verdict => ({
  objectKind: 'theme',
  objectId: 'reg-a',
  objectLabel: 'Socket comfort',
  audience: 'industry-other',
  window: { kind: 'month', from: '2026-09-01', to: '2026-10-01' },
  basis: { from: '2026-08-01', to: '2026-09-01' },
  value: { k: 14, n: 118 },
  baseline: { k: 8, n: 182 },
  changePts: 7.5,
  bandPts: 6.6,
  state: 'moved',
  flags: [],
  ...over,
})

const reading = (over: Partial<MovementReading> = {}): MovementReading => ({
  label: 'Socket comfort',
  audience: 'The category',
  curr: { month: '2026-09-01', k: 14, n: 118 },
  prev: { month: '2026-08-01', k: 8, n: 182 },
  verdict: verdict(),
  direction: null,
  readableMonths: 4,
  filling: false,
  ...over,
})

describe('movementLine', () => {
  it('states both sides with their own denominators, never a bare count', () => {
    // The run-indexed block this replaces printed "rising (2026-08-23:8,
    // 2026-08-30:14)" — two counts, no denominator, a direction from a ratio.
    const line = movementLine(reading())
    expect(line).toContain('Aug 2026 8 of 182 videos (4.4%) → Sep 2026 14 of 118 videos (11.9%)')
    expect(line).toContain('moved (+7.5 pts, band 6.6 pts)')
  })

  it('prints the band on both answers and on neither refusal', () => {
    expect(movementLine(reading({ verdict: verdict({ state: 'no_clear_change', changePts: 1.2, bandPts: 6.6 }) })))
      .toContain('no clear change (+1.2 pts, band 6.6 pts)')
    for (const [state, words] of [
      ['too_little_data', 'too few to compare'],
      ['baseline_forming', 'not enough history to compare yet'],
      ['refused', 'not comparable'],
    ] as [VerdictState, string][]) {
      const line = movementLine(reading({ verdict: verdict({ state, changePts: null, bandPts: null }) }))
      expect(line).toContain(words)
      expect(line).not.toContain('band')
    }
  })

  it('never prints a direction word the series did not earn', () => {
    expect(movementLine(reading())).toContain('no direction word has been earned here')
    expect(movementLine(reading({ direction: 'fading' }))).toContain('direction over the last three months: fading')
  })

  it('says a still-filling month is not a settled reading', () => {
    expect(movementLine(reading({ filling: true }))).toContain('Sep 2026 is still filling and is not yet a settled reading')
    expect(movementLine(reading())).not.toContain('still filling')
  })

  it('tells an unrecorded grouping apart from a changed one', () => {
    // On today's corpus every frozen month carries no clustering key, so nearly
    // every comparison earns the second of these — and saying "themes were
    // re-grouped" about a pair nobody recorded a grouping for is a claim the
    // record does not support.
    const unknown = movementLine(reading({ verdict: verdict({ flags: ['clustering_unknown'] }) }))
    expect(unknown).toContain('we did not record how themes were grouped')
    const changed = movementLine(reading({ verdict: verdict({ flags: ['clustering_changed'] }) }))
    expect(changed).toContain('themes were re-grouped between these two months')
  })

  it('says a month with no reading is unread, not empty', () => {
    // "Nothing was said about this" and "we read nothing that month" are
    // different claims, and only one of them is about the conversation.
    const line = movementLine(reading({ prev: { month: '2026-08-01', k: null, n: null } }))
    expect(line).toContain('Aug 2026 nothing read')
    const none = movementLine(reading({ prev: { month: '2026-08-01', k: null, n: 182 } }))
    expect(none).toContain('Aug 2026 182 videos, this topic not among them')
  })

  it('names every flag it prints in words, never as a code', () => {
    // The four that can arrive: three from monthChange, and `thin` from the
    // month's own label.
    const flags: VerdictFlag[] = ['renamed', 'thin', 'clustering_unknown']
    const line = movementLine(reading({ verdict: verdict({ flags }) }))
    // The snake_case tokens are the codes; `thin` and `renamed` are also
    // ordinary words and appear inside the sentences that explain them.
    for (const f of flags.filter((x) => x.includes('_'))) expect(line).not.toContain(f)
    expect(line).toContain('two names for the same rival')
    expect(line).toContain('thin against this audience’s own year')
  })

  it('stays silent about a flag it has no sentence for, rather than printing a code', () => {
    // `measurement_changed` is moodChange's, and nothing writes `re_read` at
    // all; both carried reader-facing sentences here that no path could reach.
    const line = movementLine(reading({ verdict: verdict({ flags: ['re_read', 'measurement_changed'] }) }))
    expect(line).not.toContain('re_read')
    expect(line).not.toContain('measurement_changed')
    // Two lines and no caveat bullet: the reading and its history, nothing else.
    expect(line.split('\n')).toHaveLength(2)
  })

  it('counts the history behind a line, in the singular where there is one', () => {
    expect(movementLine(reading({ readableMonths: 1 }))).toContain('1 month of readings behind it')
    expect(movementLine(reading({ readableMonths: 9 }))).toContain('9 months of readings behind it')
  })

  it('says an audience too small to read is too small, not empty', () => {
    // Össur's own brand carries ~20 videos a month against a floor of 100, so
    // every month of it is below the floor while the level above is real.
    // "0 months of readings behind it" read as "we have never heard this".
    const line = movementLine(reading({
      audience: 'Your own brand',
      readableMonths: 0,
      curr: { month: '2026-09-01', k: 0, n: 19 },
      prev: { month: '2026-08-01', k: 0, n: 20 },
      verdict: verdict({ state: 'too_little_data', changePts: null, bandPts: null }),
    }))
    expect(line).toContain('no month here carries enough videos to compare on')
    expect(line).toContain('Aug 2026 0 of 20 videos (0%) → Sep 2026 0 of 19 videos (0%)')
  })
})

describe('renderMovement', () => {
  it('states the unit before the numbers', () => {
    const block = renderMovement([reading()])
    expect(block.startsWith('MOVEMENT OVER TIME (calendar months, each with its own denominator).')).toBe(true)
    expect(block).toContain('A month is dated by when a comment was WRITTEN, not by when we read it.')
  })

  it('forbids the model working out a direction of its own', () => {
    const block = renderMovement([reading()])
    expect(block).toContain('You may name a direction ONLY where a line says growing, fading or flat')
    expect(block).toContain('Never work out a direction from the numbers')
    expect(block).toContain('never describe a month that is still filling as a finished one')
  })

  it('falls back to the not-readable-yet block rather than an empty list', () => {
    expect(renderMovement([])).toBe(NO_MOVEMENT_BLOCK)
  })

  it('leaves the update’s own banded verdicts alone', () => {
    // D1 keeps the sentiment and share verdicts the digest carries, and the
    // email leads on one of them. A blanket "the history is not readable" would
    // have Ask contradict the email in the same week, so the silence is scoped
    // to a topic.
    expect(NO_MOVEMENT_BLOCK).toContain('a topic’s history is not readable yet')
    expect(NO_MOVEMENT_BLOCK).not.toMatch(/sentiment|share of voice/i)
  })
})

describe('rankMovement', () => {
  it('keeps the lines that say something when a prompt cannot carry them all', () => {
    const rows = [
      reading({ label: 'Refused', verdict: verdict({ state: 'refused' }) }),
      reading({ label: 'Thin', verdict: verdict({ state: 'too_little_data' }) }),
      reading({ label: 'Steady', verdict: verdict({ state: 'no_clear_change' }) }),
      reading({ label: 'Moved', verdict: verdict({ state: 'moved' }) }),
    ]
    expect(rankMovement(rows, 2).map((r) => r.label)).toEqual(['Moved', 'Steady'])
  })

  it('breaks a tie on the object’s own size, then on its name', () => {
    const rows = [
      reading({ label: 'Small', curr: { month: '2026-09-01', k: 2, n: 118 } }),
      reading({ label: 'Big', curr: { month: '2026-09-01', k: 40, n: 118 } }),
    ]
    expect(rankMovement(rows, 2).map((r) => r.label)).toEqual(['Big', 'Small'])
    const same = [reading({ label: 'Bravo' }), reading({ label: 'Alpha' })]
    expect(rankMovement(same, 2).map((r) => r.label)).toEqual(['Alpha', 'Bravo'])
  })

  it('does not reorder what it does not have to', () => {
    expect(rankMovement([], 8)).toEqual([])
  })
})

describe('movementDirection', () => {
  // The exact shape the review reproduced: three consecutive months, both
  // floors cleared on each, one clustering key, one audience, monotone steps
  // and a span that clears the band — so `directionWord` says "growing".
  const growing: SeriesPoint[] = [
    { month: '2026-07-01', videos: 600, k: 24, audience: 'industry-other', clusteringKey: 'ck-1' },
    { month: '2026-08-01', videos: 628, k: 60, audience: 'industry-other', clusteringKey: 'ck-1' },
    { month: '2026-09-01', videos: 120, k: 30, audience: 'industry-other', clusteringKey: 'ck-1' },
  ]
  const thinLabel: MonthLabel = { kind: 'thin', text: 'Thin month — far fewer videos than usual.' }

  it('takes the word the series earned when the month is not thin', () => {
    expect(movementDirection({ labels: [] }, growing)).toBe('growing')
  })

  it('withholds it where the reading layer marked the month thin', () => {
    // 3 October, one update landed: the arithmetic still says growing and every
    // other reader in the product prints nothing. Ask used to print the word
    // and license the model to repeat it.
    expect(movementDirection({ labels: [thinLabel] }, growing)).toBeNull()
    expect(movementDirection({ labels: [{ kind: 'still_filling', text: 'Still filling.' }, thinLabel] }, growing)).toBeNull()
  })

  it('is not confused by another month’s caveat', () => {
    expect(movementDirection({ labels: [{ kind: 'read_back_at_setup', text: 'Read back at setup.' }] }, growing)).toBe('growing')
  })

  it('leaves the banded verdict to monthChange — a thin month still compares', () => {
    // The guard is about the WORD. The month-on-month line keeps its band and
    // carries the thin sentence beside it.
    const line = movementLine(reading({ direction: null, verdict: verdict({ flags: ['thin'] }) }))
    expect(line).toContain('moved (+7.5 pts, band 6.6 pts)')
    expect(line).toContain('thin against this audience’s own year')
    expect(line).toContain('no direction word has been earned here')
  })
})
