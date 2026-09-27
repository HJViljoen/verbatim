import { describe, expect, it } from 'vitest'

import { makersLine, type MakersLineTheme } from './makers-line'

// Sealand's September on staging (read 27 Sep, read-only): the category's
// themes at 10 videos or more, with `theme_maker_shares` on the latest themed
// update (maker videos of the theme's videos, and its off-topic ones).
const t = (id: string, k: number, label: string, maker: number, of: number, noise = 0): MakersLineTheme =>
  ({ id, k, label, maker: maker / of, noise: noise / of })
const SEPTEMBER = [
  t('t01', 88, 'Buying interest and ordering questions', 31, 88),
  t('t02', 72, 'Love for creative upcycling', 63, 72),
  t('t03', 65, 'Admiration for handmade craftsmanship', 46, 65),
  t('t04', 60, 'Praise for beautiful bag design', 21, 60),
  t('t05', 28, 'Requests for step-by-step tutorials', 23, 28),
  t('t06', 25, 'Questions about materials and tools', 24, 25),
  t('t07', 20, 'More colors and variants wanted', 6, 20, 1),
  t('t08', 15, 'Need for exact measurements', 12, 15),
  t('t09', 14, 'Tutorial praised as easy to follow', 14, 14),
  t('t10', 13, 'Interest in shipping and locations', 0, 13, 1),
  t('t11', 11, 'Requests for the sewing pattern', 11, 11),
  t('t12', 11, 'Frustration with bag weight', 0, 11, 1),
]

describe('the makers line Settings prints under "Grouped"', () => {
  it('counts the maker-led themes at the floor and names the two biggest', () => {
    expect(makersLine(SEPTEMBER, ['Sealand'])).toEqual({
      count: 7,
      lead: [{ label: 'Love for creative upcycling', k: 72 }, { label: 'Admiration for handmade craftsmanship', k: 65 }],
    })
  })

  it('passes over a lead whose label names a brand, for the next one', () => {
    expect(makersLine(SEPTEMBER, ['Sealand', 'Craftsmanship'])?.lead.map((l) => l.label))
      .toEqual(['Love for creative upcycling', 'Requests for step-by-step tutorials'])
  })

  it('counts none where no theme is led by makers', () => {
    expect(makersLine(SEPTEMBER.filter((x) => (x.maker ?? 0) < 0.5), [])).toEqual({ count: 0, lead: [] })
  })
})
