import { describe, it, expect } from 'vitest'

import { directionRe } from '../test/copy-contract'
import {
  EXCLUDED_NOTE,
  belowMedian,
  formatMatrix,
  formatReading,
  matrixConclusion,
  type FormatVideo,
} from './formats'

// D6 · the month-scoped, audience-split format reading.
//
// THE NUMBERS ARE THE ARTBOARD'S OWN SHAPE (mock-sealand, Competitive CO7 and
// the content brief's page 3): a category column with a wide n, the client's
// nine own posts, a rival's fourteen. What the artboard prints as "41%" and
// "none of 9" is asserted here as a k of an n and a zero-or-absent cell,
// because that is the deviation §6 D10 rules.

const vid = (over: Partial<FormatVideo> & { id: string }): FormatVideo => ({
  upload_date: '2026-09-12',
  platform: 'tiktok',
  classified_type: null,
  hook_style: null,
  engagement_rate: null,
  ...over,
})

/** Sealand's nine own posts, as the dataset describes them: product-on-desk 5,
 *  talking-head 2, commute POV 2; hooks on-screen text 5, spoken 2, caption 2. */
const OWN: FormatVideo[] = [
  ...Array.from({ length: 5 }, (_, i) =>
    vid({ id: `own-desk-${i}`, classified_type: 'product-on-desk', hook_style: 'on-screen-text', engagement_rate: 3 + i * 0.2 }),
  ),
  ...Array.from({ length: 2 }, (_, i) =>
    vid({ id: `own-head-${i}`, classified_type: 'talking-head', hook_style: 'spoken', engagement_rate: 2 + i * 0.1 }),
  ),
  ...Array.from({ length: 2 }, (_, i) =>
    vid({ id: `own-pov-${i}`, classified_type: 'commute-pov', hook_style: 'caption-only', engagement_rate: 6 + i * 0.4 }),
  ),
]

const reading = (videos: readonly FormatVideo[], over: Partial<Parameters<typeof formatReading>[0]> = {}) =>
  formatReading({
    month: '2026-09-01',
    audience: 'client',
    audienceLabel: 'Sealand',
    key: 'classified_type',
    videos,
    ...over,
  })

