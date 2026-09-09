import { describe, it, expect } from 'vitest'
import { attributeApifySpend, exactApifySpend } from './run-costs'

const run = (startedAt: string, usd: number) => ({ startedAt, usageTotalUsd: usd })

describe('exactApifySpend (Phase 3) — this run\'s own actor calls', () => {
  const row = (usd: number | string | null, settled = true) => ({ usage_usd: usd, settled })

  it('sums the run\'s own rows and claims exact', () => {
    // Nothing inferred: every row IS an actor run this pipeline run started,
    // so a second tenant on the same Apify account cannot land in the total.
    expect(exactApifySpend([row(0.0023), row(0.0552), row(1.2)])).toEqual({ usd: 1.2575, attribution: 'exact' })
  })

  it('says exact_unsettled while any row is still a floor', () => {
    // Pay-per-event charges land ~a minute after a run ends, so an unsettled
    // row can read $0 for a run that did cost money (measured live 2026-09-09).
    const r = exactApifySpend([row(0.5), row(0, false)])
    expect(r.usd).toBe(0.5)
    expect(r.attribution).toBe('exact_unsettled')
  })

  it('reads numeric columns that come back as strings', () => {
    // postgres numeric arrives from PostgREST as a string.
    expect(exactApifySpend([row('0.0552'), row('0.0023')]).usd).toBe(0.0575)
  })

  it('treats a missing usage figure as zero rather than NaN', () => {
    expect(exactApifySpend([row(null), row(0.1)]).usd).toBe(0.1)
  })

  it('a run that spent nothing is still exact, not unavailable', () => {
    expect(exactApifySpend([row(0)])).toEqual({ usd: 0, attribution: 'exact' })
  })
})

describe('attributeApifySpend (Tier 1) — the labelled FALLBACK for runs with no rows', () => {
  const start = '2026-08-23T04:00:00Z'
  const end = '2026-08-23T07:00:00Z'

  it('sums only the actor runs inside the pipeline run window', () => {
    const r = attributeApifySpend(
      [
        run('2026-08-23T03:59:00Z', 5), // before
        run('2026-08-23T04:30:00Z', 3),
        run('2026-08-23T06:59:00Z', 1.5),
        run('2026-08-23T07:30:00Z', 9), // after
      ],
      start, end,
    )
    expect(r.usd).toBe(4.5)
    expect(r.attribution).toBe('exact')
  })

  it('labels the total ambiguous when another pipeline run overlapped', () => {
    // Apify bills per ACCOUNT, so two tenants running at once cannot be split.
    // Recording the total and saying so beats presenting it as one run's spend.
    const r = attributeApifySpend([run('2026-08-23T05:00:00Z', 8)], start, end, 2)
    expect(r.usd).toBe(8)
    expect(r.attribution).toBe('ambiguous')
  })

  it('treats a missing or null usage figure as zero, not NaN', () => {
    const r = attributeApifySpend(
      [{ startedAt: '2026-08-23T05:00:00Z' }, { startedAt: '2026-08-23T05:00:00Z', usageTotalUsd: null }],
      start, end,
    )
    expect(r.usd).toBe(0)
  })

  it('ignores an unparseable timestamp rather than counting it', () => {
    expect(attributeApifySpend([run('not-a-date', 12)], start, end).usd).toBe(0)
  })

  it('an empty account list costs nothing', () => {
    expect(attributeApifySpend([], start, end)).toEqual({ usd: 0, attribution: 'exact' })
  })
})
