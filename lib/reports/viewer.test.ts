import { describe, it, expect } from 'vitest'
import { viewerHref, weeklyViewerPages } from './viewer'
import { WEEKLY_BLOCK_KEYS } from './weekly'

// The viewer's URL is the whole of its state: opening adds `view`, closing
// drops it, and everything the reader already had in the query survives both.

describe('viewerHref', () => {
  it('adds view and keeps the other parameters', () => {
    expect(viewerHref('/dashboard/reports', { group: 'built', item: 'abc' }, 'abc')).toBe('/dashboard/reports?group=built&item=abc&view=abc')
  })

  it('drops view when closing and keeps the rest', () => {
    expect(viewerHref('/dashboard/reports', { group: 'built', item: 'abc', view: 'abc' }, null)).toBe('/dashboard/reports?group=built&item=abc')
  })

  it('replaces a view already in the query rather than repeating it', () => {
    expect(viewerHref('/dashboard/studio', { item: 'r1', view: 'old' }, 'new')).toBe('/dashboard/studio?item=r1&view=new')
  })

  it('leaves out parameters with no value', () => {
    expect(viewerHref('/dashboard/reports', { group: undefined, item: '' }, 'abc')).toBe('/dashboard/reports?view=abc')
  })

  it('returns the bare path when nothing is left', () => {
    expect(viewerHref('/dashboard/studio', { view: 'abc' }, null)).toBe('/dashboard/studio')
  })

  it('escapes what it puts in the query', () => {
    expect(viewerHref('/dashboard/reports', { item: 'a b&c' }, null)).toBe('/dashboard/reports?item=a+b%26c')
  })
})

// The viewer had no weekly branch at all: it cast every non-document snapshot
// to a ReportSnapshotData and asked deckSlides for its sections, which a weekly
// snapshot does not have. This is the page count that branch reports.
describe('weeklyViewerPages', () => {
  it('is one sheet per block the report names', () => {
    expect(weeklyViewerPages([...WEEKLY_BLOCK_KEYS])).toBe(6)
    expect(weeklyViewerPages(['weekly.week', 'weekly.coverage'])).toBe(2)
  })

  it('drops a key this build no longer knows, as the deck does', () => {
    expect(weeklyViewerPages(['weekly.week', 'weekly.gone'])).toBe(1)
  })

  it('never says nought pages, because the deck always draws a sheet', () => {
    expect(weeklyViewerPages([])).toBe(1)
    expect(weeklyViewerPages(['weekly.gone'])).toBe(1)
  })
})