describe('formatReading · the published clock', () => {
  it('names the basis on the reading, because these are not comment-dated figures', () => {
    const r = reading(OWN)
    expect(r.basis).toBe('published')
    expect(r.basisLine).toBe('videos published in September')
  })

  it('counts by upload_date and drops a video published in another month', () => {
    const r = reading([...OWN, vid({ id: 'august', upload_date: '2026-08-30', classified_type: 'unboxing' })])
    expect(r.published).toBe(9)
    expect(r.rows.map((x) => x.key)).not.toContain('unboxing')
  })

  it('carries the classified n on every row, so no cell is a bare percentage', () => {
    const r = reading(OWN)
    expect(r.of).toBe(9)
    for (const row of r.rows) expect(row.value.n).toBe(9)
    expect(r.rows.find((x) => x.key === 'product-on-desk')?.value).toEqual({ k: 5, n: 9 })
  })

  it('makes the denominator the CLASSIFIED n, not the published one', () => {
    // mock-gap Competitive D6: the artboard prints "read from all 1,388
    // category videos" over a classification that reached 569 of them.
    const r = reading([...OWN, vid({ id: 'unread-1' }), vid({ id: 'unread-2' })])
    expect(r.published).toBe(11)
    expect(r.of).toBe(9)
    expect(r.rows.find((x) => x.key === 'product-on-desk')?.pct).toBe(55.6)
  })

  it('does not sum: the same videos carry a hook and a format at once', () => {
    const formats = reading(OWN)
    const hooks = reading(OWN, { key: 'hook_style' })
    expect(formats.rows.reduce((n, r) => n + r.value.k, 0)).toBe(9)
    expect(hooks.rows.reduce((n, r) => n + r.value.k, 0)).toBe(9)
    // Nine videos, eighteen row-counts across the two tables — which is why
    // neither table may be drawn as a partition of one whole.
    expect(formats.rows.length + hooks.rows.length).toBeGreaterThan(3)
  })

  it('counts a video with a hook and no format in the hook table only', () => {
    const videos = [...OWN, vid({ id: 'hook-only', hook_style: 'spoken', engagement_rate: 4 })]
    expect(reading(videos).of).toBe(9)
    expect(reading(videos, { key: 'hook_style' }).of).toBe(10)
    expect(reading(videos, { key: 'hook_style' }).rows.find((r) => r.key === 'spoken')?.value).toEqual({ k: 3, n: 10 })
  })

  it('excludes Reddit from engagement and names it with the reason', () => {
    const withReddit = [
      ...OWN,
      vid({ id: 'r1', platform: 'reddit', classified_type: 'talking-head', engagement_rate: 99 }),
      vid({ id: 'r2', platform: 'reddit', classified_type: 'talking-head', engagement_rate: 98 }),
    ]
    const r = reading(withReddit)
    const head = r.rows.find((x) => x.key === 'talking-head')!
    // Four talking-head videos are counted; only the two non-Reddit ones carry
    // a rate, so the median is theirs.
    expect(head.value).toEqual({ k: 4, n: 11 })
    expect(head.engagement).toEqual({ median: 2.1, n: 2 })
    expect(r.excluded).toContain('Reddit')
    expect(r.excludedNote).toBe(EXCLUDED_NOTE)
    expect(r.excludedNote).toContain('40')
  })

  it('reads a multiple against the audience’s own median video', () => {
    const r = reading(OWN)
    expect(r.median.value).toBe(3.4)
    expect(r.median.n).toBe(9)
    const pov = r.rows.find((x) => x.key === 'commute-pov')!
    expect(pov.engagement.median).toBe(6.2)
    expect(pov.multiple).toBe(1.8)
  })

  it('says so when an audience published nothing in the month', () => {
    const r = reading([vid({ id: 'june', upload_date: '2026-06-02', classified_type: 'unboxing' })])
    expect(r.of).toBe(0)
    expect(r.rows).toEqual([])
    expect(r.unread).toContain('published nothing we read in September')
  })

  it('says a different thing when it published and nothing has been classified', () => {
    const r = reading([vid({ id: 'a' }), vid({ id: 'b' })])
    expect(r.published).toBe(2)
    expect(r.unread).toContain('none of them has been classified yet')
  })

  it('humanises the key only where the caller passed a humaniser', () => {
    expect(reading(OWN).rows[0].label).toBe('product-on-desk')
    const humanised = reading(OWN, { label: (k) => k.replace(/-/g, ' ') })
    expect(humanised.rows[0].label).toBe('product on desk')
  })

  it('prints no direction word anywhere in the labels or sentences it composes', () => {
    const r = reading(OWN)
    const words = [r.basisLine, r.excludedNote, r.unread ?? '', ...r.rows.map((x) => x.label)].join(' ')
    expect(directionRe().test(words)).toBe(false)
  })
})

