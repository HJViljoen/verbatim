import { describe, expect, it } from 'vitest'
import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { renderText } from '@/lib/test/render'
import { contextLine } from '@/lib/shell/bar'
import { objectKey, sentMonthOf, type StoredSentFigure } from '@/lib/reports/sent-figures'
import { sentLineFor, sentLineForToken, type OverviewData } from '@/lib/pages/overview'
import { INDUSTRY_AUDIENCE } from '@/lib/rivals'
import { overviewBar } from './bar'
import { overviewSubjects } from './subjects'
import { overviewFixture } from './fixture'

const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

const stored = (over: Partial<StoredSentFigure> = {}): StoredSentFigure => ({
  snapshotId: 's1',
  month: '2026-09-01',
  audience: INDUSTRY_AUDIENCE,
  objectKind: 'subject',
  objectId: 's1',
  label: 'Durability',
  value: 19,
  unit: 'pct',
  measure: 'videos',
  k: 264,
  n: 1290,
  denominator: 'the category’s videos this month',
  changePts: null,
  bandPts: null,
  verdict: 'moved',
  direction: null,
  monthStatus: 'filling',
  artefact: 'monthly',
  readingAt: '2026-09-01T06:00:00.000Z',
  sentAt: '2026-09-01T06:00:10.000Z',
  ...over,
})

/** Overview's fixture, with an artefact already sent about this month. */
function withSent(rows: StoredSentFigure[] = [], over: Partial<OverviewData> = {}): OverviewData {
  return overviewFixture({ sent: sentMonthOf(rows), ...over })
}

describe('what we last told this client about this month', () => {
  it('indexes an object reading by audience, kind and id', () => {
    const sent = sentMonthOf([stored()])
    expect(sent?.byObject[objectKey(INDUSTRY_AUDIENCE, 'subject', 's1')]?.value).toBe(19)
  })

  it('keeps an artefact-level token apart from an object', () => {
    const sent = sentMonthOf([
      stored(),
      stored({ objectKind: 'figure', objectId: 'month_videos', audience: 'artefact', value: 2044, unit: 'videos', k: null, n: null }),
    ])
    expect(Object.keys(sent?.byObject ?? {})).toHaveLength(1)
    expect(sent?.byToken.month_videos?.value).toBe(2044)
  })

  it('takes the newest artefact’s date as "the report of"', () => {
    const sent = sentMonthOf([
      stored({ artefact: 'monthly', readingAt: '2026-09-01T06:00:00.000Z' }),
      stored({ objectId: 's2', artefact: 'weekly', readingAt: '2026-09-13T06:00:00.000Z' }),
    ])
    expect(sent?.readingAt).toBe('2026-09-13T06:00:00.000Z')
    expect(sent?.artefact).toBe('weekly')
  })

  it('is null where nothing was sent, and where M9 is not applied', () => {
    expect(sentMonthOf([])).toBeNull()
    expect(sentMonthOf(null)).toBeNull()
  })
})

describe('the line a live surface draws beside its own figure', () => {
  it('names the date and what that artefact read', () => {
    const sent = sentMonthOf([stored()])
    expect(sentLineFor(sent, INDUSTRY_AUDIENCE, 'subject', 's1', 22))
      .toBe('the report of 1 Sep read 19% · 264 of 1,290')
  })

  it('says nothing where the figure has not moved', () => {
    const sent = sentMonthOf([stored({ value: 22 })])
    expect(sentLineFor(sent, INDUSTRY_AUDIENCE, 'subject', 's1', 22)).toBeNull()
  })

  it('says nothing about an object no artefact carried', () => {
    const sent = sentMonthOf([stored()])
    expect(sentLineFor(sent, INDUSTRY_AUDIENCE, 'subject', 'other', 22)).toBeNull()
  })

  it('says nothing where there is no live figure to compare with', () => {
    expect(sentLineFor(sentMonthOf([stored()]), INDUSTRY_AUDIENCE, 'subject', 's1', null)).toBeNull()
    expect(sentLineFor(null, INDUSTRY_AUDIENCE, 'subject', 's1', 22)).toBeNull()
  })

  it('says nothing about a month that had already closed when it went out', () => {
    const sent = sentMonthOf([stored({ monthStatus: 'frozen' })])
    expect(sentLineFor(sent, INDUSTRY_AUDIENCE, 'subject', 's1', 22)).toBeNull()
  })
})

describe('OV0 · the bar', () => {
  const token = (value: number) =>
    stored({ objectKind: 'figure', objectId: 'month_videos', audience: 'artefact', value, unit: 'videos', k: null, n: null })

  it('prints what the last report read for the month’s own size', () => {
    const data = withSent([token(2044)])
    expect(sentLineForToken(data.sent, 'month_videos', data.bar.videos))
      .toBe('the report of 1 Sep read 2,044 videos')
    for (const mode of ['app', 'email'] as const) {
      expect(renderText(overviewBar.render(data, mode, ctx))).toContain('the report of 1 Sep read 2,044 videos')
    }
  })

  it('prints nothing at all where nothing has been sent — the page as it is today', () => {
    const text = renderText(overviewBar.render(overviewFixture(), 'app', ctx))
    expect(text).not.toContain('the report of')
  })

  it('keeps the copy contract with the line on it', () => {
    const data = withSent([token(2044)])
    for (const mode of ['app', 'print', 'email'] as const) {
      assertCopyContract(overviewBar.render(data, mode, ctx))
    }
  })
})

describe('OV2 · the subject rows', () => {
  it('prints what the last report read beside the category side', () => {
    const data = withSent([stored()])
    for (const mode of ['app', 'email'] as const) {
      expect(renderText(overviewSubjects.render(data, mode, ctx)))
        .toContain('the report of 1 Sep read 19% · 264 of 1,290')
    }
  })

  it('keeps the copy contract with the line on it', () => {
    const data = withSent([stored()])
    for (const mode of ['app', 'print', 'email'] as const) {
      assertCopyContract(overviewSubjects.render(data, mode, ctx))
    }
  })
})

describe('the page bar', () => {
  it('carries the clause where there is one, and reads unchanged where there is not', () => {
    const base = { brand: 'Sealand', month: '2026-09-01', status: 'filling' as const, readingAt: '2026-09-18T09:00:00.000Z' }
    // The artboard's wording (Block D wave 2, `main.bar.context`): long month,
    // short stamp, no second "reading".
    expect(contextLine(base)).toBe('Sealand · September 2026 · still filling · as at 18 Sep')
    expect(contextLine({ ...base, sent: 'the report of 1 Sep read 2,044 videos' }))
      .toBe('Sealand · September 2026 · still filling · as at 18 Sep · the report of 1 Sep read 2,044 videos')
    expect(contextLine({ ...base, sent: null })).toBe(contextLine(base))
  })
})