describe('formatMatrix · three audiences, one table', () => {
  const category = formatReading({
    month: '2026-09-01',
    audience: 'industry-other',
    audienceLabel: 'The category',
    key: 'classified_type',
    videos: [
      ...Array.from({ length: 12 }, (_, i) => vid({ id: `c-head-${i}`, classified_type: 'talking-head', engagement_rate: 3.8 })),
      ...Array.from({ length: 7 }, (_, i) => vid({ id: `c-desk-${i}`, classified_type: 'product-on-desk', engagement_rate: 3.1 })),
      ...Array.from({ length: 5 }, (_, i) => vid({ id: `c-pov-${i}`, classified_type: 'commute-pov', engagement_rate: 5.2 })),
      ...Array.from({ length: 3 }, (_, i) => vid({ id: `c-box-${i}`, classified_type: 'unboxing', engagement_rate: 2.4 })),
    ],
  })
  const own = reading(OWN)
  const rival = formatReading({
    month: '2026-09-01',
    audience: 'competitor:Freitag',
    audienceLabel: 'Freitag',
    key: 'classified_type',
    videos: [
      ...Array.from({ length: 6 }, (_, i) => vid({ id: `f-head-${i}`, classified_type: 'talking-head', engagement_rate: 4.4 })),
      ...Array.from({ length: 5 }, (_, i) => vid({ id: `f-pov-${i}`, classified_type: 'commute-pov', engagement_rate: 4.1 })),
      ...Array.from({ length: 3 }, (_, i) => vid({ id: `f-desk-${i}`, classified_type: 'product-on-desk', engagement_rate: 3.9 })),
    ],
  })

  it('takes its key ORDER from the first reading — the widest column leads', () => {
    const m = formatMatrix([category, own, rival])
    expect(m.keys.map((k) => k.key)).toEqual(['talking-head', 'product-on-desk', 'commute-pov', 'unboxing'])
  })

  it('leaves a side’s missing key NULL, never zero', () => {
    const m = formatMatrix([category, own, rival])
    const freitag = m.sides.find((s) => s.audience === 'competitor:Freitag')!
    expect(freitag.byKey['unboxing']).toBeNull()
    // …and the side carries the denominator a renderer prints "0 of 14" from,
    // plus the fact that it WAS read, which is what makes the zero honest.
    expect(freitag.of).toBe(14)
    expect(freitag.unread).toBeNull()
  })

  it('keeps every side’s own "of N" — the columns are not shares of one whole', () => {
    const m = formatMatrix([category, own, rival])
    expect(m.sides.map((s) => s.of)).toEqual([27, 9, 14])
    expect(m.sides.find((s) => s.audience === 'client')!.byKey['talking-head']!.value).toEqual({ k: 2, n: 9 })
  })

  it('distinguishes an unread side from a side with none of that format', () => {
    const hooksOfRival = formatReading({
      month: '2026-09-01',
      audience: 'competitor:Freitag',
      audienceLabel: 'Freitag',
      key: 'hook_style',
      videos: [vid({ id: 'f-1', classified_type: 'talking-head' })],
    })
    const m = formatMatrix([reading(OWN, { key: 'hook_style' }), hooksOfRival])
    const side = m.sides[1]
    expect(side.unread).toContain('none of them has been classified yet')
    expect(side.byKey['on-screen-text']).toBeNull()
  })

  it('composes its one sentence from the numbers, with both n and no direction word', () => {
    const m = formatMatrix([category, own, rival])
    expect(m.conclusion).toContain('5.2%')
    expect(m.conclusion).toContain('3.8%')
    expect(m.conclusion).toContain('The category')
    expect(directionRe().test(m.conclusion ?? '')).toBe(false)
  })

  it('says nothing at all where fewer than two rows carry a median', () => {
    const thin = reading([vid({ id: 'x', classified_type: 'unboxing', engagement_rate: 2 })])
    expect(matrixConclusion([thin])).toBeNull()
    expect(formatMatrix([thin]).conclusion).toBeNull()
  })
})

describe('belowMedian · the honest inverse of the playbook', () => {
  it('returns the formats running under the audience’s own median, worst first', () => {
    const rows = belowMedian(reading(OWN))
    expect(rows.map((r) => r.key)).toEqual(['talking-head'])
    expect(rows[0].engagement).toEqual({ median: 2.1, n: 2 })
    expect(rows[0].value).toEqual({ k: 2, n: 9 })
  })

  it('is empty when nothing is below, and when there is no median at all', () => {
    const flatRates = reading([
      vid({ id: 'a', classified_type: 'unboxing', engagement_rate: 4 }),
      vid({ id: 'b', classified_type: 'unboxing', engagement_rate: 4 }),
    ])
    expect(belowMedian(flatRates)).toEqual([])
    const noRates = reading([vid({ id: 'a', classified_type: 'unboxing' })])
    expect(noRates.median.value).toBeNull()
    expect(belowMedian(noRates)).toEqual([])
  })
})
